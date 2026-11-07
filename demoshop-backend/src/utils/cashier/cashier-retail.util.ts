import { AppError } from '../error/AppError';
import type { RetailSaleLineInput, RetailSaleLineSnapshot } from '@demoshop/shared-types';

const MAX_RETAIL_LINES = 50;
const MAX_LINE_QUANTITY = 999;

const toProductId = (value: unknown): number => {
  const productId = Number(
    (value as { productId?: unknown; inventoryProductId?: unknown; id?: unknown } | null)?.productId
    ?? (value as { inventoryProductId?: unknown } | null)?.inventoryProductId
    ?? (value as { id?: unknown } | null)?.id,
  );
  return productId;
};

/** Merges and validates cashier-submitted retail quantities. Prices are not trusted. */
export const normalizeRetailSaleLines = (raw: unknown): RetailSaleLineInput[] => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new AppError('Retail items must be an array.', 400);
  }
  if (raw.length > MAX_RETAIL_LINES) {
    throw new AppError('Too many retail items in this sale.', 400);
  }

  const merged = new Map<number, number>();
  for (const item of raw) {
    const productId = toProductId(item);
    const quantity = Number((item as { quantity?: unknown } | null)?.quantity ?? 1);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      throw new AppError('Retail items must contain valid product IDs.', 400);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) {
      throw new AppError('Retail item quantities are invalid.', 400);
    }
    merged.set(productId, Number(((merged.get(productId) || 0) + quantity).toFixed(3)));
  }

  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

/** Reads the durable retail snapshot stored on a queue entry. */
export const parseRetailItemSnapshots = (raw: unknown): RetailSaleLineSnapshot[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const productId = Number((item as { productId?: unknown } | null)?.productId);
    const quantity = Number((item as { quantity?: unknown } | null)?.quantity);
    const unitPrice = Number((item as { unitPrice?: unknown } | null)?.unitPrice);
    if (!Number.isSafeInteger(productId) || productId < 1) return [];
    if (!Number.isFinite(quantity) || quantity <= 0) return [];
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return [];
    return [{
      productId,
      quantity,
      unitPrice: Number(unitPrice.toFixed(2)),
      name: String((item as { name?: unknown } | null)?.name || 'Retail item'),
    }];
  });
};

export const sumRetailAmount = (lines: Array<{ quantity: number; unitPrice: number }>): number =>
  Number(lines.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.unitPrice)), 0).toFixed(2));
