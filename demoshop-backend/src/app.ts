import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import serviceRoutes from './routes/service.routes';
import authRoutes from './routes/auth.routes';
import oauthRoutes from './routes/oauth.routes';
import customerRoutes from './routes/customer.routes';
import * as customerController from './controllers/customer.controller';
import queueRoutes from './routes/queue.routes';
import cashierRoutes from './routes/cashier.routes';
import orderRoutes from './routes/order.routes';
import localRoutes from './routes/local.routes';
import adminRoutes from './routes/admin.routes';
import auditRoutes from './routes/audit.routes';
import feedbackRoutes from './routes/feedback.routes';
import healthRoutes from './routes/health.routes';
import cronRoutes from './routes/cron.routes';
import notificationRoutes from './routes/notifications.routes';
import paymentAttemptRoutes from './routes/payment-attempt.routes';
import inventoryRoutes from './routes/inventory.routes';
import telemetryRoutes from './routes/telemetry.routes';
import qzTrayRoutes from './routes/qz-tray.routes';
import guestRoutes from './routes/guest.routes';
import barberRoutes from './routes/barber.routes';
import featureRoutes from './routes/feature.routes';
import diagnosticsRoutes from './routes/diagnostics.routes';
import shopRoutes from './routes/shop.routes';
import appointmentRoutes from './routes/appointment.routes';
import chatbotRoutes from './modules/chatbot/chatbot.routes';
import { featureController } from './controllers/feature.controller';
import * as queueController from './controllers/queue.controller';
import redisClient from './redis';

import { corsMiddleware, corsPreflightMiddleware } from './middleware/cors.middleware';
import { requireSupabaseAuth } from './middleware/auth.middleware';
import csrfMiddleware from './middleware/csrf.middleware';
import { uploadsMiddleware } from './middleware/static-files.middleware';
import { requestMetricsMiddleware, startRequestMetrics } from './middleware/request-metrics.middleware';
import notFoundMiddleware from './middleware/not-found.middleware';
import { securityHeaders } from './middleware/security-headers.middleware';
import errorMiddleware from './middleware/error.middleware';
import { createAbuseRateLimit } from './middleware/abuse-rate-limit.middleware';
import { config } from './config/env';
import { REQUEST_JSON_LIMITS } from './utils/request-validation.util';

const app = express();

app.set('trust proxy', config.runtime.trustProxyHops);

const isProduction = config.runtime.isProduction;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://accounts.google.com',
        'https://apis.google.com',
        'https://www.googletagmanager.com',
        ...(!isProduction ? ["'unsafe-eval'"] : []),
      ],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      // The browser now reaches the API through the frontend's own origin
      // (see demoshop-frontend/vercel.ts same-origin proxy), so the backend
      // Vercel hostnames no longer need to be browser-reachable origins
      // here. Kept as 'self' plus the third parties actually contacted
      // client-side (Google OAuth/Identity and profile images).
      connectSrc: [
        "'self'",
        'https://accounts.google.com',
        'https://www.googleapis.com',
        'https://www.googletagmanager.com',
        'https://*.google-analytics.com',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://lh3.googleusercontent.com',
        'https://www.googletagmanager.com',
        'https://*.google-analytics.com',
        'http://localhost:5000',
      ],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(securityHeaders);
app.use('/uploads', uploadsMiddleware);
app.use(corsMiddleware);
app.options(/.*/, corsPreflightMiddleware);

// Parse exceptional JSON routes before the conservative fallback parser. Express
// skips later parsers once req.body has been populated.
app.use('/api/orders/sync', express.json({ limit: REQUEST_JSON_LIMITS.orderSync }));
app.use('/api/local-queue/mark-synced', express.json({ limit: REQUEST_JSON_LIMITS.markSynced }));
app.use('/api/local-queue', express.json({ limit: REQUEST_JSON_LIMITS.localQueue }));
// Customer reservations send receipt previews as base64 JSON. Keep this below
// Vercel Functions' 4.5 MB request-body ceiling so the platform can pass it through.
app.use('/api/queue', express.json({ limit: REQUEST_JSON_LIMITS.customerQueue }));
app.use(express.json({ limit: REQUEST_JSON_LIMITS.global }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_JSON_LIMITS.urlEncoded }));
app.use(cookieParser());

// Apply CSRF protection before any route, including customer routes.
app.use(csrfMiddleware);
app.use(requestMetricsMiddleware);
startRequestMetrics();

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    message: 'DemoShop Backend is successfully running on Vercel!',
    status: 'healthy',
    redis: redisClient.isReady ? 'ready' : (redisClient.isOpen ? 'connecting' : 'disconnected'),
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/customer', customerRoutes);
app.post('/api/appointments/:id/reschedule', requireSupabaseAuth, customerController.rescheduleAppointment);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/users', authRoutes);
app.use('/api/user', authRoutes);
app.use('/api/oauth', oauthRoutes);

// Redis is an optional acceleration layer. Cache consumers use bounded,
// demand-driven readiness checks; do not start a Redis connection for every
// authenticated request because an unavailable/sleeping Redis instance can
// otherwise create a reconnect storm on payment and queue endpoints.

const publicQueryRateLimit = createAbuseRateLimit({
  name: 'queue-public-query',
  windowSeconds: 60,
  limits: { ip: 60, device: 30 },
  includeDevice: true,
  failOpen: true,
});

app.use('/api/guest', guestRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/public/chatbot', chatbotRoutes);
app.get('/api/features/status', (req, res) => featureController.getPublicFeatureStatuses(req, res));
app.get('/api/shifts/today', publicQueryRateLimit, (req, res) => queueController.getPublicBarbers(req, res));
app.get('/api/bookings/barbers/availability', publicQueryRateLimit, (req, res) => queueController.getPublicBarbers(req, res));
app.use('/api/system-admin/features', featureRoutes);
app.use('/api/admin/features', featureRoutes);
app.use('/api/cashier', cashierRoutes);
app.use('/api/system-admin/audit-logs', auditRoutes);
app.use('/api/admin/audit-logs', auditRoutes);
app.use('/api/system-admin', adminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/system-admin/diagnostics', diagnosticsRoutes);
app.use('/api/admin/diagnostics', diagnosticsRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/local-queue', localRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payment-attempts', paymentAttemptRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/qz-tray', qzTrayRoutes);
app.use('/api/barber', barberRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
