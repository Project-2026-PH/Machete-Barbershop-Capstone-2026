import { Request } from 'express';
import { serviceRepository } from '../repositories/service.repository';
import { Service as ServiceType, ServiceData } from '@demoshop/shared-types';
import { auditService } from './audit.service';
import { AppError } from '../utils/error/AppError';

const MAX_SERVICE_PRICE = 99_999_999.99;
const MAX_SERVICE_TITLE_LENGTH = 100;
const MAX_SERVICE_CATEGORY_LENGTH = 50;
const MAX_SERVICE_SUBCATEGORY_LENGTH = 50;

const getActorId = (req?: Request): string | null => {
  const user = req?.user as { user_id?: string; id?: string | number } | undefined;
  const actorId = user?.user_id ?? user?.id;
  return actorId === undefined || actorId === null ? null : String(actorId);
};

const validateServiceId = (id: number): void => {
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError('Invalid service ID.', 400);
  }
};

const validateOptionalText = (
  value: unknown,
  fieldName: string,
  maxLength?: number
): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || (maxLength !== undefined && value.trim().length > maxLength)) {
    throw new AppError(`Invalid service ${fieldName}.`, 400);
  }
  return value.trim() || undefined;
};

const validateServiceData = (data: ServiceData): ServiceData => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('Invalid service data.', 400);
  }

  const { title, price, duration_minutes } = data as ServiceData & {
    duration_minutes?: unknown;
  };

  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_SERVICE_TITLE_LENGTH) {
    throw new AppError('Invalid service title.', 400);
  }
  if (
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > MAX_SERVICE_PRICE ||
    Math.abs(Math.round(price * 100) - price * 100) > Number.EPSILON * 100
  ) {
    throw new AppError('Invalid service price.', 400);
  }
  if (
    duration_minutes !== undefined &&
    duration_minutes !== null &&
    (!Number.isInteger(duration_minutes) || duration_minutes < 1)
  ) {
    throw new AppError('Invalid service duration.', 400);
  }

  return {
    title: title.trim(),
    price,
    category: validateOptionalText(data.category, 'category', MAX_SERVICE_CATEGORY_LENGTH),
    sub_category: validateOptionalText(data.sub_category, 'sub_category', MAX_SERVICE_SUBCATEGORY_LENGTH),
    description: validateOptionalText(data.description, 'description'),
    duration_minutes: duration_minutes === null ? undefined : duration_minutes as number | undefined,
    image_url: validateOptionalText(data.image_url, 'image_url'),
  };
};

/**
 * Service for barbershop Service CRUD business logic.
 * Validates mutation input, delegates DB access, and records successful mutations.
 */
export class ServiceService {
  async getAllServices(): Promise<ServiceType[]> {
    return serviceRepository.findAll();
  }

  async createService(data: ServiceData, req?: Request): Promise<ServiceType> {
    const service = await serviceRepository.create(validateServiceData(data));
    auditService.logSecurityEvent({
      userId: getActorId(req),
      action: 'SERVICE_CREATE',
      resource: 'service_catalog',
      details: { service_id: service.service_id },
      req,
    });
    return service;
  }

  async updateService(id: number, data: ServiceData, req?: Request): Promise<ServiceType | null> {
    validateServiceId(id);
    const service = await serviceRepository.update(id, validateServiceData(data));
    if (service) {
      auditService.logSecurityEvent({
        userId: getActorId(req),
        action: 'SERVICE_UPDATE',
        resource: 'service_catalog',
        details: { service_id: service.service_id },
        req,
      });
    }
    return service;
  }

  async deleteService(id: number, req?: Request): Promise<ServiceType | null> {
    validateServiceId(id);
    const service = await serviceRepository.delete(id);
    if (service) {
      auditService.logSecurityEvent({
        userId: getActorId(req),
        action: 'SERVICE_DELETE',
        resource: 'service_catalog',
        details: { service_id: service.service_id },
        req,
      });
    }
    return service;
  }
}

export const serviceService = new ServiceService();
export default serviceService;
