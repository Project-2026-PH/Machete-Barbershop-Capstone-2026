import {
    Chart as ChartJS,
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Filler,
    Tooltip,
    Legend,
    type TooltipItem,
} from 'chart.js';

ChartJS.register(
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Filler,
    Tooltip,
    Legend,
);

export const formatCurrency = (value: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(Number(value || 0));

export const exportCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [
        headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
        ...rows.map((row) =>
            row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        ),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
    cash: '#34d399',
    gcash: '#38bdf8',
    paymongo: '#a78bfa',
    digital: '#38bdf8',
};

export const colorForPaymentMethod = (method: string, index: number): string => {
    const key = method.trim().toLowerCase();
    if (PAYMENT_METHOD_COLORS[key]) return PAYMENT_METHOD_COLORS[key];
    const fallback = ['#D4AF37', '#f59e0b', '#f472b6', '#818cf8', '#2dd4bf'];
    return fallback[index % fallback.length];
};

const tickColor = '#E0E0D0';
const gridColor = 'rgba(255,255,255,0.08)';

export const darkChartLegend = {
    labels: {
        color: tickColor,
        font: { family: 'Inter, sans-serif', size: 11 },
        boxWidth: 12,
        padding: 16,
    },
};

export const darkTooltip = {
    backgroundColor: '#1C1C1C',
    titleColor: '#FFFFF0',
    bodyColor: '#E0E0D0',
    borderColor: 'rgba(212,175,55,0.4)',
    borderWidth: 1,
    callbacks: {
        label: (context: TooltipItem<any>) => {
            const parsed = context.parsed as number | { y?: number | null; x?: number | null } | null | undefined;
            const valueAxis = context.chart.options.indexAxis === 'y' ? 'x' : 'y';
            const raw = typeof parsed === 'number'
                ? parsed
                : Number(parsed?.[valueAxis] ?? 0);
            const label = context.dataset?.label ? `${context.dataset.label}: ` : '';
            return `${label}${formatCurrency(raw)}`;
        },
    },
};

export const darkCartesianScales = {
    x: {
        ticks: { color: tickColor, font: { size: 10 } },
        grid: { color: gridColor },
        border: { color: gridColor },
    },
    y: {
        ticks: {
            color: tickColor,
            font: { size: 10 },
            callback: (value: string | number) => formatCurrency(Number(value)),
        },
        grid: { color: gridColor },
        border: { color: gridColor },
    },
};
