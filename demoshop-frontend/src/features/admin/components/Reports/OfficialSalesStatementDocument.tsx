import React from 'react';
import type { SalesReportResponse } from '@demoshop/shared-types';

interface OfficialSalesStatementDocumentProps {
    report: SalesReportResponse;
    startDate: string;
    endDate: string;
    preparedBy: string;
    shopName?: string;
    branchName?: string;
    excludeEmptyDates?: boolean;
}

export const formatStatementCurrency = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const OfficialSalesStatementDocument: React.FC<OfficialSalesStatementDocumentProps> = ({
    report,
    startDate,
    endDate,
    preparedBy,
    shopName = "DemoShop's Barbershop",
    branchName = 'SampleBranch, Brgy. Kaypian, SJDM, Bulacan',
    excludeEmptyDates = true,
}) => {
    const generatedAt = new Date().toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

    // Payment buckets calculation matching PDF output
    const paymentBuckets = new Map<string, number>();
    for (const tx of report.transactions || []) {
        const method = (tx.paymentMethod || 'Unknown').trim() || 'Unknown';
        paymentBuckets.set(method, (paymentBuckets.get(method) || 0) + Number(tx.amount || 0));
    }
    if (paymentBuckets.size === 0 && report.summary.totalGrossRevenue > 0) {
        if (report.summary.cashRevenue > 0) paymentBuckets.set('Cash', report.summary.cashRevenue);
        if (report.summary.digitalRevenue > 0) paymentBuckets.set('Digital', report.summary.digitalRevenue);
    }

    // Exclude empty dates from timeline
    const activeTimeline = (report.timeline || []).filter((point) => {
        if (!excludeEmptyDates) return true;
        return Number(point.transactionCount || 0) > 0 || Number(point.totalRevenue || 0) > 0;
    });

    return (
        <div className="official-statement-doc bg-[#FBF8EE] text-[#121212] p-8 max-w-[900px] mx-auto font-sans leading-relaxed shadow-sm">
            {/* Top Decorative Stripe */}
            <div className="w-full h-[4.2mm] bg-[#121212]" />
            <div className="w-full h-[1.4mm] bg-[#D4AF37] mb-6" />

            {/* Letterhead Header */}
            <div className="flex items-start gap-4 pb-4 border-b-2 border-[#D4AF37]">
                <div className="w-16 h-16 rounded-full bg-[#121212] border-2 border-[#D4AF37] flex items-center justify-center shrink-0 p-1">
                    <img
                        src="/demoshop_logo.png"
                        alt="DemoShop's Crest"
                        className="w-12 h-12 object-contain"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#8a6b12] mb-0.5">
                        OFFICIAL SHOP REPORT
                    </p>
                    <h1 className="text-2xl font-serif font-bold text-[#121212] tracking-wide leading-tight">
                        {shopName}
                    </h1>
                    <p className="text-xs text-[#555] font-medium mt-0.5">
                        {branchName}
                    </p>
                </div>
            </div>

            {/* Statement Title Row */}
            <div className="flex items-center justify-between mt-4 mb-4">
                <h2 className="text-base font-bold text-[#8a6b12] tracking-wide">
                    Sales Breakdown & Revenue Report
                </h2>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#8a6b12] border border-[#d4af37] px-2 py-0.5 rounded-xs bg-[#f4e4a6]/20">
                    INTERNAL USE
                </span>
            </div>

            {/* Metadata Summary Cards */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
                <div className="bg-[#FFFDF8] border border-[#E0D2A8] border-t-2 border-t-[#D4AF37] p-2 rounded-xs">
                    <p className="text-[9px] font-bold text-[#8a6b12] uppercase tracking-wider">Date Range</p>
                    <p className="text-xs font-bold text-[#121212] mt-0.5 truncate">{startDate} to {endDate}</p>
                </div>
                <div className="bg-[#FFFDF8] border border-[#E0D2A8] border-t-2 border-t-[#D4AF37] p-2 rounded-xs">
                    <p className="text-[9px] font-bold text-[#8a6b12] uppercase tracking-wider">Generated</p>
                    <p className="text-xs font-bold text-[#121212] mt-0.5 truncate">{generatedAt} (Asia/Manila)</p>
                </div>
                <div className="bg-[#FFFDF8] border border-[#E0D2A8] border-t-2 border-t-[#D4AF37] p-2 rounded-xs">
                    <p className="text-[9px] font-bold text-[#8a6b12] uppercase tracking-wider">Prepared By</p>
                    <p className="text-xs font-bold text-[#121212] mt-0.5 truncate">{preparedBy}</p>
                </div>
            </div>

            {/* KPI Metric Summary Cards */}
            <div className="grid grid-cols-3 gap-2.5 mb-6">
                <div className="bg-[#FFFDF8] border border-[#E0D2A8] border-l-4 border-l-[#D4AF37] p-2.5 rounded-xs flex flex-col justify-between">
                    <p className="text-[9px] font-bold text-[#8a6b12] uppercase tracking-wider">TOTAL REVENUE</p>
                    <p className="text-lg font-serif font-bold text-[#121212] my-0.5">
                        {formatStatementCurrency(report.summary.totalGrossRevenue)}
                    </p>
                    <p className="text-[10px] text-[#666]">
                        {report.summary.totalTransactionsCount} tx • avg {formatStatementCurrency(report.summary.averageTicketValue)}
                    </p>
                </div>
                <div className="bg-[#FFFDF8] border border-[#E0D2A8] border-l-4 border-l-[#0f6b45] p-2.5 rounded-xs flex flex-col justify-between">
                    <p className="text-[9px] font-bold text-[#0f6b45] uppercase tracking-wider">CASH SALES</p>
                    <p className="text-lg font-serif font-bold text-[#121212] my-0.5">
                        {formatStatementCurrency(report.summary.cashRevenue)}
                    </p>
                    <p className="text-[10px] text-[#666]">
                        {report.summary.cashPercentage}% • {report.summary.cashTransactionsCount} tickets
                    </p>
                </div>
                <div className="bg-[#FFFDF8] border border-[#E0D2A8] border-l-4 border-l-[#155e86] p-2.5 rounded-xs flex flex-col justify-between">
                    <p className="text-[9px] font-bold text-[#155e86] uppercase tracking-wider">DIGITAL SALES</p>
                    <p className="text-lg font-serif font-bold text-[#121212] my-0.5">
                        {formatStatementCurrency(report.summary.digitalRevenue)}
                    </p>
                    <p className="text-[10px] text-[#666]">
                        {report.summary.digitalPercentage}% • {report.summary.digitalTransactionsCount} tickets
                    </p>
                </div>
            </div>

            {/* Table 1: Revenue by Payment Method */}
            <div className="mb-6 overflow-hidden rounded-xs border border-[#E0D2A8]">
                <div className="bg-[#D4AF37] text-[#121212] px-3 py-1.5 font-bold text-xs uppercase tracking-wider">
                    Revenue by payment method
                </div>
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#121212] text-[#F4E4A6] text-[10px] font-bold uppercase">
                        <tr>
                            <th className="py-2 px-3 border border-[#c9a227]">Payment method</th>
                            <th className="py-2 px-3 text-right border border-[#c9a227]">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0D2A8]">
                        {paymentBuckets.size === 0 ? (
                            <tr>
                                <td colSpan={2} className="py-3 px-3 text-center text-[#666] bg-[#FFFDF8]">
                                    No payment data recorded.
                                </td>
                            </tr>
                        ) : (
                            Array.from(paymentBuckets.entries()).map(([method, amount], idx) => (
                                <tr key={method} className={idx % 2 === 0 ? 'bg-[#FFFDF8]' : 'bg-[#F7F0DE]'}>
                                    <td className="py-2 px-3 font-semibold text-[#121212] border border-[#E0D2A8]">{method}</td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-[#121212] border border-[#E0D2A8]">
                                        {formatStatementCurrency(amount)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table 2: Daily Revenue Trend (Zero-transaction dates excluded!) */}
            <div className="mb-6 overflow-hidden rounded-xs border border-[#E0D2A8]">
                <div className="bg-[#D4AF37] text-[#121212] px-3 py-1.5 font-bold text-xs uppercase tracking-wider flex justify-between items-center">
                    <span>Daily revenue trend</span>
                    <span className="text-[10px] font-normal lowercase tracking-normal">
                        ({activeTimeline.length} active {activeTimeline.length === 1 ? 'day' : 'days'})
                    </span>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#121212] text-[#F4E4A6] text-[10px] font-bold uppercase">
                        <tr>
                            <th className="py-2 px-3 border border-[#c9a227]">Date</th>
                            <th className="py-2 px-3 text-right border border-[#c9a227]">Cash</th>
                            <th className="py-2 px-3 text-right border border-[#c9a227]">Digital</th>
                            <th className="py-2 px-3 text-right border border-[#c9a227]">Total</th>
                            <th className="py-2 px-3 text-right border border-[#c9a227]">Tickets</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0D2A8]">
                        {activeTimeline.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-3 px-3 text-center text-[#666] bg-[#FFFDF8]">
                                    No transaction activity recorded for this period.
                                </td>
                            </tr>
                        ) : (
                            activeTimeline.map((point, idx) => (
                                <tr key={point.date} className={idx % 2 === 0 ? 'bg-[#FFFDF8]' : 'bg-[#F7F0DE]'}>
                                    <td className="py-2 px-3 font-medium text-[#121212] border border-[#E0D2A8]">
                                        {point.formattedDate || point.date}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono text-[#0f6b45] border border-[#E0D2A8]">
                                        {formatStatementCurrency(point.cashRevenue)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono text-[#155e86] border border-[#E0D2A8]">
                                        {formatStatementCurrency(point.digitalRevenue)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-[#121212] border border-[#E0D2A8]">
                                        {formatStatementCurrency(point.totalRevenue)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#121212] border border-[#E0D2A8]">
                                        {point.transactionCount}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table 3: Itemized Sales Receipts */}
            <div className="mb-6 overflow-hidden rounded-xs border border-[#E0D2A8]">
                <div className="bg-[#D4AF37] text-[#121212] px-3 py-1.5 font-bold text-xs uppercase tracking-wider">
                    Itemized sales receipts ({report.transactions?.length || 0})
                </div>
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#121212] text-[#F4E4A6] text-[10px] font-bold uppercase">
                        <tr>
                            <th className="py-2 px-3 border border-[#c9a227]">TX / Time</th>
                            <th className="py-2 px-3 border border-[#c9a227]">Customer</th>
                            <th className="py-2 px-3 border border-[#c9a227]">Service</th>
                            <th className="py-2 px-3 border border-[#c9a227]">Barber</th>
                            <th className="py-2 px-3 border border-[#c9a227]">Payment</th>
                            <th className="py-2 px-3 text-right border border-[#c9a227]">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0D2A8]">
                        {(report.transactions || []).length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-3 px-3 text-center text-[#666] bg-[#FFFDF8]">
                                    No transaction receipts recorded for this period.
                                </td>
                            </tr>
                        ) : (
                            report.transactions.map((tx, idx) => (
                                <tr key={tx.transactionId} className={idx % 2 === 0 ? 'bg-[#FFFDF8]' : 'bg-[#F7F0DE]'}>
                                    <td className="py-1.5 px-3 border border-[#E0D2A8]">
                                        <p className="font-mono font-bold text-[#121212]">TX-{tx.transactionId}</p>
                                        <p className="text-[10px] text-[#666]">{tx.formattedDate} • {tx.formattedTime}</p>
                                    </td>
                                    <td className="py-1.5 px-3 font-semibold text-[#121212] border border-[#E0D2A8]">
                                        {tx.customerName}
                                    </td>
                                    <td className="py-1.5 px-3 text-[#444] border border-[#E0D2A8]">
                                        {tx.serviceName}
                                    </td>
                                    <td className="py-1.5 px-3 text-[#121212] border border-[#E0D2A8]">
                                        {tx.barberName}
                                    </td>
                                    <td className="py-1.5 px-3 border border-[#E0D2A8]">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                            (tx.paymentMethod || '').toLowerCase() === 'cash'
                                                ? 'border-[#0f6b45]/30 bg-[#e8f6ee] text-[#0f6b45]'
                                                : 'border-[#155e86]/30 bg-[#e7f4fb] text-[#155e86]'
                                        }`}>
                                            {tx.paymentMethod}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-mono font-bold text-[#121212] border border-[#E0D2A8]">
                                        {formatStatementCurrency(tx.amount)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Document Footer */}
            <div className="pt-3 border-t border-[#D4AF37] flex items-center justify-between text-[10px] text-[#8a6b12] font-semibold">
                <span>{shopName} • Precision &amp; Tradition • Confidential</span>
                <span>Official Sales Statement</span>
            </div>
        </div>
    );
};

export default OfficialSalesStatementDocument;
