import db from '../db';
import {
  calculateInventoryForecast,
  classifyInventoryMovement,
  classifyMovementTrend,
  movementClassificationRules,
  MOVEMENT_LOOKBACK_DAYS,
} from '../utils/inventory/forecast.util';
import type {
  InventoryForecastResponse,
  InventoryReportResponse,
  InventoryMovementClass,
  ProductTierMigrationPoint,
  InventoryHistoricalAnalytics,
} from '@demoshop/shared-types';
import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';

type Queryable = {
  query: (...args: any[]) => Promise<any>;
};

type InventoryRepositoryErrorCode =
  | 'INVENTORY_STOCK_COUNT_NOT_FOUND'
  | 'INVENTORY_STOCK_COUNT_ALREADY_REVIEWED'
  | 'INVENTORY_STOCK_COUNT_INVALID_LINES'
  | 'INVENTORY_STOCK_COUNT_NO_LINES'
  | 'INVENTORY_STOCK_COUNT_DUPLICATE_LINES'
  | 'INVENTORY_STOCK_NOT_FOUND'
  | 'INVENTORY_STOCK_ALREADY_EXISTS'
  | 'INVENTORY_BARBER_NOT_FOUND'
  | 'INVENTORY_RESTOCK_REQUEST_NOT_REVIEWABLE'
  | 'INVENTORY_RESTOCK_REQUEST_NOT_FOUND'
  | 'INVENTORY_RESTOCK_REQUEST_INVALID_TRANSITION'
  | 'INVENTORY_RESTOCK_REQUEST_INVALID_QUANTITY'
  | 'INVENTORY_STOCK_INVALID_QUANTITY'
  | 'INVENTORY_RESTOCK_REJECTION_REASON_REQUIRED'
  | 'INVENTORY_RETAIL_NOT_SELLABLE'
  | 'INVENTORY_RETAIL_INSUFFICIENT_STOCK'
  | 'INVENTORY_RETAIL_SOURCE_CONFLICT';

export interface RetailSaleLineConsumptionInput {
  productId: number;
  quantity: number;
}

export interface RetailSaleLineSnapshot {
  productId: number;
  quantity: number;
  unitPrice: number;
  name: string;
  inventoryStockId: number;
}

export interface RetailSaleConsumptionInput {
  items: RetailSaleLineConsumptionInput[];
  branchId: number | null | undefined;
  transactionId: number | null;
  queueEntryId?: number | null;
  createdBy: string | null;
  sourceKey: string;
}

export interface RetailSaleConsumptionResult {
  recorded: number;
  stockIds: number[];
  totalQuantity: number;
  totalAmount: number;
  lines: RetailSaleLineSnapshot[];
}

const repositoryError = (code: InventoryRepositoryErrorCode, message: string): Error & { code: InventoryRepositoryErrorCode } => (
  Object.assign(new Error(message), { code })
);

export interface StockCountLineInput {
  inventoryStockId: number;
  countedQuantity: number;
  notes?: string;
}

export interface SubmitStockCountInput {
  branchId?: number | null;
  submittedBy: string;
  countDate: string;
  shift: 'morning' | 'afternoon' | 'evening';
  notes?: string;
  submittedByRole?: string;
  lines: StockCountLineInput[];
}

export interface ReviewStockCountInput {
  branchId?: number | null;
  stockCountId: number;
  reviewedBy: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  additionalLines?: StockCountLineInput[];
}

export interface CreateRestockRequestInput {
  branchId?: number | null;
  inventoryStockId: number;
  requestedBy: string;
  requestedQuantity: number;
  consumptionPeriod: 'week' | 'month';
  notes?: string;
}

export interface ReviewRestockRequestInput {
  branchId?: number | null;
  requestId: number;
  reviewedBy: string;
  decision: 'approved' | 'rejected' | 'fulfilled';
  reason?: string;
}

export interface ReceiveRestockRequestInput {
  branchId?: number | null;
  requestId: number;
  receivedBy: string;
  receivedQuantity?: number;
  unitCost: number;
  notes?: string;
  supplier?: string;
}

export interface ListStockCountsOptions {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface InventoryReportQueryInput {
  startDate: string;
  endDate: string;
  period?: 'daily' | 'weekly' | 'custom';
  inventoryStockId?: number;
  view?: 'summary';
}

export const parseManilaDateBoundary = (dateStr: string, isEnd = false): Date => {
  const timePart = isEnd ? '23:59:59.999' : '00:00:00.000';
  const isoWithOffset = `${dateStr}T${timePart}+08:00`;
  const parsed = new Date(isoWithOffset);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format for ${dateStr}. Use YYYY-MM-DD.`);
  }
  return parsed;
};


export interface CreateInventoryItemInput {
  name: string;
  unit: string;
  initialQuantity: number;
  costPrice: number;
  retailPrice?: number | null;
  ownershipType: 'barber_assigned' | 'shared_retail';
  assignedBarberId?: number;
  supplierId?: string | null;
  supplierBranchId?: number | null;
  createdBy?: string;
  retailCategory?: string | null;
  tags?: string[];
  showInShop?: boolean;
  imageUrl?: string | null;
  expirationDate?: string | null;
}

export interface UpdateInventoryCostPriceInput {
  inventoryStockId: number;
  name?: string;
  costPrice: number;
  unit?: string;
  retailPrice?: number | null;
  ownershipType?: 'barber_assigned' | 'shared_retail';
  expirationDate?: string | null;
}

export interface UpdateInventoryStockInput {
  inventoryStockId: number;
  quantity: number;
  updatedBy: string;
  reason?: string;
}

export interface ReplenishStockInput {
  inventoryStockId: number;
  quantity: number;
  replenishedBy: string;
  unitCost: number;
  notes?: string;
}

import { getInventoryStockStatus } from '../utils/inventory-status.util';


const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

const mapInventoryRow = (row: any) => {
  const currentQuantity = Number(row.current_quantity) || 0;
  const criticalThreshold = Number(row.critical_threshold) || 0;
  const safetyStock = Number(row.safety_stock) || 0;
  const highVolumeMultiplier = Number(row.high_volume_multiplier) || 1;
  const consumptionTotal = Number(row.consumption_total) || 0;
  const priorConsumptionTotal = Number(row.prior_consumption_total) || 0;
  const historyDays = Number(row.history_days) || 0;
  const supplierLeadTimeDays = row.supplier_lead_time_days ? Number(row.supplier_lead_time_days) : 3;
  const forecast = calculateInventoryForecast({
    currentStock: currentQuantity,
    consumptionTotal,
    historyDays,
    safetyStock,
    criticalStock: criticalThreshold,
    highVolumeMultiplier,
    supplierLeadTimeDays,
  });
  const movement = classifyInventoryMovement({ consumptionTotal, historyDays });
  const stockClassification = getInventoryStockStatus(currentQuantity);
  return {
    id: String(row.inventory_stock_id),
    branchId: row.branch_id == null ? null : Number(row.branch_id),
    productId: String(row.inventory_product_id),
    name: row.name,
    category: row.category === 'barber_supplies' ? 'Barber supplies' : 'Customer retail',
    ownership: (row.ownership_type === 'barber_assigned' || row.ownership_type === 'barber_consumables') ? 'Consumables' : 'Retail Items',
    assignedBarber: undefined,
    unit: row.unit,
    costPrice: toMoney(Number(row.cost_price) || 0),
    retailPrice: row.retail_price == null ? null : toMoney(Number(row.retail_price) || 0),
    imageUrl: row.image_url || null,
    retailCategory: row.retail_category || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    showInShop: Boolean(row.show_in_shop),
    defaultSupplierId: row.default_supplier_id ? String(row.default_supplier_id) : null,
    defaultSupplierName: row.default_supplier_name || null,
    expirationDate: row.expiration_date ? (row.expiration_date instanceof Date ? row.expiration_date.toISOString().split('T')[0] : String(row.expiration_date).split('T')[0]) : null,
    currentStock: currentQuantity,
    criticalStock: criticalThreshold,
    safetyStock,
    highVolumeMultiplier,
    historyDays,
    consumptionTotal,
    priorConsumptionTotal,
    averageDailyConsumption: forecast.averageDailyConsumption,
    adjustedDailyConsumption: forecast.adjustedDailyConsumption,
    weeklyConsumption: forecast.weeklyConsumption,
    monthlyConsumption: forecast.monthlyConsumption,
    adjustedWeeklyConsumption: forecast.adjustedWeeklyConsumption,
    adjustedMonthlyConsumption: forecast.adjustedMonthlyConsumption,
    suggestedReplenishment: forecast.suggestedWeeklyReplenishment,
    suggestedWeeklyReplenishment: forecast.suggestedWeeklyReplenishment,
    suggestedMonthlyReplenishment: forecast.suggestedMonthlyReplenishment,
    expectedStockOutDate: forecast.expectedStockOutDate,
    projectedStockoutDate: forecast.projectedStockoutDate,
    recommendedRestockDate: forecast.recommendedRestockDate,
    reorderDeadlineDays: forecast.reorderDeadlineDays,
    supplierLeadTimeDays: forecast.supplierLeadTimeDays,
    suggestedReplenishmentFormula: forecast.suggestedReplenishmentFormula,
    calibrationDaysTracked: forecast.calibrationDaysTracked,
    calibrationRequiredDays: forecast.calibrationRequiredDays,
    calibrationProgressPercent: forecast.calibrationProgressPercent,
    isCalibrating: forecast.isCalibrating,
    physicalStockStatus: forecast.physicalStockStatus,
    dailyBurnRateHistory: Array.isArray(row.daily_history) ? row.daily_history : [],
    dayOfWeekIntensity: Array.isArray(row.dow_history) ? row.dow_history : [],
    daysOfStockRemaining: forecast.forecastAvailable && forecast.averageDailyConsumption > 0
      ? Number((currentQuantity / forecast.adjustedDailyConsumption).toFixed(1))
      : null,
    daysUntilCritical: forecast.forecastAvailable && forecast.adjustedDailyConsumption > 0
      ? Number((Math.max(0, currentQuantity - criticalThreshold) / forecast.adjustedDailyConsumption).toFixed(1))
      : null,
    status: stockClassification.status,
    stockStatus: stockClassification.status,
    thresholdLevel: stockClassification.thresholdLevel,
    forecastAvailable: forecast.forecastAvailable,
    forecastUnavailableReason: forecast.forecastUnavailableReason,
    movementClass: movement.movementClass,
    movementRatePerDay: movement.movementRatePerDay,
      priorMovementRatePerDay: priorConsumptionTotal > 0 ? Number((priorConsumptionTotal / MOVEMENT_LOOKBACK_DAYS).toFixed(3)) : null,
    movementTrend: classifyMovementTrend(consumptionTotal, priorConsumptionTotal),
    movementClassificationReason: movement.movementClassificationReason,
  };
};

export const aggregateInventoryItems = (items: any[]): any[] => {
  if (!Array.isArray(items) || items.length <= 1) {
    return items || [];
  }

  const grouped = new Map<string, any[]>();
  const order: string[] = [];

  for (const item of items) {
    const branchKey = item.branchId == null ? 'all' : String(item.branchId);
    const isConsumable = item.category === 'Barber supplies' ||
      item.ownership === 'Consumables' ||
      item.ownership === 'Barber-assigned';
    const ownershipKey = isConsumable ? 'barber_consumables' : 'shared_retail';
    const normName = String(item.name || '').trim().toLowerCase();
    const normUnit = String(item.unit || '').trim().toLowerCase();
    const key = `${branchKey}:${ownershipKey}:${normName}:${normUnit}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)!.push(item);
  }

  return order.map((key) => {
    const group = grouped.get(key)!;
    if (group.length === 1) {
      return group[0];
    }

    // Multiple rows found for this item: merge them
    // Pick the primary row: prefer the one with highest currentStock, else lowest numeric id
    const sorted = [...group].sort((a, b) => {
      const stockDiff = (Number(b.currentStock) || 0) - (Number(a.currentStock) || 0);
      if (stockDiff !== 0) return stockDiff;
      return Number(a.id) - Number(b.id);
    });

    const primary = sorted[0];
    const supplierSource = group.find((item) => item.defaultSupplierId) || primary;

    // Sum stock_quantity across all duplicate rows
    const totalStock = group.reduce((sum, it) => sum + (Number(it.currentStock) || 0), 0);
    // Inherit the highest unit_cost / costPrice
    const highestCostPrice = Math.max(...group.map((it) => Number(it.costPrice) || 0));
    // Maximum threshold values
    const highestCritical = Math.max(...group.map((it) => Number(it.criticalStock) || 0));
    const highestSafety = Math.max(...group.map((it) => Number(it.safetyStock) || 0));
    const highestMultiplier = Math.max(...group.map((it) => Number(it.highVolumeMultiplier) || 1));
    const totalConsumption = group.reduce((sum, it) => sum + (Number(it.consumptionTotal) || 0), 0);
    const totalPriorConsumption = group.reduce((sum, it) => sum + (Number(it.priorConsumptionTotal) || 0), 0);
    const maxHistoryDays = Math.max(...group.map((it) => Number(it.historyDays) || 0));
    const movement = classifyInventoryMovement({ consumptionTotal: totalConsumption, historyDays: maxHistoryDays });

    // Re-evaluate forecast based on the total aggregated sum
    const forecast = calculateInventoryForecast({
      currentStock: totalStock,
      consumptionTotal: totalConsumption,
      historyDays: maxHistoryDays,
      safetyStock: highestSafety,
      criticalStock: highestCritical,
      highVolumeMultiplier: highestMultiplier,
      supplierLeadTimeDays: primary.supplierLeadTimeDays || 3,
    });

    // Sum actual daily consumption across duplicate stock rows for the shared product.
    const dailyHistoryByDate = new Map<string, number>();
    for (const item of group) {
      for (const point of item.dailyBurnRateHistory || []) {
        dailyHistoryByDate.set(
          point.date,
          (dailyHistoryByDate.get(point.date) || 0) + (Number(point.quantity) || 0),
        );
      }
    }
    const mergedDailyHistory = [...dailyHistoryByDate.entries()]
      .map(([date, quantity]) => ({ date, quantity }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const mergedDowIntensity = primary.dayOfWeekIntensity || [];

    return {
      ...primary,
      defaultSupplierId: supplierSource.defaultSupplierId || null,
      defaultSupplierName: supplierSource.defaultSupplierName || null,
      expirationDate: group.find((it) => it.expirationDate)?.expirationDate || primary.expirationDate || null,
      currentStock: totalStock,
      costPrice: toMoney(highestCostPrice),
      criticalStock: highestCritical,
      safetyStock: highestSafety,
      highVolumeMultiplier: highestMultiplier,
      historyDays: maxHistoryDays,
      consumptionTotal: totalConsumption,
      priorConsumptionTotal: totalPriorConsumption,
      averageDailyConsumption: forecast.averageDailyConsumption,
      adjustedDailyConsumption: forecast.adjustedDailyConsumption,
      weeklyConsumption: forecast.weeklyConsumption,
      monthlyConsumption: forecast.monthlyConsumption,
      adjustedWeeklyConsumption: forecast.adjustedWeeklyConsumption,
      adjustedMonthlyConsumption: forecast.adjustedMonthlyConsumption,
      suggestedReplenishment: forecast.suggestedWeeklyReplenishment,
      suggestedWeeklyReplenishment: forecast.suggestedWeeklyReplenishment,
      suggestedMonthlyReplenishment: forecast.suggestedMonthlyReplenishment,
      expectedStockOutDate: forecast.expectedStockOutDate,
      projectedStockoutDate: forecast.projectedStockoutDate,
      recommendedRestockDate: forecast.recommendedRestockDate,
      reorderDeadlineDays: forecast.reorderDeadlineDays,
      supplierLeadTimeDays: forecast.supplierLeadTimeDays,
      suggestedReplenishmentFormula: forecast.suggestedReplenishmentFormula,
      calibrationDaysTracked: forecast.calibrationDaysTracked,
      calibrationRequiredDays: forecast.calibrationRequiredDays,
      calibrationProgressPercent: forecast.calibrationProgressPercent,
      isCalibrating: forecast.isCalibrating,
      physicalStockStatus: forecast.physicalStockStatus,
      dailyBurnRateHistory: mergedDailyHistory,
      dayOfWeekIntensity: mergedDowIntensity,
      daysOfStockRemaining: forecast.forecastAvailable && forecast.adjustedDailyConsumption > 0
        ? Number((totalStock / forecast.adjustedDailyConsumption).toFixed(1))
        : null,
      daysUntilCritical: forecast.forecastAvailable && forecast.adjustedDailyConsumption > 0
        ? Number((Math.max(0, totalStock - highestCritical) / forecast.adjustedDailyConsumption).toFixed(1))
        : null,
      // Re-evaluate count-based status using the new aggregated sum
      ...getInventoryStockStatus(totalStock),
      status: getInventoryStockStatus(totalStock).status,
      stockStatus: getInventoryStockStatus(totalStock).status,
      thresholdLevel: getInventoryStockStatus(totalStock).thresholdLevel,
      forecastAvailable: forecast.forecastAvailable,
      forecastUnavailableReason: forecast.forecastUnavailableReason,
      movementClass: movement.movementClass,
      movementRatePerDay: movement.movementRatePerDay,
      priorMovementRatePerDay: totalPriorConsumption > 0 ? Number((totalPriorConsumption / MOVEMENT_LOOKBACK_DAYS).toFixed(3)) : null,
      movementTrend: classifyMovementTrend(totalConsumption, totalPriorConsumption),
      movementClassificationReason: movement.movementClassificationReason,
    };
  });
};

const inventoryRowSelect = `
  SELECT s.inventory_stock_id, s.branch_id, p.inventory_product_id, p.name, p.category,
         p.ownership_type, p.unit, p.cost_price, p.retail_price, p.critical_threshold, p.safety_stock,
         p.high_volume_multiplier, s.current_quantity,
         COALESCE(s.expiration_date, p.expiration_date) AS expiration_date,
         p.default_supplier_id, supplier.name AS default_supplier_name,
         p.image_url, p.retail_category, p.tags, p.show_in_shop,
         NULL AS assigned_barber,
         COALESCE((SELECT SUM(c.quantity) FROM inventory_consumption c
           WHERE c.inventory_stock_id = s.inventory_stock_id
             AND c.consumed_at >= NOW() - INTERVAL '30 days'
             AND c.source_type IN ('retail_sale', 'barber_handout')
             AND c.consumed_at <= NOW()), 0) AS consumption_total,
         COALESCE((SELECT LEAST(30, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NOW() - MIN(c.consumed_at))) / 86400)))
           FROM inventory_consumption c
           WHERE c.inventory_stock_id = s.inventory_stock_id
             AND c.consumed_at >= NOW() - INTERVAL '30 days'
             AND c.source_type IN ('retail_sale', 'barber_handout')
             AND c.consumed_at <= NOW()), 0)::int AS history_days
  FROM inventory_stock s
  JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
  LEFT JOIN barbers b ON b.barber_id = s.assigned_barber_id
  LEFT JOIN users u ON u.user_id = b.user_id
  LEFT JOIN suppliers supplier ON supplier.id = p.default_supplier_id`;

const loadInventoryItem = async (queryable: Queryable, inventoryStockId: number): Promise<any | null> => {
  const result = await queryable.query(
    `${inventoryRowSelect}
     WHERE s.inventory_stock_id = $1
       AND p.is_active = TRUE
       AND (s.is_active IS NULL OR s.is_active = TRUE)`,
    [inventoryStockId],
  );
  return result.rows[0] ? mapInventoryRow(result.rows[0]) : null;
};

const mapStockCount = (row: any, lines: any[] = []) => ({
  id: String(row.stock_count_id),
  branchId: row.branch_id == null ? null : Number(row.branch_id),
  submittedBy: row.submitted_by,
  countDate: row.count_date,
  shift: row.shift,
  status: row.status,
  notes: row.notes || '',
  reviewedBy: row.reviewed_by || undefined,
  reviewedAt: row.reviewed_at || undefined,
  reviewReason: row.review_reason || undefined,
  createdAt: row.created_at,
  lines: lines.map((line) => ({
    id: String(line.stock_count_line_id),
    inventoryStockId: String(line.inventory_stock_id),
    countedQuantity: Number(line.counted_quantity),
    notes: line.notes || '',
    itemName: line.item_name,
    unit: line.unit,
    assignedBarber: undefined,
    ownership: line.ownership_type || undefined,
    currentQuantity: Number(line.current_quantity),
  })),
});

const loadStockCount = async (queryable: Queryable, stockCountId: number): Promise<any | null> => {
  const result = await queryable.query(
    `SELECT c.stock_count_id, c.branch_id, c.submitted_by, c.count_date,
            c.shift, c.status, c.notes, c.reviewed_by, c.reviewed_at,
            c.review_reason, c.created_at,
            (SELECT COUNT(*)::int
             FROM inventory_stock_count_lines count_line
             WHERE count_line.stock_count_id = c.stock_count_id) AS line_count
     FROM inventory_stock_count_submissions c
     WHERE c.stock_count_id = $1`,
    [stockCountId],
  );
  if (!result.rows[0]) return null;

  const lines = await queryable.query(
    `SELECT l.stock_count_line_id, l.inventory_stock_id,
            l.counted_quantity, l.notes,
            p.name AS item_name, p.unit, p.ownership_type,
            s.current_quantity
     FROM inventory_stock_count_lines l
     JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
     JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
     WHERE l.stock_count_id = $1
     ORDER BY l.stock_count_line_id`,
    [stockCountId],
  );

  if (Number(result.rows[0].line_count) !== lines.rows.length) {
    throw repositoryError(
      'INVENTORY_STOCK_COUNT_INVALID_LINES',
      'Stock count contains an invalid inventory line.',
    );
  }

  return mapStockCount(result.rows[0], lines.rows);
};

const loadStockCounts = async (queryable: Queryable, stockCountIds: number[]): Promise<any[]> => {
  if (stockCountIds.length === 0) return [];

  const headers = await queryable.query(
    `SELECT c.stock_count_id, c.branch_id, c.submitted_by, c.count_date,
            c.shift, c.status, c.notes, c.reviewed_by, c.reviewed_at,
            c.review_reason, c.created_at,
            (SELECT COUNT(*)::int
             FROM inventory_stock_count_lines count_line
             WHERE count_line.stock_count_id = c.stock_count_id) AS line_count
     FROM inventory_stock_count_submissions c
     WHERE c.stock_count_id = ANY($1::bigint[])`,
    [stockCountIds],
  );

  if (headers.rows.length === 0) return [];

  const lines = await queryable.query(
    `SELECT l.stock_count_id, l.stock_count_line_id, l.inventory_stock_id,
            l.counted_quantity, l.notes,
            p.name AS item_name, p.unit, p.ownership_type,
            s.current_quantity
     FROM inventory_stock_count_lines l
     JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
     JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
     WHERE l.stock_count_id = ANY($1::bigint[])
     ORDER BY l.stock_count_id, l.stock_count_line_id`,
    [stockCountIds],
  );

  const linesByCountId = new Map<string, any[]>();
  for (const line of lines.rows) {
    const key = String(line.stock_count_id);
    const countLines = linesByCountId.get(key) || [];
    countLines.push(line);
    linesByCountId.set(key, countLines);
  }

  const mappedHeaders = new Map<string, any>(
    headers.rows.map((header: any) => [String(header.stock_count_id), header]),
  );

  return stockCountIds
    .map((stockCountId) => {
      const header = mappedHeaders.get(String(stockCountId));
      if (!header) return null;
      const countLines = linesByCountId.get(String(stockCountId)) || [];
      if (Number(header.line_count) !== countLines.length) {
        throw repositoryError(
          'INVENTORY_STOCK_COUNT_INVALID_LINES',
          'Stock count contains an invalid inventory line.',
        );
      }
      return mapStockCount(header, countLines);
    })
    .filter(Boolean);
};

const loadRestockRequest = async (queryable: Queryable, requestId: number): Promise<any | null> => {
  const result = await queryable.query(
    `SELECT r.*, p.name AS item_name, p.category, p.ownership_type, p.unit,
            s.assigned_barber_id, s.current_quantity,
            NULL AS assigned_barber,
            requester.username AS requested_by_name, reviewer.username AS reviewed_by_name
     FROM inventory_restock_requests r
     JOIN inventory_stock s ON s.inventory_stock_id = r.inventory_stock_id
     JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
     LEFT JOIN barbers b ON b.barber_id = s.assigned_barber_id
     LEFT JOIN users u ON u.user_id = b.user_id
     LEFT JOIN users requester ON requester.user_id = r.requested_by
     LEFT JOIN users reviewer ON reviewer.user_id = r.reviewed_by
     WHERE r.inventory_restock_request_id = $1`,
    [requestId],
  );
  return result.rows[0] || null;
};

let retailSchemaReady = false;
let retailSchemaSetup: Promise<void> | null = null;

export const ensureRetailSchema = async (): Promise<void> => {
  if (retailSchemaReady || process.env.NODE_ENV === 'test') return;
  if (!retailSchemaSetup) {
    retailSchemaSetup = (async () => {
      try {
        await db.query(`
          ALTER TABLE public.inventory_products
            ADD COLUMN IF NOT EXISTS image_url TEXT,
            ADD COLUMN IF NOT EXISTS retail_category VARCHAR(64),
            ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS show_in_shop BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS expiration_date DATE;

          ALTER TABLE public.inventory_stock
            ADD COLUMN IF NOT EXISTS expiration_date DATE;

          CREATE TABLE IF NOT EXISTS public.retail_tags (
            id SERIAL PRIMARY KEY,
            name VARCHAR(64) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS uq_retail_tags_lower_name ON public.retail_tags (LOWER(TRIM(name)));

          CREATE TABLE IF NOT EXISTS public.retail_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(64) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS uq_retail_categories_lower_name ON public.retail_categories (LOWER(TRIM(name)));

          INSERT INTO public.retail_categories (name)
          VALUES ('Hair'), ('Beard'), ('Face'), ('Tools'), ('Grooming')
          ON CONFLICT DO NOTHING;
        `);
        retailSchemaReady = true;
      } catch (err: any) {
        logger.warn(`[InventoryRepository] ensureRetailSchema: ${err?.message}`);
      } finally {
        retailSchemaSetup = null;
      }
    })();
  }
  await retailSchemaSetup;
};

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BENCHMARK_SEASONALITY = [
  { month: 1, index: 0.85, label: 'Post-Holiday Reset', isLull: true, isPeak: false },
  { month: 2, index: 0.90, label: "Valentine's Prep", isLull: false, isPeak: false },
  { month: 3, index: 1.00, label: 'Spring Grooming', isLull: false, isPeak: false },
  { month: 4, index: 1.05, label: 'Spring Break / Easter', isLull: false, isPeak: false },
  { month: 5, index: 1.15, label: 'Graduation & Weddings', isLull: false, isPeak: true },
  { month: 6, index: 1.10, label: 'Early Summer Rush', isLull: false, isPeak: false },
  { month: 7, index: 0.95, label: 'Mid-Summer Lull', isLull: true, isPeak: false },
  { month: 8, index: 1.15, label: 'Back to School Rush', isLull: false, isPeak: true },
  { month: 9, index: 1.00, label: 'Fall Routine', isLull: false, isPeak: false },
  { month: 10, index: 1.05, label: 'Halloween & Events', isLull: false, isPeak: false },
  { month: 11, index: 1.20, label: 'Holiday Season Kickoff', isLull: false, isPeak: true },
  { month: 12, index: 1.35, label: 'Year-End Peak Rush', isLull: false, isPeak: true },
];

function generateItemDailyHistory(itemHistoryRows: any[], asOf: Date = new Date()) {
  const points = [];
  const map = new Map<string, number>();

  for (const row of itemHistoryRows) {
    if (row.date) {
      map.set(String(row.date), Number(row.quantity) || 0);
    }
  }

  for (let i = MOVEMENT_LOOKBACK_DAYS - 1; i >= 0; i--) {
    const d = new Date(asOf);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    let qty = map.get(dateStr);
    if (qty === undefined) {
      qty = 0;
    }
    points.push({ date: dateStr, quantity: qty });
  }

  return points;
}

function generateItemDayOfWeekIntensity(
  dowRows: any[],
  avgDaily: number,
) {
  const result = [];
  const dowMap = new Map<number, number>();
  for (const r of dowRows) {
    if (r.dow) dowMap.set(Number(r.dow), Number(r.quantity) || 0);
  }

  for (let dow = 1; dow <= 7; dow++) {
    const dayName = DOW_NAMES[dow - 1];
    let units = dowMap.get(dow);
    if (units === undefined) {
      const factor = dow === 6 ? 1.8 : dow === 7 ? 1.5 : dow === 5 ? 1.4 : dow === 4 ? 1.0 : dow === 2 ? 0.9 : 0.6;
      units = Number((avgDaily * factor * 4).toFixed(1));
    }
    const avgUnits = Number((units / 4).toFixed(2));
    const relativeIntensity = avgDaily > 0 ? Number((avgUnits / avgDaily).toFixed(2)) : 1.0;

    result.push({
      dayOfWeek: dow,
      dayName,
      totalUnits: units,
      avgUnits,
      relativeIntensity,
    });
  }

  return result;
}

function buildHistoricalAnalytics(
  monthlyDbRows: any[],
  spendDbRows: any[],
  forecastItems: any[],
): InventoryHistoricalAnalytics {
  const monthsLogged = Math.max(1, new Set(monthlyDbRows.map((r) => r.month_key)).size);
  const isMaturityReached = monthsLogged >= 12;
  const maturityProgressPercent = Math.min(100, Math.round((monthsLogged / 12) * 100));

  const seasonality = BENCHMARK_SEASONALITY.map((bench) => {
    const monthNum = bench.month;
    const matchingRows = monthlyDbRows.filter((r) => Number(r.month_num) === monthNum);
    const loggedConsumption = matchingRows.reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);
    const avgConsumption = forecastItems.reduce((sum, it) => sum + (Number(it.monthlyConsumption) || 0), 0);

    const seasonalityIndex = loggedConsumption > 0 && avgConsumption > 0
      ? Number((loggedConsumption / (avgConsumption / 12)).toFixed(2))
      : bench.index;

    return {
      month: monthNum,
      monthName: MONTH_NAMES[monthNum - 1],
      consumptionUnits: loggedConsumption > 0 ? loggedConsumption : Math.round(avgConsumption * bench.index),
      seasonalityIndex,
      isPeak: bench.isPeak,
      isLull: bench.isLull,
      label: bench.label,
      isBenchmark: loggedConsumption === 0,
    };
  });

  const now = new Date();
  const spendTrend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthName = MONTH_NAMES[d.getMonth()];

    const monthCons = monthlyDbRows.filter((r) => r.month_key === yearMonth);
    const consumables = monthCons
      .filter((r) => r.category === 'Barber supplies' || r.category === 'barber_supplies')
      .reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);
    const retails = monthCons
      .filter((r) => r.category === 'Customer retail' || r.category === 'customer_retail')
      .reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);

    const spendRow = spendDbRows.find((r) => r.month_key === yearMonth);
    const restockSpend = spendRow ? Number(spendRow.restock_spend) || 0 : 0;

    spendTrend.push({
      yearMonth,
      monthName,
      consumablesUnits: consumables,
      retailsUnits: retails,
      totalUnits: consumables + retails,
      restockSpend,
    });
  }

  const tierMigrations: ProductTierMigrationPoint[] = forecastItems.slice(0, 15).map((item) => {
    const priorClass: InventoryMovementClass = item.priorMovementRatePerDay === null
      ? 'insufficient_data'
      : item.priorMovementRatePerDay >= 1
        ? 'fast'
        : item.priorMovementRatePerDay > 0
          ? 'slow'
          : 'insufficient_data';
    const breachCount = item.physicalStockStatus === 'critical' || item.physicalStockStatus === 'out_of_stock' ? 2 : 0;
    const reliabilityScore = Math.max(50, 100 - (breachCount * 25));

    return {
      productId: item.productId,
      name: item.name,
      currentTier: (item.movementClass || 'insufficient_data') as InventoryMovementClass,
      priorTier: priorClass,
      trend: item.movementTrend || 'stable',
      stockoutBreachMonthsCount: breachCount,
      reliabilityScore,
    };
  });

  const annualTotalConsumption = seasonality.reduce((sum, s) => sum + s.consumptionUnits, 0);
  const annualTotalSpend = spendTrend.reduce((sum, s) => sum + s.restockSpend, 0);

  return {
    monthsLogged,
    isMaturityReached,
    maturityProgressPercent,
    seasonality,
    spendTrend,
    tierMigrations,
    annualTotalConsumption,
    annualTotalSpend,
  };
}

export class InventoryRepository {
  async listRetailCatalog(): Promise<any[]> {
    await ensureRetailSchema();
    const result = await db.query(`
      SELECT p.inventory_product_id AS id,
             p.inventory_product_id AS "productId",
             p.name,
             'Customer retail' AS category,
             'Retail Items' AS ownership,
             p.unit,
             p.retail_price AS "retailPrice",
             COALESCE(SUM(s.current_quantity), 0) AS "currentStock"
      FROM inventory_products p
      JOIN inventory_stock s ON s.inventory_product_id = p.inventory_product_id
      WHERE p.is_active = TRUE
        AND p.ownership_type = 'shared_retail'
        AND (s.is_active IS NULL OR s.is_active = TRUE)
      GROUP BY p.inventory_product_id, p.name, p.unit, p.retail_price
      ORDER BY p.name ASC, p.inventory_product_id ASC
    `);
    return result.rows;
  }

  async listInventoryForecast(): Promise<InventoryForecastResponse> {
    await ensureRetailSchema();
    const result = await db.query(
      `WITH recent_consumption AS (
         SELECT inventory_stock_id,
                SUM(quantity) AS consumption_total
         FROM inventory_consumption
         WHERE consumed_at >= DATE_TRUNC('day', NOW()) - INTERVAL '${MOVEMENT_LOOKBACK_DAYS - 1} days'
           AND source_type IN ('retail_sale', 'barber_handout')
           AND consumed_at <= NOW()
         GROUP BY inventory_stock_id
       ), prior_consumption AS (
         SELECT inventory_stock_id,
                SUM(quantity) AS prior_consumption_total
         FROM inventory_consumption
         WHERE consumed_at >= DATE_TRUNC('day', NOW()) - INTERVAL '${(MOVEMENT_LOOKBACK_DAYS * 2) - 1} days'
           AND source_type IN ('retail_sale', 'barber_handout')
           AND consumed_at < DATE_TRUNC('day', NOW()) - INTERVAL '${MOVEMENT_LOOKBACK_DAYS - 1} days'
         GROUP BY inventory_stock_id
       ), history_start AS (
         SELECT inventory_stock_id,
                MIN(consumed_at) AS first_consumed_at
         FROM inventory_consumption
         WHERE consumed_at >= DATE_TRUNC('day', NOW()) - INTERVAL '${(MOVEMENT_LOOKBACK_DAYS * 2) - 1} days'
           AND source_type IN ('retail_sale', 'barber_handout')
           AND consumed_at <= NOW()
         GROUP BY inventory_stock_id
       )
       SELECT s.inventory_stock_id, s.branch_id, p.inventory_product_id, p.name, p.category,
              p.ownership_type, p.unit, p.cost_price, p.retail_price, p.critical_threshold, p.safety_stock,
              p.high_volume_multiplier, s.current_quantity,
              COALESCE(s.expiration_date, p.expiration_date) AS expiration_date,
              p.default_supplier_id, supplier.name AS default_supplier_name,
              COALESCE(rc.consumption_total, 0) AS consumption_total,
              COALESCE(pc.prior_consumption_total, 0) AS prior_consumption_total,
              CASE
                WHEN hs.first_consumed_at IS NULL THEN 0
                ELSE LEAST(${MOVEMENT_LOOKBACK_DAYS}, GREATEST(1, CURRENT_DATE - hs.first_consumed_at::date + 1))
              END::int AS history_days
       FROM inventory_stock s
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       LEFT JOIN suppliers supplier ON supplier.id = p.default_supplier_id
       LEFT JOIN recent_consumption rc ON rc.inventory_stock_id = s.inventory_stock_id
       LEFT JOIN prior_consumption pc ON pc.inventory_stock_id = s.inventory_stock_id
       LEFT JOIN history_start hs ON hs.inventory_stock_id = s.inventory_stock_id
       WHERE p.is_active = TRUE
         AND (s.is_active IS NULL OR s.is_active = TRUE)
       ORDER BY p.ownership_type, p.name, s.inventory_stock_id`,
      [],
    );

    let dailyRows: any[] = [];
    let monthlyRows: any[] = [];
    let spendRows: any[] = [];
    try {
      const dailyRes = await db.query(
        `SELECT inventory_stock_id,
                TO_CHAR(history_date, 'YYYY-MM-DD') AS date,
                consumed_quantity AS quantity,
                EXTRACT(ISODOW FROM history_date)::int AS dow
         FROM public.inventory_forecast_daily_history
         ORDER BY inventory_stock_id, history_date`,
        [],
      );
      dailyRows = dailyRes?.rows || [];
    } catch {
      dailyRows = [];
    }

    try {
      const monthlyRes = await db.query(
        `SELECT TO_CHAR(c.consumed_at, 'YYYY-MM') AS month_key,
                EXTRACT(MONTH FROM c.consumed_at)::int AS month_num,
                p.category,
                SUM(c.quantity) AS total_quantity
         FROM inventory_consumption c
         JOIN inventory_stock s ON s.inventory_stock_id = c.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE c.consumed_at >= NOW() - INTERVAL '12 months'
           AND c.source_type IN ('retail_sale', 'barber_handout')
         GROUP BY TO_CHAR(c.consumed_at, 'YYYY-MM'), EXTRACT(MONTH FROM c.consumed_at), p.category
         ORDER BY month_key ASC`,
        [],
      );
      monthlyRows = monthlyRes?.rows || [];
    } catch {
      monthlyRows = [];
    }

    try {
      const spendRes = await db.query(
        `SELECT TO_CHAR(m.created_at, 'YYYY-MM') AS month_key,
                SUM(m.quantity_delta * COALESCE(p.cost_price, 0)) AS restock_spend
         FROM inventory_stock_movements m
         JOIN inventory_stock s ON s.inventory_stock_id = m.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE m.movement_type = 'receipt'
           AND m.created_at >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(m.created_at, 'YYYY-MM')
         ORDER BY month_key ASC`,
        [],
      );
      spendRows = spendRes?.rows || [];
    } catch {
      spendRows = [];
    }

    const rawRows = (result?.rows || []).map((row: any) => {
      const stockId = String(row.inventory_stock_id);
      const itemDailyRows = dailyRows.filter((r) => String(r.inventory_stock_id) === stockId);
      const historyDays = Number(row.history_days) || 0;
      const consumptionTotal = Number(row.consumption_total) || 0;
      const avgDaily = historyDays > 0 ? consumptionTotal / historyDays : 0;

      const dailyHistory = generateItemDailyHistory(itemDailyRows);
      const dowIntensity = generateItemDayOfWeekIntensity(itemDailyRows, avgDaily);

      return mapInventoryRow({
        ...row,
        daily_history: dailyHistory,
        dow_history: dowIntensity,
      });
    });

    const items = aggregateInventoryItems(rawRows);
    const historicalAnalytics = buildHistoricalAnalytics(monthlyRows, spendRows, items);

    return {
      items,
      summary: {
        totalItems: items.length,
        fastMoving: items.filter((item) => item.movementClass === 'fast').length,
        slowMoving: items.filter((item) => item.movementClass === 'slow').length,
        insufficientData: items.filter((item) => item.movementClass === 'insufficient_data').length,
        urgentRestockCount: items.filter((item) => item.physicalStockStatus === 'out_of_stock' || item.physicalStockStatus === 'critical' || (item.reorderDeadlineDays !== null && item.reorderDeadlineDays <= 0)).length,
        outOfStockCount: items.filter((item) => item.physicalStockStatus === 'out_of_stock').length,
        criticallyLowCount: items.filter((item) => item.physicalStockStatus === 'critical').length,
      },
      rules: movementClassificationRules,
      historicalAnalytics,
    };
  }

  async listInventory(): Promise<any[]> {
    await ensureRetailSchema();
    const result = await db.query(
      `${inventoryRowSelect}
       WHERE p.is_active = TRUE
         AND (s.is_active IS NULL OR s.is_active = TRUE)
       ORDER BY p.ownership_type, p.name, s.inventory_stock_id`,
      [],
    );
    const rows = result?.rows || [];
    return aggregateInventoryItems(rows.map(mapInventoryRow));
  }

  async bulkDeleteInventoryItems(itemIds: number[]): Promise<{ deletedCount: number; itemIds: string[]; deletedItems: any[] }> {
    if (!itemIds || itemIds.length === 0) {
      return { deletedCount: 0, itemIds: [], deletedItems: [] };
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const lookupResult = await client.query(
        `SELECT s.inventory_stock_id, s.inventory_product_id, p.name, p.unit, p.ownership_type
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE (s.inventory_stock_id = ANY($1::bigint[]) OR p.inventory_product_id = ANY($1::bigint[]))
           AND (s.is_active IS NULL OR s.is_active = TRUE)
           AND p.is_active = TRUE`,
        [itemIds],
      );

      const targetRows = lookupResult.rows;
      if (targetRows.length === 0) {
        await client.query('COMMIT');
        return { deletedCount: 0, itemIds: [], deletedItems: [] };
      }

      const stockIds = targetRows.map((r: any) => Number(r.inventory_stock_id));
      const productIds = Array.from(new Set(targetRows.map((r: any) => Number(r.inventory_product_id))));

      await client.query(
        `UPDATE inventory_stock
         SET is_active = FALSE
         WHERE inventory_stock_id = ANY($1::bigint[])`,
        [stockIds],
      );

      await client.query(
        `UPDATE inventory_products p
         SET is_active = FALSE
         WHERE p.inventory_product_id = ANY($1::bigint[])
           AND NOT EXISTS (
             SELECT 1
             FROM inventory_stock s
             WHERE s.inventory_product_id = p.inventory_product_id
               AND (s.is_active IS NULL OR s.is_active = TRUE)
           )`,
        [productIds],
      );

      await client.query('COMMIT');

      return {
        deletedCount: targetRows.length,
        itemIds: targetRows.map((r: any) => String(r.inventory_stock_id)),
        deletedItems: targetRows.map((r: any) => ({
          stockId: String(r.inventory_stock_id),
          productId: String(r.inventory_product_id),
          name: r.name,
          unit: r.unit,
          ownershipType: r.ownership_type,
        })),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createInventoryItem(data: CreateInventoryItemInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const category = (data.ownershipType === 'barber_assigned' || (data.ownershipType as string) === 'barber_consumables')
        ? 'barber_supplies'
        : 'customer_retail';
      const ownershipType = (data.ownershipType === 'barber_assigned' || (data.ownershipType as string) === 'barber_consumables')
        ? 'barber_assigned'
        : 'shared_retail';

      const existingProduct = await client.query(
        `SELECT *
         FROM inventory_products
         WHERE LOWER(TRIM(name)) = LOWER($1)
           AND LOWER(TRIM(unit)) = LOWER($2)
           AND category = $3
           AND ownership_type = $4
           AND is_active = TRUE
         ORDER BY branch_id NULLS FIRST, inventory_product_id
         LIMIT 1`,
        [data.name, data.unit, category, ownershipType],
      );

      let product = existingProduct.rows[0];
      if (!product) {
        if (data.supplierId) {
          const supplierResult = await client.query(
            `SELECT id
             FROM suppliers
             WHERE id = $1::uuid
               AND is_active = TRUE
               AND ($2::int IS NULL OR branch_id = $2::int)`,
            [data.supplierId, data.supplierBranchId ?? null],
          );
          if (!supplierResult.rows[0]) {
            throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'The selected supplier is not active in this branch.');
          }
        }
        const productResult = data.expirationDate
          ? await client.query(
              `INSERT INTO inventory_products
                (branch_id, name, category, ownership_type, unit, cost_price, critical_threshold,
                 safety_stock, high_volume_multiplier, retail_price, default_supplier_id, created_by,
                 retail_category, tags, show_in_shop, image_url, expiration_date)
               VALUES (NULL, $1, $2, $3, $4, $5, 0, 0, 1, $6, $7::uuid, $8, $9, $10, $11, $12, $13::date)
               RETURNING *`,
              [
                data.name,
                category,
                ownershipType,
                data.unit,
                data.costPrice ?? 0,
                data.ownershipType === 'shared_retail' ? data.retailPrice ?? null : null,
                data.supplierId || null,
                data.createdBy || null,
                data.ownershipType === 'shared_retail' ? data.retailCategory || null : null,
                data.ownershipType === 'shared_retail' && Array.isArray(data.tags) ? data.tags : [],
                data.ownershipType === 'shared_retail' ? Boolean(data.showInShop) : false,
                data.ownershipType === 'shared_retail' ? data.imageUrl || null : null,
                data.expirationDate,
              ],
            )
          : await client.query(
              `INSERT INTO inventory_products
                (branch_id, name, category, ownership_type, unit, cost_price, critical_threshold,
                 safety_stock, high_volume_multiplier, retail_price, default_supplier_id, created_by,
                 retail_category, tags, show_in_shop, image_url)
               VALUES (NULL, $1, $2, $3, $4, $5, 0, 0, 1, $6, $7::uuid, $8, $9, $10, $11, $12)
               RETURNING *`,
              [
                data.name,
                category,
                ownershipType,
                data.unit,
                data.costPrice ?? 0,
                data.ownershipType === 'shared_retail' ? data.retailPrice ?? null : null,
                data.supplierId || null,
                data.createdBy || null,
                data.ownershipType === 'shared_retail' ? data.retailCategory || null : null,
                data.ownershipType === 'shared_retail' && Array.isArray(data.tags) ? data.tags : [],
                data.ownershipType === 'shared_retail' ? Boolean(data.showInShop) : false,
                data.ownershipType === 'shared_retail' ? data.imageUrl || null : null,
              ],
            );
        product = productResult.rows[0];
      } else if (data.supplierId) {
        const supplierResult = await client.query(
          `SELECT id
           FROM suppliers
           WHERE id = $1::uuid
             AND is_active = TRUE
             AND ($2::int IS NULL OR branch_id = $2::int)`,
          [data.supplierId, data.supplierBranchId ?? null],
        );
        if (!supplierResult.rows[0]) {
          throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'The selected supplier is not active in this branch.');
        }
        await client.query(
          `UPDATE inventory_products SET default_supplier_id = $1::uuid WHERE inventory_product_id = $2`,
          [data.supplierId, product.inventory_product_id],
        );
      }

      const stockResult = await client.query(
        `SELECT *
         FROM inventory_stock
         WHERE inventory_product_id = $1
           AND assigned_barber_id IS NULL
         ORDER BY branch_id NULLS FIRST, inventory_stock_id
         LIMIT 1`,
        [product.inventory_product_id],
      );
      if (stockResult.rows[0]) {
        throw repositoryError(
          'INVENTORY_STOCK_ALREADY_EXISTS',
          'This inventory item already exists.',
        );
      }

      const insertedStock = data.expirationDate
        ? await client.query(
            `INSERT INTO inventory_stock
              (branch_id, inventory_product_id, assigned_barber_id, current_quantity, expiration_date)
             VALUES (NULL, $1, NULL, $2, $3::date)
             RETURNING *`,
            [product.inventory_product_id, data.initialQuantity, data.expirationDate],
          )
        : await client.query(
            `INSERT INTO inventory_stock
              (branch_id, inventory_product_id, assigned_barber_id, current_quantity)
             VALUES (NULL, $1, NULL, $2)
             RETURNING *`,
            [product.inventory_product_id, data.initialQuantity],
          );
      const stock = insertedStock.rows[0];

      if (data.initialQuantity > 0) {
        await client.query(
          `INSERT INTO inventory_stock_movements
            (branch_id, inventory_stock_id, movement_type, quantity_delta,
             quantity_before, quantity_after, source_type, source_id, reason, created_by)
           VALUES (NULL, $1, 'manual_adjustment', $2, 0, $2, 'inventory_item',
                   $3, 'Initial stock quantity', $4)`,
          [stock.inventory_stock_id, data.initialQuantity, String(product.inventory_product_id), data.createdBy || null],
        );
      }

      const response = await loadInventoryItem(client, Number(stock.inventory_stock_id));
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateInventoryCostPrice(data: UpdateInventoryCostPriceInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const productResult = await client.query(
        `SELECT p.inventory_product_id, p.cost_price, p.retail_price, p.unit
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = $1
           AND p.is_active = TRUE
         FOR UPDATE OF p`,
        [data.inventoryStockId],
      );
      const product = productResult.rows[0];
      if (!product) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }

      const updateResult = await client.query(
        `UPDATE inventory_products
         SET cost_price = $1,
             name = COALESCE($8, name),
             ownership_type = COALESCE($3, ownership_type),
             category = CASE WHEN COALESCE($3, ownership_type) = 'shared_retail' THEN 'customer_retail' ELSE 'barber_supplies' END,
             retail_price = CASE WHEN COALESCE($3, ownership_type) = 'shared_retail' THEN $2::numeric ELSE NULL END,
             expiration_date = CASE WHEN $5::boolean THEN $6::date ELSE expiration_date END,
             unit = COALESCE($7, unit)
         WHERE inventory_product_id = $4
         RETURNING inventory_product_id, name, cost_price, retail_price, expiration_date, unit`,
        [
          data.costPrice,
          data.retailPrice ?? null,
          data.ownershipType ?? null,
          product.inventory_product_id,
          data.expirationDate !== undefined,
          data.expirationDate || null,
          data.unit ?? null,
          data.name ? data.name.trim() : null,
        ],
      );
      if (updateResult.rowCount !== 1) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }

      if (data.expirationDate !== undefined) {
        await client.query(
          `UPDATE inventory_stock
           SET expiration_date = $1::date
           WHERE inventory_stock_id = $2`,
          [data.expirationDate || null, data.inventoryStockId],
        );
      }

      await client.query('COMMIT');
      const response: any = {
        productId: String(updateResult.rows[0].inventory_product_id),
        name: updateResult.rows[0].name || product.name,
        previousCostPrice: toMoney(Number(product.cost_price) || 0),
        costPrice: toMoney(Number(updateResult.rows[0].cost_price) || 0),
        retailPrice: updateResult.rows[0].retail_price == null ? null : toMoney(Number(updateResult.rows[0].retail_price) || 0),
        unit: updateResult.rows[0].unit ?? data.unit ?? product.unit,
      };
      if (data.expirationDate !== undefined || updateResult.rows[0].expiration_date) {
        response.expirationDate = data.expirationDate !== undefined
          ? (data.expirationDate || null)
          : (updateResult.rows[0].expiration_date
              ? (updateResult.rows[0].expiration_date instanceof Date
                  ? updateResult.rows[0].expiration_date.toISOString().split('T')[0]
                  : String(updateResult.rows[0].expiration_date).split('T')[0])
              : null);
      }
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStockQuantity(data: UpdateInventoryStockInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const lockedStock = await client.query(
        `SELECT s.inventory_stock_id, s.branch_id, s.current_quantity, p.category
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = $1
           AND p.is_active = TRUE
         FOR UPDATE OF s`,
        [data.inventoryStockId],
      );
      const stock = lockedStock.rows[0];
      if (!stock) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }

      const quantityBefore = Number(stock.current_quantity);
      const quantityAfter = data.quantity;
      if (quantityAfter < 0) {
        throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Stock quantity cannot be negative.');
      }
      if (stock.category === 'barber_supplies' && !Number.isInteger(quantityAfter)) {
        throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Barber-supply stock must use a whole-unit quantity.');
      }
      const quantityDelta = Number((quantityAfter - quantityBefore).toFixed(3));
      if (quantityDelta !== 0) {
        await client.query(
          `INSERT INTO inventory_stock_movements
            (branch_id, inventory_stock_id, movement_type, quantity_delta,
             quantity_before, quantity_after, source_type, source_id, reason, created_by)
           VALUES ($1, $2, 'manual_adjustment', $3, $4, $5,
                   'admin_direct_edit', $6, $7, $8)`,
          [
            stock.branch_id ?? null,
            data.inventoryStockId,
            quantityDelta,
            quantityBefore,
            quantityAfter,
            String(data.inventoryStockId),
            data.reason?.trim() || 'Direct stock edit',
            data.updatedBy,
          ],
        );
        const updateResult = await client.query(
          `UPDATE inventory_stock
           SET current_quantity = $1, version = version + 1, updated_at = NOW()
           WHERE inventory_stock_id = $2`,
          [quantityAfter, data.inventoryStockId],
        );
        if (updateResult.rowCount !== 1) {
          throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
        }
      }

      const item = await loadInventoryItem(client, data.inventoryStockId);
      if (!item) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }
      await client.query('COMMIT');
      return {
        ...item,
        quantityBefore,
        quantityAfter,
        quantityDelta,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async replenishStock(data: ReplenishStockInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const lockedStock = await client.query(
        `SELECT s.inventory_stock_id, s.branch_id, s.current_quantity, p.name, p.unit, p.inventory_product_id, p.category
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = $1
           AND p.is_active = TRUE
         FOR UPDATE OF s`,
        [data.inventoryStockId],
      );
      const stock = lockedStock.rows[0];
      if (!stock) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }
      if (stock.category === 'barber_supplies' && !Number.isInteger(data.quantity)) {
        throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Barber-supply stock must use a whole-unit quantity.');
      }

      const quantityBefore = Number(stock.current_quantity);
      const quantityDelta = Number(data.quantity.toFixed(3));
      const quantityAfter = Number((quantityBefore + quantityDelta).toFixed(3));
      if (quantityAfter < 0) {
        throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Stock quantity cannot be negative.');
      }
      const unitCost = toMoney(data.unitCost);

      await client.query(
        `INSERT INTO inventory_stock_movements
          (branch_id, inventory_stock_id, movement_type, quantity_delta,
           quantity_before, quantity_after, source_type, source_id, reason, unit_cost, created_by)
         VALUES ($1, $2, 'receipt', $3, $4, $5,
                 'direct_replenishment', $6, $7, $8, $9)`,
        [
          stock.branch_id ?? null,
          data.inventoryStockId,
          quantityDelta,
          quantityBefore,
          quantityAfter,
          String(data.inventoryStockId),
          data.notes?.trim() || 'Direct shelf replenishment',
          unitCost,
          data.replenishedBy,
        ],
      );

      await client.query(
        `UPDATE inventory_products
         SET cost_price = $1
         WHERE inventory_product_id = $2`,
        [unitCost, stock.inventory_product_id],
      );

      const updateResult = await client.query(
        `UPDATE inventory_stock
         SET current_quantity = $1, version = version + 1, updated_at = NOW()
         WHERE inventory_stock_id = $2`,
        [quantityAfter, data.inventoryStockId],
      );
      if (updateResult.rowCount !== 1) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }

      const item = await loadInventoryItem(client, data.inventoryStockId);
      if (!item) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }

      await client.query('COMMIT');
      return {
        ...item,
        quantityBefore,
        quantityAdded: quantityDelta,
        quantityAfter,
        unitCost,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Lists recent recorded usage events. */
  async listConsumption(limit = 100): Promise<any[]> {
    const result = await db.query(
      `SELECT c.inventory_consumption_id, c.inventory_stock_id, c.quantity,
              c.source_type, c.source_id, c.service_id, c.transaction_id, c.barber_id,
              c.consumed_at, p.name, p.unit, s.assigned_barber_id
       FROM inventory_consumption c
       JOIN inventory_stock s ON s.inventory_stock_id = c.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       ORDER BY c.consumed_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** Lists recent stock movements with report categories. */
  async listStockMovements(limit = 100): Promise<any[]> {
    const result = await db.query(
      `SELECT m.inventory_movement_id, m.inventory_stock_id, m.movement_type,
              m.quantity_delta, m.quantity_before, m.quantity_after,
              m.source_type, m.source_id, m.reason, m.created_by, m.created_at,
              p.name, p.unit

       FROM inventory_stock_movements m
       JOIN inventory_stock s ON s.inventory_stock_id = m.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       ORDER BY m.created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row: any) => {
      const reportCategory = row.movement_type === 'consumption'
        ? 'recorded_usage'
        : row.movement_type === 'count_correction'
          ? 'physical_count_correction'
          : row.movement_type === 'receipt'
            ? 'stock_receipt'
            : 'manual_adjustment';
      return {
        ...row,
        report_category: reportCategory,
      };
    });
  }

  async createStockCount(data: SubmitStockCountInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const stockResult = await client.query(
        `SELECT s.inventory_stock_id
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = ANY($1::bigint[])`,
        [data.lines.map((line) => line.inventoryStockId)],
      );
      if (stockResult.rowCount !== data.lines.length) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'One or more inventory items were not found.');
      }
      const existingSubmission = await client.query(
        `SELECT stock_count_id, status
         FROM inventory_stock_count_submissions
         WHERE branch_id IS NOT DISTINCT FROM $1
           AND count_date = $2
           AND shift = $3
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [data.branchId ?? null, data.countDate, data.shift],
      );

      let countId: number;
      if (existingSubmission.rows.length > 0) {
        const existing = existingSubmission.rows[0];
        if (existing.status === 'approved' || existing.status === 'submitted') {
          throw new Error('A count for this date and shift has already been submitted.');
        }
        countId = Number(existing.stock_count_id);
        if (data.notes?.trim()) {
          await client.query(
            `UPDATE inventory_stock_count_submissions
             SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || E'\n' || $1 END
             WHERE stock_count_id = $2`,
            [data.notes.trim(), countId],
          );
        }
      } else {
        const countResult = await client.query(
          `INSERT INTO inventory_stock_count_submissions
            (branch_id, submitted_by, count_date, shift, notes, submitted_by_role, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
           RETURNING stock_count_id`,
          [data.branchId ?? null, data.submittedBy, data.countDate, data.shift, data.notes?.trim() || null, data.submittedByRole || 'cashier'],
        );
        countId = Number(countResult.rows[0].stock_count_id);
      }

      for (const line of data.lines) {
        await client.query(
          `INSERT INTO inventory_stock_count_lines
            (stock_count_id, inventory_stock_id, counted_quantity, notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (stock_count_id, inventory_stock_id)
           DO UPDATE SET counted_quantity = EXCLUDED.counted_quantity, notes = COALESCE(EXCLUDED.notes, inventory_stock_count_lines.notes)`,
          [countId, line.inventoryStockId, line.countedQuantity, line.notes?.trim() || null],
        );
      }

      const linesResult = await client.query(
        `SELECT l.inventory_stock_id, l.counted_quantity, l.notes, p.category,
                s.current_quantity, s.branch_id AS stock_branch_id
         FROM inventory_stock_count_lines l
         JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE l.stock_count_id = $1
         ORDER BY l.inventory_stock_id
         FOR UPDATE OF s`,
        [countId],
      );
      if (!linesResult.rowCount) {
        throw repositoryError('INVENTORY_STOCK_COUNT_NO_LINES', 'Stock count has no count lines.');
      }

      let movementCount = 0;
      for (const line of linesResult.rows) {
        const before = Number(line.current_quantity);
        const after = Number(line.counted_quantity);
        if (!Number.isFinite(after) || after < 0) {
          throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Stock quantity cannot be negative.');
        }
        if (line.category === 'barber_supplies' && !Number.isInteger(after)) {
          throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Barber-supply stock counts must use a whole-unit quantity.');
        }
        const delta = Number((after - before).toFixed(3));
        if (delta === 0) continue;

        await client.query(
          `INSERT INTO inventory_stock_movements
            (branch_id, inventory_stock_id, movement_type, quantity_delta,
             quantity_before, quantity_after, source_type, source_id, reason, created_by)
           VALUES ($1, $2, 'count_correction', $3, $4, $5, 'stock_count', $6, $7, $8)`,
          [line.stock_branch_id ?? data.branchId ?? null, line.inventory_stock_id, delta, before, after, String(countId), line.notes?.trim() || data.notes?.trim() || null, data.submittedBy],
        );
        const updateResult = await client.query(
          `UPDATE inventory_stock
           SET current_quantity = $1, version = version + 1, updated_at = NOW()
           WHERE inventory_stock_id = $2`,
          [after, line.inventory_stock_id],
        );
        if (updateResult.rowCount !== 1) {
          throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'One or more inventory items were not found.');
        }
        movementCount += 1;
      }

      await client.query(
        `UPDATE inventory_stock_count_submissions
         SET status = 'submitted', submitted_by = $2, submitted_by_role = $3,
             reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL
         WHERE stock_count_id = $1`,
        [countId, data.submittedBy, data.submittedByRole || 'cashier'],
      );
      const response = await loadStockCount(client, countId);
      await client.query('COMMIT');
      return { ...response, movementCount };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as any)?.code === '23505') throw new Error('A count for this date and shift already exists.');
      throw error;
    } finally {
      client.release();
    }
  }

  async findStockCountById(stockCountId: number, _branchId?: number | null): Promise<any | null> {
    return loadStockCount(db, stockCountId);
  }

  async listPendingStockCounts(): Promise<any[]> {
    const result = await db.query(
      `SELECT stock_count_id
       FROM inventory_stock_count_submissions
       WHERE status = 'pending'
       ORDER BY count_date ASC, created_at ASC
       LIMIT $1`,
      [50],
    );
    return loadStockCounts(
      db,
      result.rows.map((row: any) => Number(row.stock_count_id)),
    );
  }

  async listStockCounts(options: ListStockCountsOptions = {}): Promise<any[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.status && options.status !== 'ALL' && options.status !== 'all') {
      params.push(options.status.toLowerCase());
      conditions.push(`status = $${params.length}`);
    }
    if (options.startDate) {
      params.push(options.startDate);
      conditions.push(`count_date >= $${params.length}`);
    }
    if (options.endDate) {
      params.push(options.endDate);
      conditions.push(`count_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(options.limit || 100, 500);
    params.push(limit);
    const limitClause = `LIMIT $${params.length}`;

    const result = await db.query(
      `SELECT stock_count_id
       FROM inventory_stock_count_submissions
       ${whereClause}
       ORDER BY count_date DESC, created_at DESC
       ${limitClause}`,
      params,
    );

    return loadStockCounts(
      db,
      result.rows.map((row: any) => Number(row.stock_count_id)),
    );
  }


  async reviewStockCount(data: ReviewStockCountInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const countResult = await client.query(
        `SELECT * FROM inventory_stock_count_submissions
         WHERE stock_count_id = $1 FOR UPDATE`,
        [data.stockCountId],
      );
      const count = countResult.rows[0];
      if (!count) {
        throw repositoryError(
          'INVENTORY_STOCK_COUNT_NOT_FOUND',
          'Stock count was not found.',
        );
      }
      if (count.status !== 'pending') {
        throw repositoryError(
          'INVENTORY_STOCK_COUNT_ALREADY_REVIEWED',
          'Only pending stock counts can be reviewed.',
        );
      }

      let response: any;
      if (data.decision === 'rejected') {
        const updateResult = await client.query(
          `UPDATE inventory_stock_count_submissions
           SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_reason = $2
           WHERE stock_count_id = $3 AND status = 'pending'`,
          [data.reviewedBy, data.reason?.trim() || null, data.stockCountId],
        );
        if (updateResult.rowCount !== 1) {
          throw repositoryError(
            'INVENTORY_STOCK_COUNT_ALREADY_REVIEWED',
            'Only pending stock counts can be reviewed.',
          );
        }
        response = await loadStockCount(client, data.stockCountId);
      } else {
        const additionalLines = data.additionalLines || [];
        if (additionalLines.length > 0) {
          const additionalStockIds = additionalLines.map((line) => line.inventoryStockId);
          const existingLinesResult = await client.query(
            `SELECT inventory_stock_id
             FROM inventory_stock_count_lines
             WHERE stock_count_id = $1`,
            [data.stockCountId],
          );
          const existingStockIds = new Set(
            existingLinesResult.rows.map((line: any) => String(line.inventory_stock_id)),
          );
          if (additionalStockIds.some((stockId) => existingStockIds.has(String(stockId)))) {
            throw repositoryError(
              'INVENTORY_STOCK_COUNT_DUPLICATE_LINES',
              'One or more added stock items are already in this count.',
            );
          }

          const additionalStocksResult = await client.query(
            `SELECT s.inventory_stock_id
             FROM inventory_stock s
             JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
             WHERE s.inventory_stock_id = ANY($1::bigint[])`,
            [additionalStockIds],
          );
          if (additionalStocksResult.rowCount !== additionalStockIds.length) {
            throw repositoryError(
              'INVENTORY_STOCK_NOT_FOUND',
              'One or more added inventory items were not found.',
            );
          }

          for (const line of additionalLines) {
            await client.query(
              `INSERT INTO inventory_stock_count_lines
                (stock_count_id, inventory_stock_id, counted_quantity, notes)
               VALUES ($1, $2, $3, $4)`,
              [data.stockCountId, line.inventoryStockId, line.countedQuantity, line.notes?.trim() || null],
            );
          }
        }

        const linesResult = await client.query(
          `SELECT l.stock_count_line_id, l.inventory_stock_id, l.counted_quantity, p.category,
                  s.current_quantity, s.branch_id AS stock_branch_id,
                  p.branch_id AS product_branch_id
           FROM inventory_stock_count_lines l
           LEFT JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
           LEFT JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
           WHERE l.stock_count_id = $1
           ORDER BY l.stock_count_line_id`,
          [data.stockCountId],
        );
        const allLinesResult = await client.query(
          `SELECT l.stock_count_line_id, l.inventory_stock_id,
                  s.branch_id AS stock_branch_id,
                  p.branch_id AS product_branch_id
           FROM inventory_stock_count_lines l
           LEFT JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
           LEFT JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
           WHERE l.stock_count_id = $1
           ORDER BY l.stock_count_line_id`,
          [data.stockCountId],
        );
        if (allLinesResult.rowCount !== null && allLinesResult.rowCount === 0) {
          throw repositoryError(
            'INVENTORY_STOCK_COUNT_NO_LINES',
            'Stock count has no count lines.',
          );
        }
        if (allLinesResult.rowCount !== linesResult.rowCount) {
          throw repositoryError(
            'INVENTORY_STOCK_COUNT_INVALID_LINES',
            'Stock count contains an invalid inventory line.',
          );
        }
        const stockIds = linesResult.rows.map((line) => line.inventory_stock_id);
        const lockedStocks = await client.query(
          `SELECT s.inventory_stock_id, s.current_quantity
           FROM inventory_stock s
           WHERE s.inventory_stock_id = ANY($1::bigint[])
           FOR UPDATE`,
          [stockIds],
        );
        if (lockedStocks.rowCount !== stockIds.length) {
          throw repositoryError(
            'INVENTORY_STOCK_NOT_FOUND',
            'One or more inventory items were not found.',
          );
        }
        const currentById = new Map(lockedStocks.rows.map((row) => [String(row.inventory_stock_id), Number(row.current_quantity)]));
        let movementCount = 0;

        for (const line of linesResult.rows) {
          const before = currentById.get(String(line.inventory_stock_id));
          if (before === undefined) {
            throw repositoryError(
              'INVENTORY_STOCK_NOT_FOUND',
              'One or more inventory items were not found.',
            );
          }
          const after = Number(line.counted_quantity);
          if (after < 0) {
            throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Stock quantity cannot be negative.');
          }
          if (line.category === 'barber_supplies' && !Number.isInteger(after)) {
            throw repositoryError('INVENTORY_STOCK_INVALID_QUANTITY', 'Barber-supply stock counts must use a whole-unit quantity.');
          }
          const delta = Number((after - before).toFixed(3));
          if (delta === 0) continue;
          await client.query(
            `INSERT INTO inventory_stock_movements
              (branch_id, inventory_stock_id, movement_type, quantity_delta,
               quantity_before, quantity_after, source_type, source_id, reason, created_by)
             VALUES ($1, $2, 'count_correction', $3, $4, $5, 'stock_count', $6, $7, $8)`,
            [count.branch_id ?? data.branchId ?? null, line.inventory_stock_id, delta, before, after, String(data.stockCountId), data.reason?.trim() || null, data.reviewedBy],
          );
          const updateResult = await client.query(
            `UPDATE inventory_stock
             SET current_quantity = $1, version = version + 1, updated_at = NOW()
             WHERE inventory_stock_id = $2`,
            [after, line.inventory_stock_id],
          );
          if (updateResult.rowCount !== 1) {
            throw repositoryError(
              'INVENTORY_STOCK_NOT_FOUND',
              'One or more inventory items were not found.',
            );
          }
          movementCount += 1;
        }
        const updateResult = await client.query(
          `UPDATE inventory_stock_count_submissions
           SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_reason = $2
           WHERE stock_count_id = $3 AND status = 'pending'`,
          [data.reviewedBy, data.reason?.trim() || null, data.stockCountId],
        );
        if (updateResult.rowCount !== 1) {
          throw repositoryError(
            'INVENTORY_STOCK_COUNT_ALREADY_REVIEWED',
            'Only pending stock counts can be reviewed.',
          );
        }
        response = await loadStockCount(client, data.stockCountId);
        response = { ...response, movementCount };
      }
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRestockRequests(requestedBy?: string): Promise<any[]> {
    const result = await db.query(
      `SELECT r.*, p.name AS item_name, p.category, p.ownership_type, p.unit,
              s.assigned_barber_id,
              COALESCE(NULLIF(b.name, ''), NULLIF(u.username, '')) AS assigned_barber,
              requester.username AS requested_by_name, reviewer.username AS reviewed_by_name
       FROM inventory_restock_requests r
       JOIN inventory_stock s ON s.inventory_stock_id = r.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       LEFT JOIN barbers b ON b.barber_id = s.assigned_barber_id
       LEFT JOIN users u ON u.user_id = b.user_id
       LEFT JOIN users requester ON requester.user_id = r.requested_by
       LEFT JOIN users reviewer ON reviewer.user_id = r.reviewed_by
       WHERE ($1::text IS NULL OR r.requested_by::text = $1::text)
       ORDER BY r.created_at DESC`,
      [requestedBy || null],
    );
    return result.rows;
  }

  async createRestockRequest(data: CreateRestockRequestInput): Promise<any> {
    const result = await db.query(
      `INSERT INTO inventory_restock_requests
        (branch_id, inventory_stock_id, requested_by, requested_quantity, consumption_period, notes)
       SELECT s.branch_id, s.inventory_stock_id, $2, $3, $4, $5
       FROM inventory_stock s
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       WHERE s.inventory_stock_id = $1
       RETURNING *`,
      [data.inventoryStockId, data.requestedBy, data.requestedQuantity, data.consumptionPeriod, data.notes?.trim() || null],
    );
    if (!result.rows[0]) throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
    return result.rows[0];
  }

  async getRestockRequestEmailDetails(requestId: number): Promise<any | null> {
    const result = await db.query(
      `SELECT r.inventory_restock_request_id, r.branch_id, r.inventory_stock_id,
              r.requested_quantity, r.consumption_period, r.notes, r.status, r.created_at,
              p.name AS item_name, p.category, p.ownership_type, p.unit,
              p.critical_threshold, p.safety_stock, s.current_quantity,
              CASE
                WHEN s.current_quantity <= p.critical_threshold OR s.current_quantity = 0 THEN 'Critical'
                WHEN p.safety_stock > 0 AND s.current_quantity <= p.safety_stock THEN 'Low'
                WHEN p.safety_stock > 0 AND s.current_quantity >= p.safety_stock * 3 THEN 'Overstock'
                ELSE 'Normal'
              END AS stock_status,
              COALESCE(NULLIF(b.name, ''), NULLIF(barber_user.username, '')) AS assigned_barber,
              COALESCE(NULLIF(requester.username, ''), NULLIF(requester.email, '')) AS requested_by_name,
              branch.name AS branch_name, branch.address AS branch_address
       FROM inventory_restock_requests r
       JOIN inventory_stock s ON s.inventory_stock_id = r.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       LEFT JOIN barbers b ON b.barber_id = s.assigned_barber_id
       LEFT JOIN users barber_user ON barber_user.user_id = b.user_id
       LEFT JOIN users requester ON requester.user_id = r.requested_by
       LEFT JOIN branches branch ON branch.branch_id = r.branch_id
       WHERE r.inventory_restock_request_id = $1`,
      [requestId],
    );
    return result.rows[0] || null;
  }

  async recordRetailSaleConsumption(
    client: Queryable,
    data: RetailSaleConsumptionInput,
  ): Promise<RetailSaleConsumptionResult> {
    const items = (data.items || []).filter((item) => (
      Number.isSafeInteger(item.productId) && item.productId > 0
      && Number.isFinite(item.quantity) && item.quantity > 0
    ));
    if (items.length === 0) {
      return { recorded: 0, stockIds: [], totalQuantity: 0, totalAmount: 0, lines: [] };
    }

    const sourceKey = String(data.sourceKey || '').trim();
    if (!sourceKey) {
      throw repositoryError('INVENTORY_RETAIL_SOURCE_CONFLICT', 'A retail sale source key is required.');
    }

    const merged = new Map<number, number>();
    for (const item of items) {
      merged.set(item.productId, Number(((merged.get(item.productId) || 0) + item.quantity).toFixed(3)));
    }
    const lines = [...merged.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([productId, quantity]) => ({
        productId,
        quantity,
        sourceId: `${sourceKey}:product:${productId}`,
      }));
    const sourceIds = lines.map((line) => line.sourceId);

    const existingResult = await client.query(
      `SELECT source_id
       FROM inventory_consumption
       WHERE source_type = 'retail_sale' AND source_id = ANY($1::text[])`,
      [sourceIds],
    );
    if (existingResult.rows.length === lines.length) {
      const existingLines = await client.query(
        `SELECT l.inventory_product_id, l.quantity, l.unit_price, p.name, s.inventory_stock_id
         FROM inventory_retail_sale_lines l
         JOIN inventory_products p ON p.inventory_product_id = l.inventory_product_id
         JOIN inventory_stock s ON s.inventory_product_id = l.inventory_product_id
          AND s.assigned_barber_id IS NULL
         WHERE ($1::int IS NULL OR l.transaction_id = $1)
           AND ($2::int IS NULL OR l.queue_entry_id = $2)
           AND l.inventory_product_id = ANY($3::bigint[])
         ORDER BY l.inventory_retail_sale_line_id`,
        [data.transactionId, data.queueEntryId ?? null, lines.map((line) => line.productId)],
      );
      const snapshots: RetailSaleLineSnapshot[] = existingLines.rows.map((row: any) => ({
        productId: Number(row.inventory_product_id),
        quantity: Number(row.quantity),
        unitPrice: toMoney(Number(row.unit_price) || 0),
        name: String(row.name || 'Retail item'),
        inventoryStockId: Number(row.inventory_stock_id),
      }));
      return {
        recorded: 0,
        stockIds: [...new Set(snapshots.map((line) => line.inventoryStockId))],
        totalQuantity: Number(snapshots.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)),
        totalAmount: Number(snapshots.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2)),
        lines: snapshots,
      };
    }
    if (existingResult.rows.length > 0) {
      throw repositoryError('INVENTORY_RETAIL_SOURCE_CONFLICT', 'Retail sale consumption is only partially recorded for this checkout.');
    }

    const productIds = lines.map((line) => line.productId);
    const stockResult = await client.query(
      `SELECT s.inventory_stock_id, s.branch_id, s.inventory_product_id,
              s.assigned_barber_id, s.current_quantity, p.ownership_type, p.category,
              p.name, p.cost_price, p.retail_price, p.is_active
       FROM inventory_stock s
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       WHERE s.inventory_product_id = ANY($1::bigint[])
         AND p.is_active = TRUE
         AND (s.is_active IS NULL OR s.is_active = TRUE)
         AND p.ownership_type = 'shared_retail'
         AND p.category = 'customer_retail'
         AND s.assigned_barber_id IS NULL
       ORDER BY s.current_quantity DESC, s.inventory_stock_id ASC
       FOR UPDATE OF s`,
      [productIds],
    );
    const stockByProduct = new Map<number, any>();
    const secondaryRetailStockIds: number[] = [];
    for (const stock of stockResult.rows) {
      const productId = Number(stock.inventory_product_id);
      const existing = stockByProduct.get(productId);
      if (existing) {
        existing.currentQuantity += Number(stock.current_quantity);
        secondaryRetailStockIds.push(Number(stock.inventory_stock_id));
      } else {
        stockByProduct.set(productId, { ...stock, currentQuantity: Number(stock.current_quantity) });
      }
    }

    for (const line of lines) {
      const stock = stockByProduct.get(line.productId);
      if (!stock) {
        throw repositoryError('INVENTORY_RETAIL_NOT_SELLABLE', 'One or more selected products are not available for retail sale.');
      }
      if (Number(stock.currentQuantity) + 1e-9 < line.quantity) {
        throw repositoryError(
          'INVENTORY_RETAIL_INSUFFICIENT_STOCK',
          `Insufficient stock for ${stock.name || 'a retail product'}.`,
        );
      }
    }

    const snapshots: RetailSaleLineSnapshot[] = [];
    const currentByStockId = new Map<number, number>(
      [...stockByProduct.values()].map((stock) => [Number(stock.inventory_stock_id), Number(stock.currentQuantity)]),
    );
    const consumptionRows = lines.map((line) => {
      const stock = stockByProduct.get(line.productId);
      const stockId = Number(stock.inventory_stock_id);
      const quantityBefore = currentByStockId.get(stockId) ?? 0;
      const quantityAfter = Number((quantityBefore - line.quantity).toFixed(3));
      const unitPrice = toMoney(Number(stock.retail_price ?? stock.cost_price) || 0);
      currentByStockId.set(stockId, quantityAfter);
      const snapshot = {
        productId: line.productId,
        quantity: line.quantity,
        unitPrice,
        name: String(stock.name || 'Retail item'),
        inventoryStockId: stockId,
      };
      snapshots.push(snapshot);
      return {
        branchId: stock.branch_id ?? data.branchId ?? null,
        stockId,
        quantity: line.quantity,
        quantityBefore,
        quantityAfter,
        sourceId: line.sourceId,
        productId: line.productId,
        unitPrice: unitPrice.toFixed(2),
      };
    });
    const orderedByStock = [...currentByStockId.entries()].sort(([left], [right]) => left - right);

    await client.query(
      `INSERT INTO inventory_consumption
        (branch_id, inventory_stock_id, quantity, source_type, source_id,
         service_id, transaction_id, created_by)
       SELECT input.branch_id, input.stock_id, input.quantity, 'retail_sale', input.source_id,
              NULL, input.transaction_id, input.created_by
       FROM UNNEST($1::int[], $2::bigint[], $3::numeric[], $4::text[], $5::int[], $6::text[])
         WITH ORDINALITY AS input(branch_id, stock_id, quantity, source_id, transaction_id, created_by, input_order)
       ORDER BY input.input_order`,
      [
        consumptionRows.map((row) => row.branchId),
        consumptionRows.map((row) => row.stockId),
        consumptionRows.map((row) => row.quantity),
        consumptionRows.map((row) => row.sourceId),
        consumptionRows.map(() => data.transactionId),
        consumptionRows.map(() => data.createdBy),
      ],
    );
    await client.query(
      `INSERT INTO inventory_stock_movements
        (branch_id, inventory_stock_id, movement_type, quantity_delta,
         quantity_before, quantity_after, source_type, source_id, reason, created_by)
       SELECT input.branch_id, input.stock_id, 'consumption', -input.quantity,
              input.quantity_before, input.quantity_after, 'retail_sale', input.source_id,
              'Cashier retail sale', input.created_by
       FROM UNNEST($1::int[], $2::bigint[], $3::numeric[], $4::numeric[], $5::numeric[], $6::text[], $7::text[])
         WITH ORDINALITY AS input(branch_id, stock_id, quantity, quantity_before, quantity_after, source_id, created_by, input_order)
       ORDER BY input.input_order`,
      [
        consumptionRows.map((row) => row.branchId),
        consumptionRows.map((row) => row.stockId),
        consumptionRows.map((row) => row.quantity),
        consumptionRows.map((row) => row.quantityBefore),
        consumptionRows.map((row) => row.quantityAfter),
        consumptionRows.map((row) => row.sourceId),
        consumptionRows.map(() => data.createdBy),
      ],
    );
    await client.query(
      `INSERT INTO inventory_retail_sale_lines
        (branch_id, transaction_id, queue_entry_id, inventory_product_id, quantity, unit_price)
       SELECT input.branch_id, input.transaction_id, input.queue_entry_id, input.product_id,
              input.quantity, input.unit_price
       FROM UNNEST($1::int[], $2::int[], $3::int[], $4::bigint[], $5::numeric[], $6::numeric[])
         WITH ORDINALITY AS input(branch_id, transaction_id, queue_entry_id, product_id, quantity, unit_price, input_order)
       ORDER BY input.input_order`,
      [
        consumptionRows.map((row) => row.branchId),
        consumptionRows.map(() => data.transactionId),
        consumptionRows.map(() => data.queueEntryId ?? null),
        consumptionRows.map((row) => row.productId),
        consumptionRows.map((row) => row.quantity),
        consumptionRows.map((row) => row.unitPrice),
      ],
    );
    const stockUpdate = await client.query(
      `UPDATE inventory_stock stock
       SET current_quantity = updates.current_quantity,
           version = stock.version + 1, updated_at = NOW()
       FROM UNNEST($1::bigint[], $2::numeric[]) AS updates(inventory_stock_id, current_quantity)
       WHERE stock.inventory_stock_id = updates.inventory_stock_id`,
      [orderedByStock.map(([stockId]) => stockId), orderedByStock.map(([, quantity]) => quantity)],
    );
    if (stockUpdate.rowCount !== orderedByStock.length) {
      throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory stock was not found.');
    }
    if (secondaryRetailStockIds.length > 0) {
      await client.query(
        `UPDATE inventory_stock
         SET current_quantity = 0, version = version + 1, updated_at = NOW()
         WHERE inventory_stock_id = ANY($1::bigint[])`,
        [secondaryRetailStockIds],
      );
    }

    return {
      recorded: snapshots.length,
      stockIds: [...currentByStockId.keys()].sort((left, right) => left - right),
      totalQuantity: Number(snapshots.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)),
      totalAmount: Number(snapshots.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2)),
      lines: snapshots,
    };
  }

  async reviewRestockRequest(data: ReviewRestockRequestInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT *
         FROM inventory_restock_requests
         WHERE inventory_restock_request_id = $1
         FOR UPDATE`,
        [data.requestId],
      );
      const request = requestResult.rows[0];
      if (!request) {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_NOT_FOUND',
          'Restock request was not found.',
        );
      }

      const previousStatus = String(request.status);
      const requestedQuantity = Number(request.requested_quantity);
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_INVALID_QUANTITY',
          'Restock request quantity must be greater than zero.',
        );
      }

      if (data.decision === 'approved' && previousStatus !== 'pending') {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_INVALID_TRANSITION',
          'Only pending restock requests can be approved.',
        );
      }
      if (data.decision === 'fulfilled' && previousStatus !== 'approved') {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_INVALID_TRANSITION',
          'Only approved restock requests can be fulfilled.',
        );
      }
      if (data.decision === 'rejected') {
        if ((data.reason?.trim().length || 0) < 10) {
          throw repositoryError(
            'INVENTORY_RESTOCK_REJECTION_REASON_REQUIRED',
            'Restock rejection requires a reason of at least 10 characters.',
          );
        }
        if (!['pending', 'approved'].includes(previousStatus)) {
          throw repositoryError(
            'INVENTORY_RESTOCK_REQUEST_INVALID_TRANSITION',
            'Fulfilled restock requests are terminal and cannot be rejected.',
          );
        }
      }

      let quantityBefore: number | undefined;
      let quantityAfter: number | undefined;
      let quantityDelta = 0;
      let movementCount = 0;
      const changesInventory = data.decision === 'fulfilled';

      if (changesInventory) {
        const stockResult = await client.query(
          `SELECT s.inventory_stock_id, s.branch_id, s.current_quantity
           FROM inventory_stock s
           JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
           WHERE s.inventory_stock_id = $1
             AND p.is_active = TRUE
           FOR UPDATE OF s`,
          [request.inventory_stock_id],
        );
        const stock = stockResult.rows[0];
        if (!stock) {
          throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
        }

        quantityBefore = Number(stock.current_quantity);
        quantityDelta = Number(requestedQuantity.toFixed(3));
        quantityAfter = Number((quantityBefore + quantityDelta).toFixed(3));

        await client.query(
          `INSERT INTO inventory_stock_movements
            (branch_id, inventory_stock_id, movement_type, quantity_delta,
             quantity_before, quantity_after, source_type, source_id, reason, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            stock.branch_id ?? request.branch_id ?? null,
            request.inventory_stock_id,
            'receipt',
            quantityDelta,
            quantityBefore,
            quantityAfter,
            'restock_request',
            String(data.requestId),
            'Restock request fulfilled',
            data.reviewedBy,
          ],
        );
        const stockUpdate = await client.query(
          `UPDATE inventory_stock
           SET current_quantity = $1, version = version + 1, updated_at = NOW()
           WHERE inventory_stock_id = $2`,
          [quantityAfter, request.inventory_stock_id],
        );
        if (stockUpdate.rowCount !== 1) {
          throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
        }
        movementCount = 1;
      }

      const rejectionReason = data.decision === 'rejected' ? data.reason!.trim() : null;
      const updateResult = await client.query(
        `UPDATE inventory_restock_requests
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
             rejection_reason = $3
         WHERE inventory_restock_request_id = $4`,
        [data.decision, data.reviewedBy, rejectionReason, data.requestId],
      );
      if (updateResult.rowCount !== 1) {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_NOT_FOUND',
          'Restock request was not found.',
        );
      }

      const response = await loadRestockRequest(client, data.requestId);
      if (!response) {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_NOT_FOUND',
          'Restock request was not found.',
        );
      }
      await client.query('COMMIT');
      return {
        ...response,
        previous_status: previousStatus,
        inventory_quantity_before: quantityBefore,
        inventory_quantity_after: quantityAfter,
        inventory_quantity_delta: quantityDelta,
        movement_count: movementCount,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async receiveRestockRequest(data: ReceiveRestockRequestInput): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT *
         FROM inventory_restock_requests
         WHERE inventory_restock_request_id = $1
         FOR UPDATE`,
        [data.requestId],
      );
      const request = requestResult.rows[0];
      if (!request) {
        throw repositoryError('INVENTORY_RESTOCK_REQUEST_NOT_FOUND', 'Restock request was not found.');
      }
      const previousStatus = String(request.status);
      if (previousStatus !== 'approved' && previousStatus !== 'partially_received') {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_INVALID_TRANSITION',
          'Only approved restock requests can be received.',
        );
      }

      const requestedQuantity = Number(request.requested_quantity);
      const receivedQuantity = data.receivedQuantity !== undefined
        ? Number(data.receivedQuantity)
        : requestedQuantity;

      if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) {
        throw repositoryError(
          'INVENTORY_RESTOCK_REQUEST_INVALID_QUANTITY',
          'Received quantity must be greater than zero.',
        );
      }

      const stockResult = await client.query(
        `SELECT s.inventory_stock_id, s.branch_id, s.current_quantity, p.inventory_product_id, p.category
         FROM inventory_stock s
         JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
         WHERE s.inventory_stock_id = $1
           AND p.is_active = TRUE
         FOR UPDATE OF s`,
        [request.inventory_stock_id],
      );
      const stock = stockResult.rows[0];
      if (!stock) {
        throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory item was not found.');
      }
      if (stock.category === 'barber_supplies' && !Number.isInteger(receivedQuantity)) {
        throw repositoryError('INVENTORY_RESTOCK_REQUEST_INVALID_QUANTITY', 'Barber-supply receipts must use a whole-unit quantity.');
      }

      const quantityBefore = Number(stock.current_quantity);
      const quantityDelta = Number(receivedQuantity.toFixed(3));
      const quantityAfter = Number((quantityBefore + quantityDelta).toFixed(3));
      const unitCost = toMoney(data.unitCost);
      const movementReason = data.notes?.trim()
        ? `Restock receipt: ${data.notes.trim()}`
        : data.supplier?.trim()
          ? `Restock received from ${data.supplier.trim()}`
          : 'Restock request received';

      await client.query(
        `INSERT INTO inventory_stock_movements
          (branch_id, inventory_stock_id, movement_type, quantity_delta,
           quantity_before, quantity_after, source_type, source_id, reason, unit_cost, created_by)
         VALUES ($1, $2, 'receipt', $3, $4, $5, 'restock_request', $6, $7, $8, $9)`,
        [
          stock.branch_id ?? request.branch_id ?? null,
          request.inventory_stock_id,
          quantityDelta,
          quantityBefore,
          quantityAfter,
          String(data.requestId),
          movementReason,
          unitCost,
          data.receivedBy,
        ],
      );

      await client.query(
        `UPDATE inventory_products
         SET cost_price = $1
         WHERE inventory_product_id = $2`,
        [unitCost, stock.inventory_product_id],
      );

      await client.query(
        `UPDATE inventory_stock
         SET current_quantity = $1, version = version + 1, updated_at = NOW()
         WHERE inventory_stock_id = $2`,
        [quantityAfter, request.inventory_stock_id],
      );

      const nextStatus = receivedQuantity < requestedQuantity ? 'partially_received' : 'fulfilled';
      await client.query(
        `UPDATE inventory_restock_requests
         SET status = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE inventory_restock_request_id = $3`,
        [nextStatus, data.receivedBy, data.requestId],
      );

      const response = await loadRestockRequest(client, data.requestId);
      await client.query('COMMIT');
      return {
        ...response,
        previous_status: previousStatus,
        inventory_quantity_before: quantityBefore,
        inventory_quantity_after: quantityAfter,
        inventory_quantity_delta: quantityDelta,
        unit_cost: unitCost,
        movement_count: 1,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPhysicalCountVariances(startDate: string, endDate: string): Promise<any[]> {
    const result = await db.query(
      `SELECT c.stock_count_id, c.count_date, c.shift, c.status, c.reviewed_by, c.reviewed_at, c.review_reason,
              l.stock_count_line_id, l.inventory_stock_id, l.counted_quantity, l.notes AS line_notes,
              p.name AS item_name, p.unit, p.cost_price, p.ownership_type,
              NULL AS assigned_barber,
              COALESCE(m.quantity_before, s.current_quantity) AS current_quantity_before,
              COALESCE(m.quantity_delta, (l.counted_quantity - s.current_quantity)) AS variance_delta
       FROM inventory_stock_count_lines l
       JOIN inventory_stock_count_submissions c ON c.stock_count_id = l.stock_count_id
       JOIN inventory_stock s ON s.inventory_stock_id = l.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       LEFT JOIN inventory_stock_movements m
         ON m.source_type = 'stock_count'
        AND m.source_id = c.stock_count_id::text
        AND m.inventory_stock_id = l.inventory_stock_id
       WHERE c.count_date >= $1 AND c.count_date <= $2
       ORDER BY c.count_date DESC, c.created_at DESC, l.stock_count_line_id ASC`,
      [startDate, endDate],
    );

    return result.rows.map((row: any) => {
      const costPrice = toMoney(Number(row.cost_price) || 0);
      const varianceDelta = Number(Number(row.variance_delta).toFixed(3));
      return {
        stockCountId: String(row.stock_count_id),
        countDate: row.count_date,
        shift: row.shift,
        status: row.status,
        inventoryStockId: String(row.inventory_stock_id),
        itemName: row.item_name,
        unit: row.unit,
        costPrice,
        ownership: (row.ownership_type === 'barber_assigned' || row.ownership_type === 'barber_consumables') ? 'Consumables' : 'Retail Items',
        assignedBarber: undefined,
        countedQuantity: Number(row.counted_quantity),
        currentQuantityBefore: Number(row.current_quantity_before),
        varianceDelta,
        financialExposure: toMoney(varianceDelta * costPrice),
        notes: row.line_notes || undefined,
        reviewedBy: row.reviewed_by || undefined,
        reviewedAt: row.reviewed_at || undefined,
        reviewReason: row.review_reason || undefined,
      };
    });
  }

  async getInventoryReport(input: InventoryReportQueryInput): Promise<InventoryReportResponse> {
    const startUtc = parseManilaDateBoundary(input.startDate, false);
    const endUtc = parseManilaDateBoundary(input.endDate, true);

    const [itemsResult, stockCountsResult] = await Promise.all([
      db.query(
        `${inventoryRowSelect}
         WHERE p.is_active = TRUE
           AND ($1::bigint IS NULL OR s.inventory_stock_id = $1::bigint)
         ORDER BY p.ownership_type, p.name, s.inventory_stock_id`,
        [input.inventoryStockId ?? null],
      ),
      db.query(
        `SELECT l.inventory_stock_id,
                MAX(l.counted_quantity) FILTER (WHERE c.count_date = $1::date AND c.shift = 'morning') AS morning_stock_count,
                MAX(l.counted_quantity) FILTER (WHERE c.count_date = $2::date AND c.shift = 'evening') AS evening_stock_count
         FROM inventory_stock_count_lines l
         JOIN inventory_stock_count_submissions c ON c.stock_count_id = l.stock_count_id
         WHERE c.count_date IN ($1::date, $2::date)
           AND c.status <> 'rejected'
           AND (($3::bigint IS NULL) OR l.inventory_stock_id = $3::bigint)
         GROUP BY l.inventory_stock_id`,
        [input.startDate, input.endDate, input.inventoryStockId ?? null],
      ),
    ]);
    const items = itemsResult.rows.map(mapInventoryRow);
    const stockCountsById = new Map<string, any>(stockCountsResult.rows.map((row: any) => [
      String(row.inventory_stock_id),
      row,
    ]));

    const windowMovementsResult = input.view === 'summary' ? { rows: [] } : await db.query(
      `SELECT m.inventory_movement_id, m.inventory_stock_id, m.movement_type,
              m.quantity_delta, m.quantity_before, m.quantity_after,
              m.source_type, m.source_id, m.reason, m.created_by, m.created_at,
              p.name, p.unit, p.cost_price

       FROM inventory_stock_movements m
       JOIN inventory_stock s ON s.inventory_stock_id = m.inventory_stock_id
       JOIN inventory_products p ON p.inventory_product_id = s.inventory_product_id
       WHERE m.created_at >= $1 AND m.created_at <= $2
         AND ($3::bigint IS NULL OR m.inventory_stock_id = $3::bigint)
       ORDER BY m.created_at ASC`,
      [startUtc.toISOString(), endUtc.toISOString(), input.inventoryStockId ?? null],
    );

    const afterStartMovementsResult = await db.query(
      input.view === 'summary'
        ? `SELECT m.inventory_stock_id, SUM(m.quantity_delta) AS net_delta_after_start,
                  COUNT(*) FILTER (WHERE m.created_at <= $3) AS movement_count,
                  COALESCE(SUM(m.quantity_delta) FILTER (WHERE m.created_at <= $3 AND m.movement_type = 'receipt'), 0) AS receipts_quantity,
                  COALESCE(SUM(ABS(m.quantity_delta)) FILTER (WHERE m.created_at <= $3 AND m.movement_type = 'consumption'), 0) AS consumption_quantity,
                  COALESCE(SUM(ABS(m.quantity_delta)) FILTER (WHERE m.created_at <= $3 AND m.movement_type = 'spoilage'), 0) AS spoilage_quantity,
                  COALESCE(SUM(m.quantity_delta) FILTER (WHERE m.created_at <= $3 AND m.movement_type = 'count_correction'), 0) AS corrections_quantity,
                  COALESCE(SUM(m.quantity_delta) FILTER (WHERE m.created_at <= $3 AND (m.movement_type NOT IN ('receipt', 'consumption', 'spoilage', 'count_correction') OR m.movement_type IS NULL)), 0) AS adjustments_quantity
           FROM inventory_stock_movements m
           WHERE m.created_at >= $1
             AND ($2::bigint IS NULL OR m.inventory_stock_id = $2::bigint)
           GROUP BY m.inventory_stock_id`
        : `SELECT m.inventory_stock_id, SUM(m.quantity_delta) as net_delta_after_start
       FROM inventory_stock_movements m
       WHERE m.created_at >= $1
         AND ($2::bigint IS NULL OR m.inventory_stock_id = $2::bigint)
       GROUP BY m.inventory_stock_id`,
      input.view === 'summary'
        ? [startUtc.toISOString(), input.inventoryStockId ?? null, endUtc.toISOString()]
        : [startUtc.toISOString(), input.inventoryStockId ?? null],
    );
    const summaryByStock = new Map<string, any>(input.view === 'summary'
      ? afterStartMovementsResult.rows.map((row: any) => [String(row.inventory_stock_id), row])
      : []);
    const netDeltaAfterStartByStock = new Map<string, number>();
    for (const row of afterStartMovementsResult.rows) {
      netDeltaAfterStartByStock.set(String(row.inventory_stock_id), Number(row.net_delta_after_start) || 0);
    }

    const movementsByStock = new Map<string, any[]>();
    for (const row of windowMovementsResult.rows) {
      const stockId = String(row.inventory_stock_id);
      const list = movementsByStock.get(stockId) || [];
      list.push(row);
      movementsByStock.set(stockId, list);
    }

    let totalOpeningValue = 0;
    let totalReceiptsValue = 0;
    let totalEstimatedConsumptionValue = 0;
    let totalSpoilageQuantity = 0;
    let totalSpoilageValue = 0;
    let totalCountCorrectionsValue = 0;
    let totalManualAdjustmentsValue = 0;
    let totalClosingValue = 0;
    let atRiskSkuCount = 0;

    const reportItems = items.map((item) => {
      const stockId = item.id;
      const netAfterStart = netDeltaAfterStartByStock.get(stockId) || 0;
      const openingQuantity = Number((item.currentStock - netAfterStart).toFixed(3));
      const costPrice = toMoney(Number(item.costPrice) || 0);

      const stockMovements = movementsByStock.get(stockId) || [];
      let receiptsQuantity = 0;
      let estimatedConsumptionQuantity = 0;
      let spoilageQuantity = 0;
      let countCorrectionsQuantity = 0;
      let manualAdjustmentsQuantity = 0;

      for (const m of stockMovements) {
        const delta = Number(m.quantity_delta) || 0;
        if (m.movement_type === 'receipt') {
          receiptsQuantity += delta;
        } else if (m.movement_type === 'consumption') {
          estimatedConsumptionQuantity += Math.abs(delta);
        } else if (m.movement_type === 'spoilage') {
          spoilageQuantity += Math.abs(delta);
        } else if (m.movement_type === 'count_correction') {
          countCorrectionsQuantity += delta;
        } else {
          manualAdjustmentsQuantity += delta;
        }
      }

      if (input.view === 'summary') {
        const totals = summaryByStock.get(stockId);
        receiptsQuantity = Number(totals?.receipts_quantity) || 0;
        estimatedConsumptionQuantity = Number(totals?.consumption_quantity) || 0;
        spoilageQuantity = Number(totals?.spoilage_quantity) || 0;
        countCorrectionsQuantity = Number(totals?.corrections_quantity) || 0;
        manualAdjustmentsQuantity = Number(totals?.adjustments_quantity) || 0;
      }

      receiptsQuantity = Number(receiptsQuantity.toFixed(3));
      estimatedConsumptionQuantity = Number(estimatedConsumptionQuantity.toFixed(3));
      spoilageQuantity = Number(spoilageQuantity.toFixed(3));
      countCorrectionsQuantity = Number(countCorrectionsQuantity.toFixed(3));
      manualAdjustmentsQuantity = Number(manualAdjustmentsQuantity.toFixed(3));
      const closingQuantity = Number((
        openingQuantity + receiptsQuantity - estimatedConsumptionQuantity - spoilageQuantity + countCorrectionsQuantity + manualAdjustmentsQuantity
      ).toFixed(3));
      const openingValue = toMoney(openingQuantity * costPrice);
      const receiptsValue = toMoney(receiptsQuantity * costPrice);
      const estimatedConsumptionValue = toMoney(estimatedConsumptionQuantity * costPrice);
      const spoilageValue = toMoney(spoilageQuantity * costPrice);
      const countCorrectionsValue = toMoney(countCorrectionsQuantity * costPrice);
      const manualAdjustmentsValue = toMoney(manualAdjustmentsQuantity * costPrice);
      const closingValue = toMoney(closingQuantity * costPrice);

      totalOpeningValue += openingValue;
      totalReceiptsValue += receiptsValue;
      totalEstimatedConsumptionValue += estimatedConsumptionValue;
      totalSpoilageQuantity += spoilageQuantity;
      totalSpoilageValue += spoilageValue;
      totalCountCorrectionsValue += countCorrectionsValue;
      totalManualAdjustmentsValue += manualAdjustmentsValue;
      totalClosingValue += closingValue;

      if (item.stockStatus !== 'In Stock') atRiskSkuCount++;

      return {
        inventoryStockId: item.id,
        productId: item.productId,
        name: item.name,
        category: item.category,
        ownership: item.ownership,
        assignedBarber: item.assignedBarber,
        unit: item.unit,
        costPrice,
        openingQuantity,
        receiptsQuantity,
        estimatedConsumptionQuantity,
        spoilageQuantity,
        countCorrectionsQuantity,
        manualAdjustmentsQuantity,
        closingQuantity,
        openingValue,
        receiptsValue,
        estimatedConsumptionValue,
        spoilageValue,
        countCorrectionsValue,
        manualAdjustmentsValue,
        closingValue,
        movementCount: input.view === 'summary' ? Number(summaryByStock.get(stockId)?.movement_count) || 0 : stockMovements.length,
        currentStock: item.currentStock,
        morningStockCount: stockCountsById.get(stockId)?.morning_stock_count == null
          ? null
          : Number(stockCountsById.get(stockId).morning_stock_count),
        eveningStockCount: stockCountsById.get(stockId)?.evening_stock_count == null
          ? null
          : Number(stockCountsById.get(stockId).evening_stock_count),
        criticalStock: item.criticalStock,
        safetyStock: item.safetyStock,
        highVolumeMultiplier: item.highVolumeMultiplier,
        stockStatus: item.stockStatus || item.status,
        forecastAvailable: item.forecastAvailable,
        forecastUnavailableReason: item.forecastUnavailableReason,
        projectedStockOutDate: item.expectedStockOutDate,
        suggestedWeeklyReplenishment: item.suggestedWeeklyReplenishment,
        suggestedMonthlyReplenishment: item.suggestedMonthlyReplenishment,
      };
    });

    const variances = input.view === 'summary' ? [] : await this.getPhysicalCountVariances(input.startDate, input.endDate);

    return {
      summary: {
        startDate: input.startDate,
        endDate: input.endDate,
        period: input.period || 'daily',
        activeTrackedSkuCount: items.length,
        atRiskSkuCount,
        totalMovementCount: input.view === 'summary'
          ? afterStartMovementsResult.rows.reduce((total: number, row: any) => total + (Number(row.movement_count) || 0), 0)
          : windowMovementsResult.rows.length,
        totalOpeningValue: toMoney(totalOpeningValue),
        totalReceiptsValue: toMoney(totalReceiptsValue),
        totalEstimatedConsumptionValue: toMoney(totalEstimatedConsumptionValue),
        totalSpoilageQuantity: Number(totalSpoilageQuantity.toFixed(3)),
        totalSpoilageValue: toMoney(totalSpoilageValue),
        totalCountCorrectionsValue: toMoney(totalCountCorrectionsValue),
        totalManualAdjustmentsValue: toMoney(totalManualAdjustmentsValue),
        totalClosingValue: toMoney(totalClosingValue),
      },
      items: reportItems,
      variances,
      movements: windowMovementsResult.rows.map((row: any) => ({
        id: String(row.inventory_movement_id || row.inventory_stock_movement_id),

        inventoryStockId: String(row.inventory_stock_id),
        movementType: row.movement_type,
        quantityDelta: Number(row.quantity_delta),
        quantityBefore: Number(row.quantity_before),
        quantityAfter: Number(row.quantity_after),
        costPrice: toMoney(Number(row.cost_price) || 0),
        financialExposure: toMoney((Number(row.quantity_delta) || 0) * (Number(row.cost_price) || 0)),
        sourceType: row.source_type,
        sourceId: row.source_id,
        reason: row.reason,
        createdAt: row.created_at,
      })),
    };
  }

  async getInventoryAlerts(): Promise<any[]> {
    const items = await this.listInventory();
    const alerts: any[] = [];

    for (const item of items) {
      const current = Number(item.currentStock) || 0;
      const critical = Number(item.criticalStock) || 0;
      const safety = Number(item.safetyStock) || 0;

      if (current <= critical || current === 0 || current <= 5) {
        alerts.push({
          id: `alert-${item.id}-critical`,
          inventoryStockId: item.id,
          productId: item.productId,
          name: item.name,
          category: item.category,
          ownership: item.ownership,
          assignedBarber: item.assignedBarber,
          unit: item.unit,
          currentStock: current,
          thresholdValue: critical,
          safetyStock: safety,
          alertType: 'critical',
          severity: 'critical',
          title: `Critical Shortage: ${item.name}`,
          message: `${item.name} is down to ${current} ${item.unit} (critical threshold is ${critical} ${item.unit}). Immediate replenishment is required.`,
          forecastContext: item.forecastAvailable ? {
            expectedStockOutDate: item.expectedStockOutDate,
            suggestedReplenishment: item.suggestedWeeklyReplenishment,
            historyDays: item.historyDays,
          } : null,
          actionableLinks: [
            { label: 'Create stock request', tab: 'purchase-orders', action: 'view' },
            { label: 'Adjust stock', tab: 'management', action: 'edit' },
          ],
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      if (safety > 0 && current <= safety) {
        alerts.push({
          id: `alert-${item.id}-low_stock`,
          inventoryStockId: item.id,
          productId: item.productId,
          name: item.name,
          category: item.category,
          ownership: item.ownership,
          assignedBarber: item.assignedBarber,
          unit: item.unit,
          currentStock: current,
          thresholdValue: safety,
          safetyStock: safety,
          alertType: 'low_stock',
          severity: 'warning',
          title: `Low Stock: ${item.name}`,
          message: `${item.name} is at ${current} ${item.unit} (safety threshold is ${safety} ${item.unit}). Consider submitting a replenishment request.`,
          forecastContext: item.forecastAvailable ? {
            expectedStockOutDate: item.expectedStockOutDate,
            suggestedReplenishment: item.suggestedWeeklyReplenishment,
            historyDays: item.historyDays,
          } : null,
          actionableLinks: [
            { label: 'Create stock request', tab: 'purchase-orders', action: 'view' },
            { label: 'View inventory', tab: 'management', action: 'view' },
          ],
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      if (item.forecastAvailable && item.expectedStockOutDate) {
        const stockOutTime = new Date(`${item.expectedStockOutDate}T23:59:59+08:00`).getTime();
        const daysToStockout = Math.ceil((stockOutTime - Date.now()) / (1000 * 86400));
        if (daysToStockout >= 0 && daysToStockout <= 7) {
          alerts.push({
            id: `alert-${item.id}-forecast_stockout`,
            inventoryStockId: item.id,
            productId: item.productId,
            name: item.name,
            category: item.category,
            ownership: item.ownership,
            assignedBarber: item.assignedBarber,
            unit: item.unit,
            currentStock: current,
            thresholdValue: safety,
            safetyStock: safety,
            alertType: 'forecast_stockout',
            severity: 'warning',
            title: `Projected Stockout: ${item.name}`,
            message: `${item.name} is forecasted to run out of stock by ${item.expectedStockOutDate} (in ${daysToStockout} day${daysToStockout === 1 ? '' : 's'}) based on ${item.historyDays} days of consumption patterns.`,
            forecastContext: {
              expectedStockOutDate: item.expectedStockOutDate,
              suggestedReplenishment: item.suggestedWeeklyReplenishment,
              historyDays: item.historyDays,
            },
            actionableLinks: [
              { label: 'Create stock request', tab: 'purchase-orders', action: 'view' },
            ],
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return alerts;
  }

  async listRetailTags(): Promise<string[]> {
    await ensureRetailSchema();
    const result = await db.query(`
      SELECT DISTINCT name FROM (
        SELECT name FROM public.retail_tags
        UNION
        SELECT unnest(tags) AS name FROM public.inventory_products WHERE tags IS NOT NULL
      ) t
      WHERE name IS NOT NULL AND TRIM(name) <> ''
      ORDER BY name ASC
    `);
    return result.rows.map((r: any) => r.name);
  }

  async createRetailTag(name: string): Promise<string> {
    await ensureRetailSchema();
    const clean = name.trim();
    if (!clean) throw new AppError('Tag name cannot be empty.', 400);
    if (clean.length > 50) throw new AppError('Tag name must be 50 characters or fewer.', 400);

    await db.query(`
      INSERT INTO public.retail_tags (name)
      VALUES ($1)
      ON CONFLICT (LOWER(TRIM(name))) DO NOTHING
    `, [clean]);
    return clean;
  }

  async listRetailCategories(): Promise<string[]> {
    await ensureRetailSchema();
    const result = await db.query(`
      SELECT DISTINCT name FROM (
        SELECT name FROM public.retail_categories
        UNION
        SELECT retail_category AS name FROM public.inventory_products WHERE retail_category IS NOT NULL
      ) c
      WHERE name IS NOT NULL AND TRIM(name) <> ''
      ORDER BY name ASC
    `);
    return result.rows.map((r: any) => r.name);
  }

  async createRetailCategory(name: string): Promise<string> {
    await ensureRetailSchema();
    const clean = name.trim();
    if (!clean) throw new AppError('Category name cannot be empty.', 400);
    if (clean.length > 50) throw new AppError('Category name must be 50 characters or fewer.', 400);

    await db.query(`
      INSERT INTO public.retail_categories (name)
      VALUES ($1)
      ON CONFLICT (LOWER(TRIM(name))) DO NOTHING
    `, [clean]);
    return clean;
  }

  async updateRetailPresentation(
    productIdOrStockId: number,
    data: {
      name?: string;
      unit?: string;
      costPrice?: number;
      retailPrice?: number | null;
      retailCategory?: string | null;
      tags?: string[];
      showInShop?: boolean;
      imageUrl?: string | null;
    }
  ): Promise<any> {
    await ensureRetailSchema();

    // Check by product ID first
    let prodLookup = await db.query(`
      SELECT p.inventory_product_id, s.inventory_stock_id
      FROM public.inventory_products p
      LEFT JOIN public.inventory_stock s ON s.inventory_product_id = p.inventory_product_id AND s.assigned_barber_id IS NULL AND (s.is_active IS NULL OR s.is_active = TRUE)
      WHERE p.inventory_product_id = $1
      ORDER BY s.inventory_stock_id ASC NULLS LAST
      LIMIT 1
    `, [productIdOrStockId]);

    // Fall back to matching by stock ID
    if (!prodLookup.rows.length) {
      prodLookup = await db.query(`
        SELECT p.inventory_product_id, s.inventory_stock_id
        FROM public.inventory_stock s
        JOIN public.inventory_products p ON p.inventory_product_id = s.inventory_product_id
        WHERE s.inventory_stock_id = $1
        LIMIT 1
      `, [productIdOrStockId]);
    }

    if (!prodLookup.rows.length) {
      throw repositoryError('INVENTORY_STOCK_NOT_FOUND', 'Inventory product not found.');
    }

    const productId = Number(prodLookup.rows[0].inventory_product_id);

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      params.push(data.name.trim());
      updates.push(`name = $${params.length}`);
    }
    if (data.unit !== undefined) {
      params.push(data.unit.trim());
      updates.push(`unit = $${params.length}`);
    }
    if (data.costPrice !== undefined) {
      params.push(Number(data.costPrice) || 0);
      updates.push(`cost_price = $${params.length}::numeric`);
    }
    if (data.retailPrice !== undefined) {
      params.push(data.retailPrice == null ? null : Number(data.retailPrice) || 0);
      updates.push(`retail_price = $${params.length}::numeric`);
    }
    if (data.retailCategory !== undefined) {
      const cleanCat = data.retailCategory ? data.retailCategory.trim() : null;
      params.push(cleanCat);
      updates.push(`retail_category = $${params.length}`);
      if (cleanCat) {
        await this.createRetailCategory(cleanCat).catch(() => {});
      }
    }
    if (data.tags !== undefined) {
      const cleanTags = Array.isArray(data.tags)
        ? Array.from(new Set(data.tags.map(t => String(t).trim()).filter(Boolean)))
        : [];
      params.push(cleanTags);
      updates.push(`tags = $${params.length}::text[]`);
      for (const t of cleanTags) {
        await this.createRetailTag(t).catch(() => {});
      }
    }
    if (data.showInShop !== undefined) {
      params.push(Boolean(data.showInShop));
      updates.push(`show_in_shop = $${params.length}::boolean`);
    }
    if (data.imageUrl !== undefined) {
      params.push(data.imageUrl || null);
      updates.push(`image_url = $${params.length}`);
    }

    if (updates.length > 0) {
      params.push(productId);
      await db.query(`
        UPDATE public.inventory_products
        SET ${updates.join(', ')}
        WHERE inventory_product_id = $${params.length}
      `, params);
    }

    let resolvedStockId = Number(prodLookup.rows[0].inventory_stock_id) || 0;
    if (!resolvedStockId) {
      const activeStock = await db.query(`
        SELECT inventory_stock_id FROM public.inventory_stock
        WHERE inventory_product_id = $1 AND assigned_barber_id IS NULL AND (is_active IS NULL OR is_active = TRUE)
        LIMIT 1
      `, [productId]);
      if (activeStock.rows.length) {
        resolvedStockId = Number(activeStock.rows[0].inventory_stock_id);
      }
    }

    if (resolvedStockId) {
      const item = await loadInventoryItem(db, resolvedStockId);
      if (item) return item;
    }

    const prodRow = await db.query(`
      SELECT p.*, s.current_quantity, s.inventory_stock_id
      FROM public.inventory_products p
      LEFT JOIN public.inventory_stock s ON s.inventory_product_id = p.inventory_product_id
      WHERE p.inventory_product_id = $1
      LIMIT 1
    `, [productId]);
    if (prodRow.rows[0]) {
      const r = prodRow.rows[0];
      return {
        id: String(r.inventory_stock_id || r.inventory_product_id),
        productId: String(r.inventory_product_id),
        name: r.name,
        category: r.category === 'barber_supplies' ? 'Barber supplies' : 'Customer retail',
        ownership: 'Retail Items',
        unit: r.unit,
        costPrice: toMoney(Number(r.cost_price) || 0),
        retailPrice: r.retail_price == null ? null : toMoney(Number(r.retail_price) || 0),
        imageUrl: r.image_url || null,
        retailCategory: r.retail_category || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        showInShop: Boolean(r.show_in_shop),
        defaultSupplierId: r.default_supplier_id ? String(r.default_supplier_id) : null,
        currentStock: Math.floor(Number(r.current_quantity ?? 0)),
        criticalStock: Number(r.critical_threshold ?? 0),
        safetyStock: Number(r.safety_stock ?? 0),
        highVolumeMultiplier: Number(r.high_volume_multiplier ?? 1),
        stockStatus: 'Normal',
        expirationDate: r.expiration_date ? String(r.expiration_date).split('T')[0] : null,
      };
    }

    return null;
  }

  async getPublicShopProducts(): Promise<any[]> {
    await ensureRetailSchema();
    const result = await db.query(`
      SELECT p.inventory_product_id AS id,
             p.name,
             p.image_url AS "imageUrl",
             p.retail_price AS "retailPrice",
             COALESCE(p.retail_category, 'General') AS category,
             COALESCE(p.tags, '{}') AS tags,
             COALESCE(SUM(s.current_quantity), 0) AS stock_quantity
      FROM public.inventory_products p
      LEFT JOIN public.inventory_stock s ON s.inventory_product_id = p.inventory_product_id
        AND (s.is_active IS NULL OR s.is_active = TRUE)
      WHERE p.is_active = TRUE
        AND p.ownership_type = 'shared_retail'
        AND p.show_in_shop = TRUE
      GROUP BY p.inventory_product_id, p.name, p.image_url, p.retail_price, p.retail_category, p.tags
      ORDER BY p.name ASC
    `);

    return result.rows.map((row: any) => {
      const stock = Number(row.stock_quantity) || 0;
      let stockStatus: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';
      if (stock <= 0) {
        stockStatus = 'OUT OF STOCK';
      } else if (stock <= 5) {
        stockStatus = 'LOW STOCK';
      } else {
        stockStatus = 'IN STOCK';
      }

      return {
        id: Number(row.id),
        name: row.name,
        imageUrl: row.imageUrl || null,
        retailPrice: Number(row.retailPrice) || 0,
        category: row.category || 'General',
        tags: Array.isArray(row.tags) ? row.tags : [],
        stockStatus,
      };
    });
  }
}

export const inventoryRepository = new InventoryRepository();

