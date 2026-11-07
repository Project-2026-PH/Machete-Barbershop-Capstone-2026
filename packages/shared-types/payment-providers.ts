export type PaymentCategory = 'ewallet' | 'bank';
export type PaymentProviderId = 'gcash' | 'maya' | 'maribank' | 'gotyme';

export interface ReceiptValidationResult {
  status: 'checking' | 'needs-reference' | 'pending-review' | 'verified' | 'rejected';
  amount: number | null;
  reference: string | null;
  transactionDate: Date | null;
  imageHash: string | null;
  recipient: string | null;
  referenceEligible?: boolean;
  /** OCR was incomplete; a unique manual reference allows customer submission for Admin review only. */
  adminReviewOnly?: boolean;
  referenceSource?: 'ocr' | 'manual';
  failureCode?: 'unreadable' | 'wrong-recipient' | 'old' | 'future' | 'not-receipt' | 'missing-field' | 'reference-used' | 'hash-used';
  message?: string;
  detail?: string;
}

export interface PaymentProviderConfig {
  id: PaymentProviderId;
  label: string;
  category: PaymentCategory;
  enabled: boolean;
  receiving: {
    accountName: string;
    accountNumber: string;
    accountNumberLabel: 'Mobile' | 'Account no.';
    qrImageUrl: string;
  };
  logo: { mark: string; color: string };
  receipt: {
    providerPattern: RegExp;
    statusPattern: RegExp;
    amountPattern: RegExp;
    recipientPattern: RegExp;
    recipientMatch: 'phone' | 'name+last4';
    parseReference(text: string): string | null;
    parseTimestamp(text: string): Date | null;
    parseAmount(text: string): number | null;
  };
}

const COMMON_RECEIPT_CONTEXT_KEYWORDS = [
  'gcash', 'maya', 'paymaya', 'instapay', 'pesonet', 'maribank', 'seabank', 'gotyme',
  'express send', 'send money', 'sent to', 'paid to', 'transfer',
  'reference', 'ref no', 'ref.', 'ref #', 'transaction', 'confirmation', 'receipt',
  'successful', 'successfully', 'amount', 'php', 'pesos', '₱', 'total'
];

export const hasCommonReceiptContext = (text: string): boolean => {
  const lower = String(text || '').toLowerCase();
  return COMMON_RECEIPT_CONTEXT_KEYWORDS.some(kw => lower.includes(kw));
};

const IGNORED_OCR_TOKENS = new Set([
  'DATE', 'TIME', 'AMOUNT', 'TOTAL', 'REF', 'NO', 'NUMBER', 'DETAILS',
  'TRANSACTION', 'CONFIRMATION', 'RECEIPT', 'SUCCESSFUL', 'SUCCESSFULLY',
  'COMPLETED', 'COMPLETE', 'PHP', 'PESO', 'PESOS', 'EXPRESS', 'SEND',
  'MONEY', 'TRANSFER', 'FROM', 'TO', 'PAID', 'PAYMENT', 'CUSTOMER',
  'ACCOUNT', 'NAME', 'BANK', 'GCASH', 'MAYA', 'PAYMAYA', 'MARIBANK',
  'SEABANK', 'GOTYME'
]);

export const extractGenericReceiptAmount = (text: string): number | null => {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const amountPattern = /(?:₱|PHP|P|\+)\s*([\d,]+(?:\.\d{1,2})?)/i;
  const labeledAmountPattern = /(?:amount|total\s+amount\s+sent|transfer\s+amount)\s*[:\-]?\s*(?:₱|PHP|P|\+)?\s*([\d,]+(?:\.\d{1,2})?)/i;
  const candidates: Array<{ amount: number; score: number }> = [];

  lines.forEach((line, index) => {
    const scope = `${line} ${lines[index + 1] || ''}`;
    const match = line.match(labeledAmountPattern) ||
      (/amount|total\s+amount|transfer/i.test(line) ? scope.match(labeledAmountPattern) : null) ||
      scope.match(amountPattern);
    if (!match) return;
    const amount = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const score = /amount|total|sent|paid|payment|transferred/i.test(line) ? 100 : 20;
    candidates.push({ amount, score });
  });

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.score - a.score)[0].amount;
};

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

const resolveMonthIndex = (token: string): number => {
  const norm = token.toLowerCase().replace(/^0ct$/, 'oct').replace(/^ocl$/, 'oct').replace(/[^a-z]/g, '').slice(0, 3);
  return MONTH_LOOKUP[norm] ?? -1;
};

export const extractGenericReceiptTransactionDate = (text: string): Date | null => {
  const normalizedText = String(text || '')
    .replace(/[\u00a0]/g, ' ')
    .replace(/\b(A)\s+(M)\b/gi, '$1$2')
    .replace(/\b(P)\s+(M)\b/gi, '$1$2')
    .replace(/,([0-9])/g, ', $1')
    .replace(/\s+/g, ' ')
    .trim();

  const monthNames = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

  // 1. Month DD, YYYY (e.g. "Oct 17, 2026", "Oct 17,2026", "Oct. 17, 2026", "October 17 2026 05:58 PM")
  const monthDatePattern = new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2}),?\\s*(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::\\d{2})?\\s*(AM|PM)?)?`, 'i');
  const monthMatch = normalizedText.match(monthDatePattern);
  if (monthMatch) {
    const month = resolveMonthIndex(monthMatch[1]);
    const day = Number(monthMatch[2]);
    const year = Number(monthMatch[3]);
    let hour = Number(monthMatch[4] || 0);
    const minute = Number(monthMatch[5] || 0);
    if (monthMatch[6]) {
      if (monthMatch[6].toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (monthMatch[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const parsed = new Date(year, month, day, hour, minute);
    return month >= 0 && Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // 2. DD Month YYYY (e.g. "17 Oct 2026", "17-Oct-2026", "17 October 2026")
  const dayMonthPattern = new RegExp(`\\b(\\d{1,2})[\\s\\-–/]+(${monthNames})\\.?([\\s\\-–/,]*)(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::\\d{2})?\\s*(AM|PM)?)?`, 'i');
  const dayMonthMatch = normalizedText.match(dayMonthPattern);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const month = resolveMonthIndex(dayMonthMatch[2]);
    const year = Number(dayMonthMatch[4]);
    let hour = Number(dayMonthMatch[5] || 0);
    const minute = Number(dayMonthMatch[6] || 0);
    if (dayMonthMatch[7]) {
      if (dayMonthMatch[7].toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (dayMonthMatch[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const parsed = new Date(year, month, day, hour, minute);
    return month >= 0 && Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // 3. YYYY-MM-DD or YYYY/MM/DD (ISO banking timestamp)
  const isoDatePattern = /\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i;
  const isoMatch = normalizedText.match(isoDatePattern);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    let hour = Number(isoMatch[4] || 0);
    const minute = Number(isoMatch[5] || 0);
    if (isoMatch[6]) {
      if (isoMatch[6].toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (isoMatch[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const parsed = new Date(year, month, day, hour, minute);
    return month >= 0 && month < 12 && Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // 4. MM/DD/YYYY or DD/MM/YYYY
  const numericDatePattern = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i;
  const numericMatch = normalizedText.match(numericDatePattern);
  if (numericMatch) {
    const month = Number(numericMatch[1]) - 1;
    const day = Number(numericMatch[2]);
    const year = Number(numericMatch[3]);
    let hour = Number(numericMatch[4] || 0);
    const minute = Number(numericMatch[5] || 0);
    if (numericMatch[6]) {
      if (numericMatch[6].toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (numericMatch[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const parsed = new Date(year, month, day, hour, minute);
    return month >= 0 && month < 12 && Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // 5. OCR typo fallback: e.g. "0ct 17, 2026"
  const looseDateMatch = normalizedText.match(/\b([A-Za-z0-9]{3,9})\s+(\d{1,2}),?\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?\b/i);
  if (looseDateMatch) {
    const month = resolveMonthIndex(looseDateMatch[1]);
    let hour = Number(looseDateMatch[4] || 0);
    const minute = Number(looseDateMatch[5] || 0);
    if (looseDateMatch[6]) {
      if (looseDateMatch[6].toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (looseDateMatch[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const parsed = new Date(Number(looseDateMatch[3]), month, Number(looseDateMatch[2]), hour, minute);
    return month >= 0 && Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
};

export const extractEWalletReference = (text: string): string | null => {
  if (!text) return null;
  if (!hasCommonReceiptContext(text)) return null;

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates: Array<{ token: string; score: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isRefLine = /reference|ref\b|ref\.|ref\s*no|refno|transaction|txn|confirmation/i.test(line);
    if (!isRefLine) continue;

    const searchScope = `${line} ${lines[i + 1] || ''}`;
    const labeledDigitSequences = line.match(/(?:\d[\d\s-]{7,}\d)/g) || [];
    for (const sequence of labeledDigitSequences) {
      const cleanSequence = sequence.replace(/\D/g, '');
      if (cleanSequence.length >= 9 && cleanSequence.length <= 13) {
        candidates.push({ token: cleanSequence, score: 110 });
      }
    }

    const chunkedMatch = searchScope.match(/\b(\d{4})[\s-](\d{4})[\s-](\d{4,5})\b/);
    if (chunkedMatch) {
      candidates.push({ token: `${chunkedMatch[1]}${chunkedMatch[2]}${chunkedMatch[3]}`, score: 100 });
    }

    const tokens = searchScope.match(/[A-Za-z0-9][A-Za-z0-9-]{4,24}/g) || [];
    for (const rawToken of tokens) {
      const upper = rawToken.toUpperCase();
      if (IGNORED_OCR_TOKENS.has(upper)) continue;

      const cleanDigits = rawToken.replace(/\D/g, '');
      if (cleanDigits.length >= 9 && cleanDigits.length <= 13) {
        const score = 60 + cleanDigits.length + (/^\d+$/.test(rawToken) ? 20 : 0);
        candidates.push({ token: cleanDigits, score });
      }
    }
  }

  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.score - a.score)[0].token;
  }

  const isPaymentReceipt = /gcash|maya|paymaya|express send|send money|receipt|payment/i.test(text);
  if (isPaymentReceipt) {
    const chunkedMatch = text.match(/\b(\d{4})[\s-](\d{4})[\s-](\d{4,5})\b/);
    if (chunkedMatch) {
      return `${chunkedMatch[1]}${chunkedMatch[2]}${chunkedMatch[3]}`;
    }
  }

  return null;
};

export const extractBankReference = (text: string): string | null => {
  if (!text) return null;
  if (!hasCommonReceiptContext(text)) return null;

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates: Array<{ token: string; score: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isRefLine = /reference|ref\b|ref\.|ref\s*no|refno|transaction\s*(?:id|no|#)?|txn\s*(?:id|no|#)?|trace\s*no/i.test(line);
    if (!isRefLine) continue;

    const searchScope = `${line} ${lines[i + 1] || ''}`;
    const rawTokens = searchScope.match(/[A-Za-z0-9][A-Za-z0-9-]{6,30}/g) || [];
    for (const token of rawTokens) {
      const clean = token.replace(/[^A-Za-z0-9]/g, '');
      if (clean.length >= 8 && clean.length <= 24 && !IGNORED_OCR_TOKENS.has(clean.toUpperCase())) {
        if (!/\d/.test(clean)) continue;
        candidates.push({ token: clean, score: 100 + clean.length });
      }
    }
  }

  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.score - a.score)[0].token;
  }

  return extractEWalletReference(text);
};

export const matchesBankRecipient = (
  detected?: string | null,
  configuredNumber?: string | null,
  configuredName?: string | null,
): boolean => {
  const detectedValue = String(detected || '').trim();
  if (!detectedValue) return true;

  const detectedDigits = detectedValue.replace(/\D/g, '');
  const configuredDigits = String(configuredNumber || '').replace(/\D/g, '');

  if (detectedDigits.length >= 4 && configuredDigits.length >= 4) {
    const detectedLast4 = detectedDigits.slice(-4);
    const configuredLast4 = configuredDigits.slice(-4);
    if (detectedLast4 === configuredLast4) return true;
  }

  const detectedClean = detectedValue.toLowerCase().replace(/[^a-z0-9]/g, '');
  const configuredMerchant = String(configuredName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (detectedClean && configuredMerchant) {
    if (detectedClean.includes(configuredMerchant) || configuredMerchant.includes(detectedClean)) {
      return true;
    }
    const detectedWords = detectedValue.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4);
    const merchantWords = String(configuredName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4);
    const commonWords = merchantWords.filter(w => detectedWords.includes(w));
    if (commonWords.length >= 1) {
      return true;
    }
  }

  return false;
};

export const DEFAULT_PAYMENT_PROVIDERS: Record<PaymentProviderId, PaymentProviderConfig> = {
  gcash: {
    id: 'gcash',
    label: 'Gcash',
    category: 'ewallet',
    enabled: true,
    receiving: {
      accountName: "DEMOSHOP'S BARBERSHOP",
      accountNumber: '09XX XXX XXXX',
      accountNumberLabel: 'Mobile',
      qrImageUrl: '',
    },
    logo: { mark: 'G', color: '#007DFE' },
    receipt: {
      providerPattern: /gcash/i,
      statusPattern: /sent\s+successfully|payment\s+details|express\s+send|send\s+money|transaction|receipt/i,
      amountPattern: /(?:amount|total\s+amount\s+sent|php|₱)/i,
      recipientPattern: /sent\s+(?:via|to)|paid\s+to|recipient|transfer\s+to/i,
      recipientMatch: 'phone',
      parseReference: extractEWalletReference,
      parseTimestamp: extractGenericReceiptTransactionDate,
      parseAmount: extractGenericReceiptAmount,
    },
  },
  maya: {
    id: 'maya',
    label: 'Maya/ Paymaya',
    category: 'ewallet',
    enabled: true,
    receiving: {
      accountName: "DEMOSHOP'S BARBERSHOP",
      accountNumber: '09XX XXX XXXX',
      accountNumberLabel: 'Mobile',
      qrImageUrl: '',
    },
    logo: { mark: 'M', color: '#2ECC71' },
    receipt: {
      providerPattern: /maya|paymaya/i,
      statusPattern: /sent\s+money|payment\s+details|transfer\s+to\s+bank|transaction\s+completed|success|receipt/i,
      amountPattern: /(?:amount|total\s+amount\s+sent|php|₱)/i,
      recipientPattern: /sent\s+(?:via|to)|paid\s+to|recipient|transfer\s+to/i,
      recipientMatch: 'phone',
      parseReference: extractEWalletReference,
      parseTimestamp: extractGenericReceiptTransactionDate,
      parseAmount: extractGenericReceiptAmount,
    },
  },
  maribank: {
    id: 'maribank',
    label: 'MariBank',
    category: 'bank',
    enabled: false,
    receiving: {
      accountName: "DEMOSHOP'S BARBERSHOP",
      accountNumber: '',
      accountNumberLabel: 'Account no.',
      qrImageUrl: '',
    },
    logo: { mark: 'MB', color: '#FF5722' },
    receipt: {
      providerPattern: /maribank|seabank/i,
      statusPattern: /successful|completed|transferred|sent|payment\s+details|transaction/i,
      amountPattern: /(?:amount|transfer\s+amount|total|php|₱)/i,
      recipientPattern: /recipient|to\b|sent\s+to|beneficiary|transferred\s+to/i,
      recipientMatch: 'name+last4',
      parseReference: extractBankReference,
      parseTimestamp: extractGenericReceiptTransactionDate,
      parseAmount: extractGenericReceiptAmount,
    },
  },
  gotyme: {
    id: 'gotyme',
    label: 'GoTyme',
    category: 'bank',
    enabled: false,
    receiving: {
      accountName: "DEMOSHOP'S BARBERSHOP",
      accountNumber: '',
      accountNumberLabel: 'Account no.',
      qrImageUrl: '',
    },
    logo: { mark: 'GT', color: '#00C896' },
    receipt: {
      providerPattern: /gotyme|go\s*tyme/i,
      statusPattern: /successful|completed|transferred|sent|payment\s+details|transaction/i,
      amountPattern: /(?:amount|transfer\s+amount|total|php|₱)/i,
      recipientPattern: /recipient|to\b|sent\s+to|beneficiary|transferred\s+to/i,
      recipientMatch: 'name+last4',
      parseReference: extractBankReference,
      parseTimestamp: extractGenericReceiptTransactionDate,
      parseAmount: extractGenericReceiptAmount,
    },
  },
};

export const getPaymentProvider = (providerId: string): PaymentProviderConfig => {
  const normalized = providerId.toLowerCase().trim() as PaymentProviderId;
  return DEFAULT_PAYMENT_PROVIDERS[normalized] || DEFAULT_PAYMENT_PROVIDERS.gcash;
};
