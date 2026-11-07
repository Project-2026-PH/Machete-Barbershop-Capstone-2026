import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../utils/error/AppError';
import logger from '../utils/general/logger';
import { AVATAR_MAX_SIZE_MESSAGE, MAX_AVATAR_BYTES } from '../config/upload-limits';

/**
 * Global error handling middleware.
 * Distinguishes operational errors (AppError) from unexpected programmer errors.
 */
const errorMiddleware: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestError = err as Error & { code?: string; type?: string; status?: number };
  logger.error('[Global Error Handler] Request failed', {
    error: err,
    method: req.method,
    path: req.path,
    status: requestError.status || 500,
  });

  if (requestError.code === 'LIMIT_FILE_SIZE') {
    const isReceipt = req.path.includes('/pay');
    res.status(413).json({
      success: false,
      code: isReceipt ? 'RECEIPT_TOO_LARGE' : 'AVATAR_TOO_LARGE',
      error: isReceipt ? 'Receipt image must be 10 MB or smaller.' : AVATAR_MAX_SIZE_MESSAGE,
      maxBytes: isReceipt ? 10 * 1024 * 1024 : MAX_AVATAR_BYTES,
    });
    return;
  }
  if (requestError.type === 'entity.too.large' || requestError.status === 413) {
    res.status(413).json({ success: false, error: 'Request payload is too large.' });
    return;
  }
  if (requestError.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: 'Malformed JSON request body.' });
    return;
  }

  if (err instanceof AppError) {
    // Operational error — safe to surface to client
    res.status(err.status).json({
      success: false,
      error: err.message,
      ...err.metadata,
    });
    return;
  }

  // Unexpected / programmer error — never surface raw DB/system messages to the client
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again.',
  });
};

export default errorMiddleware;
