import type { BranchInvoiceProfile } from '@demoshop/shared-types';

export interface OfflineReceiptLine {
  name: string;
  amount: number;
}

export interface OfflineReceiptSnapshotInput {
  receiptNumber: string;
  issuedAt: number;
  branchId: number;
  cashierId: string;
  customerName: string;
  barberName: string;
  lines: OfflineReceiptLine[];
  amount: number;
  tenderedAmount: number;
  changeAmount: number;
  cashierName?: string | null;
  sellerInvoiceProfile?: BranchInvoiceProfile | null;
}

const toCents = (amount: number): number => Math.round(amount * 100);

export const normalizeLocalCashCapture = (
  amount: number,
  tenderedAmount: number,
): { amount: number; tenderedAmount: number; changeAmount: number } => {
  if (!Number.isFinite(amount) || !Number.isFinite(tenderedAmount)) {
    throw new Error('Enter valid cash amounts.');
  }
  const amountCents = toCents(amount);
  const tenderedCents = toCents(tenderedAmount);
  if (amountCents <= 0) throw new Error('A positive amount is required for cash capture.');
  if (tenderedCents < amountCents) throw new Error('Cash received cannot be less than the total due.');
  if (amountCents > 100_000_000 || tenderedCents > 100_000_000) {
    throw new Error('Cash amount exceeds the supported limit.');
  }
  return {
    amount: amountCents / 100,
    tenderedAmount: tenderedCents / 100,
    changeAmount: (tenderedCents - amountCents) / 100,
  };
};

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] || character));

const money = (value: number): string => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fallbackInvoiceProfile = (branchId: number): BranchInvoiceProfile => ({
  branchId,
  tradeName: 'DEMOSHOP’S R18 BARBER SHOP',
  registeredName: 'RYAN B. ELFA – Prop.',
  registeredAddress: 'Ground Floor, SampleBranch Sta. 3A-GF-GL-00041,\nKaypian, CSJDM, 3023\nCity of San Jose Del Monte, Bulacan, Philippines',
  taxType: 'NON_VAT',
  tin: '300503954',
  branchCode: '00000',
  confirmedFromForm2303: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
});

const dateText = (value: number): string => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'long',
  day: '2-digit',
  year: 'numeric',
}).format(new Date(value)).toUpperCase();

/** Uses the standard receipt layout while keeping connectivity and sync state in cashier-only UI. */
export const renderOfflineReceiptHtml = (
  snapshot: OfflineReceiptSnapshotInput,
  options: { isReprint?: boolean } = {},
): string => {
  const profile = snapshot.sellerInvoiceProfile?.branchId === snapshot.branchId
    ? snapshot.sellerInvoiceProfile
    : fallbackInvoiceProfile(snapshot.branchId);
  const tradeName = profile.tradeName || 'Business name not configured';
  const taxTypeLabel = profile.taxType === 'VAT' ? 'VAT REG.' : 'NON-VAT REG.';
  const formattedTin = `${profile.tin.slice(0, 3)}-${profile.tin.slice(3, 6)}-${profile.tin.slice(6, 9)}-${profile.branchCode}`;
  const lines = snapshot.lines.map((line) => `
    <div class="service-line"><span>${escapeHtml(line.name)}<small>QTY 1 × ${money(line.amount)} · Cash</small></span><i></i><strong>${money(line.amount)}</strong></div>`).join('');
  const safeAddress = escapeHtml(profile.registeredAddress).replace(/\r?\n/g, '<br>');
  const cashierRow = snapshot.cashierName
    ? `<div class="row"><span>CASHIER:</span><strong>${escapeHtml(snapshot.cashierName)}</strong></div>`
    : '';
  const reprint = options.isReprint ? '<div class="reprint">REPRINT COPY</div>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(snapshot.receiptNumber)}</title>
<style>
@page{size:58mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:11px;font-weight:600;line-height:1.2}
.receipt{width:48mm;max-width:100%;padding:4mm 1mm;margin:0 auto;color:#000}.brand img{display:block;width:18mm;height:auto;margin:0 auto 4px;filter:contrast(200%) grayscale(100%)}.brand{text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px}.brand h1{font:700 15px Georgia,serif;letter-spacing:0.5px;margin:0 0 2px;color:#000}.brand p{font-size:8px;letter-spacing:0.5px;margin:0;color:#000;font-weight:700}.seller-details{font-size:6.5px;line-height:1.25;margin:0 0 8px}.seller-row{display:grid;grid-template-columns:19mm minmax(0,1fr);column-gap:1mm;align-items:start;margin:2px 0}.seller-row strong{text-align:left;font-weight:800}.seller-row span{text-align:left;overflow-wrap:anywhere}.invoice-title{text-align:center;font-weight:900;font-size:15px;letter-spacing:1px;margin:8px 0}.reprint{text-align:center;font-size:8px;font-weight:800;letter-spacing:.5px;margin:-4px 0 8px}.meta{border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px}.row{display:flex;justify-content:space-between;gap:6px;margin:3px 0;color:#000}.row span:first-child{color:#000;font-weight:600}.row strong{font-weight:700;text-align:right;color:#000}.section-title{font-weight:800;letter-spacing:0.5px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:4px;color:#000;text-transform:uppercase}.service-line{display:flex;align-items:baseline;gap:4px;padding:3px 0;color:#000}.service-line span{white-space:normal;color:#000}.service-line i{flex:1;border-bottom:1px dotted #000;height:1px}.service-line strong{color:#000;font-weight:700;white-space:nowrap}.service-line small{display:block;color:#000;font-size:8px;font-weight:600;margin-top:1px}.total{border-top:1px solid #000;border-bottom:1px solid #000;padding:6px 0;font-size:13px;font-weight:800;margin-top:12px;color:#000}.footer{text-align:center;border-top:1px dashed #000;padding-top:10px;margin-top:12px;font-size:9px;color:#000;font-weight:600}.contact{display:block;text-align:center;color:#000;font-size:8px;margin-top:10px;font-weight:600}
</style></head><body><main class="receipt">
  <header class="brand"><img src="/demoshop_logo.png" alt="DemoShop's logo"><h1>${escapeHtml(tradeName)}</h1><p>A SANCTUARY FOR THE<br>MODERN GENTLEMAN</p></header>
  <section class="seller-details">
    <div class="seller-row"><strong>REGISTERED NAME</strong><span>${escapeHtml(profile.registeredName)}</span></div>
    <div class="seller-row"><strong>${escapeHtml(`${taxTypeLabel} TIN`)}</strong><span>${escapeHtml(formattedTin)}</span></div>
    <div class="seller-row"><strong>BRANCH CODE</strong><span>${escapeHtml(profile.branchCode)}</span></div>
    <div class="seller-row"><strong>REGISTERED ADDRESS</strong><span>${safeAddress}</span></div>
  </section>
  <div class="invoice-title">SALES INVOICE</div>${reprint}
  <section class="meta">
    <div class="row"><span>INVOICE NO.</span><strong>${escapeHtml(snapshot.receiptNumber)}</strong></div>
    <div class="row"><span>DATE:</span><strong>${escapeHtml(dateText(snapshot.issuedAt))}</strong></div>
    <div class="row"><span>CUSTOMER:</span><strong>${escapeHtml(snapshot.customerName)}</strong></div>
    <div class="row"><span>BARBER:</span><strong>${escapeHtml(snapshot.barberName)}</strong></div>
    <div class="row"><span>AMOUNT RECEIVED:</span><strong>${money(snapshot.tenderedAmount)}</strong></div>
    <div class="row"><span>CHANGE:</span><strong>${money(snapshot.changeAmount)}</strong></div>
    ${cashierRow}
  </section>
  <section><div class="section-title">AVAILED SERVICE</div><div class="services">${lines}</div>
    <div class="row total"><span>TOTAL:</span><strong>${money(snapshot.amount)}</strong></div>
  </section>
  <footer class="footer"><strong>THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.</strong><div class="contact">portfolio.example.invalid<br>855-0123</div></footer>
</main></body></html>`;
};
