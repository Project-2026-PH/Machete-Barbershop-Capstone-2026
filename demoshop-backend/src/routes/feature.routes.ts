import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import { featureController } from '../controllers/feature.controller';

const router = express.Router();

// Rate limiter for feature status modifications (max 60 changes per 15 mins)
const featureWriteLimiter = createAbuseRateLimit({
  name: 'feature-controls-write',
  windowSeconds: 15 * 60,
  limits: { ip: 60, device: 60 },
  includeDevice: true,
});

// Protect all routes with JWT + System Admin/Owner Authorization
router.use(requireSupabaseAuth);
router.use(authorizeRoles('System Admin', 'Owner'));

router.get('/', featureController.getFeatures.bind(featureController));
router.patch('/:id/roles', featureWriteLimiter, featureController.updateFeatureRoles.bind(featureController));
router.put('/:id/roles', featureWriteLimiter, featureController.updateFeatureRoles.bind(featureController));
router.patch('/:id', featureWriteLimiter, featureController.updateFeatureStatus.bind(featureController));
router.put('/:id', featureWriteLimiter, featureController.updateFeatureStatus.bind(featureController));

export default router;
