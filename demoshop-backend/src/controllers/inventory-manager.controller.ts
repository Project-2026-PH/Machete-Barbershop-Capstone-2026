import type { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { inventoryManagerService } from '../services/inventory-manager.service';
import { createImageArrayUploadMiddleware } from '../utils/general/image-upload.util';
import { MAX_RECEIPT_BYTES } from '../utils/cashier/receipt-evidence.util';

const actorFromRequest = (req: Request) => {
  const user = req.user as any;
  return {
    userId: String(user?.user_id || user?.id || ''),
    branchId: user?.branch_id,
    role: user?.role,
  };
};

export const inventoryReceiptUpload = createImageArrayUploadMiddleware('receipt', 12, MAX_RECEIPT_BYTES);

export class InventoryManagerController extends BaseController {
  async listSuppliers(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listSuppliers(actorFromRequest(req))); }, 'ListInventorySuppliers');
  }

  async createSupplier(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.status(201).json(await inventoryManagerService.createSupplier(actorFromRequest(req), req.body || {}, req)); }, 'CreateInventorySupplier');
  }

  async updateSupplier(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.updateSupplier(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'UpdateInventorySupplier');
  }

  async deactivateSupplier(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      await inventoryManagerService.deactivateSupplier(actorFromRequest(req), req.params.id, req);
      res.status(204).end();
    }, 'DeactivateInventorySupplier');
  }

  async assignDefaultSupplier(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.assignDefaultSupplier(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'AssignDefaultInventorySupplier');
  }

  async listPurchaseOrderCatalog(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listPurchaseOrderCatalog(actorFromRequest(req))); }, 'ListPurchaseOrderCatalog');
  }

  async getPurchaseOrderSummary(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.getPurchaseOrderSummary(actorFromRequest(req))); }, 'GetPurchaseOrderSummary');
  }

  async listPurchaseOrders(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listPurchaseOrders(actorFromRequest(req), req.query.status)); }, 'ListPurchaseOrders');
  }

  async createPurchaseOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.status(201).json(await inventoryManagerService.createPurchaseOrder(actorFromRequest(req), req.body || {}, req)); }, 'CreatePurchaseOrder');
  }

  async updatePurchaseOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.updatePurchaseOrder(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'UpdatePurchaseOrder');
  }

  async deletePurchaseOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { await inventoryManagerService.deletePurchaseOrder(actorFromRequest(req), req.params.id, req); res.status(204).send(); }, 'DeletePurchaseOrder');
  }

  async submitPurchaseOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.submitPurchaseOrder(actorFromRequest(req), req.params.id, req)); }, 'SubmitPurchaseOrder');
  }

  async reviewPurchaseOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.reviewPurchaseOrder(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'ReviewPurchaseOrder');
  }

  async restorePurchaseOrderDeletedItems(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.restorePurchaseOrderDeletedItems(actorFromRequest(req), req.params.id, req)); }, 'RestorePurchaseOrderDeletedItems');
  }

  async fulfillPurchaseOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.fulfillPurchaseOrder(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'FulfillPurchaseOrder');
  }

  async listReceipts(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listReceipts(actorFromRequest(req))); }, 'ListInventoryReceipts');
  }

  async uploadReceipt(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.status(201).json(await inventoryManagerService.uploadReceipt(actorFromRequest(req), req.body || {}, Array.isArray(req.files) ? req.files : [], req)); }, 'UploadInventoryReceipt');
  }

  async appendReceiptAttachments(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.status(201).json(await inventoryManagerService.appendReceiptAttachments(actorFromRequest(req), req.params.id, Array.isArray(req.files) ? req.files : [], req));
    }, 'AppendReceiptAttachments');
  }

  async deleteReceiptAttachment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      await inventoryManagerService.deleteReceiptAttachment(actorFromRequest(req), req.params.id, req.params.attachmentId, req);
      res.status(204).end();
    }, 'DeleteReceiptAttachment');
  }

  async deletePrimaryReceiptImage(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      await inventoryManagerService.deletePrimaryReceiptImage(actorFromRequest(req), req.params.id, req);
      res.status(204).end();
    }, 'DeletePrimaryReceiptImage');
  }

  async linkReceipt(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.linkReceipt(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'LinkInventoryReceipt');
  }

  async unlinkReceipt(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.unlinkReceipt(actorFromRequest(req), req.params.id, req)); }, 'UnlinkInventoryReceipt');
  }

  async listBarbers(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listBarbers(actorFromRequest(req))); }, 'ListInventoryBarbers');
  }

  async listInventoryHandoutCatalog(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listInventoryHandoutCatalog(actorFromRequest(req))); }, 'ListInventoryHandoutCatalog');
  }

  async listBottleLifecycle(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listBottleLifecycle(actorFromRequest(req), req.query.status)); }, 'ListBottleLifecycle');
  }

  async listInventoryHandouts(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listInventoryHandouts(actorFromRequest(req))); }, 'ListInventoryHandouts');
  }

  async listBottleConsumption(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listBottleConsumption(actorFromRequest(req), req.query)); }, 'ListBottleConsumption');
  }

  async recordInventoryHandout(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.status(201).json(await inventoryManagerService.recordInventoryHandout(actorFromRequest(req), req.body || {}, req)); }, 'RecordInventoryHandout');
  }

  async returnBottle(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.returnBottle(actorFromRequest(req), req.params.id, req.body || {}, req)); }, 'ReturnBottle');
  }

  async getDailyStockReport(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.getDailyStockReport(actorFromRequest(req), req.query.date)); }, 'GetDailyStockReport');
  }

  async sendDailyStockReport(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.sendDailyStockReport(actorFromRequest(req), req.body?.date ?? req.query.date, req)); }, 'SendDailyStockReport');
  }

  async runStockCountDueReminders(_req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryManagerService.sendStockCountDueReminders());
    }, 'RunStockCountDueReminders');
  }

  async listExpirableStock(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => { res.json(await inventoryManagerService.listExpirableStock(actorFromRequest(req))); }, 'ListExpirableStock');
  }

  async disposeExpiredUnit(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryManagerService.disposeExpiredUnit(actorFromRequest(req), String(req.params.unitId), req.body?.reason, req));
    }, 'DisposeExpiredUnit');
  }
}

const controller = new InventoryManagerController();
export const listSuppliers = controller.listSuppliers.bind(controller);
export const createSupplier = controller.createSupplier.bind(controller);
export const updateSupplier = controller.updateSupplier.bind(controller);
export const deactivateSupplier = controller.deactivateSupplier.bind(controller);
export const assignDefaultSupplier = controller.assignDefaultSupplier.bind(controller);
export const listPurchaseOrderCatalog = controller.listPurchaseOrderCatalog.bind(controller);
export const getPurchaseOrderSummary = controller.getPurchaseOrderSummary.bind(controller);
export const listPurchaseOrders = controller.listPurchaseOrders.bind(controller);
export const createPurchaseOrder = controller.createPurchaseOrder.bind(controller);
export const updatePurchaseOrder = controller.updatePurchaseOrder.bind(controller);
export const deletePurchaseOrder = controller.deletePurchaseOrder.bind(controller);
export const submitPurchaseOrder = controller.submitPurchaseOrder.bind(controller);
export const reviewPurchaseOrder = controller.reviewPurchaseOrder.bind(controller);
export const restorePurchaseOrderDeletedItems = controller.restorePurchaseOrderDeletedItems.bind(controller);
export const fulfillPurchaseOrder = controller.fulfillPurchaseOrder.bind(controller);
export const listReceipts = controller.listReceipts.bind(controller);
export const uploadReceipt = controller.uploadReceipt.bind(controller);
export const appendReceiptAttachments = controller.appendReceiptAttachments.bind(controller);
export const deleteReceiptAttachment = controller.deleteReceiptAttachment.bind(controller);
export const deletePrimaryReceiptImage = controller.deletePrimaryReceiptImage.bind(controller);
export const linkReceipt = controller.linkReceipt.bind(controller);
export const unlinkReceipt = controller.unlinkReceipt.bind(controller);
export const listBarbers = controller.listBarbers.bind(controller);
export const listInventoryHandoutCatalog = controller.listInventoryHandoutCatalog.bind(controller);
export const listBottleLifecycle = controller.listBottleLifecycle.bind(controller);
export const listInventoryHandouts = controller.listInventoryHandouts.bind(controller);
export const listBottleConsumption = controller.listBottleConsumption.bind(controller);
export const recordInventoryHandout = controller.recordInventoryHandout.bind(controller);
export const returnBottle = controller.returnBottle.bind(controller);
export const getDailyStockReport = controller.getDailyStockReport.bind(controller);
export const sendDailyStockReport = controller.sendDailyStockReport.bind(controller);
export const runStockCountDueReminders = controller.runStockCountDueReminders.bind(controller);
export const listExpirableStock = controller.listExpirableStock.bind(controller);
export const disposeExpiredUnit = controller.disposeExpiredUnit.bind(controller);
export default controller;
