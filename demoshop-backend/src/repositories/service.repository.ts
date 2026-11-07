import db from '../db';
import type { PoolClient } from 'pg';
import { Service as ServiceType, ServiceData } from '@demoshop/shared-types';
import { deleteCache, getCache, setCache } from '../redis';

/**
 * Repository for barbershop Service database operations.
 * Replaces the old models/Service.js flat-object pattern.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const SERVICE_CATALOG_CACHE_KEY = 'catalog:services:active';

export class ServiceRepository {
  private cache: { map: Map<number, ServiceType>; list: ServiceType[]; fetchedAt: number } | null = null;

  private invalidateCache(): void {
    this.cache = null;
    void deleteCache(SERVICE_CATALOG_CACHE_KEY);
    void deleteCache('chatbot:public:services:v2');
  }

  private isCacheValid(): boolean {
    return this.cache !== null && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS;
  }

  private columnEnsured = false;

  private async ensureColumn(): Promise<void> {
    if (this.columnEnsured || process.env.NODE_ENV === 'test') return;
    try {
      await db.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT');
      this.columnEnsured = true;
    } catch {
      // Ignore if column already exists or permissions
    }
  }

  private async loadCache(): Promise<{ map: Map<number, ServiceType>; list: ServiceType[] }> {
    if (this.isCacheValid() && this.cache) {
      return this.cache;
    }
    await this.ensureColumn();
    try {
      const sharedList = await getCache<ServiceType[]>(SERVICE_CATALOG_CACHE_KEY);
      if (Array.isArray(sharedList)) {
        const map = new Map<number, ServiceType>();
        for (const service of sharedList) {
          if (service?.service_id !== undefined) map.set(Number(service.service_id), service);
        }
        this.cache = { map, list: sharedList, fetchedAt: Date.now() };
        return { map, list: sharedList };
      }

      const result = await db.query(
        `SELECT service_id, category, sub_category, title, price,
                duration_minutes, description, image_url
         FROM services
         ORDER BY service_id ASC`,
      );
      const list: ServiceType[] = result?.rows || [];
      const map = new Map<number, ServiceType>();
      for (const service of list) {
        if (service?.service_id !== undefined) {
          map.set(Number(service.service_id), service);
        }
      }
      if (list.length > 0) {
        this.cache = { map, list, fetchedAt: Date.now() };
        void setCache(SERVICE_CATALOG_CACHE_KEY, list, 300);
      }
      return { map, list };
    } catch {
      return { map: new Map(), list: [] };
    }
  }

  /**
   * Finds all services, ordered by ID.
   */
  async findAll(): Promise<ServiceType[]> {
    const { list } = await this.loadCache();
    return list;
  }

  /**
   * Finds a service by ID.
   */
  async findById(id: number): Promise<ServiceType | null> {
    const { map } = await this.loadCache();
    return map.get(Number(id)) || null;
  }

  /**
   * Creates a new service.
   */
  async create(data: ServiceData): Promise<ServiceType> {
    this.invalidateCache();
    await this.ensureColumn();
    const { title, description, price, category, sub_category, duration_minutes, image_url } = data;
    const result = await db.query(
      `INSERT INTO services (category, sub_category, title, price, duration_minutes, description, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [category, sub_category, title, price, duration_minutes, description, image_url || null]
    );
    return result.rows[0];
  }

  /**
   * Updates a service by ID.
   */
  async update(id: number, data: ServiceData): Promise<ServiceType | null> {
    this.invalidateCache();
    await this.ensureColumn();
    const { title, description, price, category, sub_category, duration_minutes, image_url } = data;
    const result = await db.query(
      `UPDATE services
       SET category = $1, sub_category = $2, title = $3, price = $4, duration_minutes = $5, description = $6, image_url = $7
       WHERE service_id = $8
       RETURNING *`,
      [category, sub_category, title, price, duration_minutes, description, image_url !== undefined ? image_url : null, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Deletes a service by ID.
   */
  async delete(id: number): Promise<ServiceType | null> {
    this.invalidateCache();
    const result = await db.query(
      'DELETE FROM services WHERE service_id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Finds services by ID while retaining the caller's requested order.
   */
  async findByIds(serviceIds: number[]): Promise<ServiceType[]> {
    if (serviceIds.length === 0) return [];
    const { map } = await this.loadCache();
    const resolved: ServiceType[] = [];
    let hasAll = true;

    for (const id of serviceIds) {
      const item = map.get(Number(id));
      if (item) {
        resolved.push(item);
      } else {
        hasAll = false;
        break;
      }
    }

    if (hasAll && resolved.length === serviceIds.length) {
      return resolved;
    }

    // Fallback directly to DB if uncached services requested
    const result = await db.query(
      `SELECT service_id, category, sub_category, title, price,
              duration_minutes, description, image_url
       FROM services
       WHERE service_id = ANY($1::int[])
       ORDER BY array_position($1::int[], service_id)`,
      [serviceIds]
    );
    return result?.rows || [];
  }

  /** Reads and locks authoritative service values during an offline order replay. */
  async findByIdsForUpdate(client: PoolClient, serviceIds: number[]): Promise<ServiceType[]> {
    if (serviceIds.length === 0) return [];
    const result = await client.query(
      `SELECT service_id, category, sub_category, title, price,
              duration_minutes, description, image_url
       FROM services
       WHERE service_id = ANY($1::int[])
       ORDER BY array_position($1::int[], service_id)
       FOR SHARE`,
      [serviceIds],
    );
    return result?.rows || [];
  }

  /**
   * Finds a service's duration by ID.
   */
  async findDurationById(serviceId: number): Promise<number | null> {
    const service = await this.findById(serviceId);
    return service ? Number(service.duration_minutes) || null : null;
  }
}

export const serviceRepository = new ServiceRepository();
