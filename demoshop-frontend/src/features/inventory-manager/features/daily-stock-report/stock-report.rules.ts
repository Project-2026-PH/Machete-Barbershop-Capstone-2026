import type { DailyStockReport, StockStatus, StockStatusContext } from './stock-report.types';

export const isSubmittedShiftStatus = (status?: string | null): boolean =>
  status === 'pending' || status === 'submitted' || status === 'reviewed' || status === 'approved';

export interface StockStatusRule {
  evaluate(context: StockStatusContext): StockStatus | null;
}

export const ranOutRule: StockStatusRule = {
  evaluate({ item }) {
    const isOut = item.currentStock <= 0;
    if (isOut) {
      return {
        label: 'Ran out',
        tone: 'danger',
        message: `${item.itemName} — ran out today`,
      };
    }
    return null;
  },
};

export const highConsumptionRule: StockStatusRule = {
  evaluate({ item }) {
    if (item.loggedUsage > 0) {
      return {
        label: 'Usage logged',
        tone: 'info',
        message: `${item.itemName} — handout and sale usage is logged`,
      };
    }
    return null;
  },
};

export const missingCountRule: StockStatusRule = {
  evaluate({ item }) {
    if (item.openingQuantity === null || item.closingQuantity === null) {
      return {
        label: 'Not counted',
        tone: 'warning',
        message: item.openingQuantity === null
          ? `${item.itemName} — morning count is missing`
          : `${item.itemName} — evening count is missing`,
      };
    }
    return null;
  },
};

const stockStatusRules: StockStatusRule[] = [
  ranOutRule,
  missingCountRule,
  highConsumptionRule,
];

export const determineStockStatus = (context: StockStatusContext): StockStatus => {
  for (const rule of stockStatusRules) {
    const result = rule.evaluate(context);
    if (result) return result;
  }
  return {
    label: 'Normal',
    tone: 'normal',
    message: `${context.item.itemName} — normal`,
  };
};

export const buildStockStatusMap = (report: DailyStockReport | null): Map<string, StockStatus> => {
  const map = new Map<string, StockStatus>();
  if (!report?.items) return map;

  for (const item of report.items) {
    const status = determineStockStatus({
      item,
    });
    map.set(item.inventoryStockId, status);
  }

  return map;
};
