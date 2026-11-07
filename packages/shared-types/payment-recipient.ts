export const normalizeRecipientDigits = (value?: string | null): string =>
  String(value || '').replace(/\D/g, '');

export const normalizeRecipientName = (value?: string | null): string =>
  String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizePhoneDigits = (value: string): string =>
  value.startsWith('63') && value.length >= 11 ? `0${value.slice(2)}` : value;

/**
 * Compares an OCR recipient identifier against the shop's configured account.
 * Masked receipt numbers are accepted when their visible suffix matches.
 */
export const recipientMatchesConfiguredAccount = (
  detected?: string | null,
  configuredNumber?: string | null,
  configuredName?: string | null,
): boolean => {
  const detectedValue = String(detected || '').trim();
  if (!detectedValue) return true;

  const detectedDigits = normalizePhoneDigits(normalizeRecipientDigits(detectedValue));
  const configuredDigits = normalizePhoneDigits(normalizeRecipientDigits(configuredNumber));
  if (detectedDigits && configuredDigits) {
    if (detectedDigits === configuredDigits) return true;
    const isMasked = /[*xX\u2022\u2023\u2024\u00b7]/u.test(detectedValue);
    if (!isMasked) return false;
    const visiblePrefix = detectedDigits.length >= 4 ? detectedDigits : '';
    const visibleSuffix = configuredDigits.length >= 3 ? configuredDigits.slice(-3) : configuredDigits;
    return Boolean(
      (visiblePrefix && configuredDigits.startsWith(visiblePrefix)) ||
      (visibleSuffix.length >= 3 && detectedDigits.endsWith(visibleSuffix)),
    );
  }

  const detectedName = normalizeRecipientName(detectedValue);
  const configuredMerchant = normalizeRecipientName(configuredName);
  return Boolean(detectedName && configuredMerchant && (
    detectedName === configuredMerchant || detectedName.includes(configuredMerchant) || configuredMerchant.includes(detectedName)
  ));
};

export const extractRecipientIdentifierFromOcrText = (text: string): string | null => {
  if (!text) return null;

  const phonePattern = /((?:09\s*[\d*xX\u2022\u2023\u2024\u00b7]{2}\s*[-\s]?\s*[\d*xX\u2022\u2023\u2024\u00b7]{3}\s*[-\s]?\s*[\d*xX\u2022\u2023\u2024\u00b7]{3,4})|(?:\+63\s*9\s*[\d*xX\u2022\u2023\u2024\u00b7]{4,8}\s*[-\s]?\s*[\d*xX\u2022\u2023\u2024\u00b7]{3,4}))/iu;

  const trailingSectionPattern = /\s+(?:amount|total|reference|ref\.?\s*no|transaction|date|details|php|₱).*$/i;

  // 1. Check for "Transfer from ... to ..." or "From ... to ..." pattern.
  // In transfer transactions, the sender is after "from" and the recipient is after "to".
  const transferFromToMatch = text.match(/(?:transfer\s+)?from\s+[\s\S]*?\bto\b\s*([\s\S]*?)(?=\bamount\b|\bdate\b|\breference\b|\n\s*\n|$)/i);
  if (transferFromToMatch) {
    const targetSection = transferFromToMatch[1];
    const phone = targetSection.match(phonePattern)?.[1];
    if (phone) return phone.replace(/\s+/g, ' ').trim();

    const candidateLines = targetSection
      .split(/\r?\n/)
      .map(line => line.trim().replace(/^[:\-\s]+/, '').replace(trailingSectionPattern, '').trim())
      .filter(Boolean);
    const candidate = candidateLines[0];
    if (candidate && candidate.length >= 3 && !/^(?:amount|reference|transaction|date|details)$/i.test(candidate)) {
      return candidate;
    }
  }

  // 2. Check for explicit recipient labels: "Sent to", "Transfer to", "Paid to", "Recipient", or "To:"
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const recipientLabel = /(?:sent\s+to|transfer\s+to|paid\s+to|recipient|\bto\s*[:\-]|\bto\b)/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(recipientLabel);
    if (!match || match.index === undefined) continue;

    const afterLabel = line.slice(match.index + match[0].length).trim();
    const nextLine = (lines[index + 1] || '').trim();
    const scopeAfterLabel = `${afterLabel} ${nextLine}`.trim();

    const phone = scopeAfterLabel.match(phonePattern)?.[1];
    if (phone) return phone.replace(/\s+/g, ' ').trim();

    const cleanAfter = afterLabel.replace(/^[:\-\s]+/, '').replace(trailingSectionPattern, '').trim();
    const isCategoryHeader = /^(?:bank\s*[\/-]?\s*wallet|bank|wallet|other\s+bank|another\s+account|success|successful|payment\s+details)$/i.test(cleanAfter);
    if (!isCategoryHeader && cleanAfter && cleanAfter.length >= 3 && !/^(?:amount|reference|transaction|date|details)$/i.test(cleanAfter)) {
      return cleanAfter;
    }
    const cleanNext = nextLine.replace(/^[:\-\s]+/, '').replace(trailingSectionPattern, '').trim();
    const isNextCategoryHeader = /^(?:bank\s*[\/-]?\s*wallet|bank|wallet|other\s+bank|another\s+account|success|successful|payment\s+details)$/i.test(cleanNext);
    if (!isNextCategoryHeader && cleanNext && cleanNext.length >= 3 && !/^(?:amount|reference|transaction|date|details)$/i.test(cleanNext)) {
      return cleanNext;
    }
  }

  // 3. Fallback: if sender phone is explicitly marked with "from" or "transfer from",
  // collect all phone numbers and exclude the sender phone.
  const senderMatch = text.match(/(?:transfer\s+)?from\s*[:\-]?\s*([^\n\r]+)/i);
  const senderPhone = senderMatch?.[1]?.match(phonePattern)?.[1]?.replace(/\s+/g, ' ').trim();

  const allPhones = Array.from(text.matchAll(new RegExp(phonePattern.source, 'giu')))
    .map(m => m[1]?.replace(/\s+/g, ' ').trim())
    .filter((p): p is string => Boolean(p));

  if (senderPhone && allPhones.length > 1) {
    const nonSender = allPhones.find(p => p.replace(/\D/g, '') !== senderPhone.replace(/\D/g, ''));
    if (nonSender) return nonSender;
  }

  // 4. Fallback to first standalone phone if no sender distinction was found
  const standalonePhone = text.match(phonePattern)?.[1];
  return standalonePhone ? standalonePhone.replace(/\s+/g, ' ').trim() : null;
};

