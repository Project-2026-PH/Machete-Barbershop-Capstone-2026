import type { PurchaseOrderCatalogItem } from './purchase-order.types';

export const suggestedRestockQuantity = (item: PurchaseOrderCatalogItem): number => {
  const target = item.safetyStock && item.safetyStock > 0 ? item.safetyStock : item.criticalThreshold;
  return Math.max(1, Math.ceil(target - item.currentStock));
};

export const getItemsNeedingRestock = (catalog: PurchaseOrderCatalogItem[]): PurchaseOrderCatalogItem[] =>
  catalog
    .filter((item) => item.stockStatus === 'critical' || item.stockStatus === 'low')
    .sort((a, b) => {
      if (a.stockStatus !== b.stockStatus) return a.stockStatus === 'critical' ? -1 : 1;
      return (a.currentStock - a.criticalThreshold) - (b.currentStock - b.criticalThreshold);
    });
