import type { ReceiptResponse } from '@demoshop/shared-types';

const ESC = '\x1B';
const GS = '\x1D';
const MAX_COLUMNS = 32;
const QR_SIZE = 256;
const sanitize = (value: unknown): string => String(value ?? '')
  .replace(/[’‘]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/[\r\n]+/g, ' ')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '?');

const money = (value: number): string => `PHP ${Number(value || 0).toFixed(2)}`;

const wrap = (value: string, width = MAX_COLUMNS): string[] => {
  const text = sanitize(value).trim();
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word.slice(0, width);
    else if (current.length + word.length + 1 <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current) lines.push(current);
  return lines;
};

const leftRight = (left: string, right: string): string => {
  const safeLeft = sanitize(left);
  const safeRight = sanitize(right);
  const available = Math.max(1, MAX_COLUMNS - safeRight.length - 1);
  return `${safeLeft.slice(0, available).padEnd(available, ' ')} ${safeRight.slice(0, MAX_COLUMNS)}`;
};

const sellerField = (label: string, value: string): string[] => {
  const safeLabel = sanitize(label);
  const inlineWidth = Math.max(1, MAX_COLUMNS - safeLabel.length - 1);
  const safeValue = sanitize(value).trim();
  if (safeValue.length <= inlineWidth) return [leftRight(safeLabel, safeValue)];
  if (safeValue.length <= MAX_COLUMNS) return [safeLabel, safeValue.padStart(MAX_COLUMNS)];
  return [safeLabel, ...wrap(safeValue).map(line => line.padStart(MAX_COLUMNS))];
};

const formatDate = (value: string): string => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'long',
  day: '2-digit',
  year: 'numeric',
}).format(new Date(value)).toUpperCase();

const centered = (value: string): string => {
  const text = sanitize(value).slice(0, MAX_COLUMNS);
  return text.padStart(Math.floor((MAX_COLUMNS + text.length) / 2), ' ');
};

const divider = '-'.repeat(MAX_COLUMNS);

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Guest QR image could not be loaded.'));
  image.src = src;
});

/** Creates a GS v 0 ESC/POS monochrome raster bitmap from a QR data URL. */
const rasterizeQr = async (dataUrl: string): Promise<string> => {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable for QR rasterization.');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, QR_SIZE, QR_SIZE);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, QR_SIZE, QR_SIZE);

  const pixels = context.getImageData(0, 0, QR_SIZE, QR_SIZE).data;
  const widthBytes = QR_SIZE / 8;
  const bitmap = new Uint8Array(widthBytes * QR_SIZE);
  for (let y = 0; y < QR_SIZE; y += 1) {
    for (let x = 0; x < QR_SIZE; x += 1) {
      const pixel = (y * QR_SIZE + x) * 4;
      const luminance = (pixels[pixel] * 299 + pixels[pixel + 1] * 587 + pixels[pixel + 2] * 114) / 1000;
      if (pixels[pixel + 3] > 0 && luminance < 180) {
        bitmap[y * widthBytes + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }

  const header = `${GS}v0\x00${String.fromCharCode(
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    QR_SIZE & 0xff,
    (QR_SIZE >> 8) & 0xff,
  )}`;
  return `${ESC}a\x01${header}${String.fromCharCode(...bitmap)}${ESC}a\x00`;
};

/** Creates native ESC/POS output for a 58 mm / 203 DPI printer. */
export const formatReceiptForEscPos = async (receipt: ReceiptResponse): Promise<string | null> => {
  const profile = receipt.sellerInvoiceProfile;
  const fullTin = profile
    ? `${profile.tin.slice(0, 3)}-${profile.tin.slice(3, 6)}-${profile.tin.slice(6, 9)}-${profile.branchCode}`
    : 'TIN NOT CONFIGURED';
  const tradeName = profile?.tradeName || receipt.branch.name || 'Business name not configured';
  const registeredName = profile?.registeredName || 'Registered taxpayer name not configured';
  const registeredAddress = profile?.registeredAddress || 'Registered business address not configured';
  const taxTypeLabel = profile?.taxType === 'VAT' ? 'VAT REG. TIN' : 'NON-VAT REG. TIN';
  let qrBitmap = '';
  if (receipt.guestQrCode) {
    try {
      qrBitmap = await rasterizeQr(receipt.guestQrCode);
    } catch (error) {
      console.warn('[EscPos] Guest QR rasterization failed; using HTML fallback.', error);
      return null;
    }
  }

  const output: string[] = [
    `${ESC}@`,
    `${ESC}t\x00`,
    `${ESC}a\x01${ESC}E\x01`,
    ...wrap(tradeName).map(centered),
    centered('A SANCTUARY FOR THE'),
    centered('MODERN GENTLEMAN'),
    `${ESC}E\x00`,
    // Emphasized mode makes the text print darker on small thermal heads such
    // as the GOOJPRT PT-210 while keeping the header centered normally.
    `${ESC}a\x00${ESC}E\x01`,
    divider,
    ...sellerField('REG. NAME', registeredName),
    ...sellerField(taxTypeLabel, fullTin),
    ...sellerField('BRANCH CODE', profile?.branchCode || 'NOT CONFIGURED'),
    ...sellerField('REG. ADDRESS', registeredAddress),
    divider,
    centered('SALES INVOICE'),
    leftRight('INVOICE NO.', receipt.receiptNumber),
    leftRight('DATE:', formatDate(receipt.issuedAt)),
    leftRight('CUSTOMER:', receipt.customerName),
  ];

  if (!receipt.isRetailOnly) output.push(leftRight('BARBER:', receipt.barberName));
  if (receipt.cashierName) output.push(leftRight('CASHIER:', receipt.cashierName));
  if (receipt.gcashReferenceLast4) output.push(leftRight('GCASH REF', `****${receipt.gcashReferenceLast4}`));

  output.push(divider, receipt.isRetailOnly ? 'RETAIL PURCHASE' : 'AVAILED SERVICE', divider);
  for (const line of receipt.lines) {
    const quantity = line.quantity || 1;
    const unitPrice = line.unitPrice ?? line.amount / quantity;
    output.push(...wrap(line.serviceName));
    output.push(...wrap(`QTY ${quantity} @ ${money(unitPrice)}`));
    output.push(leftRight(`  ${line.paymentMethod}`, money(line.amount)));
  }

  if (receipt.reservationFee) {
    output.push(...wrap('Reservation Fee'));
    output.push(...wrap(`QTY 1 @ ${money(receipt.reservationFee.amount)}`));
    output.push(leftRight(receipt.reservationFee.paymentMethod, money(receipt.reservationFee.amount)));
  }

  output.push(
    divider,
    leftRight('TOTAL', money(receipt.totalAmount)),
    leftRight('PAYMENT', receipt.paymentMethods.join(' / ')),
  );
  if (receipt.cashReceivedAmount != null) {
    output.push(
      leftRight('AMOUNT RECEIVED', money(receipt.cashReceivedAmount)),
      leftRight('CHANGE', money(receipt.cashChangeAmount || 0)),
    );
  }

  if (receipt.guestReference) output.push('', centered(`GUEST REF: ${receipt.guestReference}`));
  if (receipt.visitLookupCode) {
    output.push('', centered('VISIT LOOKUP CODE'), centered(receipt.visitLookupCode), ...wrap('Keep this code private. You will need it to retrieve this visit in chat.'));
  }
  if (qrBitmap) output.push('', qrBitmap, '');

  output.push(
    divider,
    ...wrap('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.'),
    divider,
    centered('portfolio.example.invalid'),
    centered('855-0123'),
    '',
    '',
  );

  return `${output.join('\n')}\n`;
};
