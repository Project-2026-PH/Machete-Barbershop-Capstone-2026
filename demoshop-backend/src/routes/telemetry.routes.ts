import express from 'express';
import { recordBatch } from '../controllers/telemetry.controller';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';

const router = express.Router();

const telemetryRateLimit = createAbuseRateLimit({
  name: 'frontend-telemetry',
  windowSeconds: 60,
  limits: { ip: 30 },
  failOpen: true,
});

router.post('/batch', telemetryRateLimit, recordBatch);

export default router;
