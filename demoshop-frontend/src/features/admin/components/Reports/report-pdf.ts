import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
    BarberCommissionResponse,
    InventoryReportResponse,
    SalesReportResponse,
} from '@demoshop/shared-types';
import { api } from '@/config/api';

const DEFAULT_SHOP = "DemoShop's Barbershop";
const DEFAULT_BRANCH = 'SampleBranch, Brgy. Kaypian, SJDM, Bulacan';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAGE1_START_Y = 92;
const CONTINUATION_TOP = 20;
const FOOTER_TOP = PAGE_H - 12;

const INK: [number, number, number] = [28, 25, 20];
const GOLD: [number, number, number] = [212, 175, 55];
const GOLD_DK: [number, number, number] = [138, 107, 18];
const GOLD_SOFT: [number, number, number] = [247, 240, 222];
const CREAM: [number, number, number] = [251, 247, 239];
const PAPER: [number, number, number] = [255, 253, 248];
const MUTED: [number, number, number] = [74, 67, 56];
const GREEN: [number, number, number] = [15, 107, 69];
const BLUE: [number, number, number] = [21, 94, 134];
const RED: [number, number, number] = [155, 44, 44];

type KpiTone = 'gold' | 'green' | 'blue' | 'red' | 'ink';

interface KpiCard {
    label: string;
    value: string;
    hint?: string;
    tone: KpiTone;
}

interface ReportPdfMeta {
    shopName: string;
    branchName: string;
    title: string;
    startDate: string;
    endDate: string;
    preparedBy: string;
    generatedAt: string;
    filename: string;
    kpis: KpiCard[];
}

interface PdfTableSection {
    title: string;
    columns: string[];
    rows: string[][];
    foot?: string[];
    aligns?: Array<'left' | 'right' | 'center'>;
}

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

const toneColor = (tone: KpiTone): [number, number, number] => {
    if (tone === 'green') return GREEN;
    if (tone === 'blue') return BLUE;
    if (tone === 'red') return RED;
    if (tone === 'ink') return INK;
    return GOLD_DK;
};

export const formatPdfCurrency = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatPdfNumber = (value: number) =>
    Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const formatSignedCurrency = (value: number) =>
    `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatPdfCurrency(Math.abs(value))}`;

const formatSignedNumber = (value: number) =>
    `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatPdfNumber(Math.abs(value))}`;

const generatedTimestamp = () => new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

const loadLogoDataUrl = async (): Promise<string | null> => {
    try {
        const response = await fetch('/demoshop_logo.png');
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

const resolveShopProfile = async () => {
    try {
        const response = await api.get('/api/admin/settings');
        const data = response.data || {};
        return {
            shopName: typeof data.shopName === 'string' && data.shopName.trim() ? data.shopName.trim() : DEFAULT_SHOP,
            branchName: typeof data.physicalAddress === 'string' && data.physicalAddress.trim()
                ? data.physicalAddress.trim()
                : DEFAULT_BRANCH,
        };
    } catch {
        return { shopName: DEFAULT_SHOP, branchName: DEFAULT_BRANCH };
    }
};

const getFinalY = (doc: jsPDF, fallback: number) =>
    (doc as JsPdfWithTable).lastAutoTable?.finalY ?? fallback;

const paintBackground = (doc: jsPDF) => {
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    doc.setFillColor(...INK);
    doc.rect(0, 0, PAGE_W, 4.2, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 4.2, PAGE_W, 1.4, 'F');
};

const paintFooter = (doc: jsPDF, meta: ReportPdfMeta, pageNumber: number, pageCount: number) => {
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, FOOTER_TOP, PAGE_W - MARGIN, FOOTER_TOP);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GOLD_DK);
    doc.text(`${meta.shopName}  •  Precision & Tradition  •  Confidential`, MARGIN, PAGE_H - 7);
    doc.text(`Page ${pageNumber} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
};

const paintLetterhead = (doc: jsPDF, meta: ReportPdfMeta, logo: string | null) => {
    const sealX = MARGIN + 11;
    const sealY = 22;
    doc.setFillColor(...INK);
    doc.circle(sealX, sealY, 10.5, 'F');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.7);
    doc.circle(sealX, sealY, 10.5, 'S');
    if (logo) {
        doc.addImage(logo, 'PNG', sealX - 8.2, sealY - 8.2, 16.4, 16.4);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD_DK);
    doc.text('OFFICIAL SHOP REPORT', MARGIN + 26, 14.5);

    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...INK);
    doc.text(meta.shopName, MARGIN + 26, 22.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(meta.branchName, MARGIN + 26, 28.5);

    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, 35, PAGE_W - MARGIN, 35);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...GOLD_DK);
    doc.text(meta.title, MARGIN, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('INTERNAL USE', PAGE_W - MARGIN, 42, { align: 'right' });

    const cards = [
        { label: 'DATE RANGE', value: `${meta.startDate} to ${meta.endDate}` },
        { label: 'GENERATED', value: `${meta.generatedAt} (Asia/Manila)` },
        { label: 'PREPARED BY', value: meta.preparedBy },
    ];
    const gap = 3;
    const cardW = (CONTENT_W - gap * 2) / 3;
    cards.forEach((card, index) => {
        const x = MARGIN + index * (cardW + gap);
        doc.setFillColor(...PAPER);
        doc.rect(x, 46, cardW, 14, 'F');
        doc.setFillColor(...GOLD);
        doc.rect(x, 46, cardW, 1.3, 'F');
        doc.setDrawColor(224, 210, 168);
        doc.setLineWidth(0.2);
        doc.rect(x, 46, cardW, 14, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...GOLD_DK);
        doc.text(card.label, x + 2.5, 50.5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        doc.text(card.value, x + 2.5, 56, { maxWidth: cardW - 5 });
    });

    if (meta.kpis.length === 0) return;
    const kpiGap = 3;
    const kpiW = (CONTENT_W - kpiGap * (meta.kpis.length - 1)) / meta.kpis.length;
    meta.kpis.forEach((kpi, index) => {
        const x = MARGIN + index * (kpiW + kpiGap);
        const color = toneColor(kpi.tone);
        doc.setFillColor(...PAPER);
        doc.rect(x, 63.5, kpiW, 22, 'F');
        doc.setFillColor(...color);
        doc.rect(x, 63.5, 1.6, 22, 'F');
        doc.setDrawColor(224, 210, 168);
        doc.setLineWidth(0.2);
        doc.rect(x, 63.5, kpiW, 22, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...color);
        doc.text(kpi.label.toUpperCase(), x + 4, 68.8, { maxWidth: kpiW - 7 });
        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        doc.text(kpi.value, x + 4, 76.5, { maxWidth: kpiW - 7 });
        if (kpi.hint) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...MUTED);
            doc.text(kpi.hint, x + 4, 81.8, { maxWidth: kpiW - 7 });
        }
    });
};

const paintCompactHeader = (doc: jsPDF, meta: ReportPdfMeta) => {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(meta.shopName, MARGIN, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD_DK);
    doc.text(meta.title, PAGE_W - MARGIN, 13, { align: 'right' });
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, 16, PAGE_W - MARGIN, 16);
};

const paintPageChrome = (
    doc: jsPDF,
    meta: ReportPdfMeta,
    logo: string | null,
    pageNumber: number,
    painted: Set<number>,
) => {
    if (painted.has(pageNumber)) return;
    painted.add(pageNumber);
    paintBackground(doc);
    if (pageNumber === 1) {
        paintLetterhead(doc, meta, logo);
    } else {
        paintCompactHeader(doc, meta);
    }
};

const writeTables = (doc: jsPDF, meta: ReportPdfMeta, logo: string | null, sections: PdfTableSection[]) => {
    const painted = new Set<number>();
    let startY = PAGE1_START_Y;

    sections.forEach((section) => {
        if (startY > PAGE_H - 40) {
            doc.addPage();
            startY = CONTINUATION_TOP;
        }

        const columnCount = Math.max(section.columns.length, 1);
        autoTable(doc, {
            startY,
            theme: 'grid',
            pageBreak: 'auto',
            rowPageBreak: 'auto',
            tableWidth: CONTENT_W,
            margin: { top: CONTINUATION_TOP, left: MARGIN, right: MARGIN, bottom: 18 },
            head: [
                [{
                    content: section.title,
                    colSpan: columnCount,
                    styles: {
                        fillColor: GOLD,
                        textColor: INK,
                        fontStyle: 'bold',
                        fontSize: 8,
                        halign: 'left',
                        cellPadding: { top: 2.4, right: 2.2, bottom: 2.4, left: 2.2 },
                    },
                }],
                section.columns,
            ],
            body: section.rows.length > 0
                ? section.rows
                : [[{ content: 'No records for this section.', colSpan: columnCount, styles: { halign: 'left' } }]],
            foot: section.foot ? [section.foot] : undefined,
            styles: {
                font: 'helvetica',
                fontSize: 7,
                cellPadding: 1.5,
                textColor: INK,
                fillColor: PAPER,
                lineColor: [224, 210, 168],
                lineWidth: 0.15,
                overflow: 'linebreak',
                valign: 'middle',
                minCellHeight: 6,
            },
            headStyles: {
                fillColor: INK,
                textColor: [244, 228, 166],
                fontStyle: 'bold',
                fontSize: 6.4,
                cellPadding: 1.6,
                overflow: 'linebreak',
            },
            alternateRowStyles: { fillColor: GOLD_SOFT },
            footStyles: {
                fillColor: INK,
                textColor: [244, 228, 166],
                fontStyle: 'bold',
                fontSize: 7,
            },
            columnStyles: Object.fromEntries(
                (section.aligns || []).map((align, index) => [index, { halign: align }]),
            ),
            didParseCell: (hook) => {
                if (hook.section === 'head' && hook.row.index === 0) {
                    hook.cell.styles.fillColor = GOLD;
                    hook.cell.styles.textColor = INK;
                    hook.cell.styles.fontStyle = 'bold';
                    hook.cell.styles.halign = 'left';
                }
            },
            willDrawPage: (hook) => {
                paintPageChrome(doc, meta, logo, hook.pageNumber, painted);
            },
        });
        startY = getFinalY(doc, startY) + 7;
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        if (!painted.has(page)) {
            paintPageChrome(doc, meta, logo, page, painted);
        }
        paintFooter(doc, meta, page, pageCount);
    }
};

const buildDocument = async (meta: ReportPdfMeta, sections: PdfTableSection[]) => {
    const [logo] = await Promise.all([loadLogoDataUrl()]);
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
    });
    doc.setProperties({
        title: `${meta.title} — ${meta.shopName}`,
        subject: `${meta.startDate} to ${meta.endDate}`,
        author: meta.preparedBy,
        creator: meta.shopName,
    });
    writeTables(doc, meta, logo, sections);
    doc.save(meta.filename);
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface ReportPdfRequestBase {
    startDate: string;
    endDate: string;
    preparedBy: string;
}

export async function downloadSalesReportPdf(
    report: SalesReportResponse,
    context: ReportPdfRequestBase,
) {
    const shop = await resolveShopProfile();
    const paymentBuckets = new Map<string, number>();
    for (const tx of report.transactions) {
        const method = (tx.paymentMethod || 'Unknown').trim() || 'Unknown';
        paymentBuckets.set(method, (paymentBuckets.get(method) || 0) + Number(tx.amount || 0));
    }
    if (paymentBuckets.size === 0 && report.summary.totalGrossRevenue > 0) {
        if (report.summary.cashRevenue > 0) paymentBuckets.set('Cash', report.summary.cashRevenue);
        if (report.summary.digitalRevenue > 0) paymentBuckets.set('Digital', report.summary.digitalRevenue);
    }

    const activeTimeline = (report.timeline || []).filter(
        (point) => Number(point.transactionCount || 0) > 0 || Number(point.totalRevenue || 0) > 0
    );

    await buildDocument({
        ...shop,
        title: 'Sales Breakdown & Revenue Report',
        startDate: context.startDate,
        endDate: context.endDate,
        preparedBy: context.preparedBy,
        generatedAt: generatedTimestamp(),
        filename: `demoshop-sales-report-${context.startDate}-to-${context.endDate}.pdf`,
        kpis: [
            {
                label: 'Total revenue',
                value: formatPdfCurrency(report.summary.totalGrossRevenue),
                hint: `${report.summary.totalTransactionsCount} tx • avg ${formatPdfCurrency(report.summary.averageTicketValue)}`,
                tone: 'gold',
            },
            {
                label: 'Cash sales',
                value: formatPdfCurrency(report.summary.cashRevenue),
                hint: `${report.summary.cashPercentage}% • ${report.summary.cashTransactionsCount} tickets`,
                tone: 'green',
            },
            {
                label: 'Digital sales',
                value: formatPdfCurrency(report.summary.digitalRevenue),
                hint: `${report.summary.digitalPercentage}% • ${report.summary.digitalTransactionsCount} tickets`,
                tone: 'blue',
            },
        ],
    }, [
        {
            title: 'Revenue by payment method',
            columns: ['Payment method', 'Amount'],
            rows: Array.from(paymentBuckets.entries()).map(([method, amount]) => [method, formatPdfCurrency(amount)]),
            aligns: ['left', 'right'],
        },
        {
            title: `Daily revenue trend (${activeTimeline.length} active ${activeTimeline.length === 1 ? 'day' : 'days'})`,
            columns: ['Date', 'Cash', 'Digital', 'Total', 'Tickets'],
            rows: activeTimeline.map((point) => [
                point.formattedDate || point.date,
                formatPdfCurrency(point.cashRevenue),
                formatPdfCurrency(point.digitalRevenue),
                formatPdfCurrency(point.totalRevenue),
                String(point.transactionCount),
            ]),
            aligns: ['left', 'right', 'right', 'right', 'right'],
        },
        {
            title: `Itemized sales receipts (${report.transactions.length})`,
            columns: ['TX / Time', 'Customer', 'Service', 'Barber', 'Payment', 'Amount'],
            rows: report.transactions.map((tx) => [
                `TX-${tx.transactionId}\n${tx.formattedDate} • ${tx.formattedTime}`,
                tx.customerName,
                tx.serviceName,
                tx.barberName,
                tx.paymentMethod,
                formatPdfCurrency(tx.amount),
            ]),
            aligns: ['left', 'left', 'left', 'left', 'left', 'right'],
        },
    ]);
}

export async function downloadCommissionsReportPdf(
    report: BarberCommissionResponse,
    context: ReportPdfRequestBase,
) {
    const shop = await resolveShopProfile();
    const topBarber = [...report.barbers].sort((a, b) => b.netCommissionPayout - a.netCommissionPayout)[0];

    await buildDocument({
        ...shop,
        title: 'Barber Commission Report',
        startDate: context.startDate,
        endDate: context.endDate,
        preparedBy: context.preparedBy,
        generatedAt: generatedTimestamp(),
        filename: `demoshop-commission-report-${context.startDate}-to-${context.endDate}.pdf`,
        kpis: [
            {
                label: 'Commission payouts',
                value: formatPdfCurrency(report.summary.totalCommissionPayout),
                hint: `${report.summary.totalServicesCompleted} completed services`,
                tone: 'gold',
            },
            {
                label: 'Top performing barber',
                value: topBarber?.barberName || '—',
                hint: topBarber
                    ? `${formatPdfCurrency(topBarber.netCommissionPayout)} • ${topBarber.commissionRateLabel}`
                    : 'No commission activity',
                tone: 'ink',
            },
            {
                label: 'Shop net revenue',
                value: formatPdfCurrency(report.summary.totalShopNetRevenue),
                hint: `Gross ${formatPdfCurrency(report.summary.totalGrossSales)} minus commissions`,
                tone: 'green',
            },
        ],
    }, [
        {
            title: 'Commission earnings by barber',
            columns: ['Barber', 'Services', 'Commission payout'],
            rows: report.barbers.map((barber) => [
                barber.barberName,
                String(barber.completedServicesCount),
                formatPdfCurrency(barber.netCommissionPayout),
            ]),
            aligns: ['left', 'right', 'right'],
        },
        {
            title: 'Barber commission breakdown',
            columns: ['Barber / role', 'Services', 'Gross sales', 'Tier', 'Commission', 'Shop net'],
            rows: report.barbers.map((barber) => [
                `${barber.barberName}\n${barber.role || 'Barber'}`,
                String(barber.completedServicesCount),
                formatPdfCurrency(barber.totalGrossSales),
                barber.commissionRateLabel,
                formatPdfCurrency(barber.netCommissionPayout),
                formatPdfCurrency(barber.shopNetRevenue),
            ]),
            foot: [
                'Total',
                String(report.summary.totalServicesCompleted),
                formatPdfCurrency(report.summary.totalGrossSales),
                '—',
                formatPdfCurrency(report.summary.totalCommissionPayout),
                formatPdfCurrency(report.summary.totalShopNetRevenue),
            ],
            aligns: ['left', 'right', 'right', 'left', 'right', 'right'],
        },
    ]);
}

export async function downloadInventoryReportPdf(
    report: InventoryReportResponse,
    context: ReportPdfRequestBase & { displayMode: 'units' | 'value' },
) {
    const shop = await resolveShopProfile();
    const valueMode = context.displayMode === 'value';
    const qtyOrValue = (quantity: number, amount: number) =>
        valueMode ? formatPdfCurrency(amount) : formatPdfNumber(quantity);
    const signedQtyOrValue = (quantity: number, amount: number) =>
        valueMode ? formatSignedCurrency(amount) : formatSignedNumber(quantity);

    await buildDocument({
        ...shop,
        title: 'Inventory Report',
        startDate: context.startDate,
        endDate: context.endDate,
        preparedBy: context.preparedBy,
        generatedAt: generatedTimestamp(),
        filename: `demoshop-inventory-report-${slug(context.displayMode)}-${context.startDate}-to-${context.endDate}.pdf`,
        kpis: [
            {
                label: 'Stock value',
                value: formatPdfCurrency(report.summary.totalClosingValue),
                hint: 'Ending stock at cost',
                tone: 'gold',
            },
            {
                label: 'Items tracked',
                value: formatPdfNumber(report.summary.activeTrackedSkuCount),
                hint: 'Items in this report',
                tone: 'ink',
            },
            {
                label: 'Items running low',
                value: formatPdfNumber(report.summary.atRiskSkuCount),
                hint: 'Critical or low stock',
                tone: 'red',
            },
            {
                label: 'Stock changes',
                value: formatPdfNumber(report.summary.totalMovementCount),
                hint: 'In selected period',
                tone: 'gold',
            },
        ],
    }, [
        {
            title: `Stock summary — ${valueMode ? 'cost value (PHP)' : 'quantity'}`,
            columns: ['Item / type', 'Starting stock', 'Deliveries', 'Estimated use', 'Ending stock', 'Status'],
            rows: report.items.map((item) => [
                `${item.name}\n${item.ownership === 'Consumables' || item.assignedBarber ? 'Consumables' : item.ownership} • ${item.unit}`,
                qtyOrValue(item.openingQuantity, item.openingValue),
                signedQtyOrValue(item.receiptsQuantity, item.receiptsValue),
                valueMode
                    ? `-${formatPdfCurrency(item.estimatedConsumptionValue)}`
                    : `-${formatPdfNumber(item.estimatedConsumptionQuantity)}`,
                qtyOrValue(item.closingQuantity, item.closingValue),
                item.stockStatus,
            ]),
            aligns: ['left', 'right', 'right', 'right', 'right', 'center'],
        },
        {
            title: 'Stock changes, cost, and restocking',
            columns: ['Item', 'Count fixes', 'Manual changes', 'Unit cost', 'When to restock'],
            rows: report.items.map((item) => [
                item.name,
                signedQtyOrValue(item.countCorrectionsQuantity, item.countCorrectionsValue),
                signedQtyOrValue(item.manualAdjustmentsQuantity, item.manualAdjustmentsValue),
                formatPdfCurrency(item.costPrice),
                item.forecastAvailable
                    ? [
                        item.projectedStockOutDate ? `May run out ${item.projectedStockOutDate}` : 'In stock',
                        item.suggestedWeeklyReplenishment != null ? `Wk ${formatPdfNumber(item.suggestedWeeklyReplenishment)}` : null,
                        item.suggestedMonthlyReplenishment != null ? `Mo ${formatPdfNumber(item.suggestedMonthlyReplenishment)}` : null,
                    ].filter(Boolean).join(' • ')
                    : (item.forecastUnavailableReason || 'Available after 14 days of stock history'),
            ]),
            aligns: ['left', 'right', 'right', 'right', 'left'],
        },
        {
            title: 'Stock count differences',
            columns: ['Date / shift', 'Item', 'System stock', 'Counted stock', 'Difference', 'Difference at cost', 'Notes'],
            rows: report.variances.map((row) => [
                `${row.countDate}\n${row.shift} shift`,
                `${row.itemName}\n${row.ownership}`,
                `${formatPdfNumber(row.currentQuantityBefore)} ${row.unit}`,
                `${formatPdfNumber(row.countedQuantity)} ${row.unit}`,
                row.varianceDelta === 0 ? '—' : `${formatSignedNumber(row.varianceDelta)} ${row.unit}`,
                row.financialExposure === 0 ? '—' : formatSignedCurrency(row.financialExposure),
                [
                    row.notes ? `"${row.notes}"` : null,
                    row.reviewedBy ? `Reviewed by ${row.reviewedBy}` : null,
                ].filter(Boolean).join(' • ') || '—',
            ]),
            aligns: ['left', 'left', 'right', 'right', 'right', 'right', 'left'],
        },
    ]);
}

export type DownloadableReport =
    | { kind: 'sales'; report: SalesReportResponse }
    | { kind: 'commissions'; report: BarberCommissionResponse }
    | { kind: 'inventory'; report: InventoryReportResponse; displayMode: 'units' | 'value' };

export async function downloadReportPdf(
    request: DownloadableReport & ReportPdfRequestBase,
) {
    const context = {
        startDate: request.startDate,
        endDate: request.endDate,
        preparedBy: request.preparedBy,
    };
    if (request.kind === 'sales') {
        await downloadSalesReportPdf(request.report, context);
        return;
    }
    if (request.kind === 'commissions') {
        await downloadCommissionsReportPdf(request.report, context);
        return;
    }
    await downloadInventoryReportPdf(request.report, { ...context, displayMode: request.displayMode });
}
