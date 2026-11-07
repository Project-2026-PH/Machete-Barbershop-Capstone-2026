import React, { useState, useEffect } from 'react';
import { Clock, Save, RotateCcw, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface BusinessHourDay {
  day: string;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

interface BusinessHoursProps {
  initialHours: BusinessHourDay[];
  onSave: (hours: BusinessHourDay[]) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

const formatTime12h = (time24: string): string => {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr) || 0;
  if (isNaN(h)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
};

export const BusinessHoursSection: React.FC<BusinessHoursProps> = ({
  initialHours,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [hours, setHours] = useState<BusinessHourDay[]>(initialHours);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHours(initialHours);
  }, [initialHours]);

  const isDirty = JSON.stringify(hours) !== JSON.stringify(initialHours);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleToggleOpen = (dayIndex: number) => {
    setHours((prev) => {
      const next = [...prev];
      next[dayIndex] = { ...next[dayIndex], isOpen: !next[dayIndex].isOpen };
      return next;
    });
  };

  const handleTimeChange = (dayIndex: number, field: 'openTime' | 'closeTime', val: string) => {
    setHours((prev) => {
      const next = [...prev];
      next[dayIndex] = { ...next[dayIndex], [field]: val };
      return next;
    });
  };

  const handleReset = () => {
    setHours(initialHours);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate opening < closing for every open day
    for (const item of hours) {
      if (item.isOpen) {
        if (!item.openTime || !item.closeTime) {
          setError(`Please specify both opening and closing times for ${item.day}.`);
          return;
        }
        if (item.openTime >= item.closeTime) {
          setError(`Invalid hours for ${item.day}: Opening time (${formatTime12h(item.openTime)}) must be earlier than closing time (${formatTime12h(item.closeTime)}).`);
          return;
        }
      }
    }

    await onSave(hours);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
          <Clock className="w-5 h-5 text-gold" /> Operating Business Hours
        </h3>
        <p className="text-xs text-ivory-dim mt-1">
          Configured hours dictate customer booking availability slots and operating hours displayed in the website footer.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          {hours.map((schedule, idx) => {
            const hasTimeError = schedule.isOpen && schedule.openTime && schedule.closeTime && schedule.openTime >= schedule.closeTime;

            return (
              <div
                key={schedule.day}
                className={`p-4 rounded border transition-all ${
                  schedule.isOpen
                    ? hasTimeError
                      ? 'bg-red-500/5 border-red-500/30'
                      : 'bg-white/[0.02] border-white/10 hover:border-gold/30'
                    : 'bg-charcoal/50 border-white/5 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleOpen(idx)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        schedule.isOpen ? 'bg-gold' : 'bg-white/20'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-charcoal shadow ring-0 transition duration-200 ease-in-out ${
                          schedule.isOpen ? 'translate-x-5 bg-charcoal' : 'translate-x-0 bg-white'
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-sm font-bold text-ivory block">{schedule.day}</span>
                      <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${
                        schedule.isOpen ? 'text-emerald-400' : 'text-ivory-dim'
                      }`}>
                        {schedule.isOpen ? 'OPEN' : 'CLOSED'}
                      </span>
                    </div>
                  </div>

                  {schedule.isOpen ? (
                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-ivory-dim">From</label>
                        <input
                          type="time"
                          value={schedule.openTime}
                          onChange={(e) => handleTimeChange(idx, 'openTime', e.target.value)}
                          className="bg-charcoal border border-white/15 px-2.5 py-1.5 text-xs text-ivory rounded focus:border-gold focus:outline-none"
                        />
                      </div>
                      <span className="text-ivory-dim text-xs">→</span>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-ivory-dim">To</label>
                        <input
                          type="time"
                          value={schedule.closeTime}
                          onChange={(e) => handleTimeChange(idx, 'closeTime', e.target.value)}
                          className="bg-charcoal border border-white/15 px-2.5 py-1.5 text-xs text-ivory rounded focus:border-gold focus:outline-none"
                        />
                      </div>
                      <span className="text-[11px] font-mono text-gold/90 ml-2 hidden md:inline">
                        ({formatTime12h(schedule.openTime)} – {formatTime12h(schedule.closeTime)})
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-ivory-dim/60 italic">
                      Shop closed on this day (No booking slots generated)
                    </div>
                  )}
                </div>

                {hasTimeError && (
                  <p className="text-[11px] text-red-400 mt-2 font-medium">
                    ⚠️ Opening time must be earlier than closing time.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 text-xs text-ivory-dim hover:text-white min-h-[44px] w-full sm:w-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty || isSaving}
            className="flex items-center justify-center gap-2 px-6 min-h-[44px] w-full sm:w-auto text-xs sm:text-sm"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving Changes...' : 'Save Business Hours'}
          </Button>
        </div>
      </form>
    </div>
  );
};
