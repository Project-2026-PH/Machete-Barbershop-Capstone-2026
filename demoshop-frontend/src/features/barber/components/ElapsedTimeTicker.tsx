import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface ElapsedTimeTickerProps {
    startTimeRaw?: string | null;
    initialElapsedMinutes?: number;
}

const calculateElapsed = (startTimeStr?: string | null, fallbackMinutes: number = 0): number => {
    if (!startTimeStr) return fallbackMinutes;
    try {
        const startMs = new Date(startTimeStr).getTime();
        if (isNaN(startMs)) return fallbackMinutes;
        const diffMs = Date.now() - startMs;
        return Math.max(0, Math.floor(diffMs / 60000));
    } catch {
        return fallbackMinutes;
    }
};

export const ElapsedTimeTicker: React.FC<ElapsedTimeTickerProps> = React.memo(({
    startTimeRaw,
    initialElapsedMinutes = 0
}) => {
    const [elapsed, setElapsed] = useState<number>(() =>
        calculateElapsed(startTimeRaw, initialElapsedMinutes)
    );

    useEffect(() => {
        setElapsed(calculateElapsed(startTimeRaw, initialElapsedMinutes));

        const interval = setInterval(() => {
            setElapsed(calculateElapsed(startTimeRaw, initialElapsedMinutes));
        }, 60000);

        return () => clearInterval(interval);
    }, [startTimeRaw, initialElapsedMinutes]);

    return (
        <div className="flex items-center gap-3 bg-gold/5 border border-gold/20 px-4 py-3 rounded-sm self-start md:self-auto">
            <Clock className="w-5 h-5 text-gold animate-spin" style={{ animationDuration: '6s' }} />
            <div>
                <span className="text-[10px] uppercase tracking-widest text-ivory-dim block font-bold">Elapsed Time</span>
                <span className="text-sm font-bold text-ivory">{elapsed} mins in chair</span>
            </div>
        </div>
    );
});

ElapsedTimeTicker.displayName = 'ElapsedTimeTicker';
