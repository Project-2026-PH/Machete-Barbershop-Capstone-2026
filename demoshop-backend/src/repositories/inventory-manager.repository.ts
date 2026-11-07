import crypto from 'node:crypto';
import db from '../db';
import { parseManilaDateBoundary } from './inventory.repository';
import logger from '../utils/general/logger';
import type { DisposeUnitResponse, ExpirableBatchUnit, ExpirableStockBatch, ExpirableStockResponse, ExpiryStatus } from '@demoshop/shared-types';

type Queryable = {
  query: (...args: any[]) => Promise<any>;
};

export type InventoryManagerRepositoryErrorCode =
  | 'INVENTORY_MANAGER_NOT_FOUND'
  | 'INVENTORY_MANAGER_INVALID_BRANCH'
  | 'INVENTORY_MANAGER_INVALID_TRANSITION'
  | 'INVENTORY_MANAGER_DUPLICATE_ACTIVE_ISSUANCE'
  | 'INVENTORY_MANAGER_INVALID_RECEIPT'
  | 'INVENTORY_MANAGER_RECEIPT_NOT_LINKED'
  | 'INVENTORY_MANAGER_STOCK_NOT_FOUND'
  | 'INVENTORY_MANAGER_INSUFFICIENT_STOCK'
  | 'INVENTORY_MANAGER_INVALID_QUANTITY'
  | 'INVENTORY_MANAGER_SUPPLIER_NOT_FOUND'
  | 'INVENTORY_MANAGER_PO_NOT_FOUND'
  | 'INVENTORY_MANAGER_PO_EMPTY'
  | 'INVENTORY_MANAGER_BARBER_NOT_FOUND'
  | 'INVENTORY_MANAGER_LIFECYCLE_NOT_FOUND'
  | 'INVENTORY_MANAGER_REPORT_EMAIL_NOT_FOUND';

export const inventoryManagerRepositoryError = (
  code: InventoryManagerRepositoryErrorCode,
  message: string,
): Error & { code: InventoryManagerRepositoryErrorCode } => Object.assign(new Error(message), { code });

export interface SupplierInput {
  branchId: number;
  name: string;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  createdBy: string;
}

export interface SupplierUpdateInput {
  id: string;
  branchId: number | null;
  name?: string;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface PurchaseOrderLineInput {
  inventoryStockId: number;
  supplierId?: string | null;
  quantityRequested: number;
  unitCost?: number | null;
  notes?: string | null;
}

export interface CreatePurchaseOrderInput {
  branchId: number;
  createdBy: string;
  notes?: string | null;
  status?: 'draft' | 'pending';
  lines: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderInput extends CreatePurchaseOrderInput {
  purchaseOrderId: string;
}

export interface ReviewPurchaseOrderInput {
  purchaseOrderId: string;
  branchId: number | null;
  reviewedBy: string;
  decision: 'approved' | 'rejected';
  reviewNotes?: string | null;
}

export interface FulfillPurchaseOrderInput {
  purchaseOrderId: string;
  branchId: number | null;
  fulfilledBy: string;
  receiptId?: string | null;
}

export interface ReceiptInput {
  id: string;
  branchId: number;
  receiptNumber?: string | null;
  supplierId?: string | null;
  purchaseDate: string;
  totalAmount?: number | null;
  receiptImagePath: string;
  uploadedBy: string;
  notes?: string | null;
}

export interface ReceiptAttachmentInput {
  receiptId: string;
  storagePath: string;
  mimeType: string;
}

export interface InventoryHandoutInput {
  branchId: number;
  inventoryStockId: number;
  barberId: number;
  quantity: number;
  loggedBy: string;
  notes?: string | null;
}

export interface BottleReturnInput {
  id: string;
  branchId: number;
  returnCondition: 'empty' | 'partially_used';
  estimatedRemainingPercent: number;
  notes?: string | null;
}

export interface DailyStockReportQuery {
  branchId: number;
  reportDate: string;
}

export interface StockReportEmailInput {
  id: string;
  branchId: number;
  reportDate: string;
  sentBy: string;
  recipientEmail: string;
  ccEmail?: string | null;
}

const asNumber = (value: unknown): number => Number(value || 0);
const roundQuantity = (value: number): number => Number(value.toFixed(3));
const roundMoney = (value: number): number => Number(value.toFixed(2));
const cleanNullable = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

let expirableStockSchemaReady = false;
let expirableStockSchemaSetup: Promise<void> | null = null;

export const ensureExpirableStockSchema = async (): Promise<void> => {
  if (expirableStockSchemaReady || process.env.NODE_ENV === 'test') return;
  if (!expirableStockSchemaSetup) {
    expirableStockSchemaSetup = (async () => {
      try {
        await db.query(`
          ALTER TABLE public.inventory_products
            ADD COLUMN IF NOT EXISTS is_expirable BOOLEAN NOT NULL DEFAULT FALSE;

          ALTER TABLE public.inventory_stock_movements
            DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

          ALTER TABLE public.inventory_stock_movements
            ADD CONSTRAINT inventory_stock_movements_movement_type_check
            CHECK (movement_type IN ('count_correction', 'consumption', 'receipt', 'manual_adjustment', 'spoilage'));

          CREATE TABLE IF NOT EXISTS public.inventory_stock_batches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            branch_id INT NOT NULL REFERENCES public.branches(branch_id) ON DELETE RESTRICT,
            inventory_stock_id BIGINT NOT NULL REFERENCES public.inventory_stock(inventory_stock_id) ON DELETE RESTRICT,
            purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
            receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
            batch_number TEXT NOT NULL,
            received_date DATE NOT NULL DEFAULT CURRENT_DATE,
            initial_quantity NUMERIC(12, 3) NOT NULL CHECK (initial_quantity > 0),
            current_quantity NUMERIC(12, 3) NOT NULL CHECK (current_quantity >= 0),
            expiration_date DATE NOT NULL,
            manufactured_date DATE,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'consumed')),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          ALTER TABLE public.inventory_stock_batches
            ALTER COLUMN branch_id DROP NOT NULL;

          CREATE TABLE IF NOT EXISTS public.inventory_stock_batch_units (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            batch_id UUID NOT NULL REFERENCES public.inventory_stock_batches(id) ON DELETE CASCADE,
            unit_number INT NOT NULL,
            expiration_date DATE NOT NULL,
            is_disposed BOOLEAN NOT NULL DEFAULT FALSE,
            disposed_at TIMESTAMPTZ,
            disposed_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (batch_id, unit_number)
          );
        `);
        expirableStockSchemaReady = true;
      } catch (err: any) {
        logger.warn(`[InventoryManagerRepository] ensureExpirableStockSchema: ${err?.message}`);
      } finally {
        expirableStockSchemaSetup = null;
      }
    })();
  }
  await expirableStockSchemaSetup;
};

const loadCumulativeBarberCustomerCount = async (
  queryable: Queryable,
  barberId: number,
  branchId: number,
): Promise<number> => {
  const result = await queryable.query(
    `SELECT COUNT(*)::int AS total_customers
     FROM queue_entries
     WHERE barber_id = $1
       AND branch_id = $2
       AND status::text = 'completed'`,
    [barberId, branchId],
  );
  return Number(result.rows[0]?.total_customers || 0);
};

const mapSupplier = (row: any) => ({
  id: String(row.id),
  branchId: row.branch_id == null ? null : Number(row.branch_id),
  name: row.name,
  contactPerson: row.contact_person || '',
  contactNumber: row.contact_number || '',
  email: row.email || '',
  address: row.address || '',
  notes: row.notes || '',
  isActive: row.is_active === true,
  itemsSupplied: Number(row.items_supplied || 0),
  createdAt: row.created_at,
});

const mapPurchaseOrderLine = (row: any) => ({
  id: String(row.id),
  inventoryStockId: String(row.inventory_stock_id),
  inventoryProductId: row.inventory_product_id ? String(row.inventory_product_id) : undefined,
  itemName: row.item_name,
  unit: row.unit,
  category: row.category,
  currentStock: asNumber(row.current_quantity),
  defaultSupplierId: row.default_supplier_id ? String(row.default_supplier_id) : null,
  supplierId: row.supplier_id ? String(row.supplier_id) : null,
  supplierName: row.supplier_name || null,
  quantityRequested: asNumber(row.quantity_requested),
  unitCost: row.unit_cost == null ? null : roundMoney(asNumber(row.unit_cost)),
  notes: row.notes || '',
  isDeleted: Boolean(row.product_is_active === false || row.stock_is_active === false),
});

const mapPurchaseOrder = (row: any, lines: any[] = []) => ({
  id: String(row.id),
  branchId: Number(row.branch_id),
  poNumber: row.po_number,
  status: row.status,
  createdBy: row.created_by,
  createdByName: row.created_by_name || row.created_by,
  reviewedBy: row.reviewed_by || null,
  reviewedByName: row.reviewed_by_name || null,
  reviewNotes: row.review_notes || '',
  submittedAt: row.submitted_at || null,
  reviewedAt: row.reviewed_at || null,
  fulfilledAt: row.fulfilled_at || null,
  receiptId: row.receipt_id ? String(row.receipt_id) : null,
  receiptNumber: row.receipt_number || null,
  receiptImagePath: row.receipt_image_url || null,
  receiptAttachmentPaths: Array.isArray(row.receipt_attachment_paths) ? row.receipt_attachment_paths : [],
  receiptAttachmentIds: Array.isArray(row.receipt_attachment_ids) ? row.receipt_attachment_ids.map(String) : [],
  notes: row.notes || '',
  createdAt: row.created_at,
  lines: lines.map(mapPurchaseOrderLine),
});

const purchaseOrderSelect = `
  SELECT po.*, creator.username AS created_by_name,
         reviewer.username AS reviewed_by_name,
         r.receipt_number, r.receipt_image_url,
         COALESCE((SELECT json_agg(ra.storage_path ORDER BY ra.created_at, ra.id)
                   FROM receipt_attachments ra WHERE ra.receipt_id = r.id), '[]'::json) AS receipt_attachment_paths
         ,COALESCE((SELECT json_agg(ra.id::text ORDER BY ra.created_at, ra.id)
                   FROM receipt_attachments ra WHERE ra.receipt_id = r.id), '[]'::json) AS receipt_attachment_ids
  FROM purchase_orders po
  LEFT JOIN users creator ON creator.user_id = po.created_by
  LEFT JOIN users reviewer ON reviewer.user_id = po.reviewed_by
  LEFT JOIN receipts r ON r.id = po.receipt_id`;

const loadPurchaseOrder = async (
  queryable: Queryable,
  purchaseOrderId: string,
  branchId: number | null,
): Promise<any | null> => {
  const orderResult = await queryable.query(
    `${purchaseOrderSelect}
     WHERE po.id = $1::uuid
       AND ($2::int IS NULL OR po.branch_id = $2::int)`,
    [purchaseOrderId, branchId],
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  const lineResult = await queryable.query(
    `SELECT li.*, p.name AS item_name, p.unit, p.category,
            p.inventory_product_id,
            p.is_active AS product_is_active,
            s.is_active AS stock_is_active,
            p.default_supplier_id, s.current_quantity AS current_quantity,
            supplier.name AS supplier_name
     FROM po_line_items li
     JOIN inventory_stock s ON s.inventory_stock_id = li.inventory_stock_id
     JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
     LEFT JOIN suppliers supplier ON supplier.id = li.supplier_id
     WHERE li.po_id = $1::uuid
     ORDER BY li.id`,
    [purchaseOrderId],
  );

  return mapPurchaseOrder(order, lineResult.rows);
};

const loadPurchaseOrders = async (
  queryable: Queryable,
  orderRows: any[],
): Promise<any[]> => {
  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((row) => String(row.id));
  const lineResult = await queryable.query(
    `SELECT li.*, p.name AS item_name, p.unit, p.category,
            p.inventory_product_id,
            p.is_active AS product_is_active,
            s.is_active AS stock_is_active,
            p.default_supplier_id, s.current_quantity AS current_quantity,
            supplier.name AS supplier_name
     FROM po_line_items li
     JOIN inventory_stock s ON s.inventory_stock_id = li.inventory_stock_id
     JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
     LEFT JOIN suppliers supplier ON supplier.id = li.supplier_id
     WHERE li.po_id = ANY($1::uuid[])
     ORDER BY li.po_id, li.id`,
    [orderIds],
  );
  const linesByOrderId = new Map<string, any[]>();
  for (const line of lineResult.rows) {
    const key = String(line.po_id);
    const lines = linesByOrderId.get(key) || [];
    lines.push(line);
    linesByOrderId.set(key, lines);
  }

  return orderRows.map((row) => mapPurchaseOrder(row, linesByOrderId.get(String(row.id)) || []));
};

const loadPurchaseOrdersByIds = async (
  queryable: Queryable,
  purchaseOrderIds: string[],
  branchId: number | null,
): Promise<any[]> => {
  if (purchaseOrderIds.length === 0) return [];
  const orderResult = await queryable.query(
    `${purchaseOrderSelect}
     WHERE po.id = ANY($1::uuid[])
       AND ($2::int IS NULL OR po.branch_id = $2::int)
     ORDER BY array_position($1::uuid[], po.id)`,
    [purchaseOrderIds, branchId],
  );
  return loadPurchaseOrders(queryable, orderResult.rows);
};

const validateSupplierForLine = async (
  client: Queryable,
  branchId: number,
  supplierId: string | null | undefined,
): Promise<void> => {
  if (!supplierId) return;
  const result = await client.query(
    `SELECT id FROM suppliers
     WHERE id = $1::uuid AND branch_id = $2 AND is_active = TRUE`,
    [supplierId, branchId],
  );
  if (!result.rows[0]) {
    throw inventoryManagerRepositoryError(
      'INVENTORY_MANAGER_SUPPLIER_NOT_FOUND',
      'The selected supplier is not active in this branch.',
    );
  }
};

const insertPurchaseOrderLines = async (
  client: Queryable,
  purchaseOrderId: string,
  branchId: number,
  lines: PurchaseOrderLineInput[],
): Promise<void> => {
  const stockIds = [...new Set(lines.map((line) => Number(line.inventoryStockId)))];
  const stockResult = await client.query(
    `SELECT s.inventory_stock_id, p.default_supplier_id
     FROM inventory_stock s
     JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
     WHERE s.inventory_stock_id = ANY($1::bigint[])
       AND (s.branch_id IS NULL OR s.branch_id = $2)
       AND (p.branch_id IS NULL OR p.branch_id = $2)
       AND p.is_active = TRUE
       AND (s.is_active IS NULL OR s.is_active = TRUE)
     FOR SHARE OF s`,
    [stockIds, branchId],
  );
  const stockById = new Map<number, any>(
    stockResult.rows.map((row: any) => [Number(row.inventory_stock_id), row]),
  );
  const firstMissingStockIndex = lines.findIndex((line) => !stockById.has(Number(line.inventoryStockId)));
  const validStockPrefix = firstMissingStockIndex < 0 ? lines : lines.slice(0, firstMissingStockIndex);
  const preparedLines = validStockPrefix.map((line) => {
    const stock = stockById.get(Number(line.inventoryStockId));
    return {
      ...line,
      supplierId: line.supplierId || stock.default_supplier_id || null,
      notes: cleanNullable(line.notes),
    };
  });

  const supplierIds = [...new Set(preparedLines.flatMap((line) => line.supplierId ? [line.supplierId] : []))];
  if (supplierIds.length > 0) {
    const supplierResult = await client.query(
      `SELECT id FROM suppliers
       WHERE id = ANY($1::uuid[])
         AND branch_id = $2
         AND is_active = TRUE`,
      [supplierIds, branchId],
    );
    const activeSupplierIds = new Set(supplierResult.rows.map((row: any) => String(row.id).toLowerCase()));
    if (supplierIds.some((supplierId) => !activeSupplierIds.has(String(supplierId).toLowerCase()))) {
      throw inventoryManagerRepositoryError(
        'INVENTORY_MANAGER_SUPPLIER_NOT_FOUND',
        'The selected supplier is not active in this branch.',
      );
    }
  }

  if (firstMissingStockIndex >= 0) {
    throw inventoryManagerRepositoryError(
      'INVENTORY_MANAGER_STOCK_NOT_FOUND',
      'One or more purchase-order items are not active in this branch.',
    );
  }

  await client.query(
    `INSERT INTO po_line_items
       (po_id, inventory_stock_id, supplier_id, quantity_requested, unit_cost, notes)
     SELECT $1::uuid, line.inventory_stock_id, line.supplier_id,
            line.quantity_requested, line.unit_cost, line.notes
     FROM UNNEST(
       $2::bigint[], $3::uuid[], $4::numeric[], $5::numeric[], $6::text[]
     ) WITH ORDINALITY AS line(inventory_stock_id, supplier_id, quantity_requested, unit_cost, notes, line_order)
     ORDER BY line.line_order`,
    [
      purchaseOrderId,
      preparedLines.map((line) => line.inventoryStockId),
      preparedLines.map((line) => line.supplierId),
      preparedLines.map((line) => line.quantityRequested),
      preparedLines.map((line) => line.unitCost ?? null),
      preparedLines.map((line) => line.notes),
    ],
  );
};

export class InventoryManagerRepository {
  async listStockCountReminderTargets(countDate: string): Promise<Array<{
    branch_id: number;
    branch_name: string;
    settings: Record<string, unknown> | null;
    recipient_user_id: string;
    submitted_shifts: string[];
  }>> {
    const result = await db.query(
      `SELECT b.branch_id,
              b.name AS branch_name,
              b.settings,
              u.user_id AS recipient_user_id,
              COALESCE(
                ARRAY_AGG(DISTINCT c.shift::text) FILTER (WHERE c.stock_count_id IS NOT NULL),
                ARRAY[]::text[]
              ) AS submitted_shifts
       FROM branches b
       JOIN users u
         ON u.deleted_at IS NULL
        AND LOWER(TRIM(u.role::text)) IN ('inventory manager', 'inventorymanager')
        AND (u.branch_id IS NULL OR u.branch_id = b.branch_id)
       LEFT JOIN inventory_stock_count_submissions c
         ON c.branch_id = b.branch_id
        AND c.count_date = $1::date
        AND c.shift IN ('morning', 'evening')
       GROUP BY b.branch_id, b.name, b.settings, u.user_id
       ORDER BY b.branch_id, u.user_id`,
      [countDate],
    );
    return result.rows;
  }

  async listSuppliers(branchId: number | null): Promise<any[]> {
    const result = await db.query(
      `SELECT s.*,
              COUNT(DISTINCT p.inventory_product_id)::int AS items_supplied
       FROM suppliers s
       LEFT JOIN inventory_products p ON p.default_supplier_id = s.id
         AND p.is_active = TRUE AND p.branch_id = s.branch_id
       WHERE ($1::int IS NULL OR s.branch_id = $1::int)
       GROUP BY s.id
       ORDER BY s.is_active DESC, s.name ASC`,
      [branchId],
    );
    return result.rows.map(mapSupplier);
  }

  async createSupplier(input: SupplierInput): Promise<any> {
    const result = await db.query(
      `INSERT INTO suppliers
        (branch_id, name, contact_person, contact_number, email, address, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.branchId,
        input.name,
        cleanNullable(input.contactPerson),
        cleanNullable(input.contactNumber),
        cleanNullable(input.email),
        cleanNullable(input.address),
        cleanNullable(input.notes),
        input.createdBy,
      ],
    );
    return mapSupplier(result.rows[0]);
  }

  async updateSupplier(input: SupplierUpdateInput): Promise<any> {
    const result = await db.query(
      `UPDATE suppliers
       SET name = COALESCE($3, name),
           contact_person = $4,
           contact_number = $5,
           email = $6,
           address = $7,
           notes = $8
       WHERE id = $1::uuid
         AND ($2::int IS NULL OR branch_id = $2::int)
       RETURNING *`,
      [
        input.id,
        input.branchId,
        input.name?.trim() || null,
        cleanNullable(input.contactPerson),
        cleanNullable(input.contactNumber),
        cleanNullable(input.email),
        cleanNullable(input.address),
        cleanNullable(input.notes),
      ],
    );
    if (!result.rows[0]) {
      throw inventoryManagerRepositoryError('INVENTORY_MANAGER_SUPPLIER_NOT_FOUND', 'Supplier was not found.');
    }
    return mapSupplier(result.rows[0]);
  }

  async deactivateSupplier(id: string, branchId: number | null): Promise<void> {
    const result = await db.query(
      `UPDATE suppliers SET is_active = FALSE
       WHERE id = $1::uuid
         AND ($2::int IS NULL OR branch_id = $2::int)
         AND is_active = TRUE`,
      [id, branchId],
    );
    if (result.rowCount !== 1) {
      throw inventoryManagerRepositoryError('INVENTORY_MANAGER_SUPPLIER_NOT_FOUND', 'Supplier was not found or is already inactive.');
    }
  }

  async assignDefaultSupplier(
    inventoryStockId: number,
    supplierId: string | null,
    branchId: number | null,
  ): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const stockResult = await client.query(
        `SELECT s.inventory_product_id, s.branch_id
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = $1
           AND ($2::int IS NULL OR s.branch_id IS NULL OR s.branch_id = $2::int)
           AND (p.branch_id IS NULL OR p.branch_id = $2::int)
           AND p.is_active = TRUE
         FOR UPDATE OF s`,
        [inventoryStockId, branchId],
      );
      const stock = stockResult.rows[0];
      if (!stock) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_STOCK_NOT_FOUND', 'Inventory item was not found.');
      if (supplierId) await validateSupplierForLine(client, Number(stock.branch_id || branchId), supplierId);

      const updateResult = await client.query(
        `UPDATE inventory_products
         SET default_supplier_id = $1::uuid
         WHERE inventory_product_id = $2
         RETURNING inventory_product_id, default_supplier_id`,
        [supplierId, stock.inventory_product_id],
      );
      await client.query('COMMIT');
      return {
        inventoryProductId: String(updateResult.rows[0].inventory_product_id),
        defaultSupplierId: updateResult.rows[0].default_supplier_id ? String(updateResult.rows[0].default_supplier_id) : null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listPurchaseOrderCatalog(branchId: number | null, bottledOnly = false): Promise<any[]> {
    const bottleCondition = bottledOnly
      ? "AND p.category = 'barber_supplies' AND LOWER(TRIM(p.unit)) = 'bottle'"
      : '';
    const result = await db.query(
      `SELECT s.inventory_stock_id, s.branch_id, p.inventory_product_id,
              p.name, p.category, p.unit, p.cost_price,
              s.current_quantity, p.default_supplier_id,
              p.critical_threshold, p.safety_stock,
              supplier.name AS default_supplier_name
       FROM inventory_stock s
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       LEFT JOIN suppliers supplier ON supplier.id = p.default_supplier_id
         AND supplier.branch_id = COALESCE(s.branch_id, $1) AND supplier.is_active = TRUE
       WHERE ($1::int IS NULL OR s.branch_id IS NULL OR s.branch_id = $1)
         AND ($1::int IS NULL OR p.branch_id IS NULL OR p.branch_id = $1)
         AND p.is_active = TRUE
         AND (s.is_active IS NULL OR s.is_active = TRUE)
         ${bottleCondition}
       ORDER BY p.name, s.inventory_stock_id`,
      [branchId],
    );
    return result.rows.map((row: any) => {
      const currentStock = asNumber(row.current_quantity);
      const criticalThreshold = asNumber(row.critical_threshold);
      const safetyStock = row.safety_stock == null ? null : asNumber(row.safety_stock);
      let stockStatus: 'critical' | 'low' | 'normal' | 'overstock' = 'normal';
      if (currentStock <= criticalThreshold || currentStock === 0) stockStatus = 'critical';
      else if (safetyStock != null && safetyStock > 0 && currentStock <= safetyStock) stockStatus = 'low';
      else if (safetyStock != null && safetyStock > 0 && currentStock >= safetyStock * 3) stockStatus = 'overstock';
      return {
        inventoryStockId: String(row.inventory_stock_id),
        inventoryProductId: String(row.inventory_product_id),
        name: row.name,
        category: row.category,
        unit: row.unit,
        currentStock,
        criticalThreshold,
        safetyStock,
        stockStatus,
        costPrice: roundMoney(asNumber(row.cost_price)),
        defaultSupplierId: row.default_supplier_id ? String(row.default_supplier_id) : null,
        defaultSupplierName: row.default_supplier_name || null,
      };
    });
  }

  async listInventoryHandoutCatalog(branchId: number): Promise<any[]> {
    const catalog = await this.listPurchaseOrderCatalog(branchId);
    return catalog.filter((item) => item.category === 'barber_supplies');
  }

  async listPurchaseOrderSummary(branchId: number | null): Promise<{ pending: number; approved: number; totalActive: number }> {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE po.status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE po.status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE po.status IN ('pending', 'approved'))::int AS total_active
       FROM purchase_orders po
       WHERE ($1::int IS NULL OR po.branch_id = $1::int)`,
      [branchId],
    );
    const row = result.rows[0] || {};
    return {
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
      totalActive: Number(row.total_active) || 0,
    };
  }

  async listPurchaseOrders(branchId: number | null, status?: string): Promise<any[]> {
    const params: any[] = [branchId];
    const conditions = ['($1::int IS NULL OR po.branch_id = $1::int)'];
    if (status) {
      params.push(status);
      conditions.push(`po.status = $${params.length}`);
    }
    const result = await db.query(
      `${purchaseOrderSelect}
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.created_at DESC`,
      params,
    );
    const orders = await loadPurchaseOrders(db, result.rows);
    return orders.filter(Boolean);
  }

  async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<any> {
    if (input.lines.length === 0) {
      throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_EMPTY', 'A stock request must contain at least one line item.');
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const dateResult = await client.query(
        `SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY-MMDD') AS po_date`,
      );
      const prefix = `SR-${dateResult.rows[0].po_date}-`;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`inventory-po:${prefix}`]);
      const sequenceResult = await client.query(
        `SELECT COALESCE(MAX(NULLIF(substring(po_number FROM '([0-9]+)$'), '')::int), 0) + 1 AS next_sequence
         FROM purchase_orders
         WHERE po_number LIKE $1`,
        [`${prefix}%`],
      );
      const sequence = Number(sequenceResult.rows[0]?.next_sequence || 1);
      const poNumber = `${prefix}${String(sequence).padStart(3, '0')}`;
      const status = input.status === 'draft' ? 'draft' : 'pending';
      const orderResult = await client.query(
        `INSERT INTO purchase_orders (branch_id, po_number, created_by, notes, status, submitted_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'pending' THEN NOW() ELSE NULL END)
         RETURNING id`,
        [input.branchId, poNumber, input.createdBy, cleanNullable(input.notes), status],
      );
      await insertPurchaseOrderLines(client, String(orderResult.rows[0].id), input.branchId, input.lines);
      const response = await loadPurchaseOrder(client, String(orderResult.rows[0].id), input.branchId);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePurchaseOrder(input: UpdatePurchaseOrderInput): Promise<any> {
    if (input.lines.length === 0) {
      throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_EMPTY', 'A stock request must contain at least one line item.');
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `SELECT * FROM purchase_orders
         WHERE id = $1::uuid AND branch_id = $2
         FOR UPDATE`,
        [input.purchaseOrderId, input.branchId],
      );
      const order = orderResult.rows[0];
      if (!order) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'Stock request was not found.');
      if (!['draft', 'rejected'].includes(order.status) || order.created_by !== input.createdBy) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only your draft or rejected stock requests can be edited.');
      }
      await client.query('DELETE FROM po_line_items WHERE po_id = $1::uuid', [input.purchaseOrderId]);
      await insertPurchaseOrderLines(client, input.purchaseOrderId, input.branchId, input.lines);
      const status = input.status === 'draft' ? 'draft' : 'pending';
      await client.query(
        `UPDATE purchase_orders
         SET status = $2,
             submitted_at = CASE WHEN $2 = 'pending' THEN NOW() ELSE submitted_at END,
             review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL,
             notes = $3
         WHERE id = $1::uuid`,
        [input.purchaseOrderId, status, cleanNullable(input.notes)],
      );
      const response = await loadPurchaseOrder(client, input.purchaseOrderId, input.branchId);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async submitPurchaseOrder(purchaseOrderId: string, branchId: number, submittedBy: string): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `SELECT * FROM purchase_orders
         WHERE id = $1::uuid AND branch_id = $2 AND created_by = $3
         FOR UPDATE`,
        [purchaseOrderId, branchId, submittedBy],
      );
      const order = orderResult.rows[0];
      if (!order) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'Stock request was not found.');
      const lineCountResult = await client.query(
        `SELECT COUNT(*)::int AS line_count FROM po_line_items WHERE po_id = $1::uuid`,
        [purchaseOrderId],
      );
      if (!['draft', 'rejected'].includes(order.status)) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only draft or rejected stock requests can be submitted.');
      }
      if (Number(lineCountResult.rows[0]?.line_count || 0) < 1) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_EMPTY', 'A stock request must contain at least one line item.');
      await client.query(
        `UPDATE purchase_orders SET status = 'pending', submitted_at = NOW(), reviewed_by = NULL,
         reviewed_at = NULL, review_notes = NULL WHERE id = $1::uuid`,
        [purchaseOrderId],
      );
      const response = await loadPurchaseOrder(client, purchaseOrderId, branchId);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deletePurchaseOrder(purchaseOrderId: string, branchId: number, createdBy: string): Promise<void> {
    const result = await db.query(
      `DELETE FROM purchase_orders
       WHERE id = $1::uuid AND branch_id = $2 AND created_by = $3 AND status = 'draft'`,
      [purchaseOrderId, branchId, createdBy],
    );
    if (result.rowCount === 0) {
      throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only your draft stock requests can be deleted.');
    }
  }

  async reviewPurchaseOrder(input: ReviewPurchaseOrderInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `SELECT * FROM purchase_orders
         WHERE id = $1::uuid AND ($2::int IS NULL OR branch_id = $2::int)
         FOR UPDATE`,
        [input.purchaseOrderId, input.branchId],
      );
      const order = orderResult.rows[0];
      if (!order) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'Stock request was not found.');
      if (order.status !== 'pending') {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only pending stock requests can be approved or rejected.');
      }
      await client.query(
        `UPDATE purchase_orders
         SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4
         WHERE id = $1::uuid`,
        [input.purchaseOrderId, input.decision, input.reviewedBy, cleanNullable(input.reviewNotes)],
      );
      const response = await loadPurchaseOrder(client, input.purchaseOrderId, input.branchId);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async restorePurchaseOrderDeletedItems(
    purchaseOrderId: string,
    branchId: number | null,
  ): Promise<{ restoredCount: number; restoredItems: string[] }> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const linesResult = await client.query(
        `SELECT li.inventory_stock_id, s.inventory_product_id, p.name
         FROM po_line_items li
         JOIN inventory_stock s ON s.inventory_stock_id = li.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE li.po_id = $1::uuid
           AND (p.is_active = FALSE OR s.is_active = FALSE)`,
        [purchaseOrderId],
      );

      const stockIds = linesResult.rows.map((r: any) => Number(r.inventory_stock_id));
      const prodIds = Array.from(new Set(linesResult.rows.map((r: any) => Number(r.inventory_product_id))));
      const itemNames = Array.from(new Set(linesResult.rows.map((r: any) => String(r.name))));

      if (stockIds.length > 0) {
        await client.query(
          `UPDATE inventory_stock SET is_active = TRUE WHERE inventory_stock_id = ANY($1::bigint[])`,
          [stockIds],
        );
      }
      if (prodIds.length > 0) {
        await client.query(
          `UPDATE inventory_products SET is_active = TRUE WHERE inventory_product_id = ANY($1::bigint[])`,
          [prodIds],
        );
      }

      await client.query('COMMIT');
      return {
        restoredCount: stockIds.length,
        restoredItems: itemNames,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async fulfillPurchaseOrder(input: FulfillPurchaseOrderInput): Promise<any> {
    await ensureExpirableStockSchema();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `SELECT * FROM purchase_orders
         WHERE id = $1::uuid AND ($2::int IS NULL OR branch_id = $2::int)
         FOR UPDATE`,
        [input.purchaseOrderId, input.branchId],
      );
      const order = orderResult.rows[0];
      if (!order) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'Stock request was not found.');
      if (order.status !== 'approved') {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only approved stock requests can be fulfilled.');
      }

      if (input.receiptId) {
        const receiptResult = await client.query(
          `SELECT id FROM receipts
           WHERE id = $1::uuid AND branch_id = $2
           FOR SHARE`,
          [input.receiptId, order.branch_id],
        );
        if (!receiptResult.rows[0]) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_RECEIPT', 'Receipt was not found in this branch.');
      }

      const lineResult = await client.query(
        `SELECT li.*, s.branch_id, s.current_quantity,
                p.inventory_product_id, p.name AS item_name, p.category,
                p.expiration_date, p.is_expirable
         FROM po_line_items li
         JOIN inventory_stock s ON s.inventory_stock_id = li.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE li.po_id = $1::uuid
           AND (s.branch_id IS NULL OR s.branch_id = $2)
           AND (p.branch_id IS NULL OR p.branch_id = $2)
           AND p.is_active = TRUE
         ORDER BY li.id
         FOR UPDATE OF s`,
        [input.purchaseOrderId, order.branch_id],
      );
      if (lineResult.rows.length === 0) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_EMPTY', 'Stock request has no active stock lines.');

      const receiptReason = `Stock request ${order.po_number} received`;
      for (const line of lineResult.rows) {
        const before = asNumber(line.current_quantity);
        const delta = roundQuantity(asNumber(line.quantity_requested));
        if (line.category === 'barber_supplies' && !Number.isInteger(delta)) {
          throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_QUANTITY', 'Barber-supply receipts must use a whole-unit quantity.');
        }
        const after = roundQuantity(before + delta);
        await client.query(
          `INSERT INTO inventory_stock_movements
            (branch_id, inventory_stock_id, movement_type, quantity_delta,
             quantity_before, quantity_after, source_type, source_id, reason, unit_cost, created_by)
           VALUES ($1, $2, 'receipt', $3, $4, $5, 'purchase_order', $6, $7, $8, $9)`,
          [
            order.branch_id,
            line.inventory_stock_id,
            delta,
            before,
            after,
            String(input.purchaseOrderId),
            receiptReason,
            line.unit_cost == null ? null : roundMoney(asNumber(line.unit_cost)),
            input.fulfilledBy,
          ],
        );
        await client.query(
          `UPDATE inventory_stock
           SET current_quantity = $1, version = version + 1, updated_at = NOW()
           WHERE inventory_stock_id = $2`,
          [after, line.inventory_stock_id],
        );
        if (line.unit_cost != null) {
          await client.query(
            `UPDATE inventory_products SET cost_price = $1 WHERE inventory_product_id = $2`,
            [roundMoney(asNumber(line.unit_cost)), line.inventory_product_id],
          );
        }

        // Create expirable batch and units if the line is an expirable consumable or service supply
        const isExpirable = Boolean(line.is_expirable || line.category === 'barber_consumables' || line.category === 'barber_supplies' || line.expiration_date);
        if (isExpirable && delta > 0) {
          const batchExpDate = line.expiration_date
            ? (line.expiration_date instanceof Date ? line.expiration_date.toISOString().split('T')[0] : String(line.expiration_date).split('T')[0])
            : new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
          const batchNumber = `BATCH-${order.po_number || 'PO'}-${line.inventory_stock_id}`;
          const batchResult = await client.query(
            `INSERT INTO inventory_stock_batches
              (branch_id, inventory_stock_id, purchase_order_id, receipt_id, batch_number, received_date,
               initial_quantity, current_quantity, expiration_date)
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8)
             RETURNING id`,
            [
              order.branch_id,
              line.inventory_stock_id,
              input.purchaseOrderId,
              input.receiptId || null,
              batchNumber,
              delta,
              delta,
              batchExpDate,
            ],
          );
          if (batchResult.rows[0]) {
            const batchId = batchResult.rows[0].id;
            const wholeUnits = Math.max(1, Math.floor(delta));
            await client.query(
              `INSERT INTO inventory_stock_batch_units (batch_id, unit_number, expiration_date)
               SELECT $1, generated.unit_number, $3
               FROM generate_series(1, $2::int) AS generated(unit_number)`,
              [batchId, wholeUnits, batchExpDate],
            );
          }
        }
      }

      await client.query(
        `UPDATE purchase_orders
         SET status = 'fulfilled', fulfilled_by = $2, fulfilled_at = NOW(),
             receipt_id = COALESCE($3::uuid, receipt_id)
         WHERE id = $1::uuid`,
        [input.purchaseOrderId, input.fulfilledBy, input.receiptId || null],
      );
      const response = await loadPurchaseOrder(client, input.purchaseOrderId, input.branchId);
      await client.query('COMMIT');
      return {
        ...response,
        receivedLineCount: lineResult.rows.length,
        movementCount: lineResult.rows.length,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createReceipt(input: ReceiptInput): Promise<any> {
    if (input.supplierId) {
      const supplierResult = await db.query(
        `SELECT id FROM suppliers WHERE id = $1::uuid AND branch_id = $2 AND is_active = TRUE`,
        [input.supplierId, input.branchId],
      );
      if (!supplierResult.rows[0]) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_SUPPLIER_NOT_FOUND', 'The selected receipt supplier is not active in this branch.');
      }
    }
    const result = await db.query(
      `INSERT INTO receipts
        (id, branch_id, receipt_number, supplier_id, purchase_date, total_amount,
         receipt_image_url, uploaded_by, notes)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.id,
        input.branchId,
        cleanNullable(input.receiptNumber),
        input.supplierId || null,
        input.purchaseDate,
        input.totalAmount ?? null,
        input.receiptImagePath,
        input.uploadedBy,
        cleanNullable(input.notes),
      ],
    );
    return this.mapReceipt(result.rows[0]);
  }

  async addReceiptAttachments(inputs: ReceiptAttachmentInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await db.query(
      `INSERT INTO receipt_attachments (receipt_id, storage_path, mime_type)
       SELECT x."receiptId"::uuid, x."storagePath", x."mimeType"
       FROM jsonb_to_recordset($1::jsonb) AS x("receiptId" text, "storagePath" text, "mimeType" text)`,
      [JSON.stringify(inputs)],
    );
  }

  async deleteReceiptAttachment(receiptId: string, attachmentId: string, branchId: number | null): Promise<{ storagePath: string }> {
    const result = await db.query(
      `DELETE FROM receipt_attachments ra
       USING receipts r
       WHERE ra.id = $1::uuid AND ra.receipt_id = $2::uuid AND r.id = ra.receipt_id
         AND ($3::int IS NULL OR r.branch_id = $3::int)
       RETURNING ra.storage_path`,
      [attachmentId, receiptId, branchId],
    );
    if (!result.rows[0]) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_RECEIPT', 'Receipt image was not found.');
    return { storagePath: result.rows[0].storage_path };
  }

  async receiptHasFulfilledPurchaseOrder(receiptId: string, branchId: number | null): Promise<boolean> {
    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1 FROM purchase_orders po
         WHERE po.receipt_id = $1::uuid
           AND po.status = 'fulfilled'
           AND ($2::int IS NULL OR po.branch_id = $2::int)
       ) AS locked`,
      [receiptId, branchId],
    );
    return Boolean(result.rows[0]?.locked);
  }

  async promoteAndDeletePrimaryReceiptImage(receiptId: string, branchId: number | null): Promise<{ storagePath: string }> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT r.receipt_image_url,
                (SELECT ra.id FROM receipt_attachments ra WHERE ra.receipt_id = r.id ORDER BY ra.created_at, ra.id LIMIT 1) AS replacement_id,
                (SELECT ra.storage_path FROM receipt_attachments ra WHERE ra.receipt_id = r.id ORDER BY ra.created_at, ra.id LIMIT 1) AS replacement_path
         FROM receipts r
         WHERE r.id = $1::uuid AND ($2::int IS NULL OR r.branch_id = $2::int)
         FOR UPDATE`,
        [receiptId, branchId],
      );
      const row = result.rows[0];
      if (!row) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_RECEIPT', 'Receipt was not found.');
      if (!row.replacement_path) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_RECEIPT', 'At least one receipt image must remain attached.');
      await client.query('UPDATE receipts SET receipt_image_url = $1 WHERE id = $2::uuid', [row.replacement_path, receiptId]);
      await client.query('DELETE FROM receipt_attachments WHERE id = $1::uuid', [row.replacement_id]);
      await client.query('COMMIT');
      return { storagePath: row.receipt_image_url };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapReceipt(row: any): any {
    return {
      id: String(row.id),
      branchId: Number(row.branch_id),
      receiptNumber: row.receipt_number || null,
      supplierId: row.supplier_id ? String(row.supplier_id) : null,
      purchaseDate: row.purchase_date,
      totalAmount: row.total_amount == null ? null : roundMoney(asNumber(row.total_amount)),
      receiptImagePath: row.receipt_image_url || null,
      uploadedBy: row.uploaded_by || null,
      notes: row.notes || '',
      createdAt: row.created_at,
    };
  }

  async listReceipts(branchId: number | null): Promise<any[]> {
    const result = await db.query(
      `SELECT r.*, s.name AS supplier_name,
              COUNT(po.id)::int AS linked_purchase_order_count,
              COALESCE((SELECT json_agg(ra.storage_path ORDER BY ra.created_at)
                        FROM receipt_attachments ra WHERE ra.receipt_id = r.id), '[]'::json) AS attachment_paths
       FROM receipts r
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       LEFT JOIN purchase_orders po ON po.receipt_id = r.id
       WHERE ($1::int IS NULL OR r.branch_id = $1::int)
       GROUP BY r.id, s.name
       ORDER BY r.created_at DESC`,
      [branchId],
    );
    return result.rows.map((row: any) => ({
      ...this.mapReceipt(row),
      supplierName: row.supplier_name || null,
      linkedPurchaseOrderCount: Number(row.linked_purchase_order_count || 0),
      attachmentPaths: Array.isArray(row.attachment_paths) ? row.attachment_paths : [],
    }));
  }

  async getReceipt(receiptId: string, branchId: number | null): Promise<any | null> {
    const result = await db.query(
      `SELECT r.*, s.name AS supplier_name
       FROM receipts r
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       WHERE r.id = $1::uuid AND ($2::int IS NULL OR r.branch_id = $2::int)`,
      [receiptId, branchId],
    );
    if (!result.rows[0]) return null;
    return { ...this.mapReceipt(result.rows[0]), supplierName: result.rows[0].supplier_name || null };
  }

  async linkReceiptToPurchaseOrders(receiptId: string, purchaseOrderIds: string[], branchId: number | null): Promise<any[]> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const receipt = await client.query(
        `SELECT id, branch_id FROM receipts
         WHERE id = $1::uuid AND ($2::int IS NULL OR branch_id = $2::int)
         FOR SHARE`,
        [receiptId, branchId],
      );
      if (!receipt.rows[0]) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_RECEIPT', 'Receipt was not found.');

      const orderResult = await client.query(
        `SELECT id, status FROM purchase_orders
         WHERE id = ANY($1::uuid[])
           AND branch_id = $2
         FOR UPDATE`,
        [purchaseOrderIds, receipt.rows[0].branch_id],
      );
      if (orderResult.rows.length !== purchaseOrderIds.length) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'One or more stock requests were not found in this branch.');
      }
      if (orderResult.rows.some((row: any) => row.status === 'rejected')) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Rejected stock requests cannot be linked to a receipt.');
      }
      await client.query(
        `UPDATE purchase_orders SET receipt_id = $1::uuid
         WHERE id = ANY($2::uuid[]) AND branch_id = $3`,
        [receiptId, purchaseOrderIds, receipt.rows[0].branch_id],
      );
      const orders = await loadPurchaseOrdersByIds(client, purchaseOrderIds, branchId);
      await client.query('COMMIT');
      return orders.filter(Boolean);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async unlinkReceiptFromPurchaseOrder(purchaseOrderId: string, branchId: number | null): Promise<{ order: any; receiptId: string }> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `SELECT id, status, receipt_id
         FROM purchase_orders
         WHERE id = $1::uuid
           AND ($2::int IS NULL OR branch_id = $2::int)
         FOR UPDATE`,
        [purchaseOrderId, branchId],
      );
      const order = orderResult.rows[0];
      if (!order) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'Stock request was not found.');
      if (order.status !== 'approved') {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only approved stock requests can have receipt evidence removed.');
      }
      if (!order.receipt_id) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_RECEIPT_NOT_LINKED', 'This stock request has no linked receipt.');
      }
      await client.query(
        `UPDATE purchase_orders
         SET receipt_id = NULL
         WHERE id = $1::uuid`,
        [purchaseOrderId],
      );
      const updated = await loadPurchaseOrder(client, purchaseOrderId, branchId);
      await client.query('COMMIT');
      if (!updated) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_PO_NOT_FOUND', 'Stock request was not found.');
      return { order: updated, receiptId: String(order.receipt_id) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listBarbers(branchId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT b.barber_id, b.name, b.status, b.user_id
       FROM barbers b
       JOIN users u ON u.user_id = b.user_id
       WHERE b.is_active = TRUE AND u.branch_id = $1 AND u.deleted_at IS NULL
       ORDER BY b.name`,
      [branchId],
    );
    return result.rows.map((row: any) => ({
      id: Number(row.barber_id),
      name: row.name || 'Barber',
      status: row.status || 'available',
      userId: row.user_id,
    }));
  }

  async recordInventoryHandout(input: InventoryHandoutInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const stockResult = await client.query(
        `SELECT s.inventory_stock_id, s.branch_id, s.current_quantity, p.name AS item_name, p.unit
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = $1
           AND (s.branch_id IS NULL OR s.branch_id = $2)
           AND (p.branch_id IS NULL OR p.branch_id = $2)
           AND p.is_active = TRUE
           AND p.category = 'barber_supplies'
           AND (s.is_active IS NULL OR s.is_active = TRUE)
         FOR UPDATE OF s`,
        [input.inventoryStockId, input.branchId],
      );
      if (!stockResult.rows[0]) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_STOCK_NOT_FOUND', 'Inventory item was not found in this branch.');
      const isBottle = String(stockResult.rows[0].unit || '').trim().toLowerCase() === 'bottle';
      // Measured units (grams, ml, ...) can be fractional; counted units must be whole.
      const measuredUnits = ['g', 'gram', 'grams', 'kg', 'ml', 'l', 'liter', 'liters', 'litre', 'litres'];
      const isMeasuredUnit = measuredUnits.includes(String(stockResult.rows[0].unit || '').trim().toLowerCase());
      if (!isMeasuredUnit && !Number.isInteger(input.quantity)) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_QUANTITY', 'Consumable handouts must use a whole number of units.');
      }
      const before = Number(stockResult.rows[0].current_quantity);
      if (before < input.quantity) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INSUFFICIENT_STOCK', 'There is not enough on-hand stock for this handout.');
      }

      const barberResult = await client.query(
        `SELECT b.barber_id, b.name
         FROM barbers b JOIN users u ON u.user_id = b.user_id
         WHERE b.barber_id = $1 AND b.is_active = TRUE
           AND u.branch_id = $2 AND u.deleted_at IS NULL
         FOR SHARE OF b`,
        [input.barberId, input.branchId],
      );
      if (!barberResult.rows[0]) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_BARBER_NOT_FOUND', 'Barber was not found in this branch.');

      const activeResult = isBottle ? await client.query(
        `SELECT id FROM bottle_lifecycle_logs
         WHERE branch_id = $1 AND inventory_stock_id = $2 AND barber_id = $3 AND status = 'issued'
         FOR UPDATE`,
        [input.branchId, input.inventoryStockId, input.barberId],
      ) : { rows: [] };
      if (activeResult.rows[0]) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_DUPLICATE_ACTIVE_ISSUANCE', 'This item is already issued to the selected barber. Return it before issuing another.');
      }

      const handoutResult = await client.query(
        `INSERT INTO inventory_handout_logs
          (branch_id, inventory_stock_id, barber_id, quantity, handed_out_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING inventory_handout_id, handed_out_at`,
        [input.branchId, input.inventoryStockId, input.barberId, input.quantity, input.loggedBy, cleanNullable(input.notes)],
      );
      const handoutId = String(handoutResult.rows[0].inventory_handout_id);
      const issuedAtCustomerCount = isBottle ? await loadCumulativeBarberCustomerCount(client, input.barberId, input.branchId) : null;
      const result = isBottle ? await client.query(
        `INSERT INTO bottle_lifecycle_logs
          (branch_id, inventory_stock_id, barber_id, quantity, handout_id, issued_at_customer_count, logged_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [input.branchId, input.inventoryStockId, input.barberId, input.quantity, handoutId, issuedAtCustomerCount, input.loggedBy, cleanNullable(input.notes)],
      ) : { rows: [{ id: null }] };
      const after = roundQuantity(before - input.quantity);

      await client.query(
        `UPDATE inventory_stock
         SET current_quantity = $1, version = version + 1, updated_at = NOW()
         WHERE inventory_stock_id = $2`,
        [after, input.inventoryStockId]
      );

      await client.query(
        `INSERT INTO inventory_stock_movements
          (branch_id, inventory_stock_id, movement_type, quantity_delta,
           quantity_before, quantity_after, source_type, source_id, reason, created_by)
         VALUES ($1, $2, 'consumption', $3, $4, $5, 'barber_handout', $6, $7, $8)`,
        [
          input.branchId,
          input.inventoryStockId,
          -input.quantity,
          before,
          after,
          handoutId,
          `Handed to barber: ${barberResult.rows[0].name}`,
          input.loggedBy
        ]
      );

      await client.query(
        `INSERT INTO inventory_consumption
          (branch_id, inventory_stock_id, quantity, source_type, source_id, barber_id, created_by)
         VALUES ($1, $2, $3, 'barber_handout', $4, $5, $6)`,
        [input.branchId, input.inventoryStockId, input.quantity, handoutId, input.barberId, input.loggedBy],
      );

      const bottleLifecycle = isBottle
        ? await this.loadBottleLifecycle(client, String(result.rows[0].id), input.branchId)
        : null;
      const handout = { id: handoutId, inventoryStockId: String(input.inventoryStockId), quantity: input.quantity, itemName: stockResult.rows[0].item_name, unit: stockResult.rows[0].unit, barberId: input.barberId, barberName: barberResult.rows[0].name, handedOutByName: 'You', handedOutAt: handoutResult.rows[0].handed_out_at, notes: cleanNullable(input.notes) || '' };
      const response = isBottle
        ? { ...(bottleLifecycle || {}), handout }
        : { ...handout, status: 'handed_out', handout };

      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadBottleLifecycle(queryable: Queryable, id: string, branchId: number | null): Promise<any | null> {
    const result = await queryable.query(
      `SELECT l.*, p.name AS item_name, p.unit, b.name AS barber_name
       FROM bottle_lifecycle_logs l
       JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       JOIN barbers b ON b.barber_id = l.barber_id
       WHERE l.id = $1::uuid AND ($2::int IS NULL OR l.branch_id = $2::int)
         AND p.category = 'barber_supplies'
         AND LOWER(TRIM(p.unit)) = 'bottle'`,
      [id, branchId],
    );
    return result.rows[0] ? this.mapBottleLifecycle(result.rows[0]) : null;
  }

  private mapBottleLifecycle(row: any): any {
    const customersServed = row.returned_at_customer_count == null
      ? null
      : Number(row.returned_at_customer_count) - Number(row.issued_at_customer_count);
    return {
      id: String(row.id),
      branchId: Number(row.branch_id),
      inventoryStockId: String(row.inventory_stock_id),
      itemName: row.item_name,
      unit: row.unit,
      quantity: asNumber(row.quantity ?? 1),
      barberId: Number(row.barber_id),
      barberName: row.barber_name,
      issuedAt: row.issued_at,
      issuedAtCustomerCount: Number(row.issued_at_customer_count),
      returnedAt: row.returned_at || null,
      returnedAtCustomerCount: row.returned_at_customer_count == null ? null : Number(row.returned_at_customer_count),
      customersServed,
      returnCondition: row.return_condition || null,
      notes: row.notes || '',
      status: row.status,
      loggedBy: row.logged_by || null,
      createdAt: row.created_at,
    };
  }

  async returnBottle(input: BottleReturnInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const lifecycleResult = await client.query(
        `SELECT l.*, p.category, p.unit
         FROM bottle_lifecycle_logs l
         JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE l.id = $1::uuid AND l.branch_id = $2
           AND p.category = 'barber_supplies'
           AND LOWER(TRIM(p.unit)) = 'bottle'
         FOR UPDATE OF l`,
        [input.id, input.branchId],
      );
      const lifecycle = lifecycleResult.rows[0];
      if (!lifecycle) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_LIFECYCLE_NOT_FOUND', 'Bottle issuance was not found.');
      if (lifecycle.status !== 'issued') throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Only active bottle issuances can be returned.');

      const returnedAtCustomerCount = await loadCumulativeBarberCustomerCount(client, Number(lifecycle.barber_id), input.branchId);
      if (returnedAtCustomerCount < Number(lifecycle.issued_at_customer_count)) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'Current customer count cannot be lower than the issuance snapshot.');
      }

      await client.query(
        `UPDATE bottle_lifecycle_logs
         SET returned_at = NOW(), returned_at_customer_count = $2,
             return_condition = $3, estimated_remaining_percent = $4, notes = $5,
             status = 'returned'
         WHERE id = $1::uuid
         RETURNING *`,
        [input.id, returnedAtCustomerCount, input.returnCondition, input.estimatedRemainingPercent, cleanNullable(input.notes)],
      );
      const response = await this.loadBottleLifecycle(client, input.id, input.branchId);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listBottleLifecycle(branchId: number, status?: 'issued' | 'returned'): Promise<any[]> {
    const params: any[] = [branchId];
    const conditions = ['l.branch_id = $1'];
    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    const result = await db.query(
      `SELECT l.*, p.name AS item_name, p.unit, b.name AS barber_name
       FROM bottle_lifecycle_logs l
       JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       JOIN barbers b ON b.barber_id = l.barber_id
       WHERE ${conditions.join(' AND ')}
         AND p.category = 'barber_supplies'
         AND LOWER(TRIM(p.unit)) = 'bottle'
       ORDER BY l.status = 'issued' DESC, l.issued_at DESC
       LIMIT 500`,
      params,
    );
    return result.rows.map((row: any) => this.mapBottleLifecycle(row));
  }

  async listInventoryHandouts(branchId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT h.inventory_handout_id, h.inventory_stock_id, h.quantity,
              h.handed_out_at, h.notes, p.name AS item_name, p.unit,
              b.barber_id, b.name AS barber_name, u.username AS handed_out_by_name
       FROM inventory_handout_logs h
       JOIN inventory_stock s ON s.inventory_stock_id = h.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       JOIN barbers b ON b.barber_id = h.barber_id
       LEFT JOIN users u ON u.user_id = h.handed_out_by
       WHERE h.branch_id = $1
       ORDER BY h.handed_out_at DESC
       LIMIT 200`,
      [branchId],
    );
    return result.rows.map((row: any) => ({
      id: String(row.inventory_handout_id),
      inventoryStockId: String(row.inventory_stock_id),
      itemName: row.item_name,
      unit: row.unit,
      quantity: asNumber(row.quantity),
      barberId: Number(row.barber_id),
      barberName: row.barber_name,
      handedOutByName: row.handed_out_by_name || null,
      handedOutAt: row.handed_out_at,
      notes: row.notes || '',
    }));
  }

  async listBottleConsumption(
    branchId: number,
    query?: { barberId?: number; inventoryStockId?: number; limit?: number },
  ): Promise<any[]> {
    const params: any[] = [branchId];
    const conditions = ['l.branch_id = $1', "l.status = 'returned'"];
    if (query?.barberId) {
      params.push(query.barberId);
      conditions.push(`l.barber_id = $${params.length}`);
    }
    if (query?.inventoryStockId) {
      params.push(query.inventoryStockId);
      conditions.push(`l.inventory_stock_id = $${params.length}`);
    }
    const limit = query?.limit ?? 500;
    params.push(limit);
    const result = await db.query(
      `SELECT l.*, p.name AS item_name, p.unit, b.name AS barber_name
       FROM bottle_lifecycle_logs l
       JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       JOIN barbers b ON b.barber_id = l.barber_id
       WHERE ${conditions.join(' AND ')}
         AND p.category = 'barber_supplies'
         AND LOWER(TRIM(p.unit)) = 'bottle'
       ORDER BY l.returned_at DESC NULLS LAST, l.issued_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row: any) => this.mapBottleLifecycle(row));
  }

  async getDailyStockReport(input: DailyStockReportQuery): Promise<any> {
    const startUtc = parseManilaDateBoundary(input.reportDate, false);
    const endUtc = parseManilaDateBoundary(input.reportDate, true);
    const [countsResult, linesResult, stockResult, movementResult, consumptionResult] = await Promise.all([
      db.query(
        `SELECT c.stock_count_id, c.count_date, c.shift, c.status, c.notes,
                c.submitted_by, c.submitted_by_role, c.created_at, c.reviewed_at,
                u.username AS submitted_by_name
         FROM inventory_stock_count_submissions c
         LEFT JOIN users u ON u.user_id = c.submitted_by
         WHERE c.branch_id = $1 AND c.count_date = $2
         ORDER BY c.created_at ASC`,
        [input.branchId, input.reportDate],
      ),
      db.query(
        `SELECT l.stock_count_id, l.inventory_stock_id, l.counted_quantity, l.notes,
                p.name AS item_name, p.unit
         FROM inventory_stock_count_lines l
         JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         JOIN inventory_stock_count_submissions c ON c.stock_count_id = l.stock_count_id
         WHERE c.branch_id = $1 AND c.count_date = $2
         ORDER BY l.stock_count_line_id`,
        [input.branchId, input.reportDate],
      ),
      db.query(
        `SELECT s.inventory_stock_id, p.name, p.unit, s.current_quantity
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE (s.branch_id IS NULL OR s.branch_id = $1)
           AND (p.branch_id IS NULL OR p.branch_id = $1)
           AND p.is_active = TRUE
         ORDER BY p.name`,
        [input.branchId],
      ),
      db.query(
        `SELECT inventory_stock_id, movement_type, quantity_delta
         FROM inventory_stock_movements
         WHERE (branch_id IS NULL OR branch_id = $1) AND created_at >= $2 AND created_at <= $3`,
        [input.branchId, startUtc.toISOString(), endUtc.toISOString()],
      ),
      db.query(
        `SELECT inventory_stock_id, quantity
         FROM inventory_consumption
         WHERE branch_id = $1 AND consumed_at >= $2 AND consumed_at <= $3
           AND source_type IN ('retail_sale', 'barber_handout')`,
        [input.branchId, startUtc.toISOString(), endUtc.toISOString()],
      ),
    ]);

    const countById = new Map<number, any>();
    for (const row of countsResult.rows) {
      countById.set(Number(row.stock_count_id), {
        id: String(row.stock_count_id),
        countDate: row.count_date,
        shift: row.shift,
        status: row.status,
        notes: row.notes || '',
        submittedBy: row.submitted_by,
        submittedByRole: row.submitted_by_role || 'cashier',
        submittedByName: row.submitted_by_name || row.submitted_by,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at || null,
        lines: [],
      });
    }
    for (const row of linesResult.rows) {
      const count = countById.get(Number(row.stock_count_id));
      if (!count) continue;
      count.lines.push({
        inventoryStockId: String(row.inventory_stock_id),
        itemName: row.item_name,
        unit: row.unit,
        countedQuantity: asNumber(row.counted_quantity),
        notes: row.notes || '',
      });
    }

    const counts = [...countById.values()];
    const countValues = new Map<string, Record<string, number>>();
    for (const count of counts) {
      for (const line of count.lines) {
        const values = countValues.get(line.inventoryStockId) || {};
        values[count.shift] = line.countedQuantity;
        countValues.set(line.inventoryStockId, values);
      }
    }

    const receiptsByStock = new Map<string, number>();
    for (const row of movementResult.rows) {
      if (row.movement_type !== 'receipt') continue;
      const key = String(row.inventory_stock_id);
      receiptsByStock.set(key, (receiptsByStock.get(key) || 0) + asNumber(row.quantity_delta));
    }
    const consumptionByStock = new Map<string, number>();
    for (const row of consumptionResult.rows) {
      const key = String(row.inventory_stock_id);
      consumptionByStock.set(key, (consumptionByStock.get(key) || 0) + asNumber(row.quantity));
    }

    const items = stockResult.rows.map((row: any) => {
      const key = String(row.inventory_stock_id);
      const values = countValues.get(key) || {};
      const openingQuantity = values.morning ?? null;
      const midDayQuantity = values.afternoon ?? null;
      const closingQuantity = values.evening ?? null;
      const receiptQuantity = roundQuantity(receiptsByStock.get(key) || 0);
      const loggedUsage = roundQuantity(consumptionByStock.get(key) || 0);
      const currentStock = asNumber(row.current_quantity);
      const midDayVariance = openingQuantity != null && midDayQuantity != null ? roundQuantity(midDayQuantity - openingQuantity) : null;
      const closingVariance = openingQuantity != null && closingQuantity != null ? roundQuantity(closingQuantity - openingQuantity) : null;
      const netConsumption = openingQuantity != null && closingQuantity != null
        ? roundQuantity(openingQuantity + receiptQuantity - closingQuantity)
        : null;
      return {
        inventoryStockId: key,
        itemName: row.name,
        unit: row.unit,
        currentStock,
        openingQuantity,
        midDayQuantity,
        closingQuantity,
        midDayVariance,
        closingVariance,
        receiptQuantity,
        loggedUsage,
        netConsumption,
      };
    });

    const countSubmitted = (shift: string) => {
      const count = counts.find((candidate) => candidate.shift === shift);
      return ['pending', 'submitted', 'reviewed', 'approved'].includes(count?.status);
    };
    const submittedShiftCount = Number(countSubmitted('morning')) + Number(countSubmitted('evening'));
    return {
      reportDate: input.reportDate,
      shifts: ['morning', 'afternoon', 'evening'].map((shift) => {
        const count = counts.find((candidate) => candidate.shift === shift);
        if (count) return count;
        if (shift === 'afternoon') return { shift, status: 'not_required', lines: [] };
        return { shift, status: 'missing', lines: [] };
      }),
      items,
      summary: {
        submittedShiftCount,
        missingShiftCount: 2 - submittedShiftCount,
        fallbackCashierSubmissionCount: counts.filter((count) => count.submittedByRole === 'cashier').length,
        totalLoggedUsage: roundQuantity(items.reduce((sum, item) => sum + item.loggedUsage, 0)),
      },
    };
  }

  async createStockReportEmail(input: StockReportEmailInput): Promise<any> {
    const result = await db.query(
      `INSERT INTO stock_report_emails
        (id, branch_id, report_date, sent_by, recipient_email, cc_email, status)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [input.id, input.branchId, input.reportDate, input.sentBy, input.recipientEmail, input.ccEmail || null],
    );
    return this.mapReportEmail(result.rows[0]);
  }

  async updateStockReportEmail(
    id: string,
    branchId: number,
    update: { status: 'sent' | 'failed'; providerMessageId?: string | null; errorMessage?: string | null },
  ): Promise<any> {
    const result = await db.query(
      `UPDATE stock_report_emails
       SET status = $3, provider_message_id = $4, error_message = $5,
           sent_at = CASE WHEN $3 = 'sent' THEN NOW() ELSE NULL END
       WHERE id = $1::uuid AND branch_id = $2
       RETURNING *`,
      [id, branchId, update.status, update.providerMessageId || null, cleanNullable(update.errorMessage)],
    );
    if (!result.rows[0]) throw inventoryManagerRepositoryError('INVENTORY_MANAGER_REPORT_EMAIL_NOT_FOUND', 'Stock report email record was not found.');
    return this.mapReportEmail(result.rows[0]);
  }

  private mapReportEmail(row: any): any {
    return {
      id: String(row.id),
      branchId: Number(row.branch_id),
      reportDate: row.report_date,
      sentBy: row.sent_by,
      recipientEmail: row.recipient_email,
      ccEmail: row.cc_email || null,
      providerMessageId: row.provider_message_id || null,
      status: row.status,
      errorMessage: row.error_message || null,
      sentAt: row.sent_at || null,
      createdAt: row.created_at,
    };
  }

  async findUserContact(userId: string): Promise<{ email: string; username?: string | null; branchId?: number | null } | null> {
    const result = await db.query(
      `SELECT email, username, branch_id FROM users WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!result.rows[0]) return null;
    return {
      email: String(result.rows[0].email || '').trim().toLowerCase(),
      username: result.rows[0].username || null,
      branchId: result.rows[0].branch_id == null ? null : Number(result.rows[0].branch_id),
    };
  }

  async listExpirableStockBatches(branchId?: number | null): Promise<ExpirableStockResponse> {
    await ensureExpirableStockSchema();

    // Auto-seed batches for any expirable stock lines that don't have a batch yet
    try {
      await db.query(
        `INSERT INTO inventory_stock_batches (branch_id, inventory_stock_id, batch_number, received_date, initial_quantity, current_quantity, expiration_date)
         SELECT COALESCE(s.branch_id, p.branch_id, $1::int), s.inventory_stock_id,
                'BATCH-INIT-' || s.inventory_stock_id,
                COALESCE(s.created_at::date, CURRENT_DATE),
                s.current_quantity,
                s.current_quantity,
                COALESCE(s.expiration_date, p.expiration_date, CURRENT_DATE + INTERVAL '180 days')
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.current_quantity > 0
           AND ($1::int IS NULL OR s.branch_id IS NULL OR s.branch_id = $1::int)
           AND ($1::int IS NULL OR p.branch_id IS NULL OR p.branch_id = $1::int)
           AND (p.is_expirable = TRUE
                OR LOWER(BTRIM(COALESCE(p.ownership_type::text, ''))) IN ('barber_assigned', 'barber_consumables')
                OR LOWER(BTRIM(COALESCE(p.category::text, ''))) IN ('barber_consumables', 'barber_supplies')
                OR s.expiration_date IS NOT NULL
                OR p.expiration_date IS NOT NULL)
           AND NOT EXISTS (
             SELECT 1
             FROM inventory_stock_batches b
             WHERE b.inventory_stock_id = s.inventory_stock_id
               AND ($1::int IS NULL OR b.branch_id IS NULL OR b.branch_id = $1::int)
           )`,
        [branchId ?? null],
      );

      // The first page visit may have seeded a placeholder expiration date before
      // an admin added the real date in inventory editing. Keep only auto-seeded
      // batches in sync; received purchase-order batches keep their own dates.
      await db.query(
        `WITH updated_batches AS (
           UPDATE inventory_stock_batches b
           SET expiration_date = COALESCE(s.expiration_date, p.expiration_date, b.expiration_date),
               updated_at = NOW()
           FROM inventory_stock s
           JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
           WHERE b.inventory_stock_id = s.inventory_stock_id
             AND b.batch_number = 'BATCH-INIT-' || s.inventory_stock_id::text
             AND COALESCE(s.expiration_date, p.expiration_date) IS NOT NULL
             AND b.expiration_date IS DISTINCT FROM COALESCE(s.expiration_date, p.expiration_date)
             AND ($1::int IS NULL OR b.branch_id IS NULL OR b.branch_id = $1::int)
             AND ($1::int IS NULL OR s.branch_id IS NULL OR s.branch_id = $1::int)
             AND ($1::int IS NULL OR p.branch_id IS NULL OR p.branch_id = $1::int)
           RETURNING b.id, b.expiration_date
         )
         UPDATE inventory_stock_batch_units u
         SET expiration_date = updated_batches.expiration_date
         FROM updated_batches
         WHERE u.batch_id = updated_batches.id`,
        [branchId ?? null],
      );

      // Auto-generate units for any batches with current_quantity > 0 that have no unit records
      await db.query(
        `INSERT INTO inventory_stock_batch_units (batch_id, unit_number, expiration_date)
         SELECT b.id, u.num, b.expiration_date
         FROM inventory_stock_batches b
         CROSS JOIN LATERAL generate_series(1, GREATEST(1, LEAST(100, FLOOR(b.current_quantity)::int))) AS u(num)
         WHERE ($1::int IS NULL OR b.branch_id IS NULL OR b.branch_id = $1::int)
           AND NOT EXISTS (
             SELECT 1 FROM inventory_stock_batch_units u2 WHERE u2.batch_id = b.id
           )`,
        [branchId ?? null],
      );
    } catch (err: any) {
      logger.warn(`[InventoryManagerRepository] listExpirableStockBatches sync warning: ${err?.message}`);
    }

    const batchResult = await db.query(
      `SELECT b.id, b.branch_id, b.inventory_stock_id, b.purchase_order_id, b.receipt_id,
              b.batch_number, b.received_date, b.initial_quantity, b.current_quantity,
              b.expiration_date, b.manufactured_date, b.status, b.notes,
              p.inventory_product_id, p.name AS item_name, p.category, p.unit, p.cost_price,
              po.po_number
       FROM inventory_stock_batches b
       JOIN inventory_stock s ON s.inventory_stock_id = b.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       LEFT JOIN purchase_orders po ON po.id = b.purchase_order_id
       WHERE ($1::int IS NULL OR b.branch_id IS NULL OR b.branch_id = $1::int)
         AND ($1::int IS NULL OR p.branch_id IS NULL OR p.branch_id = $1::int)
       ORDER BY b.expiration_date ASC, b.received_date DESC`,
      [branchId ?? null],
    );

    const batchRows = batchResult.rows;
    if (batchRows.length === 0) {
      return {
        summary: {
          totalBatches: 0,
          totalTrackedUnits: 0,
          approachingExpiryCount: 0,
          expiredUnitsCount: 0,
          disposedUnitsCount: 0,
        },
        batches: [],
      };
    }

    const batchIds = batchRows.map((b) => b.id);
    const unitsResult = await db.query(
      `SELECT u.id, u.batch_id, u.unit_number, u.expiration_date,
              u.is_disposed, u.disposed_at, u.disposed_by,
              usr.username AS disposed_by_name
       FROM inventory_stock_batch_units u
       LEFT JOIN users usr ON usr.user_id = u.disposed_by
       WHERE u.batch_id = ANY($1::uuid[])
       ORDER BY u.unit_number ASC`,
      [batchIds],
    );

    const calculateExpiry = (exp: string | Date): { daysUntilExpiry: number; expiryStatus: ExpiryStatus } => {
      const expDateStr = exp instanceof Date ? exp.toISOString().split('T')[0] : String(exp).split('T')[0];
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      const expTime = new Date(`${expDateStr}T00:00:00+08:00`).getTime();
      const todayTime = new Date(`${todayStr}T00:00:00+08:00`).getTime();
      const diffDays = Math.round((expTime - todayTime) / (1000 * 60 * 60 * 24));

      let expiryStatus: ExpiryStatus = 'valid';
      if (diffDays < 0) {
        expiryStatus = 'expired';
      } else if (diffDays <= 30) {
        expiryStatus = 'approaching_expiry';
      } else {
        expiryStatus = 'valid';
      }
      return { daysUntilExpiry: diffDays, expiryStatus };
    };

    const unitsByBatchId = new Map<string, ExpirableBatchUnit[]>();
    let totalTrackedUnits = 0;
    let approachingExpiryCount = 0;
    let expiredUnitsCount = 0;
    let disposedUnitsCount = 0;

    for (const u of unitsResult.rows) {
      const expDateStr = u.expiration_date instanceof Date
        ? u.expiration_date.toISOString().split('T')[0]
        : String(u.expiration_date).split('T')[0];
      const { daysUntilExpiry, expiryStatus } = calculateExpiry(expDateStr);

      const unitObj: ExpirableBatchUnit = {
        id: String(u.id),
        batchId: String(u.batch_id),
        unitNumber: Number(u.unit_number),
        expirationDate: expDateStr,
        isDisposed: Boolean(u.is_disposed),
        disposedAt: u.disposed_at ? new Date(u.disposed_at).toISOString() : null,
        disposedBy: u.disposed_by ? String(u.disposed_by) : null,
        disposedByName: u.disposed_by_name || null,
        status: expiryStatus,
        daysUntilExpiry,
      };

      totalTrackedUnits++;
      if (unitObj.isDisposed) {
        disposedUnitsCount++;
      } else if (expiryStatus === 'expired') {
        expiredUnitsCount++;
      } else if (expiryStatus === 'approaching_expiry') {
        approachingExpiryCount++;
      }

      const list = unitsByBatchId.get(unitObj.batchId) || [];
      list.push(unitObj);
      unitsByBatchId.set(unitObj.batchId, list);
    }

    const batches: ExpirableStockBatch[] = batchRows.map((b) => {
      const expDateStr = b.expiration_date instanceof Date
        ? b.expiration_date.toISOString().split('T')[0]
        : String(b.expiration_date).split('T')[0];
      const rcvDateStr = b.received_date instanceof Date
        ? b.received_date.toISOString().split('T')[0]
        : String(b.received_date).split('T')[0];
      const { daysUntilExpiry, expiryStatus } = calculateExpiry(expDateStr);
      const units = unitsByBatchId.get(String(b.id)) || [];
      const disposedUnits = units.filter((u) => u.isDisposed).length;

      return {
        id: String(b.id),
        branchId: b.branch_id == null ? null : Number(b.branch_id),
        inventoryStockId: String(b.inventory_stock_id),
        inventoryProductId: String(b.inventory_product_id),
        itemName: b.item_name,
        category: b.category,
        unit: b.unit,
        costPrice: roundMoney(asNumber(b.cost_price)),
        purchaseOrderId: b.purchase_order_id ? String(b.purchase_order_id) : null,
        poNumber: b.po_number || null,
        batchNumber: b.batch_number,
        receivedDate: rcvDateStr,
        initialQuantity: asNumber(b.initial_quantity),
        currentQuantity: asNumber(b.current_quantity),
        disposedQuantity: disposedUnits,
        expirationDate: expDateStr,
        manufacturedDate: b.manufactured_date ? String(b.manufactured_date).split('T')[0] : null,
        status: b.status,
        expiryStatus,
        daysUntilExpiry,
        units,
      };
    });

    return {
      summary: {
        totalBatches: batches.length,
        totalTrackedUnits,
        approachingExpiryCount,
        expiredUnitsCount,
        disposedUnitsCount,
      },
      batches,
    };
  }

  async disposeExpiredUnit(params: {
    unitId: string;
    branchId?: number | null;
    disposedBy: string;
    reason?: string;
  }): Promise<DisposeUnitResponse> {
    await ensureExpirableStockSchema();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const selectResult = await client.query(
        `SELECT u.id AS unit_id, u.batch_id, u.unit_number, u.expiration_date, u.is_disposed,
                b.id AS batch_row_id, b.branch_id, b.inventory_stock_id, b.batch_number,
                b.current_quantity AS batch_quantity,
                s.current_quantity AS stock_quantity,
                p.name AS item_name, p.category, p.unit, p.is_expirable
         FROM inventory_stock_batch_units u
         JOIN inventory_stock_batches b ON b.id = u.batch_id
         JOIN inventory_stock s ON s.inventory_stock_id = b.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE u.id = $1::uuid
           AND ($2::int IS NULL OR b.branch_id IS NULL OR b.branch_id = $2::int)
         FOR UPDATE OF u, b, s`,
        [params.unitId, params.branchId ?? null],
      );

      const row = selectResult.rows[0];
      if (!row) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_NOT_FOUND', 'Expirable unit was not found.');
      }

      if (row.is_disposed) {
        throw inventoryManagerRepositoryError('INVENTORY_MANAGER_INVALID_TRANSITION', 'This unit has already been disposed.');
      }

      const expDateStr = row.expiration_date instanceof Date
        ? row.expiration_date.toISOString().split('T')[0]
        : String(row.expiration_date).split('T')[0];
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      const expTime = new Date(`${expDateStr}T00:00:00+08:00`).getTime();
      const todayTime = new Date(`${todayStr}T00:00:00+08:00`).getTime();
      const diffDays = Math.round((expTime - todayTime) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0) {
        throw inventoryManagerRepositoryError(
          'INVENTORY_MANAGER_INVALID_TRANSITION',
          `Only expired units can be disposed. This unit has ${diffDays} days remaining until expiration.`,
        );
      }

      const currentBatchQty = asNumber(row.batch_quantity);
      const currentStockQty = asNumber(row.stock_quantity);
      if (currentBatchQty < 1 || currentStockQty < 1) {
        throw inventoryManagerRepositoryError(
          'INVENTORY_MANAGER_INSUFFICIENT_STOCK',
          'Insufficient stock remaining to dispose this unit.',
        );
      }

      const newBatchQty = roundQuantity(currentBatchQty - 1);
      const newStockQty = roundQuantity(currentStockQty - 1);
      const batchStatus = newBatchQty === 0 ? 'disposed' : 'active';

      await client.query(
        `UPDATE inventory_stock_batch_units
         SET is_disposed = TRUE,
             disposed_at = NOW(),
             disposed_by = $2
         WHERE id = $1::uuid`,
        [params.unitId, params.disposedBy],
      );

      await client.query(
        `UPDATE inventory_stock_batches
         SET current_quantity = $1,
             status = $2,
             updated_at = NOW()
         WHERE id = $3::uuid`,
        [newBatchQty, batchStatus, row.batch_row_id],
      );

      await client.query(
        `UPDATE inventory_stock
         SET current_quantity = $1,
             version = version + 1,
             updated_at = NOW()
         WHERE inventory_stock_id = $2`,
        [newStockQty, row.inventory_stock_id],
      );

      const reason = params.reason?.trim()
        ? params.reason.trim()
        : `Expired unit #${row.unit_number} disposed from batch ${row.batch_number} (${row.item_name})`;

      await client.query(
        `INSERT INTO inventory_stock_movements
          (branch_id, inventory_stock_id, movement_type, quantity_delta,
           quantity_before, quantity_after, source_type, source_id, reason, created_by)
         VALUES ($1, $2, 'spoilage', -1, $3, $4, 'expired_disposal', $5, $6, $7)`,
        [
          row.branch_id,
          row.inventory_stock_id,
          currentStockQty,
          newStockQty,
          String(row.unit_id),
          reason,
          params.disposedBy,
        ],
      );

      const userRes = await client.query(
        `SELECT username FROM users WHERE user_id = $1`,
        [params.disposedBy],
      );
      const disposedByName = userRes.rows[0]?.username || null;

      await client.query('COMMIT');

      return {
        success: true,
        message: `Successfully disposed unit #${row.unit_number} of ${row.item_name}.`,
        unit: {
          id: String(row.unit_id),
          batchId: String(row.batch_id),
          unitNumber: Number(row.unit_number),
          expirationDate: expDateStr,
          isDisposed: true,
          disposedAt: new Date().toISOString(),
          disposedBy: params.disposedBy,
          disposedByName,
          status: 'expired',
          daysUntilExpiry: diffDays,
        },
        remainingBatchQuantity: newBatchQty,
        remainingStockQuantity: newStockQty,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const inventoryManagerRepository = new InventoryManagerRepository();
export const createInventoryManagerId = (): string => crypto.randomUUID();
export default inventoryManagerRepository;
