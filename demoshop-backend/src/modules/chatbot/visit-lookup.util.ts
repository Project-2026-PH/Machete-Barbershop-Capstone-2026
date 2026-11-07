/** Canonical receipt number used only for a bounded, one-character lookup. */
export const normalizeInvoiceNumber = (value: string): string | null => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = normalized.startsWith('MCH') ? normalized.slice(3) : normalized;
  if (!/^[A-Z0-9]{1,12}$/.test(digits)) return null;
  return `MCH${digits}`;
};

/** Generate exact and one insertion/deletion/substitution candidates for MCH receipt IDs. */
export const invoiceNumberCandidates = (value: string): string[] => {
  const normalized = normalizeInvoiceNumber(value);
  if (!normalized) return [];
  const suffix = normalized.slice(3);
  const candidates = new Set([normalized]);
  for (let index = 0; index < suffix.length; index += 1) {
    candidates.add(`MCH${suffix.slice(0, index)}${suffix.slice(index + 1)}`);
    for (let digit = 0; digit <= 9; digit += 1) {
      const replacement = `${suffix.slice(0, index)}${digit}${suffix.slice(index + 1)}`;
      if (replacement !== suffix) candidates.add(`MCH${replacement}`);
    }
  }
  if (suffix.length < 12) {
    for (let index = 0; index <= suffix.length; index += 1) {
      for (let digit = 0; digit <= 9; digit += 1) {
        candidates.add(`MCH${suffix.slice(0, index)}${digit}${suffix.slice(index)}`);
      }
    }
  }
  return [...candidates].filter(candidate => /^MCH\d{1,12}$/.test(candidate));
};

/** Accept exact matches and one simple typo for human-entered receipt credentials. */
export const isLookupValueClose = (expected: string, supplied: string): boolean => {
  const left = expected.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const right = supplied.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const mismatches = Array.from({ length: left.length }, (_, index) => index).filter(index => left[index] !== right[index]);
    if (mismatches.length === 2 && mismatches[1] === mismatches[0] + 1
      && left[mismatches[0]] === right[mismatches[1]] && left[mismatches[1]] === right[mismatches[0]]) return true;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
};
