import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/feedback/ToastContext';
import { errorMessage, todayInManila } from '@/features/inventory-manager/shared/utils/formatting';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import type { DailyStockReport, StockTone } from '../stock-report.types';
import { loadDailyStockReport, sendDailyStockReport } from '../stock-report.service';
import { buildStockStatusMap, isSubmittedShiftStatus } from '../stock-report.rules';

export interface FlaggedItem {
  id: string;
  message: string;
  tone: StockTone;
}

export const useDailyStockReport = (customDate?: string) => {
  const { addToast } = useToast();
  const reportDate = useMemo(() => customDate || todayInManila(), [customDate]);
  const [report, setReport] = useState<DailyStockReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadReport = useCallback(
    async (dateToLoad: string) => {
      setLoading(true);
      try {
        const response = await loadDailyStockReport(dateToLoad);
        setReport(response.data);
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Stock report unavailable',
          message: errorMessage(error, 'Please try again.'),
        });
      } finally {
        setLoading(false);
      }
    },
    [addToast],
  );

  useEffect(() => {
    void loadReport(reportDate);
  }, [loadReport, reportDate]);

  useInventoryRealtime({
    channelName: 'inventory-manager-daily-report-sync',
    tables: [
      'inventory_stock',
      'inventory_stock_movements',
      'inventory_consumption',
      'inventory_stock_count_submissions',
      'inventory_stock_count_lines',
    ],
    windowEvents: [
      'demoshop:stock-count-changed',
      'demoshop:inventory-changed',
      'demoshop:inventory-movement-changed',
    ],
    onReload: () => loadReport(reportDate),
  });

  const morningShift = useMemo(
    () => report?.shifts.find((s) => s.shift === 'morning'),
    [report],
  );
  const eveningShift = useMemo(
    () => report?.shifts.find((s) => s.shift === 'evening'),
    [report],
  );

  const isMorningCountDone = isSubmittedShiftStatus(morningShift?.status);
  const isEveningCountDone = isSubmittedShiftStatus(eveningShift?.status);

  const allItemsCounted = useMemo(() => {
    if (!report?.items || report.items.length === 0) return false;
    return report.items.every((item) => item.openingQuantity != null && item.closingQuantity != null);
  }, [report?.items]);

  const uncountedItemCount = useMemo(() => {
    if (!report?.items) return 0;
    return report.items.filter((item) => item.openingQuantity == null || item.closingQuantity == null).length;
  }, [report?.items]);

  const isConsolidated = Boolean(isMorningCountDone && isEveningCountDone);
  const canSendReport = Boolean(report && isMorningCountDone && isEveningCountDone && allItemsCounted && !sending && !loading);

  const itemStatusMap = useMemo(() => buildStockStatusMap(report), [report]);

  const flaggedItems = useMemo<FlaggedItem[]>(() => {
    const list: FlaggedItem[] = [];
    itemStatusMap.forEach((status, id) => {
      if (status.tone !== 'normal') {
        list.push({ id, message: status.message, tone: status.tone });
      }
    });
    return list;
  }, [itemStatusMap]);

  const sendReport = useCallback(async () => {
    if (!canSendReport) return;
    setSending(true);
    try {
      const response = await sendDailyStockReport(reportDate);
      addToast({
        type: response.data.status === 'sent' ? 'success' : 'error',
        title: response.data.status === 'sent' ? 'Stock report sent' : 'Stock report delivery failed',
        message:
          response.data.status === 'sent'
            ? 'Admin received the report and you were copied.'
            : response.data.errorMessage || 'The delivery attempt was recorded as failed.',
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Stock report could not be sent',
        message: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setSending(false);
    }
  }, [addToast, canSendReport, reportDate]);

  return {
    reportDate,
    report,
    loading,
    sending,
    isMorningCountDone,
    isEveningCountDone,
    isConsolidated,
    allItemsCounted,
    uncountedItemCount,
    canSendReport,
    itemStatusMap,
    flaggedItems,
    loadReport,
    sendReport,
  };
};
