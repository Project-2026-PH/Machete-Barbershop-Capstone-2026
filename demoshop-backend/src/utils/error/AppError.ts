/**
 * Standard Application Error class.
 * Carries optional metadata that controllers can surface in the HTTP response.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly isOperational: boolean;
  public readonly metadata: Record<string, unknown>;

  constructor(
    message: string,
    status: number = 500,
    isOperational: boolean = true,
    metadata: Record<string, unknown> = {}
  ) {
    super(message);
    this.status = status;
    this.isOperational = isOperational;
    this.metadata = metadata;

    // Ensure the prototype is correctly set for extending built-in Error
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture the stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Auth-specific error with typed metadata for authentication flows.
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    status: number = 401,
    metadata: { isVerified?: boolean; email?: string } = {}
  ) {
    super(message, status, true, metadata);
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
