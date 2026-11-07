export const todayInManila = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export const errorMessage = (error: any, fallback: string): string =>
  error?.response?.data?.message || error?.response?.data?.error || fallback;

export const formatDateTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleString() : '—';

export const statusClass: Record<string, string> = {
  draft: 'border-white/20 bg-white/5 text-ivory-dim',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  approved: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  rejected: 'border-red-400/30 bg-red-400/10 text-red-300',
  fulfilled: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

// Display labels for the persisted purchase_orders.status values.
export const purchaseOrderStatusLabel: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  fulfilled: 'Fulfilled',
};

export const formatPurchaseOrderStatus = (status?: string | null): string =>
  (status && purchaseOrderStatusLabel[status]) || status || '—';
export const formatUnit = (quantity: number, unit?: string | null): string => {
  if (!unit) return '';
  const trimmed = unit.trim();
  if (!trimmed) return '';
  if (Math.abs(quantity) === 1) return trimmed;

  const lower = trimmed.toLowerCase();
  if (lower === 'pc') return 'pcs';
  if (lower === 'box') return 'boxes';
  if (lower.endsWith('s')) return trimmed;
  return `${trimmed}s`;
};
