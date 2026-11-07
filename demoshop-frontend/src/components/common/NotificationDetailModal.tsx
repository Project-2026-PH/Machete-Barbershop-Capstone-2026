import React, { useEffect } from 'react';
import { X, Calendar, User, Scissors, ArrowRight, Star, Clock, Package } from 'lucide-react';
import { AppNotification } from './NotificationBell';

interface NotificationDetailModalProps {
  isOpen: boolean;
  notification: AppNotification | null;
  onClose: () => void;
  onAction?: (action: string, notification: AppNotification) => void;
}

interface ParsedDetails {
  category: string;
  title: string;
  rows: Array<{
    label: string;
    value: string;
    icon?: React.ReactNode;
    isBadge?: boolean;
    highlight?: boolean;
  }>;
  primaryLabel?: string;
  primaryAction?: string;
  secondaryLabel?: string;
}

const formatRelativeTime = (dateStr?: string): string => {
  if (!dateStr) return 'Just now';
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
};

const formatDatePretty = (rawDate?: string, rawTime?: string): string => {
  if (!rawDate && !rawTime) return '';
  let datePart = '';
  if (rawDate) {
    try {
      const d = new Date(rawDate.includes('T') ? rawDate : `${rawDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } else {
        datePart = rawDate;
      }
    } catch {
      datePart = rawDate;
    }
  }

  const timePart = rawTime ? rawTime.trim() : '';
  if (datePart && timePart) return `${datePart} • ${timePart}`;
  return datePart || timePart;
};

const parseNotification = (notification: AppNotification): ParsedDetails => {
  const msg = notification.message || '';
  const event = notification.event || '';
  const title = notification.title || '';

  if (event === 'inventory_stock_count_pending') {
    return {
      category: 'Inventory',
      title: title || 'Stock count awaiting review',
      rows: [{ label: 'SUBMISSION', value: msg }],
      primaryLabel: 'Review stock count',
      primaryAction: 'review_inventory_stock_counts',
      secondaryLabel: 'Close',
    };
  }

  if (event === 'inventory_stock_count_due') {
    const metadata = notification.metadata || {};
    const shift = String(metadata.shift || '').toLowerCase();
    const countDate = String(metadata.countDate || 'Today');
    const dueTime = String(metadata.dueTime || '');
    const branchName = String(metadata.branchName || 'Assigned branch');
    return {
      category: 'Inventory Reminder',
      title: title || `${shift === 'morning' ? 'Morning' : 'Evening'} stock count due`,
      rows: [
        { label: 'COUNT', value: `${shift === 'morning' ? 'Morning' : 'Evening'} stock count`, highlight: true },
        { label: 'BRANCH', value: branchName },
        { label: 'DATE', value: countDate },
        ...(dueTime ? [{ label: 'DUE TIME', value: dueTime }] : []),
        { label: 'REMINDER', value: msg },
      ],
      primaryLabel: 'Record stock count',
      primaryAction: 'record_inventory_stock_count',
      secondaryLabel: 'Close',
    };
  }

  // 1. Cashier New Reservation Request
  if (event === 'cashier_reservation_pending' || title.toLowerCase().includes('new reservation')) {
    let customer = 'Customer';
    const subMatch = msg.match(/^(.+?)\s+(?:submitted|sent)\s+(?:reservation fee proof|a reservation request)/i);
    if (subMatch) customer = subMatch[1].trim();

    let refNo = '';
    const refMatch = msg.match(/\(Ref:\s*#?([A-Za-z0-9]+)\)/i);
    if (refMatch) refNo = refMatch[1].trim();

    let dateTime = '';
    const dateMatch = msg.match(/for\s+(\d{4}-\d{2}-\d{2})\s+at\s+([0-9:AMPMapm\s]+?)(?:\.|$)/i);
    if (dateMatch) {
      dateTime = formatDatePretty(dateMatch[1], dateMatch[2]);
    } else {
      const generalDate = msg.match(/for\s+([^\.]+?)(?:\.|$)/i);
      if (generalDate) dateTime = generalDate[1].trim();
    }

    let barber = 'Any Barber';
    const barberMatch = msg.match(/with\s+([A-Za-z0-9\s]+?)(?:\.|\s+at|\s+for|$)/i);
    if (barberMatch) barber = barberMatch[1].trim();

    let service = 'Classic Haircut';
    const serviceMatch = msg.match(/for\s+(.+?)\s+with/i);
    if (serviceMatch) service = serviceMatch[1].trim();

    const rows: ParsedDetails['rows'] = [
      { label: 'CUSTOMER', value: customer, icon: <User className="w-3.5 h-3.5 text-gold" />, highlight: true },
    ];

    if (refNo) {
      rows.push({
        label: 'RESERVATION FEE REF #',
        value: `#${refNo}`,
        icon: <Star className="w-3.5 h-3.5 text-gold" />,
        isBadge: true,
      });
    }

    rows.push(
      { label: 'DATE & TIME', value: dateTime || 'Upcoming appointment', icon: <Calendar className="w-3.5 h-3.5 text-gold" /> },
      { label: 'BARBER', value: barber, icon: <Scissors className="w-3.5 h-3.5 text-gold" /> },
      { label: 'SERVICE AVAILED', value: service, isBadge: true },
    );

    return {
      category: 'New Reservation',
      title: 'Reservation Request',
      rows,
      primaryLabel: 'Review Queue',
      primaryAction: 'review_queue',
      secondaryLabel: 'Close',
    };
  }

  // 2. Customer Reservation Pending
  if (event === 'reservation_pending' || title.toLowerCase().includes('reservation submitted')) {
    let dateTime = '';
    const dateMatch = msg.match(/for\s+(\d{4}-\d{2}-\d{2})\s+at\s+([0-9:AMPMapm\s]+?)(?:\s+is|\.|$)/i);
    if (dateMatch) dateTime = formatDatePretty(dateMatch[1], dateMatch[2]);

    return {
      category: 'Booking Status',
      title: 'Reservation Submitted',
      rows: [
        { label: 'Schedule', value: dateTime || 'Requested Slot', icon: <Calendar className="w-3.5 h-3.5 text-gold" /> },
        { label: 'Status', value: 'Pending Cashier Approval', isBadge: true },
      ],
      secondaryLabel: 'Close',
    };
  }

  // 3. Reservation Confirmed / Rebook Accepted / Assigned to Barber
  if (event === 'reservation_confirmed' || event === 'barber_reservation_assigned' || title.toLowerCase().includes('confirmed') || title.toLowerCase().includes('assigned') || title.toLowerCase().includes('accepted rebook')) {
    let customer = '';
    const custMatch = msg.match(/^(.+?)\s+accepted the rebook/i) || msg.match(/assigned to serve\s+([^on\.]+?)\s+on/i);
    if (custMatch) customer = custMatch[1].trim();

    let barber = '';
    const barbMatch = msg.match(/in\s+(.+?)'s queue/i);
    if (barbMatch) barber = barbMatch[1].trim();

    let schedule = '';
    const dateMatch = msg.match(/on\s+([A-Za-z0-9,\s]+?)\s+at\s+([0-9:AMPMapm\s]+?)(?:\.|$)/i);
    if (dateMatch) schedule = `${dateMatch[1].trim()} at ${dateMatch[2].trim()}`;

    const rows: ParsedDetails['rows'] = [];
    if (customer) rows.push({ label: 'Customer', value: customer, icon: <User className="w-3.5 h-3.5 text-gold" /> });
    if (barber) rows.push({ label: 'Barber', value: barber, icon: <Scissors className="w-3.5 h-3.5 text-gold" /> });
    if (schedule) rows.push({ label: 'Schedule', value: schedule, icon: <Calendar className="w-3.5 h-3.5 text-gold" /> });
    rows.push({ label: 'Status', value: 'Confirmed & In Queue', isBadge: true });

    return {
      category: 'Confirmed',
      title: title || 'Reservation Confirmed',
      rows,
      primaryLabel: 'View Queue',
      primaryAction: 'review_queue',
      secondaryLabel: 'Close',
    };
  }

  // 4. Customer Cancelled Booking
  if (event === 'reservation_cancelled' || title.toLowerCase().includes('cancelled')) {
    const metadata = notification.metadata || {};
    let customer = 'Customer';
    const nameMatch = msg.match(/for customer\s+([^on\.]+?)\s+on/i) || msg.match(/^(.+?)\s+\d+/i) || msg.match(/^(.+?)\s+booking/i);
    if (nameMatch) customer = nameMatch[1].trim();
    if (typeof metadata.customerName === 'string' && metadata.customerName.trim()) {
      customer = metadata.customerName.trim();
    }

    let barber = '';
    const barbMatch = msg.match(/with\s+([A-Za-z0-9\s]+?)\s+was cancelled/i);
    if (barbMatch) barber = barbMatch[1].trim();
    if (typeof metadata.barberName === 'string' && metadata.barberName.trim()) {
      barber = metadata.barberName.trim();
    }

    let schedule = '';
    const dateMatch = msg.match(/on\s+([A-Za-z0-9,\s]+?)\s+at\s+([0-9:AMPMapm\s]+?)\s+was cancelled/i);
    if (dateMatch) schedule = `${dateMatch[1].trim()} at ${dateMatch[2].trim()}`;

    let reason = 'Schedule conflict';
    const reasonMatch = msg.match(/Reason:\s*([^.]+)/i);
    if (reasonMatch) reason = reasonMatch[1].trim();
    if (typeof metadata.reason === 'string' && metadata.reason.trim()) {
      reason = metadata.reason.trim();
    }

    const rows: ParsedDetails['rows'] = [
      { label: 'Customer', value: customer, icon: <User className="w-3.5 h-3.5 text-gold" /> },
    ];
    if (barber) rows.push({ label: 'Barber', value: barber, icon: <Scissors className="w-3.5 h-3.5 text-gold" /> });
    if (schedule) rows.push({ label: 'Schedule', value: schedule, icon: <Calendar className="w-3.5 h-3.5 text-gold" /> });
    rows.push({ label: 'Reason', value: reason });
    rows.push({ label: 'Slot Status', value: 'Slot Available', isBadge: true });

    return {
      category: 'Cancellation',
      title: 'Booking Cancelled',
      rows,
      primaryLabel: 'Check Queue',
      primaryAction: 'review_queue',
      secondaryLabel: 'Close',
    };
  }

  // 5. Reservation Declined
  if (event === 'reservation_declined' || title.toLowerCase().includes('declined')) {
    let reason = 'Front desk scheduling conflict';
    const reasonMatch = msg.match(/Reason:\s*([^.]+)/i);
    if (reasonMatch) reason = reasonMatch[1].trim();

    return {
      category: 'Notice',
      title: 'Appointment Declined',
      rows: [
        { label: 'Reason', value: reason },
        { label: 'Next Step', value: 'Reschedule Available in Dashboard', isBadge: true },
      ],
      secondaryLabel: 'Close',
    };
  }

  // 6. Feedback Received
  if (event === 'barber_feedback_received' || title.toLowerCase().includes('feedback')) {
    const starMatch = msg.match(/(\d+)\s+stars?/i);
    const stars = starMatch ? `${'★'.repeat(Number(starMatch[1]))} (${starMatch[1]} Stars)` : '5 Stars';
    const testMatch = msg.match(/testimonial:\s*"([^"]+)"/i);
    const testimonial = testMatch ? `"${testMatch[1]}"` : 'Customer left positive feedback';

    return {
      category: 'Client Review',
      title: 'Customer Feedback',
      rows: [
        { label: 'Rating', value: stars, icon: <Star className="w-3.5 h-3.5 text-gold fill-gold" />, highlight: true },
        { label: 'Testimonial', value: testimonial },
      ],
      secondaryLabel: 'Close',
    };
  }

  // 7. Shift Request
  if (event.includes('shift') || title.toLowerCase().includes('shift')) {
    return {
      category: 'Staff Request',
      title: title || 'Shift Request',
      rows: [
        { label: 'Details', value: msg },
      ],
      primaryLabel: 'Review Requests',
      primaryAction: 'view_shift_requests',
      secondaryLabel: 'Close',
    };
  }

  // Role & Permissions Update
  if (event === 'user_role_updated' || title.toLowerCase().includes('role')) {
    return {
      category: 'Security & Permissions',
      title: title || 'Account Role Updated',
      rows: [
        { label: 'STATUS', value: 'Role Modified', isBadge: true, highlight: true },
        { label: 'DETAILS', value: msg },
      ],
      secondaryLabel: 'Understood',
    };
  }

  // Stock Request Notifications
  if (
    event.startsWith('inventory_purchase_order') ||
    title.toLowerCase().includes('stock request')
  ) {
    const poNumberMatch = msg.match(/(SR-\d{4}-\d+|SR-[A-Za-z0-9-]+)/i);
    const poNumber = poNumberMatch ? poNumberMatch[1] : '';

    const isPending = event === 'inventory_purchase_order_pending' || title.toLowerCase().includes('awaiting review');
    const isApproved = event === 'inventory_purchase_order_approved' || title.toLowerCase().includes('approved');

    const statusLabel = isPending ? 'Pending review' : (isApproved ? 'Approved' : 'Rejected');

    const rows: ParsedDetails['rows'] = [
      {
        label: 'STATUS',
        value: statusLabel,
        isBadge: true,
        highlight: isPending,
      },
    ];

    if (poNumber) {
      rows.push({
        label: 'STOCK REQUEST NUMBER',
        value: poNumber,
        icon: <Package className="w-3.5 h-3.5 text-gold" />,
        isBadge: true,
      });
    }

    rows.push({ label: 'DETAILS', value: msg });

    return {
      category: 'Stock Request',
      title: title || 'Stock Request',
      rows,
      primaryLabel: 'View Stock Requests',
      primaryAction: 'view_purchase_orders',
      secondaryLabel: 'Close',
    };
  }

  // Generic fallback
  return {
    category: 'Notification',
    title: title || 'Notification',
    rows: [
      { label: 'Message', value: msg },
    ],
    secondaryLabel: 'Close',
  };
};

export const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  isOpen,
  notification,
  onClose,
  onAction,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !notification) return null;

  const parsed = parseNotification(notification);
  const timeAgo = formatRelativeTime(notification.created_at);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Backdrop with smooth blur */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in cursor-pointer"
        onClick={onClose}
      />

      {/* DemoShop Brand Modal Box */}
      <div
        className="relative w-full max-w-md bg-charcoal border border-white/10 rounded-sm shadow-2xl shadow-black animate-zoom-in flex flex-col z-10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gold Accent Line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-gold to-transparent opacity-80" />

        {/* Modal Header */}
        <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse shadow-[0_0_6px_#d4af37]" />
              <span className="text-[10px] text-gold uppercase tracking-widest font-bold">
                {parsed.category}
              </span>
              <span className="text-[10px] text-ivory-dim/50 font-mono ml-1">
                • {timeAgo}
              </span>
            </div>
            <h3 className="text-lg font-serif font-bold text-ivory tracking-wide">
              {parsed.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-ivory-dim hover:text-gold transition-colors p-1 hover:bg-white/5 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Structured Data Content Panel */}
        <div className="p-5">
          <div className="bg-charcoal-light/60 border border-white/5 rounded-sm p-4 divide-y divide-white/5 space-y-3">
            {parsed.rows.map((row, idx) => (
              <div
                key={idx}
                className={`flex items-baseline justify-between gap-4 ${idx > 0 ? 'pt-3' : ''}`}
              >
                <div className="flex items-center gap-1.5 text-ivory-dim/70 shrink-0">
                  {row.icon}
                  <span className="text-xs uppercase tracking-wider font-semibold">
                    {row.label}
                  </span>
                </div>

                <div className="text-right">
                  {row.isBadge ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-xs font-semibold bg-gold/10 text-gold border border-gold/20 shadow-sm">
                      {row.value}
                    </span>
                  ) : (
                    <span className={`text-sm font-semibold ${row.highlight ? 'text-gold' : 'text-ivory'}`}>
                      {row.value}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs uppercase tracking-wider font-bold text-ivory-dim hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm transition-all cursor-pointer"
          >
            {parsed.secondaryLabel || 'Close'}
          </button>

          {parsed.primaryLabel && (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (parsed.primaryAction) {
                  onAction?.(parsed.primaryAction, notification);
                }
              }}
              className="px-5 py-2 text-xs uppercase tracking-wider font-bold text-black bg-gold hover:bg-gold-dim border border-gold rounded-sm transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <span>{parsed.primaryLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationDetailModal;
