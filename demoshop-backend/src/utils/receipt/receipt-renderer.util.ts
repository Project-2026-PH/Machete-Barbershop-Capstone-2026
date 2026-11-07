import type { BranchInvoiceProfile, ReceiptDocument } from '@demoshop/shared-types';
import { receiptLogoDataUri } from './receipt-logo.util';
import { demoshopInvoiceProfile } from './demoshop-invoice-profile.util';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const money = (value: number): string => `₱${value.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatDate = (value: string): string => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'long',
  day: '2-digit',
  year: 'numeric',
}).format(new Date(value)).toUpperCase();

export const renderReceiptHtml = (
  document: ReceiptDocument,
  guestQrCode?: string | null,
  options: { profile?: BranchInvoiceProfile | null; authorizedInvoice?: boolean; showFullTinOnScreen?: boolean } = {},
): string => {
  const profile = options.profile ?? demoshopInvoiceProfile(document.branchId);
  const tradeName = profile?.tradeName || document.branch.name || 'Business name not configured';
  const registeredName = profile?.registeredName || 'Registered taxpayer name not configured';
  const address = profile?.registeredAddress || 'Registered business address not configured';
  const taxTypeLabel = profile?.taxType === 'VAT' ? 'VAT REG.' : 'NON-VAT REG.';
  const formattedTin = profile ? `${profile.tin.slice(0, 3)}-${profile.tin.slice(3, 6)}-${profile.tin.slice(6, 9)}-${profile.branchCode}` : '';
  const lines = document.lines.map(line => {
    const quantity = line.quantity || 1;
    const unitPrice = line.unitPrice ?? line.amount / quantity;
    const specification = line.customSpecification
      ? `<em style="display:inline-block;padding-left:2mm;font-style:italic">↳ ${escapeHtml(line.customSpecification)}</em><br>`
      : '';
    return `
    <div class="service-line"><span>${escapeHtml(line.serviceName)}<small>${specification}QTY ${escapeHtml(quantity)} × ${money(unitPrice)} · ${escapeHtml(line.paymentMethod)}</small></span><i></i><strong>${money(line.amount)}</strong></div>`;
  }).join('');
  const reservationFeeLine = document.reservationFee
    ? `\n    <div class="service-line"><span>Reservation Fee<small>QTY 1 × ${money(document.reservationFee.amount)} · ${escapeHtml(document.reservationFee.paymentMethod)}</small></span><i></i><strong>${money(document.reservationFee.amount)}</strong></div>`
    : '';
  const guestReference = document.guestReference
    ? `<div class="guest-ref">GUEST REF: ${escapeHtml(document.guestReference)}</div>`
    : '';
  const visitLookup = document.visitLookupCode
    ? `<div class="guest-ref">VISIT LOOKUP CODE: ${escapeHtml(document.visitLookupCode)}<small>Keep this code private. You will need it to retrieve this visit in chat.</small></div>`
    : '';
  const safeAddress = escapeHtml(address).replace(/\r?\n/g, '<br>');
  const qrSection = guestQrCode
    ? `<div class="experience"><div>LOVED THE EXPERIENCE? SCAN<br>HERE TO EXPERIENCE YOUR<br>PERSONALIZED EXPERIENCE!</div><img src="${escapeHtml(guestQrCode)}" alt="Guest QR code"><small>NOTE: THE QR CODE VALIDITY IS ONLY WITHIN 24 HOURS!</small></div>`
    : '';
  const logo = receiptLogoDataUri
    ? `<img src="${escapeHtml(receiptLogoDataUri)}" alt="DemoShop's logo">`
    : '';
  const gcashReference = document.gcashReferenceLast4
    ? `<div class="row"><span>GCash ref:</span><strong>••••${escapeHtml(document.gcashReferenceLast4)}</strong></div>`
    : '';
  const cashTotals = document.cashReceivedAmount != null
    ? `<div class="row"><span>Amount received:</span><strong>${money(document.cashReceivedAmount)}</strong></div><div class="row"><span>Change:</span><strong>${money(document.cashChangeAmount || 0)}</strong></div>`
    : '';
  // Retail-only sales have no barber, so the row is omitted rather than
  // printing a placeholder like "Unassigned".
  const barberRow = document.isRetailOnly
    ? ''
    : `<div class="row"><span>BARBER:</span><strong>${escapeHtml(document.barberName)}</strong></div>`;
  const cashierRow = document.cashierName
    ? `<div class="row"><span>CASHIER:</span><strong>${escapeHtml(document.cashierName)}</strong></div>`
    : '';
  const lineSectionTitle = document.isRetailOnly ? 'RETAIL PURCHASE' : 'AVAILED SERVICE';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(document.receiptNumber)}</title>
<style>
@page{size:58mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:11px;font-weight:600;line-height:1.2}
.receipt{width:48mm;max-width:100%;padding:4mm 1mm;margin:0 auto;color:#000}.brand img{display:block;width:18mm;height:auto;margin:0 auto 4px;filter:contrast(200%) grayscale(100%)}.brand{text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px}.brand h1{font:700 15px Georgia,serif;letter-spacing:0.5px;margin:0 0 2px;color:#000}.brand p{font-size:8px;letter-spacing:0.5px;margin:0;color:#000;font-weight:700}.seller-details{font-size:6.5px;line-height:1.25;margin:0 0 8px}.seller-row{display:grid;grid-template-columns:19mm minmax(0,1fr);column-gap:1mm;align-items:start;margin:2px 0}.seller-row strong{text-align:left;font-weight:800}.seller-row span{text-align:right;overflow-wrap:anywhere}.invoice-title{text-align:center;font-weight:900;font-size:15px;letter-spacing:1px;margin:8px 0}.meta{border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px}.row{display:flex;justify-content:space-between;gap:6px;margin:3px 0;color:#000}.row span:first-child{color:#000;font-weight:600}.row strong{font-weight:700;text-align:right;color:#000}.section-title{font-weight:800;letter-spacing:0.5px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:4px;color:#000;text-transform:uppercase}.service-line{display:flex;align-items:baseline;gap:4px;padding:3px 0;color:#000}.service-line span{white-space:normal;color:#000}.service-line i{flex:1;border-bottom:1px dotted #000;height:1px}.service-line strong{color:#000;font-weight:700;white-space:nowrap}.service-line small{display:block;color:#000;font-size:8px;font-weight:600;margin-top:1px}.total{border-top:1px solid #000;border-bottom:1px solid #000;padding:6px 0;font-size:13px;font-weight:800;margin-top:12px;color:#000}.footer{text-align:center;border-top:1px dashed #000;padding-top:10px;margin-top:12px;font-size:9px;color:#000;font-weight:600}.experience{text-align:center;margin:12px 0 8px;font-weight:700;line-height:1.2;color:#000}.experience img{display:block;width:34mm;height:34mm;margin:6px auto;image-rendering:pixelated}.experience small{display:block;color:#000;font-size:7.5px;font-weight:700;margin-top:4px}.guest-ref{text-align:center;color:#000;font-weight:800;letter-spacing:0.5px;margin:8px 0}.guest-ref small{display:block;font-size:7px;font-weight:600;letter-spacing:0;margin-top:3px}.contact{display:block;text-align:center;color:#000;font-size:8px;margin-top:10px;font-weight:600}
</style></head><body><main class="receipt${options.showFullTinOnScreen ? ' email-receipt' : ''}">
  <header class="brand">${logo}<h1>${escapeHtml(tradeName)}</h1><p>A SANCTUARY FOR THE<br>MODERN GENTLEMAN</p></header>
  <section class="seller-details">
    <div class="seller-row"><strong>REGISTERED NAME</strong><span>${escapeHtml(registeredName)}</span></div>
    <div class="seller-row"><strong>${escapeHtml(`${taxTypeLabel} TIN`)}</strong><span>${escapeHtml(formattedTin)}</span></div>
    <div class="seller-row"><strong>BRANCH CODE</strong><span>${escapeHtml(profile.branchCode)}</span></div>
    <div class="seller-row"><strong>REGISTERED ADDRESS</strong><span>${safeAddress}</span></div>
  </section>
  <div class="invoice-title">SALES INVOICE</div>
  <section class="meta">
    <div class="row"><span>INVOICE NO.</span><strong>${escapeHtml(document.receiptNumber)}</strong></div>
    <div class="row"><span>DATE:</span><strong>${escapeHtml(formatDate(document.issuedAt))}</strong></div>
    <div class="row"><span>CUSTOMER:</span><strong>${escapeHtml(document.customerName)}</strong></div>
    ${barberRow}
    ${cashierRow}
    ${gcashReference}
    ${cashTotals}
  </section>
  <section><div class="section-title">${escapeHtml(lineSectionTitle)}</div><div class="services">${lines}${reservationFeeLine}</div>
    <div class="row total"><span>TOTAL:</span><strong>${money(document.totalAmount)}</strong></div>
  </section>
  <footer class="footer"><strong>THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.</strong>${qrSection}${visitLookup}${guestReference}<div class="contact">portfolio.example.invalid<br>855-0123</div></footer>
</main></body></html>`;
};

export { escapeHtml };
