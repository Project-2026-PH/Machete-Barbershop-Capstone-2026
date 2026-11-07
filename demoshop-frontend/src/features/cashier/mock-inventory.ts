export type InventoryCategory = 'Barber supplies' | 'Customer retail' | 'Consumables';
export type InventoryOwnership = 'Barber-assigned' | 'Retail Items' | 'Consumables';
export type StockStatus = 'In Stock' | 'Low Stock' | 'Critically Low' | 'Out of Stock';

export interface InventoryItem {
    id: string;
    name: string;
    category: InventoryCategory;
    ownership: InventoryOwnership;
    assignedBarber?: string;
    unit: string;
    currentStock: number;
    criticalStock: number;
    safetyStock?: number;
    highVolumeMultiplier?: number;
    historyDays?: number;
    averageDailyConsumption?: number;
    weeklyConsumption: number;
    monthlyConsumption: number;
    adjustedWeeklyConsumption?: number;
    adjustedMonthlyConsumption?: number;
    suggestedReplenishment: number;
    suggestedWeeklyReplenishment?: number | null;
    suggestedMonthlyReplenishment?: number | null;
    expectedStockOutDate?: string | null;
    daysOfStockRemaining?: number | null;
    daysUntilCritical?: number | null;
    thresholdLevel?: 0 | 1 | 2 | 3;
    forecastAvailable?: boolean;
    forecastUnavailableReason?: string;
    status: StockStatus;
    stockStatus?: StockStatus;
}

