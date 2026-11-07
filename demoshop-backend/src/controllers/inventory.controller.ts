import type { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { inventoryService } from '../services/inventory.service';
import { AppError } from '../utils/error/AppError';

const actorFromRequest = (req: Request) => {
  const user = req.user as any;
  return { userId: String(user?.user_id || ''), branchId: user?.branch_id, role: user?.role };
};

export class InventoryController extends BaseController {
  async getInventory(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listInventory(actorFromRequest(req)));
    }, 'GetInventory');
  }

  async getRetailCatalog(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listRetailCatalog(actorFromRequest(req)));
    }, 'GetRetailCatalog');
  }

  async getInventoryForecast(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.getInventoryForecast(actorFromRequest(req)));
    }, 'GetInventoryForecast');
  }

  async createInventoryItem(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.status(201).json(await inventoryService.createInventoryItem(actorFromRequest(req), req.body || {}, req));
    }, 'CreateInventoryItem');
  }

  async bulkDeleteInventoryItems(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const itemIds = req.body?.itemIds || req.body?.ids || (req.query?.ids ? String(req.query.ids).split(',') : []);
      res.json(await inventoryService.bulkDeleteInventoryItems(actorFromRequest(req), itemIds, req));
    }, 'BulkDeleteInventoryItems');
  }

  async updateStockQuantity(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.updateStockQuantity(actorFromRequest(req), req.params.id, req.body || {}, req));
    }, 'UpdateInventoryStockQuantity');
  }

  async replenishStock(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const stockId = req.params.id || req.body?.inventoryStockId || req.body?.id;
      res.json(await inventoryService.replenishStock(actorFromRequest(req), stockId, req.body || {}, req));
    }, 'ReplenishInventoryStock');
  }

  async updateInventoryCostPrice(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.updateInventoryCostPrice(actorFromRequest(req), req.params.id, req.body || {}, req));
    }, 'UpdateInventoryCostPrice');
  }

  async getConsumption(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listConsumption(actorFromRequest(req), req.query.limit));
    }, 'GetInventoryConsumption');
  }

  /** Responds with the authorized, limit-bounded inventory movement report. */
  async getStockMovements(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listStockMovements(actorFromRequest(req), req.query.limit));
    }, 'GetInventoryStockMovements');
  }

  async submitStockCount(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.status(201).json(await inventoryService.submitStockCount(actorFromRequest(req), req.body || {}, req));
    }, 'SubmitInventoryStockCount');
  }

  async getPendingStockCounts(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listPendingStockCounts(actorFromRequest(req)));
    }, 'GetPendingInventoryStockCounts');
  }

  async reviewStockCount(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.reviewStockCount(actorFromRequest(req), req.params.id, req.body || {}, req));
    }, 'ReviewInventoryStockCount');
  }

  async getStockCounts(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listStockCounts(actorFromRequest(req), req.query));
    }, 'GetStockCounts');
  }

  async getPhysicalCountVariances(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.getPhysicalCountVariances(actorFromRequest(req), req.query));
    }, 'GetPhysicalCountVariances');
  }

  async getInventoryReport(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.getInventoryReport(actorFromRequest(req), req.query));
    }, 'GetInventoryReport');
  }

  async getInventoryAlerts(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.getInventoryAlerts(actorFromRequest(req)));
    }, 'GetInventoryAlerts');
  }

  async updateRetailPresentation(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.updateRetailPresentation(actorFromRequest(req), req.params.id, req.body || {}, req));
    }, 'UpdateRetailPresentation');
  }

  async uploadProductImage(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      if (!req.file?.buffer) throw new AppError('No image file provided.', 400);
      res.json(await inventoryService.uploadProductImage(actorFromRequest(req), req.params.id, req.file.buffer, req.file.mimetype, req));
    }, 'UploadProductImage');
  }

  async deleteProductImage(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.deleteProductImage(actorFromRequest(req), req.params.id, req));
    }, 'DeleteProductImage');
  }

  async listRetailTags(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listRetailTags(actorFromRequest(req)));
    }, 'ListRetailTags');
  }

  async createRetailTag(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.status(201).json(await inventoryService.createRetailTag(actorFromRequest(req), req.body?.name, req));
    }, 'CreateRetailTag');
  }

  async listRetailCategories(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.listRetailCategories(actorFromRequest(req)));
    }, 'ListRetailCategories');
  }

  async createRetailCategory(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.status(201).json(await inventoryService.createRetailCategory(actorFromRequest(req), req.body?.name, req));
    }, 'CreateRetailCategory');
  }

  async getPublicShopProducts(_req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      res.json(await inventoryService.getPublicShopProducts());
    }, 'GetPublicShopProducts');
  }
}

const controller = new InventoryController();
export const getInventory = controller.getInventory.bind(controller);
export const getRetailCatalog = controller.getRetailCatalog.bind(controller);
export const getInventoryForecast = controller.getInventoryForecast.bind(controller);
export const createInventoryItem = controller.createInventoryItem.bind(controller);
export const bulkDeleteInventoryItems = controller.bulkDeleteInventoryItems.bind(controller);
export const updateStockQuantity = controller.updateStockQuantity.bind(controller);
export const replenishStock = controller.replenishStock.bind(controller);
export const updateInventoryCostPrice = controller.updateInventoryCostPrice.bind(controller);
export const getConsumption = controller.getConsumption.bind(controller);
export const getStockMovements = controller.getStockMovements.bind(controller);
export const submitStockCount = controller.submitStockCount.bind(controller);
export const getPendingStockCounts = controller.getPendingStockCounts.bind(controller);
export const getStockCounts = controller.getStockCounts.bind(controller);
export const getPhysicalCountVariances = controller.getPhysicalCountVariances.bind(controller);
export const reviewStockCount = controller.reviewStockCount.bind(controller);
export const getInventoryReport = controller.getInventoryReport.bind(controller);
export const getInventoryAlerts = controller.getInventoryAlerts.bind(controller);
export const updateRetailPresentation = controller.updateRetailPresentation.bind(controller);
export const uploadProductImage = controller.uploadProductImage.bind(controller);
export const deleteProductImage = controller.deleteProductImage.bind(controller);
export const listRetailTags = controller.listRetailTags.bind(controller);
export const createRetailTag = controller.createRetailTag.bind(controller);
export const listRetailCategories = controller.listRetailCategories.bind(controller);
export const createRetailCategory = controller.createRetailCategory.bind(controller);
export const getPublicShopProducts = controller.getPublicShopProducts.bind(controller);
export default controller;

