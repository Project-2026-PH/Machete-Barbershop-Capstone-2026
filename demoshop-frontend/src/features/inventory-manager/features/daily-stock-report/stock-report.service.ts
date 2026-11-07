import { api } from '@/config/api';
import type { DailyStockReport } from './stock-report.types';

export const loadDailyStockReport = async (date: string) =>
  api.get<DailyStockReport>('/api/inventory/stock-reports/daily', { params: { date } });

export const sendDailyStockReport = async (date: string) =>
  api.post<{ status: string; errorMessage?: string }>('/api/inventory/stock-reports/email', { date });
