import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Calendar } from './Calendar';
import { calendarDateFromIso, calendarDateToIso } from './date-picker.utils';
import { getManilaDateIso } from '@/utils/manila-date';

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

/** shadcn's Base UI Popover + Calendar composition, styled for DemoShop. */
export function DatePicker({ id, value, onChange, label = 'Filter reservations by date', className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = calendarDateFromIso(value);
  const select = (date: string) => {
    onChange(date);
    setOpen(false);
  };
  const displayDate = selected?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        aria-label={`${label}: ${displayDate || 'All dates'}`}
        className={`inline-flex min-h-9 items-center justify-between gap-2 rounded-sm border px-3 py-2 text-xs text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold cursor-pointer ${selected ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/15 bg-charcoal text-ivory-dim hover:text-ivory'} ${className}`}
      >
        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 whitespace-nowrap">{displayDate || 'All dates'}</span>
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-[1000]">
          <Popover.Popup
            data-reservation-date-picker
            aria-label={label}
            className="max-w-[calc(100vw-1rem)] rounded-md border border-white/15 bg-charcoal p-3 text-ivory shadow-2xl outline-none"
          >
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected || calendarDateFromIso(getManilaDateIso())}
              today={calendarDateFromIso(getManilaDateIso())}
              onSelect={(date) => select(date ? calendarDateToIso(date) : '')}
              autoFocus
            />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <button type="button" onClick={() => select('')} className="rounded-sm px-2 py-1 text-xs text-ivory-dim hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">All dates</button>
              <button type="button" onClick={() => select(getManilaDateIso())} className="rounded-sm px-2 py-1 text-xs font-semibold text-gold hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Today</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
