import React, { useEffect, useRef, useState } from 'react';
import { Camera, CreditCard, ImagePlus, Loader2, Maximize2, ScanText, X } from 'lucide-react';
import { Modal } from '../../../../components/feedback/Modal';
import { useShopSettings } from '../../../../hooks/useShopSettings';
import { api } from '@/config/api';
import { buildReceiptPhotoVariants } from '@/utils/receipt-photo';
import { canConfirmCashierGcashPayment } from '@/utils/receipt-reference-entry';

export interface PaymentQuote {
  queueId: number;
  amountDue: number;
  lines: Array<{ serviceId: number; title: string; amount: number }>;
  gcashMerchantName?: string;
  businessDate?: string;
}

interface QueuePaymentModalProps {
  isOpen: boolean;
  queueId: string | null;
  customerName: string | null;
  quote: PaymentQuote | null;
  quoteLoading: boolean;
  completionPending?: boolean;
  quoteError: string | null;
  onRetryQuote: () => void;
  onRepairServices?: () => void;
  onClose: () => void;
  onSubmit: (payment: {
    method: string;
    amount: number;
    cashReceivedAmount?: number;
    paymentMethodId?: string;
    gcashReference?: string;
    referenceNumber?: string;
    receipt?: File;
    cashierConfirmed?: boolean;
  }) => Promise<void>;
}

type OcrStatus = 'idle' | 'extracting' | 'succeeded' | 'no-match' | 'failed';

const IGNORED_OCR_TOKENS = new Set([
  'GCASH', 'REFERENCE', 'REF', 'TRANSACTION', 'TRANSACTIONID', 'ID', 'NUMBER',
  'DATE', 'AMOUNT', 'PHP', 'PESOS', 'SUCCESSFUL', 'SEND', 'MONEY',
]);

const extractReferenceCandidate = (text: string): string | null => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates = lines.flatMap(line => {
    if (!/reference|ref(?:erence)?|transaction|confirmation/i.test(line)) return [];
    const tokens = line.match(/[A-Z0-9][A-Z0-9-]{5,49}/gi) || [];
    return tokens
      .map(token => token.toUpperCase())
      .filter(token => !IGNORED_OCR_TOKENS.has(token))
      .map(token => ({ token, score: (/^\d{8,}$/.test(token) ? 20 : 0) + Math.min(token.length, 20) }));
  });

  return candidates.sort((a, b) => b.score - a.score)[0]?.token || null;
};

const parseMoneyCandidate = (value: string): number | null => {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000 ? Number(amount.toFixed(2)) : null;
};

const extractAmountCandidate = (text: string): number | null => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates = lines.flatMap(line => {
    if (/balance|fee|change|cashback|discount|subtotal/i.test(line)) return [];
    const values = line.match(/(?:₱|PHP|P)\s*[0-9][0-9,]*(?:\.\d{1,2})?|[0-9][0-9,]*\.\d{2}/gi) || [];
    const score = /total|amount|sent|paid|payment|received/i.test(line) ? 30 : 0;
    return values
      .map(value => ({ amount: parseMoneyCandidate(value), score }))
      .filter((candidate): candidate is { amount: number; score: number } => candidate.amount !== null);
  });

  return candidates.sort((a, b) => b.score - a.score || b.amount - a.amount)[0]?.amount ?? null;
};

const QueuePaymentModal: React.FC<QueuePaymentModalProps> = ({
  isOpen,
  queueId,
  customerName,
  quote,
  quoteLoading,
  completionPending = false,
  quoteError,
  onRetryQuote,
  onRepairServices,
  onClose,
  onSubmit,
}) => {
  const { settings, loading: settingsLoading } = useShopSettings();
  const availablePaymentMethods = React.useMemo(() => {
    return (settings?.paymentMethods || []).filter(p => p.enabled);
  }, [settings?.paymentMethods]);

  const [method, setMethod] = useState<string>('Cash');

  useEffect(() => {
    if (availablePaymentMethods.length === 0) {
      setMethod('');
    } else {
      const match = availablePaymentMethods.find(
        m => m.name.toLowerCase() === method.toLowerCase() ||
             (m.id && m.id.toLowerCase() === method.toLowerCase()) ||
             (m.key && m.key.toLowerCase() === method.toLowerCase())
      );
      if (!match) {
        setMethod(availablePaymentMethods[0].name);
      }
    }
  }, [availablePaymentMethods, method]);

  const selectedMethodConfig = React.useMemo(() => {
    if (availablePaymentMethods.length === 0) return null;
    return availablePaymentMethods.find(
      m => m.name.toLowerCase() === method.toLowerCase() ||
           (m.id && m.id.toLowerCase() === method.toLowerCase()) ||
           (m.key && m.key.toLowerCase() === method.toLowerCase())
    ) || availablePaymentMethods[0];
  }, [availablePaymentMethods, method]);

  const isCash = (selectedMethodConfig?.type || '').toLowerCase() === 'cash' ||
                 (selectedMethodConfig?.id || '').toLowerCase() === 'cash' ||
                 (selectedMethodConfig?.key || '').toLowerCase() === 'cash' ||
                 method.toLowerCase() === 'cash';
  const isGcash = (selectedMethodConfig?.type || '').toLowerCase() === 'gcash' ||
                  (selectedMethodConfig?.id || '').toLowerCase() === 'gcash' ||
                  (selectedMethodConfig?.key || '').toLowerCase() === 'gcash' ||
                  method.toLowerCase() === 'gcash';
  const [amount, setAmount] = useState('');
  const [cashReceivedAmount, setCashReceivedAmount] = useState('');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [gcashConfirmed, setGcashConfirmed] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle');
  const [ocrCandidate, setOcrCandidate] = useState<string | null>(null);
  const [ocrAmountCandidate, setOcrAmountCandidate] = useState<number | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [referenceDuplicate, setReferenceDuplicate] = useState(false);
  const [referenceCheckPending, setReferenceCheckPending] = useState(false);
  const [referenceCheckError, setReferenceCheckError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const initializedQueueRef = useRef<string | null>(null);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const referenceRef = useRef('');
  const ocrRequestRef = useRef(0);
  const ocrWorkerRef = useRef<{ terminate: () => Promise<unknown> } | null>(null);

  const cancelOcr = () => {
    ocrRequestRef.current += 1;
    const worker = ocrWorkerRef.current;
    ocrWorkerRef.current = null;
    if (worker) void worker.terminate();
    setOcrStatus('idle');
    setOcrCandidate(null);
    setOcrAmountCandidate(null);
    setOcrError(null);
  };

  const runReceiptOcr = async (file: File) => {
    const requestId = ++ocrRequestRef.current;
    setOcrStatus('extracting');
    setOcrCandidate(null);
    setOcrAmountCandidate(null);
    setOcrError(null);

    let worker: any = null;
    try {
      const { createWorker } = await import('tesseract.js');
      if (requestId !== ocrRequestRef.current) return;
      worker = await createWorker('eng');
      if (requestId !== ocrRequestRef.current) {
        await worker.terminate();
        worker = null;
        return;
      }
      ocrWorkerRef.current = worker;
      const result = await worker.recognize(file);
      if (requestId !== ocrRequestRef.current) return;

      let candidate = extractReferenceCandidate(result.data.text);
      let amountCandidate = extractAmountCandidate(result.data.text);
      if (!candidate || amountCandidate === null) {
        try {
          const variants = await buildReceiptPhotoVariants(file);
          for (let index = 0; index < variants.length; index++) {
            if (index === 2 && amountCandidate !== null) break;
            const enhanced = await worker.recognize(variants[index]);
            if (requestId !== ocrRequestRef.current) return;
            candidate ||= extractReferenceCandidate(enhanced.data.text);
            amountCandidate ??= extractAmountCandidate(enhanced.data.text);
            if (candidate && amountCandidate !== null) break;
          }
        } catch {
          // Manual entry remains available when image processing is unsupported.
        }
      }
      if (!candidate && amountCandidate === null) {
        setOcrStatus('no-match');
        return;
      }

      setOcrCandidate(candidate);
      setOcrAmountCandidate(amountCandidate);
      setOcrStatus('succeeded');
      if (candidate && !referenceRef.current) {
        referenceRef.current = candidate;
        setReference(candidate);
      }
    } catch (error) {
      if (requestId !== ocrRequestRef.current) return;
      setOcrStatus('failed');
      setOcrError('Receipt details could not be detected automatically. Review the amount and reference manually.');
      console.warn('[QueuePaymentModal] Client OCR failed', error);
    } finally {
      if (worker && ocrWorkerRef.current === worker) {
        ocrWorkerRef.current = null;
        await worker.terminate();
      }
    }
  };

  useEffect(() => {
    const normalized = reference.trim().toUpperCase().replace(/[\s-]+/g, '');
    if (!isOpen || !isGcash || !normalized || !/^[A-Z0-9]{8,32}$/.test(normalized)) {
      setReferenceDuplicate(false);
      setReferenceCheckPending(false);
      setReferenceCheckError(null);
      return;
    }
    let cancelled = false;
    setReferenceCheckPending(true);
    setReferenceDuplicate(false);
    setReferenceCheckError(null);
    const timer = setTimeout(async () => {
      try {
        const response = await api.get(`/api/queue/check-reference?referenceNumber=${encodeURIComponent(normalized)}`);
        if (!cancelled) setReferenceDuplicate(Boolean(response.data?.isDuplicate));
      } catch {
        if (!cancelled) setReferenceCheckError('Could not check this reference number. Retry before confirming.');
      } finally {
        if (!cancelled) setReferenceCheckPending(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isOpen, isGcash, reference]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) initializedQueueRef.current = null;
    if (!isOpen || !quote) return;
    if (initializedQueueRef.current === queueId) return;
    initializedQueueRef.current = queueId;
    cancelOcr();
    setMethod('Cash');
    setAmount(String(quote.amountDue.toFixed(2)));
    setCashReceivedAmount(String(quote.amountDue.toFixed(2)));
    setReference('');
    referenceRef.current = '';
    setCashConfirmed(false);
    setGcashConfirmed(false);
    setReceipt(null);
    setReceiptError(null);
    setOcrStatus('idle');
    setOcrCandidate(null);
    setOcrAmountCandidate(null);
    setOcrError(null);
    setPreview(null);
    setReceiptViewerOpen(false);
    setSubmitting(false);
  }, [isOpen, queueId, quote]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => () => {
    ocrRequestRef.current += 1;
    const worker = ocrWorkerRef.current;
    ocrWorkerRef.current = null;
    if (worker) void worker.terminate();
  }, []);

  if (!isOpen) return null;
  if (!quote) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
        <div className="relative w-full max-w-lg rounded-sm border border-white/10 bg-charcoal p-6 shadow-2xl text-ivory">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 text-ivory-dim hover:text-gold transition-colors p-1 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-ivory">
            <CreditCard className="h-5 w-5 text-gold" /> Verify Payment
          </h2>
          <p className="text-xs text-ivory-dim">{completionPending
            ? `Confirming service completion for ${customerName || 'Customer'}. Payment details will load when the server confirms completion.`
            : `Preparing the server-calculated amount for customer ${customerName || 'Customer'}.`}</p>
          {quoteLoading ? (
            <div role="status" aria-label="Loading payment details" className="mt-4 space-y-4 animate-pulse">
              <span className="sr-only">Loading payment details…</span>

              <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="h-2.5 w-24 rounded bg-white/10" />
                <div className="h-8 w-32 rounded bg-white/15" />
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-36 rounded bg-white/10" />
                    <div className="h-3 w-16 rounded bg-white/10" />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-28 rounded bg-white/10" />
                    <div className="h-3 w-14 rounded bg-white/10" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-2.5 w-32 rounded bg-white/10" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="h-10 rounded-sm border border-white/10 bg-white/5" />
                  <div className="h-10 rounded-sm border border-white/10 bg-white/5" />
                  <div className="h-10 rounded-sm border border-white/10 bg-white/5 hidden sm:block" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-2.5 w-28 rounded bg-white/10" />
                <div className="h-10 w-full rounded-sm border border-white/10 bg-black/30" />
              </div>

              <div className="h-11 w-full rounded-sm bg-gold/10 border border-gold/20 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-gold/60">
                <Loader2 className="h-4 w-4 animate-spin text-gold" />
                <span>{completionPending ? 'Confirming service completion…' : 'Loading payment details…'}</span>
              </div>
            </div>
          ) : (
            <div role="status" className={`mt-4 rounded-sm border p-4 text-xs ${quoteError ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-gold/30 bg-gold/10 text-ivory'}`}>
              {quoteError || 'Payment details are not available yet.'}
            </div>
          )}
          {quoteError && !onRepairServices && (
            <button
              type="button"
              disabled={quoteLoading}
              onClick={onRetryQuote}
              className="mt-4 w-full h-10 rounded-sm bg-gold text-charcoal hover:bg-gold-dim text-xs font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              Retry Payment Details
            </button>
          )}
          {quoteError && onRepairServices && (
            <button
              type="button"
              disabled={quoteLoading}
              onClick={onRepairServices}
              className="mt-3 w-full min-h-10 rounded-sm bg-gold px-3 py-2 text-xs font-bold text-charcoal hover:bg-gold-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50"
            >
              Select performed service
            </button>
          )}
        </div>
      </div>
    );
  }
  const exactAmount = quote.amountDue.toFixed(2);
  const amountMatches = Number.isFinite(Number(amount)) && Number(amount).toFixed(2) === exactAmount;
  const received = Number(cashReceivedAmount);
  const cashReceivedIsValid = Number.isFinite(received)
    && Math.round(received * 100) >= Math.round(quote.amountDue * 100);
  const cashChangeAmount = cashReceivedIsValid
    ? (Math.round(received * 100) - Math.round(quote.amountDue * 100)) / 100
    : null;
  const referenceMatches = isGcash
    ? /^[A-Z0-9]{8,32}$/.test(reference.trim().toUpperCase().replace(/[\s-]+/g, ''))
    : /^[a-z0-9][a-z0-9-]{5,49}$/i.test(reference.trim());
  const gcashConfirmationReady = canConfirmCashierGcashPayment({
    receiptUploaded: Boolean(receipt),
    referenceEntered: referenceMatches,
    referenceUnique: !referenceDuplicate && !referenceCheckPending && !referenceCheckError,
    amountMatches,
    cashierConfirmed: gcashConfirmed,
  });
  const isValid = !settingsLoading && availablePaymentMethods.length > 0 && amountMatches
    && (isCash ? cashReceivedIsValid && cashConfirmed : (isGcash ? gcashConfirmationReady : (referenceMatches && gcashConfirmed)));
  const validationMessage = settingsLoading && !settings
    ? 'Loading payment methods…'
    : availablePaymentMethods.length === 0
    ? 'No payment methods are currently configured. Please contact the shop administrator.'
    : !amountMatches
      ? `The amount received must exactly match ₱${exactAmount}.`
        : isCash && !cashReceivedIsValid
        ? 'Amount received must be at least the amount due.'
        : isCash && !cashConfirmed
        ? `Confirm receipt of ₱${received.toFixed(2)} and return of ₱${(cashChangeAmount ?? 0).toFixed(2)} change.`
        : isGcash && !receipt
          ? 'Attach the receipt image before confirming this GCash payment.'
        : isGcash && !referenceMatches
          ? 'Enter the full GCash reference number shown on the receipt.'
        : isGcash && referenceDuplicate
          ? 'This GCash reference number has already been used.'
        : isGcash && (referenceCheckPending || referenceCheckError)
          ? referenceCheckError || 'Checking GCash reference number…'
        : !isCash && !isGcash && !referenceMatches
          ? `Review or enter a valid ${selectedMethodConfig?.name || 'payment'} reference: 6–50 letters, numbers, or hyphens.`
          : !isCash && !gcashConfirmed
            ? isGcash ? 'Check the receipt and confirm the amount and reference before finalizing.' : 'Confirm the payment details before finalizing.'
            : null;

  const methodName = (selectedMethodConfig?.name || method || '').trim();
  const confirmButtonLabel = methodName
    ? /payment$/i.test(methodName)
      ? `Confirm ${methodName}`
      : `Confirm ${methodName} Payment`
    : 'Confirm Payment';

  const chooseReceipt = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      cancelOcr();
      setReceipt(null);
      setReceiptError('Receipt must be a JPEG or PNG image.');
      return;
    }
    cancelOcr();
    setReceiptError(null);
    setReceiptViewerOpen(false);
    if (preview) URL.revokeObjectURL(preview);
    setReceipt(file);
    setPreview(URL.createObjectURL(file));
    void runReceiptOcr(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        method: selectedMethodConfig?.name || method,
        paymentMethodId: selectedMethodConfig?.id || selectedMethodConfig?.key,
        amount: Number(amount),
        cashReceivedAmount: isCash ? received : undefined,
        gcashReference: !isCash ? reference.trim() : undefined,
        referenceNumber: !isCash ? reference.trim() : undefined,
        receipt: !isCash ? receipt || undefined : undefined,
        cashierConfirmed: !isCash ? gcashConfirmed : cashConfirmed,
      });
    } finally { submittingRef.current = false; setSubmitting(false); }
  };

  return <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
    <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-sm border border-white/10 bg-charcoal p-4 sm:p-6 sm:pr-3 shadow-2xl [scrollbar-gutter:stable] custom-scrollbar text-ivory">
      <button type="button" disabled={submitting} onClick={onClose} className="absolute right-4 top-4 text-ivory-dim hover:text-gold transition-colors p-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
        <X className="h-5 w-5" />
      </button>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-ivory">
        <CreditCard className="h-5 w-5 text-gold" /> Verify Payment
      </h2>
      <p className="mb-4 text-xs text-ivory-dim">Confirm the calculated amount before settling queue #{quote.queueId}.</p>
      <div className="mb-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Service Summary</div>
        {!isCash && !receipt ? (
          <div className="mt-2 text-xs text-ivory-dim">Enter the amount below. You can attach the GCash receipt now or upload it later from Recent Transactions.</div>
        ) : (
          <div className="mt-1 text-3xl font-bold text-gold">₱{exactAmount}</div>
        )}
        {quote.lines.map(line => (
          <div key={line.serviceId} className="mt-1 flex justify-between text-xs text-ivory-dim">
            <span>{line.title}</span>
            <span>₱{line.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {settingsLoading && !settings ? (
        <div className="rounded-sm border border-white/10 bg-white/5 p-8 text-center flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
          <p className="text-xs font-medium text-ivory">Loading payment methods…</p>
        </div>
      ) : availablePaymentMethods.length === 0 ? (
        <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-6 text-center space-y-2">
          <p className="font-bold text-xs text-red-200">No payment methods are currently configured.</p>
          <p className="text-xs text-red-200/80">
            Please configure and enable at least one payment method in Shop Admin Settings.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-sm border border-white/10 bg-white/10 text-xs font-bold uppercase tracking-wider text-ivory hover:bg-white/20 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gold mb-2">
              Select Payment Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availablePaymentMethods.map((m) => {
                const isSelected = selectedMethodConfig && (
                  (selectedMethodConfig.id && m.id && selectedMethodConfig.id === m.id) ||
                  (selectedMethodConfig.key && m.key && selectedMethodConfig.key === m.key) ||
                  (selectedMethodConfig.name.toLowerCase() === m.name.toLowerCase())
                );
                return (
                  <button
                    key={m.id || m.key || m.name}
                    type="button"
                    onClick={() => setMethod(m.name)}
                    className={`h-10 px-3 rounded-sm border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gold text-charcoal border-gold shadow-sm'
                        : 'bg-white/5 text-ivory-dim border-white/10 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <span>{m.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isCash ? (
            <div className="space-y-3 pt-1">
              <label className="block text-xs font-medium text-ivory space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">Amount Received</span>
                <input
                  inputMode="decimal"
                  min={exactAmount}
                  step="0.01"
                  value={cashReceivedAmount}
                  onChange={e => setCashReceivedAmount(e.target.value)}
                  className="h-10 w-full rounded-sm border border-white/15 bg-black/30 px-3 text-xs sm:text-sm text-ivory outline-none focus:border-gold transition-colors"
                />
              </label>
              <div className="flex items-center justify-between rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <span className="text-ivory-dim">Change</span>
                <strong className="text-gold">{cashChangeAmount === null ? 'Enter at least the amount due' : `₱${cashChangeAmount.toFixed(2)}`}</strong>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-ivory cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={cashConfirmed}
                  onChange={e => setCashConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[#d4a017] cursor-pointer"
                />
                <span>I confirm I received ₱{cashReceivedIsValid ? received.toFixed(2) : '0.00'} and returned ₱{(cashChangeAmount ?? 0).toFixed(2)} in change.</span>
              </label>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-sm border border-blue-400/30 bg-blue-500/10 p-3 text-xs sm:text-sm text-blue-100">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-400/20 font-bold text-xs">1</span>
                <div>
                  <p className="font-bold">Upload receipt {isGcash ? '(required)' : '(optional)'}</p>
                  <p className="mt-0.5 text-xs text-blue-100/75">
                    {isGcash
                      ? 'Attach the receipt and enter its full reference number. OCR suggestions are optional; the cashier verifies the payment details.'
                      : 'Receipt images are optional. Enter the payment reference and verify the details manually; OCR is only a suggestion.'}
                  </p>
                </div>
              </div>

            <div className="rounded-sm border border-blue-500/30 bg-blue-500/5 p-4">
              <input ref={fileInput} type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => { chooseReceipt(e.target.files?.[0]); e.currentTarget.value = ''; }} className="hidden" />
              {!receipt ? (
                <div className="py-4 text-center">
                  <Camera className="mx-auto h-10 w-10 text-blue-200" />
                  <p className="mt-3 text-sm font-medium text-ivory">No receipt photo yet</p>
                  <p className="mt-1 text-xs text-ivory-dim">JPEG or PNG, up to 10 MB.</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="flex-1 h-10 rounded-sm bg-blue-400 text-charcoal font-bold text-xs uppercase tracking-wider hover:bg-blue-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Take Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="flex-1 h-10 rounded-sm border border-blue-400/40 text-blue-100 font-bold text-xs uppercase tracking-wider hover:bg-blue-400/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ImagePlus className="h-4 w-4" />
                      <span>Choose Image</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <img src={preview || undefined} alt="GCash receipt preview" className="max-h-64 w-full rounded-sm object-contain" />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setReceiptViewerOpen(true)}
                    className="mt-3 h-10 flex w-full items-center justify-center gap-2 rounded-sm border border-blue-300/40 p-2 text-xs font-bold uppercase tracking-wider text-blue-100 transition-colors hover:bg-blue-300/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    <Maximize2 className="h-4 w-4" />
                    <span>View Full-Size Receipt</span>
                  </button>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => fileInput.current?.click()}
                      className="flex-1 h-10 rounded-sm border border-white/20 p-2 text-xs font-bold uppercase tracking-wider text-ivory hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      Retake / Replace
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => { cancelOcr(); setReceipt(null); setReceiptError(null); setReceiptViewerOpen(false); if (preview) URL.revokeObjectURL(preview); setPreview(null); }}
                      className="h-10 px-4 rounded-sm border border-red-400/30 bg-red-500/10 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
              {ocrStatus === 'extracting' && (
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Checking for optional receipt suggestions…</span>
                </div>
              )}
              {(ocrStatus === 'no-match' || ocrStatus === 'failed') && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
                  <span className="flex-1">{ocrError || 'Receipt details could not be detected. Review them manually.'}</span>
                  {receipt && (
                    <button
                      type="button"
                      onClick={() => void runReceiptOcr(receipt)}
                      className="h-7 px-2.5 rounded-sm border border-amber-300/40 text-[10px] font-bold uppercase tracking-wider hover:bg-amber-300/10 transition-colors cursor-pointer"
                    >
                      Run Again
                    </button>
                  )}
                </div>
              )}
            </div>

            <label className="block rounded-sm border border-gold/20 bg-gold/5 p-4 text-xs text-ivory">
              <span className="mb-2 block font-bold uppercase tracking-wider text-gold">
                Full {isGcash ? 'GCash' : selectedMethodConfig?.name || 'Payment'} Reference Number
              </span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                value={reference}
                onChange={event => { referenceRef.current = event.target.value; setReference(event.target.value); }}
                placeholder="Enter or correct the full reference number"
                className="min-h-11 w-full touch-manipulation rounded-sm border border-white/20 bg-black/30 px-3 text-base text-ivory outline-none focus:border-gold sm:text-sm"
              />
              <span className="mt-2 block text-ivory-dim">
                {isGcash ? 'OCR may suggest a value. Check every digit; the full reference is required and checked for duplicates.' : 'Check this against the receipt before confirming.'}
              </span>
            </label>

            {receipt && (
              <div className="space-y-4 rounded-sm border border-gold/30 bg-gold/5 p-4">
                <div className="flex items-center gap-3 text-sm text-ivory">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/20 font-bold text-gold text-xs">2</span>
                  <div>
                    <p className="font-bold">Review payment details</p>
                    <p className="mt-0.5 text-xs text-ivory-dim">Check the extracted values against the receipt before confirming.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-ivory space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">Amount Received</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim text-xs">₱</span>
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className={`w-full h-10 rounded-sm border bg-black/30 p-3 pl-8 text-xs sm:text-sm text-ivory outline-none focus:border-gold transition-colors ${
                          amountMatches ? 'border-emerald-400/50' : 'border-amber-400/50'
                        }`}
                      />
                    </div>
                    <span className="mt-1 block text-xs text-ivory-dim">
                      {ocrAmountCandidate !== null ? `OCR suggestion: ₱${ocrAmountCandidate.toFixed(2)}. Verify and enter the amount shown.` : 'Enter the amount shown on the receipt; OCR is optional.'}
                    </span>
                  </label>
                  <div className="rounded-sm border border-gold/30 bg-gold/10 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Amount Due</div>
                    <div className="mt-1 text-2xl font-bold text-gold">₱{exactAmount}</div>
                    <div className="mt-0.5 text-xs text-ivory-dim">Server-calculated total</div>
                  </div>
                </div>

                {ocrStatus === 'succeeded' && (ocrCandidate || ocrAmountCandidate !== null) && (
                  <div className="flex items-center gap-2 rounded-sm border border-blue-400/30 bg-blue-500/10 p-2.5 text-xs text-blue-100">
                    <ScanText className="h-4 w-4 shrink-0" />
                    <span>
                      OCR suggestions available. {ocrCandidate ? `Reference suggestion: ${ocrCandidate}. ` : ''}Check the receipt and enter the confirmed amount and reference.
                    </span>
                  </div>
                )}
              </div>
            )}

            {isGcash && (
              <label className="flex items-start gap-2.5 rounded-sm border border-gold/30 bg-gold/5 p-4 text-xs text-ivory cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={gcashConfirmed}
                  onChange={e => setGcashConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[#d4a017] cursor-pointer"
                />
                <span>
                  I confirm the GCash payment amount matches the amount due. Receipt evidence and the reference can be added later from Recent Transactions.
                </span>
              </label>
            )}
          </>
        )}

        {validationMessage && (
          <p role="status" className="rounded-sm border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
            {validationMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={!isValid || submitting}
          className="w-full h-11 rounded-sm bg-gold text-charcoal hover:bg-gold-dim text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-charcoal" />
              <span>Confirming Payment…</span>
            </>
          ) : (
            confirmButtonLabel
          )}
        </button>
      </form>
      )}
    </div>
  </div>
    {receipt && preview && (
      <Modal
        isOpen={receiptViewerOpen}
        onClose={() => setReceiptViewerOpen(false)}
        title="Full-size GCash Receipt"
        size="xl"
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={() => setReceiptViewerOpen(false)}
              className="h-10 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
            >
              Close Receipt
            </button>
          </div>
        }
      >
        <p className="mb-4 text-xs text-ivory-dim">
          Compare the amount, GCash reference, merchant, and date on this receipt with the review fields before confirming payment.
        </p>
        <div className="flex min-h-[24rem] items-center justify-center rounded-sm border border-white/10 bg-black/40 p-3">
          <img
            src={preview}
            alt="Full-size GCash receipt for manual verification"
            className="max-h-[70vh] w-full object-contain rounded-sm"
          />
        </div>
      </Modal>
    )}

  </>;
};

export default QueuePaymentModal;
