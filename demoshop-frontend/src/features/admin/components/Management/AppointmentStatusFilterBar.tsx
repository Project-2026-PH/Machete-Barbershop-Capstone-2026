import React from 'react';
import type { AppointmentFilterStatus } from '@demoshop/shared-types';

export interface StatusFilterItem {
  value: AppointmentFilterStatus;
  label: string;
  getCount: (counts: {
    all: number;
    upcoming: number;
    completed: number;
    cancelled_no_show: number;
    pending?: number;
    confirmed?: number;
  }) => number;
}

const FILTER_ITEMS: StatusFilterItem[] = [
  { value: 'ALL', label: 'All', getCount: (c) => c.all },
  { value: 'PENDING', label: 'Pending Approval', getCount: (c) => c.pending ?? 0 },
  { value: 'UPCOMING', label: 'Upcoming', getCount: (c) => c.upcoming },
  { value: 'COMPLETED', label: 'Completed', getCount: (c) => c.completed },
  { value: 'CANCELLED_NO_SHOW', label: 'Cancelled / No-Show', getCount: (c) => c.cancelled_no_show },
];

export interface AppointmentStatusFilterBarProps {
  activeStatus: AppointmentFilterStatus;
  counts: {
    all: number;
    upcoming: number;
    completed: number;
    cancelled_no_show: number;
    pending?: number;
    confirmed?: number;
  };
  onSelectStatus: (status: AppointmentFilterStatus) => void;
  className?: string;
}

export const AppointmentStatusFilterBar: React.FC<AppointmentStatusFilterBarProps> = ({
  activeStatus = 'ALL',
  counts,
  onSelectStatus,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      aria-label="Appointment status filter bar"
      className={`flex items-center bg-charcoal border border-white/10 p-1 rounded-sm overflow-x-auto shrink-0 touch-pan-x [-webkit-overflow-scrolling:touch] scrollbar-none shadow-xs ${className}`}
    >
      {FILTER_ITEMS.map((item) => {
        const isActive = activeStatus === item.value;
        const count = item.getCount(counts);

        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onSelectStatus(item.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 select-none min-h-[34px] ${
              isActive
                ? 'bg-gold text-charcoal shadow-sm font-bold'
                : 'text-ivory-dim hover:text-ivory hover:bg-white/[0.04]'
            }`}
          >
            <span>{item.label}</span>
            <span
              className={`px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold leading-none ${
                isActive
                  ? 'bg-charcoal text-gold'
                  : 'bg-white/10 text-ivory-dim'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default AppointmentStatusFilterBar;
