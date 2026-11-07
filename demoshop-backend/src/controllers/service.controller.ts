import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { serviceService } from '../services/service.service';

/**
 * Controller for barbershop Service CRUD operations.
 * Extends BaseController for standardized error handling.
 */
export class ServiceController extends BaseController {
  async getAllServices(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const services = await serviceService.getAllServices();
      res.status(200).json(services);
    }, 'GetAllServices');
  }

  async createService(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const newService = await serviceService.createService(req.body, req);
      res.status(201).json(newService);
    }, 'CreateService');
  }

  async updateService(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const updated = await serviceService.updateService(Number(req.params.id), req.body, req);
      if (!updated) { res.status(404).json({ message: 'Service not found' }); return; }
      res.status(200).json(updated);
    }, 'UpdateService');
  }

  async deleteService(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const deleted = await serviceService.deleteService(Number(req.params.id), req);
      if (!deleted) { res.status(404).json({ message: 'Service not found' }); return; }
      res.status(200).json({ message: 'Service deleted successfully' });
    }, 'DeleteService');
  }
}

const controller = new ServiceController();

export const getAllServices = controller.getAllServices.bind(controller);
export const createService = controller.createService.bind(controller);
export const updateService = controller.updateService.bind(controller);
export const deleteService = controller.deleteService.bind(controller);

export default controller;
