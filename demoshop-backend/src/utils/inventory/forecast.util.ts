import type {
  InventoryMovementClass,
  InventoryMovementTrend,
  PhysicalStockStatus,
} from '@demoshop/shared-types';

export const MIN_FORECAST_HISTORY_DAYS = 14;
export const FORECAST_MONTH_DAYS = 30;
export const FORECAST_WEEK_DAYS = 7;
export const MOVEMENT_LOOKBACK_DAYS = 14;
export const MOVEMENT_FAST_DAILY_UNITS = 1;
export const MOVEMENT_SLOW_DAILY_UNITS = 1;
export const MOVEMENT_RULE_VERSION = 'v2' as const;

export interface ForecastInput {
  currentStock: number;
  consumptionTotal: number;
  historyDays: number;
  safetyStock: number;
  criticalStock?: number;
  highVolumeMultiplier: number;
  supplierLeadTimeDays?: number;
  asOf?: Date;
}

export interface ForecastResult {
  forecastAvailable: boolean;
  forecastUnavailableReason?: string;
  averageDailyConsumption: number;
  weeklyConsumption: number;
  monthlyConsumption: number;
  adjustedWeeklyConsumption: number;
  adjustedMonthlyConsumption: number;
  adjustedDailyConsumption: number;
  suggestedWeeklyReplenishment: number | null;
  suggestedMonthlyReplenishment: number | null;
  expectedStockOutDate: string | null;
  projectedStockoutDate: string | null;
  recommendedRestockDate: string | null;
  reorderDeadlineDays: number | null;
  supplierLeadTimeDays: number;
  suggestedReplenishmentFormula: string;
  calibrationDaysTracked: number;
  calibrationRequiredDays: number;
  calibrationProgressPercent: number;
  isCalibrating: boolean;
  physicalStockStatus: PhysicalStockStatus;
}

export interface MovementClassificationInput {
  consumptionTotal: number;
  historyDays: number;
}

export interface MovementClassificationResult {
  movementClass: InventoryMovementClass;
  movementRatePerDay: number;
  movementClassificationReason: string;
}

export const movementClassificationRules = {
  version: MOVEMENT_RULE_VERSION,
  windowDays: MOVEMENT_LOOKBACK_DAYS,
  minimumHistoryDays: MIN_FORECAST_HISTORY_DAYS,
  fastDailyUnits: MOVEMENT_FAST_DAILY_UNITS,
  slowDailyUnits: MOVEMENT_SLOW_DAILY_UNITS,
} as const;

const roundQuantity = (value: number): number => Math.round(value * 1000) / 1000;

export const classifyInventoryMovement = (
  input: MovementClassificationInput,
): MovementClassificationResult => {
  const total = Math.max(0, Number(input.consumptionTotal) || 0);
  const historyDays = Math.max(0, Number(input.historyDays) || 0);
  // Classify on the raw rate; the rounded value is for display only, so
  // 0.9996/day must not round up into Fast-moving.
  const rawRatePerDay = total / Math.max(historyDays, 1);
  const movementRatePerDay = roundQuantity(rawRatePerDay);

  if (historyDays < MIN_FORECAST_HISTORY_DAYS) {
    return {
      movementClass: 'insufficient_data',
      movementRatePerDay,
      movementClassificationReason: `At least ${MIN_FORECAST_HISTORY_DAYS} days of consumption history are required.`,
    };
  }
  if (total <= 0) {
    return {
      movementClass: 'insufficient_data',
      movementRatePerDay,
      movementClassificationReason: 'No authoritative consumption was recorded in the analysis window.',
    };
  }
  if (rawRatePerDay >= MOVEMENT_FAST_DAILY_UNITS) {
    return {
      movementClass: 'fast',
      movementRatePerDay,
      movementClassificationReason: `Fast-moving: at least ${MOVEMENT_FAST_DAILY_UNITS} unit per day over the analysis window.`,
    };
  }
  if (rawRatePerDay > 0 && rawRatePerDay < MOVEMENT_SLOW_DAILY_UNITS) {
    return {
      movementClass: 'slow',
      movementRatePerDay,
      movementClassificationReason: `Slow-moving: more than zero and below ${MOVEMENT_SLOW_DAILY_UNITS} unit per day over the analysis window.`,
    };
  }
  return {
    movementClass: 'fast',
    movementRatePerDay,
    movementClassificationReason: `Fast-moving: at least ${MOVEMENT_FAST_DAILY_UNITS} unit per day over the analysis window.`,
  };
};

export const classifyMovementTrend = (
  recentConsumptionTotal: number,
  priorConsumptionTotal: number,
): InventoryMovementTrend => {
  const recent = Math.max(0, Number(recentConsumptionTotal) || 0);
  const prior = Math.max(0, Number(priorConsumptionTotal) || 0);
  if (recent === 0 && prior === 0) return 'stable';
  if (prior === 0) return 'increasing';
  const changeRatio = (recent - prior) / prior;
  if (changeRatio >= 0.1) return 'increasing';
  if (changeRatio <= -0.1) return 'decreasing';
  return 'stable';
};

export const calculateInventoryForecast = (input: ForecastInput): ForecastResult => {
  const total = Math.max(0, Number(input.consumptionTotal) || 0);
  const historyDays = Math.max(0, Number(input.historyDays) || 0);
  const safetyStock = Math.max(0, Number(input.safetyStock) || 0);
  const criticalStock = Math.max(0, Number(input.criticalStock) || 0);
  const multiplier = Math.max(1, Number(input.highVolumeMultiplier) || 1);
  const supplierLeadTimeDays = Math.max(1, Number(input.supplierLeadTimeDays) || 3);
  const averageDailyConsumption = roundQuantity(total / Math.max(historyDays, 1));
  const weeklyConsumption = roundQuantity(averageDailyConsumption * FORECAST_WEEK_DAYS);
  const monthlyConsumption = roundQuantity(averageDailyConsumption * FORECAST_MONTH_DAYS);
  const adjustedWeeklyConsumption = roundQuantity(weeklyConsumption * multiplier);
  const adjustedMonthlyConsumption = roundQuantity(monthlyConsumption * multiplier);
  const adjustedDailyConsumption = roundQuantity(averageDailyConsumption * multiplier);
  const forecastAvailable = total > 0 && historyDays >= MIN_FORECAST_HISTORY_DAYS;

  // Decoupled physical stock status (physical stock reality regardless of statistical history)
  let physicalStockStatus: PhysicalStockStatus = 'healthy';
  if (input.currentStock <= 0) {
    physicalStockStatus = 'out_of_stock';
  } else if (criticalStock > 0 && input.currentStock <= criticalStock) {
    physicalStockStatus = 'critical';
  } else if (input.currentStock <= safetyStock) {
    physicalStockStatus = 'low';
  } else if (safetyStock > 0 && input.currentStock >= safetyStock * 3) {
    physicalStockStatus = 'overstock';
  } else {
    physicalStockStatus = 'healthy';
  }

  const calibrationDaysTracked = Math.min(MIN_FORECAST_HISTORY_DAYS, historyDays);
  const calibrationRequiredDays = MIN_FORECAST_HISTORY_DAYS;
  const calibrationProgressPercent = Math.min(100, Math.round((calibrationDaysTracked / MIN_FORECAST_HISTORY_DAYS) * 100));
  const isCalibrating = historyDays < MIN_FORECAST_HISTORY_DAYS;

  if (!forecastAvailable) {
    const forecastUnavailableReason = historyDays < MIN_FORECAST_HISTORY_DAYS
      ? `At least ${MIN_FORECAST_HISTORY_DAYS} days of consumption history are needed; ${historyDays} calendar day${historyDays === 1 ? '' : 's'} are available.`
      : `No consumption was recorded in the latest ${MIN_FORECAST_HISTORY_DAYS} days, so stockout and replenishment estimates are unavailable.`;
    return {
      forecastAvailable,
      forecastUnavailableReason,
      averageDailyConsumption,
      weeklyConsumption,
      monthlyConsumption,
      adjustedWeeklyConsumption,
      adjustedMonthlyConsumption,
      adjustedDailyConsumption,
      suggestedWeeklyReplenishment: null,
      suggestedMonthlyReplenishment: null,
      expectedStockOutDate: null,
      projectedStockoutDate: null,
      recommendedRestockDate: null,
      reorderDeadlineDays: null,
      supplierLeadTimeDays,
      suggestedReplenishmentFormula: forecastUnavailableReason,
      calibrationDaysTracked,
      calibrationRequiredDays,
      calibrationProgressPercent,
      isCalibrating,
      physicalStockStatus,
    };
  }

  const rawAdjustedDaily = averageDailyConsumption * multiplier;
  const stockOutDays = rawAdjustedDaily > 0 ? Math.ceil(Math.max(0, input.currentStock) / rawAdjustedDaily) : null;
  const stockOutDate = stockOutDays === null ? null : new Date(input.asOf || new Date());
  if (stockOutDate) stockOutDate.setDate(stockOutDate.getDate() + (stockOutDays ?? 0));
  const expectedStockOutDate = stockOutDate?.toISOString().slice(0, 10) || null;

  // Recommended Restock Date (Reorder Deadline):
  // Order must arrive when stock hits safetyStock.
  // Delivery takes supplierLeadTimeDays, so order must be placed supplierLeadTimeDays before reaching safetyStock.
  let recommendedRestockDate: string | null = null;
  let reorderDeadlineDays: number | null = null;

  if (rawAdjustedDaily > 0) {
    if (input.currentStock <= safetyStock) {
      reorderDeadlineDays = 0;
      const todayDate = new Date(input.asOf || new Date());
      recommendedRestockDate = todayDate.toISOString().slice(0, 10);
    } else {
      const daysUntilSafety = (input.currentStock - safetyStock) / rawAdjustedDaily;
      const daysUntilDeadline = daysUntilSafety - supplierLeadTimeDays;
      if (daysUntilDeadline <= 0) {
        reorderDeadlineDays = 0;
        const todayDate = new Date(input.asOf || new Date());
        recommendedRestockDate = todayDate.toISOString().slice(0, 10);
      } else {
        reorderDeadlineDays = Number(daysUntilDeadline.toFixed(1));
        const restockDate = new Date(input.asOf || new Date());
        restockDate.setDate(restockDate.getDate() + Math.floor(daysUntilDeadline));
        recommendedRestockDate = restockDate.toISOString().slice(0, 10);
      }
    }
  }

  const suggestedWeeklyReplenishment = Math.max(0, Math.ceil(adjustedWeeklyConsumption + safetyStock - input.currentStock));
  const suggestedMonthlyReplenishment = Math.max(0, Math.ceil(adjustedMonthlyConsumption + safetyStock - input.currentStock));

  const suggestedReplenishmentFormula = `(7d × ${rawAdjustedDaily.toFixed(2)}/d) + ${safetyStock} safety - ${input.currentStock} on hand = ${suggestedWeeklyReplenishment} units`;

  return {
    forecastAvailable,
    averageDailyConsumption,
    weeklyConsumption,
    monthlyConsumption,
    adjustedWeeklyConsumption,
    adjustedMonthlyConsumption,
    adjustedDailyConsumption,
    suggestedWeeklyReplenishment,
    suggestedMonthlyReplenishment,
    expectedStockOutDate,
    projectedStockoutDate: expectedStockOutDate,
    recommendedRestockDate,
    reorderDeadlineDays,
    supplierLeadTimeDays,
    suggestedReplenishmentFormula,
    calibrationDaysTracked,
    calibrationRequiredDays,
    calibrationProgressPercent,
    isCalibrating,
    physicalStockStatus,
  };
};
