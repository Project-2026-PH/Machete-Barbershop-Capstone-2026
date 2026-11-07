import { useEffect, useRef } from 'react';
import type { ReceiptResponse } from '@demoshop/shared-types';
import { api } from '@/config/api';
import { printReceiptWithQzTray } from '../utils/qz-tray-print.util';

const STATION_KEY = 'demoshop:cashier:printer-station-id';
const POLL_MS = 2500;

const getStationId = (): string => {
  const existing = window.localStorage.getItem(STATION_KEY);
  if (existing) return existing;
  const generated = `laptop-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  window.localStorage.setItem(STATION_KEY, generated);
  return generated;
};

interface PrintJobResponse {
  jobId: number;
  receipt: ReceiptResponse;
}

export const usePrinterStation = (enabled = true): void => {
  const runningRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    const stationId = getStationId();

    const poll = async () => {
      if (stopped || runningRef.current || !enabledRef.current) return;
      runningRef.current = true;
      try {
        const claim = await api.post<{ job: PrintJobResponse | null }>('/api/cashier/print-jobs/claim', { stationId });
        const job = claim.data.job;
        if (!job) return;
        const result = await printReceiptWithQzTray(job.receipt);
        if (result) {
          await api.post(`/api/cashier/print-jobs/${job.jobId}/complete`, { stationId });
        } else {
          await api.post(`/api/cashier/print-jobs/${job.jobId}/fail`, {
            stationId,
            error: 'QZ Tray or the USB receipt printer is unavailable.',
          });
        }
      } catch (error) {
        // The claim may fail while the backend is unavailable. A claimed job
        // expires server-side and becomes available again automatically.
        console.warn('[PrinterStation] Poll/print attempt failed.', error);
      } finally {
        runningRef.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
};
