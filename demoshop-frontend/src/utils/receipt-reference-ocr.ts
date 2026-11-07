const IGNORED_OCR_TOKENS = new Set([
  'GCASH', 'MAYA', 'REFERENCE', 'REF', 'TRANSACTION', 'TRANSACTIONID', 'ID', 'NUMBER', 'NO',
  'DATE', 'AMOUNT', 'PHP', 'PESOS', 'SUCCESSFUL', 'SEND', 'MONEY', 'DETAILS', 'TIKTOK',
  'MERCHANT', 'SHOP', 'SELLER', 'HELP', 'TIME', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]);

const RECEIPT_CONTEXT_KEYWORDS = [
  'gcash', 'maya', 'paymaya', 'instapay', 'pesonet',
  'express send', 'send money', 'sent to', 'paid to', 'transfer',
  'reference', 'ref no', 'ref.', 'ref #', 'transaction', 'confirmation', 'receipt',
  'successful', 'successfully', 'amount', 'php', 'pesos', '₱', 'â‚±', 'total',
];

const hasReceiptContext = (text: string): boolean => {
  const lower = text.toLowerCase();
  return RECEIPT_CONTEXT_KEYWORDS.some((keyword) => lower.includes(keyword));
};

/** Extracts a likely payment reference using the customer booking receipt OCR rules. */
export const extractReferenceFromOcrText = (text: string): string | null => {
  if (!text || !hasReceiptContext(text)) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates: Array<{ token: string; score: number }> = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const isRefLine = /reference|ref\b|ref\.|ref\s*no|refno|transaction|txn|confirmation/i.test(line);
    if (!isRefLine) continue;

    const searchScope = `${line} ${lines[index + 1] || ''}`;
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
      if (IGNORED_OCR_TOKENS.has(rawToken.toUpperCase())) continue;
      const cleanDigits = rawToken.replace(/\D/g, '');
      if (cleanDigits.length >= 9 && cleanDigits.length <= 13) {
        const score = 60 + cleanDigits.length + (/^\d+$/.test(rawToken) ? 20 : 0);
        candidates.push({ token: cleanDigits, score });
      }
    }
  }

  if (candidates.length > 0) return candidates.sort((a, b) => b.score - a.score)[0].token;

  const isPaymentReceipt = /gcash|maya|paymaya|express send|send money|receipt|payment/i.test(text);
  if (isPaymentReceipt) {
    const chunkedMatch = text.match(/\b(\d{4})[\s-](\d{4})[\s-](\d{4,5})\b/);
    if (chunkedMatch) return `${chunkedMatch[1]}${chunkedMatch[2]}${chunkedMatch[3]}`;
  }

  return null;
};
