export interface DailyStockReportShift {
  id?: string;
  shift: string;
  status: string;
  submittedByName?: string;
  submittedByRole?: string;
  lines?: Array<{ inventoryStockId: string; itemName: string; countedQuantity: number }>;
}

export interface DailyStockReportItem {
  inventoryStockId: string;
  itemName: string;
  unit: string;
  currentStock: number;
  openingQuantity: number | null;
  midDayQuantity: number | null;
  closingQuantity: number | null;
  midDayVariance: number | null;
  closingVariance: number | null;
  receiptQuantity: number;
  loggedUsage: number;
  netConsumption: number | null;
}

export interface DailyStockReportSummary {
  submittedShiftCount: number;
  missingShiftCount: number;
  fallbackCashierSubmissionCount: number;
  totalLoggedUsage: number;
}

export interface DailyStockReport {
  reportDate: string;
  shifts: DailyStockReportShift[];
  items: DailyStockReportItem[];
  summary: DailyStockReportSummary;
}

export type StockTone = 'danger' | 'warning' | 'info' | 'normal';

export interface StockStatus {
  label: string;
  tone: StockTone;
  message: string;
}

export interface StockStatusContext {
  item: DailyStockReportItem;
}
