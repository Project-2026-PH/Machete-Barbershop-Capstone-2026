import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to set common security-related HTTP headers.
 * Complements Helmet by being explicit about certain headers.
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Control framing permissions (Deny by default)
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filtering in browsers (Legacy but useful)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Control Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');

  next();
};

export default securityHeaders;
