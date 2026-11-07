import express from 'express';
import * as serviceController from '../controllers/service.controller';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';

const router = express.Router();

const publicServiceRateLimit = createAbuseRateLimit({
  name: 'services-public-catalog',
  windowSeconds: 60,
  limits: { ip: 120, device: 60 },
  failOpen: true,
});

// Service catalog reads remain public for booking flows.
router.get('/', publicServiceRateLimit, serviceController.getAllServices);

// Only authenticated System Admins, Owners, Admins, and ShopAdmins may mutate the catalog.
const authorizeCatalogMutation = [
  requireSupabaseAuth,
  authorizeRoles('System Admin', 'Owner', 'Admin', 'ShopAdmin'),
];

router.post('/', authorizeCatalogMutation, serviceController.createService);
router.put('/:id', authorizeCatalogMutation, serviceController.updateService);
router.delete('/:id', authorizeCatalogMutation, serviceController.deleteService);

export default router;
