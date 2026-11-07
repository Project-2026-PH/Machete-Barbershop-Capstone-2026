import React, { useState, useEffect, memo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface PayTimerChipProps {
  initialSeconds?: number;
  onExpire: () => void;
}

export const PayTimerChip: React.FC<PayTimerChipProps> = memo(({
  initialSeconds = 900,
  onExpire,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (isExpired) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isExpired, onExpire]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isUrgent = secondsLeft <= 180 && !isExpired; // <= 3 minutes

  if (isExpired) {
    return (
      <div
        role="alert"
        className="sticky top-0 z-20 mb-4 p-3 rounded-md bg-red-500/20 border border-red-500/40 text-red-200 flex items-center justify-between gap-3 shadow-lg backdrop-blur-md"
      >
        <div className="flex items-center gap-2 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>Time's up! Your slot hold has expired.</span>
        </div>
        <button
          type="button"
          onClick={onExpire}
          className="text-xs font-bold text-red-300 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
        >
          Pick a new slot
        </button>
      </div>
    );
  }

  return (
    <div
      role="timer"
      aria-live="off"
      className={`sticky top-0 z-20 mb-4 px-3.5 py-2 rounded-full border transition-all duration-300 flex items-center justify-between gap-2.5 shadow-md backdrop-blur-md ${isUrgent
        ? 'bg-red-500/15 border-red-500/50 text-red-300 animate-pulse'
        : 'bg-charcoal-light/90 border border-gold/30 text-ivory-dim'
        }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Clock className={`w-3.5 h-3.5 ${isUrgent ? 'text-red-400' : 'text-gold'}`} />
        <span className="font-medium">Slot held for you:</span>
      </div>
      <div className="font-mono text-xs font-bold tracking-wider">
        <span className={isUrgent ? 'text-red-300' : 'text-gold'}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
});

PayTimerChip.displayName = 'PayTimerChip';
