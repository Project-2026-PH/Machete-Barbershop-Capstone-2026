import db from '../db';
import logger from '../utils/general/logger';

export interface StaffSearchResultRow {
  user_id: string;
  name: string;
  role: string;
  email: string;
  username: string | null;
  profile_picture: string | null;
  barber_id: number | null;
}

export interface InventorySearchResultRow {
  inventory_product_id: string;
  name: string;
  category: string;
  ownership_type: string;
  unit: string;
  is_active: boolean;
}

export interface ServiceSearchResultRow {
  service_id: number;
  title: string;
  category: string | null;
  price: number | string;
  description: string | null;
  duration_minutes: number | null;
}

export interface AppointmentSearchResultRow {
  id: string | number;
  customer_user_id?: string | null;
  customer_name: string;
  barber_name: string | null;
  service_title: string | null;
  status: string;
  preferred_date: string | null;
  preferred_time: string | null;
  created_at: string;
  local_date: string | null;
}

export interface TransactionSearchResultRow {
  transaction_id: number;
  receipt_number: string | null;
  total_amount: number | string;
  payment_method: string;
  gcash_ref_no: string | null;
  customer_name: string | null;
  created_at: string;
  local_date: string | null;
}

export interface StockRequestSearchResultRow {
  id: string;
  po_number: string;
  status: string;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface AccountSearchResultRow {
  user_id: string;
  username: string | null;
  email: string;
  role: string;
  is_verified: boolean;
  created_at: string;
}

export interface FeatureSearchResultRow {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
}

export interface AuditLogSearchResultRow {
  id: number;
  action: string;
  resource: string;
  details: string | null;
  username: string | null;
  email: string | null;
  created_at: string;
}

export class SearchRepository {
  async searchStaff(query: string, limit: number = 8): Promise<StaffSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           u.user_id,
           COALESCE(b.name, u.username, u.email) AS name,
           u.role,
           u.email,
           u.username,
           u.profile_picture,
           b.barber_id
         FROM users u
         LEFT JOIN barbers b ON b.user_id = u.user_id
         WHERE u.deleted_at IS NULL
           AND u.role IN ('Barber', 'Cashier', 'Admin', 'ShopAdmin', 'Owner', 'System Admin', 'Inventory Manager')
           AND (
             u.username ILIKE $1 
             OR u.email ILIKE $1 
             OR b.name ILIKE $1
           )
         ORDER BY 
           CASE 
             WHEN b.name ILIKE $1 THEN 1
             WHEN u.username ILIKE $1 THEN 2
             ELSE 3
           END,
           name ASC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchStaff failed:', err);
      return [];
    }
  }

  async searchInventory(query: string, limit: number = 8): Promise<InventorySearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           p.inventory_product_id,
           p.name,
           p.category,
           p.ownership_type,
           p.unit,
           p.is_active
         FROM inventory_products p
         WHERE p.is_active = TRUE
           AND (
             p.name ILIKE $1 
             OR p.category ILIKE $1 
             OR p.ownership_type ILIKE $1 
             OR p.unit ILIKE $1
           )
         ORDER BY 
           CASE 
             WHEN p.name ILIKE $1 THEN 1
             ELSE 2
           END,
           p.name ASC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchInventory failed:', err);
      return [];
    }
  }

  async searchServices(query: string, limit: number = 8): Promise<ServiceSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           s.service_id,
           s.title,
           s.category,
           s.price,
           s.description,
           s.duration_minutes
         FROM services s
         WHERE (
           s.title ILIKE $1 
           OR s.category ILIKE $1 
           OR COALESCE(s.description, '') ILIKE $1
         )
         ORDER BY 
           CASE 
             WHEN s.title ILIKE $1 THEN 1
             ELSE 2
           END,
           s.title ASC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchServices failed:', err);
      return [];
    }
  }

  async searchAppointments(query: string, limit: number = 8): Promise<AppointmentSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           a.id::text AS id,
           a.customer_id::text AS customer_user_id,
           COALESCE(a.customer_name, CONCAT_WS(' ', c.first_name, c.last_name), 'Customer') AS customer_name,
           b.name AS barber_name,
           s.title AS service_title,
           a.status,
           a.scheduled_date::text AS preferred_date,
           a.scheduled_time AS preferred_time,
           a.created_at::text,
           COALESCE(a.scheduled_date, (a.created_at AT TIME ZONE 'Asia/Manila')::date)::text AS local_date
         FROM appointments a
         LEFT JOIN customers c ON c.user_id = a.customer_id OR c.customer_id = a.customer_int_id
         LEFT JOIN barbers b ON b.barber_id = a.barber_id
         LEFT JOIN services s ON s.service_id = a.service_id
         WHERE (
           a.customer_name ILIKE $1
           OR c.first_name ILIKE $1
           OR c.last_name ILIKE $1
           OR CONCAT_WS(' ', c.first_name, c.last_name) ILIKE $1
           OR b.name ILIKE $1
           OR s.title ILIKE $1
           OR a.id::text ILIKE $1
         )
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchAppointments failed:', err);
      return [];
    }
  }

  async searchTransactions(query: string, limit: number = 8): Promise<TransactionSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           t.transaction_id,
           rd.receipt_number,
           t.total_amount,
           COALESCE(t.payment_method, 'Cash') AS payment_method,
           t.gcash_ref_no,
           COALESCE(CONCAT_WS(' ', c.first_name, c.last_name), qe.customer_name, t.customer_name, 'Customer') AS customer_name,
           t.created_at::text,
           (t.created_at AT TIME ZONE 'Asia/Manila')::date::text AS local_date
         FROM transactions t
         LEFT JOIN queue_entries qe ON qe.id = t.queue_entry_id
         LEFT JOIN customers c ON c.customer_id = COALESCE(t.customer_id, qe.customer_id)
         LEFT JOIN receipt_documents rd ON rd.transaction_id = t.transaction_id OR (rd.queue_entry_id = t.queue_entry_id AND rd.queue_entry_id IS NOT NULL)
         WHERE (
           t.transaction_id::text ILIKE $1
           OR t.gcash_ref_no ILIKE $1
           OR rd.receipt_number ILIKE $1
           OR CONCAT_WS(' ', c.first_name, c.last_name) ILIKE $1
           OR qe.customer_name ILIKE $1
           OR t.customer_name ILIKE $1
         )
         ORDER BY t.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchTransactions failed:', err);
      return [];
    }
  }

  async searchStockRequests(query: string, limit: number = 8): Promise<StockRequestSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           po.id::text AS id,
           po.po_number,
           po.status,
           po.notes,
           creator.username AS created_by_name,
           po.created_at::text
         FROM purchase_orders po
         LEFT JOIN users creator ON creator.user_id = po.created_by
         WHERE (
           po.po_number ILIKE $1
           OR COALESCE(po.notes, '') ILIKE $1
           OR creator.username ILIKE $1
           OR po.status ILIKE $1
         )
         ORDER BY po.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchStockRequests failed:', err);
      return [];
    }
  }

  async searchAccounts(query: string, limit: number = 8): Promise<AccountSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           u.user_id::text,
           u.username,
           u.email,
           u.role,
           u.is_verified,
           u.created_at::text
         FROM users u
         WHERE u.deleted_at IS NULL
           AND (
             u.username ILIKE $1
             OR u.email ILIKE $1
             OR u.role ILIKE $1
             OR u.user_id::text ILIKE $1
           )
         ORDER BY 
           CASE 
             WHEN u.username ILIKE $1 THEN 1
             WHEN u.email ILIKE $1 THEN 2
             ELSE 3
           END,
           u.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchAccounts failed:', err);
      return [];
    }
  }

  async searchFeatures(query: string, limit: number = 8): Promise<FeatureSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           f.id,
           f.name,
           f.description,
           f.category,
           f.status
         FROM system_features f
         WHERE (
           f.id ILIKE $1
           OR f.name ILIKE $1
           OR f.category ILIKE $1
           OR f.description ILIKE $1
         )
         ORDER BY f.name ASC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchFeatures failed:', err);
      return [];
    }
  }

  async searchAuditLogs(query: string, limit: number = 8): Promise<AuditLogSearchResultRow[]> {
    try {
      const searchPattern = `%${query.trim()}%`;
      const result = await db.query(
        `SELECT 
           a.id,
           a.action,
           a.resource,
           a.details::text,
           u.username,
           u.email,
           a.created_at::text
         FROM audit_logs a
         LEFT JOIN users u ON u.user_id = a.user_id
         WHERE (
           a.action ILIKE $1
           OR a.resource ILIKE $1
           OR u.email ILIKE $1
           OR u.username ILIKE $1
           OR a.details::text ILIKE $1
         )
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      return result?.rows || [];
    } catch (err: unknown) {
      logger.error('[SearchRepository] searchAuditLogs failed:', err);
      return [];
    }
  }
}

export const searchRepository = new SearchRepository();
