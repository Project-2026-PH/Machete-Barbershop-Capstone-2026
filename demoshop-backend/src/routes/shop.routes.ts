import express from 'express';
import { adminService } from '../services/admin.service';
import { inventoryService } from '../services/inventory.service';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';

const router = express.Router();

const shopPublicRateLimit = createAbuseRateLimit({
  name: 'shop-public-query',
  windowSeconds: 60,
  limits: { ip: 60, device: 30 },
  includeDevice: true,
  failOpen: true,
});

/**
 * GET /api/shop/settings
 * Public endpoint to fetch live authoritative storefront configuration.
 * Consumed by: Public Landing Page (Hero, About, Gallery, FAQ, Footer, Legal),
 * Customer Booking (hours, available payment methods, QR), and Cashier POS.
 */
router.get('/settings', shopPublicRateLimit, async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : 1;
    const settings = await adminService.getShopSettings(branchId);
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve shop configuration.' });
  }
});

/**
 * GET /api/shop/products
 * Public view-only product catalog.
 * Strict customer privacy: only returns enabled products (show_in_shop = true)
 * with sanitized public details (id, name, image, retail price, category, tags, stockStatus).
 * NO internal cost prices, NO supplier data, NO exact quantities leaked.
 */
router.get('/products', shopPublicRateLimit, async (_req, res) => {
  try {
    const products = await inventoryService.getPublicShopProducts();
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve retail catalog.' });
  }
});

export default router;
