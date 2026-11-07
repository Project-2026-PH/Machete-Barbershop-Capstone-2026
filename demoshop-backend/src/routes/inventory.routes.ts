import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import * as inventoryController from '../controllers/inventory.controller';
import * as inventoryManagerController from '../controllers/inventory-manager.controller';
import { requireFeature } from '../middleware/feature-gate.middleware';
import { createImageUploadMiddleware } from '../utils/general/image-upload.util';

import { validateBottleConsumptionQuery, validateStockCountPayload } from '../utils/request-validation.util';

const router = express.Router();
const inventoryReadRoles = authorizeRoles('Cashier', 'Inventory Manager', 'Owner', 'System Admin', 'Admin', 'ShopAdmin', 'Barber');
const forecastRoles = authorizeRoles('Inventory Manager', 'Owner', 'System Admin', 'Admin', 'ShopAdmin');
const countSubmitRoles = authorizeRoles('Cashier', 'Inventory Manager', 'Owner', 'System Admin', 'Admin', 'ShopAdmin');
const reviewRoles = authorizeRoles('Owner', 'System Admin', 'Admin', 'ShopAdmin');
const inventoryManagerRoles = authorizeRoles('Inventory Manager', 'Owner', 'System Admin', 'Admin', 'ShopAdmin');
const inventoryManagerOnly = authorizeRoles('Inventory Manager');
const inventoryManagerWriteRoles = authorizeRoles('Inventory Manager', 'Owner', 'System Admin', 'Admin', 'ShopAdmin');

router.use(requireSupabaseAuth);
router.use(requireFeature('inventory_management'));

router.get('/', inventoryReadRoles, inventoryController.getInventory);
router.get('/retail/catalog', inventoryReadRoles, inventoryController.getRetailCatalog);
router.get('/forecast', forecastRoles, inventoryController.getInventoryForecast);
router.get('/retail/tags', inventoryReadRoles, inventoryController.listRetailTags);
router.post('/retail/tags', reviewRoles, inventoryController.createRetailTag);
router.get('/retail/categories', inventoryReadRoles, inventoryController.listRetailCategories);
router.post('/retail/categories', reviewRoles, inventoryController.createRetailCategory);
router.patch('/items/:id/retail', reviewRoles, inventoryController.updateRetailPresentation);
router.post('/items/:id/image', reviewRoles, createImageUploadMiddleware('image'), inventoryController.uploadProductImage);
router.delete('/items/:id/image', reviewRoles, inventoryController.deleteProductImage);
router.post('/items', reviewRoles, requireFeature('inventory_management'), inventoryController.createInventoryItem);
router.delete('/bulk-delete', reviewRoles, requireFeature('inventory_management'), inventoryController.bulkDeleteInventoryItems);
router.post('/bulk-delete', reviewRoles, requireFeature('inventory_management'), inventoryController.bulkDeleteInventoryItems);
router.patch('/items/:id/stock', reviewRoles, requireFeature('inventory_management'), inventoryController.updateStockQuantity);
router.patch('/items/:id/replenish', reviewRoles, requireFeature('inventory_management'), inventoryController.replenishStock);
router.post('/items/:id/replenish', reviewRoles, requireFeature('inventory_management'), inventoryController.replenishStock);
router.post('/replenish', reviewRoles, requireFeature('inventory_management'), inventoryController.replenishStock);
router.patch('/items/:id/cost-price', reviewRoles, inventoryController.updateInventoryCostPrice);
router.patch('/items/:id/default-supplier', inventoryManagerWriteRoles, inventoryManagerController.assignDefaultSupplier);

router.get('/suppliers', inventoryManagerRoles, inventoryManagerController.listSuppliers);
router.post('/suppliers', inventoryManagerWriteRoles, inventoryManagerController.createSupplier);
router.patch('/suppliers/:id', inventoryManagerWriteRoles, inventoryManagerController.updateSupplier);
router.delete('/suppliers/:id', inventoryManagerWriteRoles, inventoryManagerController.deactivateSupplier);

// Inventory Manager purchase-order workflow. Catalog must be declared before :id routes.
router.get('/purchase-orders/catalog', inventoryManagerRoles, inventoryManagerController.listPurchaseOrderCatalog);
router.get('/purchase-orders/summary', inventoryManagerRoles, inventoryManagerController.getPurchaseOrderSummary);
router.get('/purchase-orders', inventoryManagerRoles, inventoryManagerController.listPurchaseOrders);
router.post('/purchase-orders', inventoryManagerOnly, inventoryManagerController.createPurchaseOrder);
router.patch('/purchase-orders/:id', inventoryManagerOnly, inventoryManagerController.updatePurchaseOrder);
router.delete('/purchase-orders/:id', inventoryManagerOnly, inventoryManagerController.deletePurchaseOrder);
router.post('/purchase-orders/:id/submit', inventoryManagerOnly, inventoryManagerController.submitPurchaseOrder);
router.patch('/purchase-orders/:id/review', reviewRoles, inventoryManagerController.reviewPurchaseOrder);
router.post('/purchase-orders/:id/restore-deleted-items', reviewRoles, inventoryManagerController.restorePurchaseOrderDeletedItems);
router.delete('/purchase-orders/:id/receipt', reviewRoles, inventoryManagerController.unlinkReceipt);
router.post('/purchase-orders/:id/fulfill', inventoryManagerWriteRoles, inventoryManagerController.fulfillPurchaseOrder);

router.get('/receipts', inventoryManagerRoles, inventoryManagerController.listReceipts);
router.post('/receipts', inventoryManagerWriteRoles, inventoryManagerController.inventoryReceiptUpload, inventoryManagerController.uploadReceipt);
router.post('/receipts/:id/attachments', inventoryManagerWriteRoles, inventoryManagerController.inventoryReceiptUpload, inventoryManagerController.appendReceiptAttachments);
router.delete('/receipts/:id/attachments/:attachmentId', inventoryManagerWriteRoles, inventoryManagerController.deleteReceiptAttachment);
router.delete('/receipts/:id/primary-image', inventoryManagerWriteRoles, inventoryManagerController.deletePrimaryReceiptImage);
router.post('/receipts/:id/link', inventoryManagerWriteRoles, inventoryManagerController.linkReceipt);

router.get('/barbers', inventoryManagerRoles, inventoryManagerController.listBarbers);
router.get('/handouts/catalog', inventoryManagerRoles, inventoryManagerController.listInventoryHandoutCatalog);
router.get(
  '/bottle-lifecycle/consumption',
  inventoryManagerRoles,
  (req, res, next) => {
    try {
      validateBottleConsumptionQuery(req.query);
      next();
    } catch (error) {
      next(error);
    }
  },
  inventoryManagerController.listBottleConsumption,
);
router.get('/bottle-lifecycle', inventoryManagerRoles, inventoryManagerController.listBottleLifecycle);
router.get('/handouts', inventoryManagerRoles, inventoryManagerController.listInventoryHandouts);
router.post('/handouts', inventoryManagerWriteRoles, inventoryManagerController.recordInventoryHandout);
router.post('/bottle-lifecycle/:id/return', inventoryManagerWriteRoles, inventoryManagerController.returnBottle);

router.get('/stock-reports/daily', inventoryManagerRoles, inventoryManagerController.getDailyStockReport);
router.post('/stock-reports/email', inventoryManagerOnly, inventoryManagerController.sendDailyStockReport);

router.get('/expirable-stock', inventoryManagerRoles, inventoryManagerController.listExpirableStock);
router.post('/expirable-stock/units/:unitId/dispose', inventoryManagerWriteRoles, inventoryManagerController.disposeExpiredUnit);

router.get('/reports', reviewRoles, inventoryController.getInventoryReport);
router.get('/alerts', inventoryReadRoles, inventoryController.getInventoryAlerts);
router.get('/variances', reviewRoles, inventoryController.getPhysicalCountVariances);
router.get('/consumption', inventoryReadRoles, inventoryController.getConsumption);
router.get('/movements', inventoryReadRoles, inventoryController.getStockMovements);
router.get('/counts', reviewRoles, inventoryController.getStockCounts);
router.post(
  '/counts',
  countSubmitRoles,
  (req, res, next) => {
    try {
      validateStockCountPayload(req.body);
      next();
    } catch (error) {
      next(error);
    }
  },
  inventoryController.submitStockCount,
);
router.get('/counts/pending', reviewRoles, inventoryController.getPendingStockCounts);
router.patch('/counts/:id/review', reviewRoles, inventoryController.reviewStockCount);

export default router;

