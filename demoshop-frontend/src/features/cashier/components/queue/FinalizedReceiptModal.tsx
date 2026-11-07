import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Printer, X } from 'lucide-react';
import { printReceiptWithQzTray } from '../../utils/qz-tray-print.util';
import type { ReceiptResponse } from '@demoshop/shared-types';
import { renderOfflineReceiptHtml, type OfflineReceiptSnapshotInput } from '../../services/cashier-offline-payment';

interface FinalizedReceiptModalProps {
  receipt: ReceiptResponse | null;
  localReceiptId?: string | null;
  provisional?: boolean;
  initialPrintAttemptCount?: number;
  offlineReceiptSnapshot?: OfflineReceiptSnapshotInput | null;
  initialPrintStatus?: 'ready' | 'printed' | 'print_requested' | 'print_failed' | 'synced';
  initialPrintError?: string | null;
  onClose: () => void;
}

const STORAGE_KEY = 'demoshop:active_finalized_receipt';
const MAX_RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredReceipt {
  receipt: ReceiptResponse;
  savedAt: number;
}

const getStoredReceipt = (): ReceiptResponse | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReceipt;
    if (!parsed?.receipt?.html) return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_RETENTION_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.receipt;
  } catch {
    return null;
  }
};

const storeReceipt = (receipt: ReceiptResponse | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (receipt && receipt.html) {
      const data: StoredReceipt = { receipt, savedAt: Date.now() };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[FinalizedReceiptModal] Failed to persist receipt:', err);
  }
};

export default function FinalizedReceiptModal({
  receipt: propReceipt,
  localReceiptId = null,
  provisional = false,
  initialPrintAttemptCount = 0,
  offlineReceiptSnapshot = null,
  initialPrintStatus = 'ready',
  initialPrintError = null,
  onClose,
}: FinalizedReceiptModalProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [isReceiptReady, setIsReceiptReady] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printAttemptCount, setPrintAttemptCount] = useState(initialPrintAttemptCount);
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState(initialPrintStatus);
  const [lastPrintError, setLastPrintError] = useState(initialPrintError);
  const printCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [persistedReceipt, setPersistedReceipt] = useState<ReceiptResponse | null>(() => getStoredReceipt());

  useEffect(() => {
    if (propReceipt) {
      if (!provisional && !propReceipt.receiptNumber.startsWith('OFF-')) storeReceipt(propReceipt);
      setPersistedReceipt(propReceipt);
    }
  }, [propReceipt, provisional]);

  const activeReceipt = propReceipt || persistedReceipt;
  const isProvisionalReceipt = Boolean(activeReceipt && (provisional || activeReceipt.receiptNumber.startsWith('OFF-')));
  const displayedReceipt = activeReceipt && isProvisionalReceipt && printAttemptCount > 0 && offlineReceiptSnapshot
    ? { ...activeReceipt, html: renderOfflineReceiptHtml(offlineReceiptSnapshot, { isReprint: true }) }
    : activeReceipt;

  useEffect(() => {
    setIsReceiptReady(false);
  }, [activeReceipt?.receiptNumber, displayedReceipt?.html]);

  useEffect(() => {
    setPrintAttemptCount(initialPrintAttemptCount);
    setPrintMessage(null);
    setPrintStatus(initialPrintStatus);
    setLastPrintError(initialPrintError);
  }, [localReceiptId, initialPrintAttemptCount, initialPrintStatus, initialPrintError]);

  useEffect(() => {
    if (activeReceipt) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeReceipt]);

  useEffect(() => () => {
    if (printCooldownRef.current) clearTimeout(printCooldownRef.current);
  }, []);

  if (!activeReceipt) return null;

  const handleClose = () => {
    storeReceipt(null);
    setPersistedReceipt(null);
    onClose();
  };

  const printReceipt = async () => {
    const printWindow = frameRef.current?.contentWindow;
    if (!printWindow || !isReceiptReady || isPrinting) return;

    setIsPrinting(true);
    let outcome: 'printed' | 'print_requested' | 'print_failed' = 'print_failed';
    let errorMessage: string | null = null;
    try {
      if (!isProvisionalReceipt) {
        const printedWithQzTray = await printReceiptWithQzTray(activeReceipt);
        if (printedWithQzTray) {
          outcome = 'printed';
            setPrintMessage(null);
          return;
        }
      }

      // Provisional offline receipts use browser printing and never use QZ's
      // server-signed sales-invoice formatter.
      printWindow.focus();
      printWindow.print();
      outcome = isProvisionalReceipt ? 'print_requested' : 'printed';
        setPrintMessage(null);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Print request failed.';
      setPrintMessage(`Print failed: ${errorMessage}`);
    } finally {
      if (localReceiptId) {
        try {
          const repository = await import('../../services/cashier-offline.repository');
          const updated = await repository.recordLocalReceiptPrintResult(localReceiptId, outcome, errorMessage);
          window.dispatchEvent(new Event('cashier-offline-sync-requested'));
          setPrintAttemptCount(updated.printAttemptCount);
          setPrintStatus(updated.status);
          setLastPrintError(updated.lastPrintError);
        } catch (error) {
          setPrintMessage(error instanceof Error ? `Print status could not be saved: ${error.message}` : 'Print status could not be saved.');
        }
      }
      // Keep the button blocked briefly after the print call so accidental
      // double-clicks cannot submit duplicate jobs. A failed print can be
      // retried once this cooldown expires.
      if (printCooldownRef.current) clearTimeout(printCooldownRef.current);
      printCooldownRef.current = setTimeout(() => {
        setIsPrinting(false);
        printCooldownRef.current = null;
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 transform-gpu will-change-transform animate-fade-in">
      <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-y-auto overscroll-contain rounded-sm border border-white/10 bg-charcoal p-5 sm:max-h-[calc(100dvh-2rem)] sm:p-6 shadow-2xl custom-scrollbar transform-gpu will-change-transform text-ivory">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 text-ivory-dim hover:text-gold transition-colors p-1 cursor-pointer print:hidden"
          aria-label="Close receipt"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mb-4 flex items-center gap-3 print:hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-ivory">Payment Confirmed</h2>
            <p className="text-xs text-ivory-dim">Receipt #{activeReceipt.receiptNumber}</p>
          </div>
        </div>
        <div className="shrink-0 overflow-hidden rounded-sm bg-white border border-white/10">
          <iframe
            ref={frameRef}
            title={`Receipt ${activeReceipt.receiptNumber}`}
            srcDoc={displayedReceipt?.html || activeReceipt.html}
            onLoad={() => setIsReceiptReady(true)}
            className="h-[45dvh] min-h-[220px] w-full border-0 sm:h-[70vh] sm:min-h-[480px]"
          />
        </div>
        {printMessage && <p role="status" className="mt-3 text-xs text-ivory-dim print:hidden">{printMessage}</p>}
        {isProvisionalReceipt && printStatus === 'print_failed' && lastPrintError && (
          <p role="alert" className="mt-2 rounded-sm border border-amber-300/25 bg-amber-300/10 p-2 text-xs text-amber-100 print:hidden">
            The last print attempt failed: {lastPrintError}. Use Reprint Receipt after resolving the printer issue.
          </p>
        )}
        {isProvisionalReceipt && printStatus === 'print_requested' && (
          <p role="status" className="mt-2 text-xs text-ivory-dim print:hidden">The system print dialog opened. If the printer did not produce a copy, use Reprint Receipt.</p>
        )}
        <div className="mt-4 flex gap-3 print:hidden">
          <button
            type="button"
            onClick={printReceipt}
            disabled={!isReceiptReady || isPrinting}
            className="flex-1 h-10 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Printer className={`h-4 w-4 ${isPrinting ? 'animate-pulse' : ''}`} />
            <span>{isPrinting ? 'Printing…' : printAttemptCount > 0 ? 'Reprint Receipt' : 'Print Receipt'}</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 h-10 rounded-sm bg-gold text-charcoal hover:bg-gold-dim text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer flex items-center justify-center"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
