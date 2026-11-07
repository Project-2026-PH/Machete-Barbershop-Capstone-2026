export type InventoryStockStatus = 'In Stock' | 'Low Stock' | 'Critically Low' | 'Out of Stock';
export type InventoryThresholdLevel = 0 | 1 | 2 | 3;

/** Count-based stock bands shared by inventory API consumers. */
export const getInventoryStockStatus = (quantity: number): {
  status: InventoryStockStatus;
  thresholdLevel: InventoryThresholdLevel;
} => {
  const count = Number.isFinite(quantity) ? quantity : 0;

  if (count <= 0) return { status: 'Out of Stock', thresholdLevel: 3 };
  if (count < 10) return { status: 'Critically Low', thresholdLevel: 2 };
  if (count <= 15) return { status: 'Low Stock', thresholdLevel: 1 };
  return { status: 'In Stock', thresholdLevel: 0 };
};
