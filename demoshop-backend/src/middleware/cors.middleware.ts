import cors, { CorsOptions } from 'cors';
import logger from '../utils/general/logger';
import { config } from '../config/env';

const allowedOrigins = new Set(config.cors.allowedOrigins);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    // Never log the untrusted header value; it may contain sensitive data or control characters.
    logger.warn('Blocked CORS request', { originPresent: true });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin'],
};

export const corsMiddleware = cors(corsOptions);
export const corsPreflightMiddleware = cors(corsOptions);
export { allowedOrigins };
