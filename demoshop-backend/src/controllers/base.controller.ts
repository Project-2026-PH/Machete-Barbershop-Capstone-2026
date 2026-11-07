import { Request, Response } from 'express';
import { AppError } from '../utils/error/AppError';
import logger from '../utils/general/logger';

/**
 * Abstract Base Controller using Template Method pattern.
 * 
 * All controllers extend this to get a standardized try/catch wrapper
 * that handles AppError (operational) vs unknown errors consistently.
 * 
 * Subclasses implement specific route handlers that call `handleRequest()`.
 */
export abstract class BaseController {
  /**
   * Template Method: wraps an async handler with standardized error handling.
   * 
   * @param res - Express response object
   * @param fn - Async function containing the handler logic
   * @param context - Label for log messages (e.g., "Login", "JoinQueue")
   */
  protected async handleRequest(
    res: Response,
    fn: () => Promise<void>,
    context: string
  ): Promise<void> {
    try {
      await fn();
    } catch (error: unknown) {
      this.handleError(res, error, context);
    }
  }

  /**
   * Centralized error handler that distinguishes AppError (operational)
   * from unexpected errors. Surfaces AppError.metadata in the response
   * so domain-specific fields (e.g., isVerified, email) are included
   * without controllers needing per-domain error logic.
   */
  private handleError(res: Response, error: unknown, context: string): void {
    const isAppError = error instanceof AppError || (
      error !== null &&
      typeof error === 'object' &&
      'status' in error &&
      typeof (error as any).status === 'number' &&
      'isOperational' in error
    );

    if (isAppError) {
      const err = error as any;
      if (err.status === 429) {
        const retryAfter = Number(err.metadata?.retryAfter) > 0 ? Number(err.metadata.retryAfter) : 60;
        res.set('Retry-After', String(retryAfter));
        const errorMessage = err.message && err.message !== 'RATE_LIMITED' ? err.message : 'RATE_LIMITED';
        res.status(429).json({
          error: errorMessage,
          message: err.message || 'Too many requests. Please try again later.',
          retryAfter,
        });
        return;
      }

      res.status(err.status || 400).json({
        success: false,
        error: err.message,
        message: err.message,
        ...(err.metadata || {}),
      });
      return;
    }

    // Unknown / programmer error — log full details, return generic message
    const err = error as Error;
    logger.error(`[${context}] ${err.message}\nStack: ${err.stack}`);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}
