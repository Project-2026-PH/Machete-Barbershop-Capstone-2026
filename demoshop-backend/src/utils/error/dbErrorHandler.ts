import logger from '../general/logger';

/**
 * Centralized Database Error Handler
 * Maps PostgreSQL error codes to user-friendly messages.
 */
export interface DbErrorResponse {
  message: string;
  statusCode: number;
  isOperational: boolean;
}

const handleDbError = (err: any): DbErrorResponse => {
  // Keep database values and query details out of logs; codes are sufficient for diagnosis.
  logger.error('Database operation failed', {
    code: err?.code,
    table: err?.table,
    constraint: err?.constraint,
  });

  // Default Error Response
  let errorResponse: DbErrorResponse = {
    message: "An unexpected database error occurred.",
    statusCode: 500,
    isOperational: true, // Trusted error that we can handle
  };

  // Postgres Error Codes
  switch (err.code) {
    case '23505': // Unique violation (e.g., duplicate email)
      errorResponse.message = "This record already exists. Please check your input.";
      errorResponse.statusCode = 409; // Conflict
      if (err.detail && err.detail.includes("email")) {
        errorResponse.message = "This email address is already in use.";
      }
      break;

    case '23502': // Not-null violation
      errorResponse.message = "Missing required information.";
      errorResponse.statusCode = 400; // Bad Request
      if (err.column) {
        // Transform "last_name" -> "Last Name" for friendlier message
        const friendlyField = err.column
          .split('_')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        errorResponse.message = `${friendlyField} is required.`;
      }
      break;

    case '23503': // Foreign key violation
      errorResponse.message = "Operation failed due to a related record constraint.";
      errorResponse.statusCode = 400;
      break;

    case '22P02': // Invalid text representation (e.g., UUID syntax error)
      errorResponse.message = "Invalid input format.";
      errorResponse.statusCode = 400;
      break;

    case '42P01': // Undefined table
      errorResponse.message = "System error: Resource not found.";
      errorResponse.statusCode = 500;
      break;

    default:
      if (process.env.NODE_ENV === 'development') {
        errorResponse.message = `Database Error: ${err.message}`;
      }
  }

  return errorResponse;
};

export default handleDbError;

