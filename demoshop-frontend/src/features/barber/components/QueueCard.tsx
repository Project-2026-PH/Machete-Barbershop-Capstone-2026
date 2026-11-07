import React, { useState, useCallback } from 'react';
import { Scissors, Camera, Copy, Check } from 'lucide-react';

export interface QueueItem {
    id: string;
    rawId: number;
    name: string;
    type: 'Walk-in' | 'Reservation' | 'Barber-Initiated';
    eta: string;
    estimatedCompletion?: string;
    isFutureScheduled?: boolean;
    dateContext?: string;
    fullDisplay?: string;
    countdownSeconds?: number;
    status: 'Waiting' | 'Arrived' | 'No-Show' | 'Expired';
    styleRef: string;
    guestRef?: string;
    lastHaircutPhoto?: string;
    rawItem?: any;
}

interface QueueCardProps {
    item: QueueItem;
    index: number;
    onViewPhoto: (name: string, photoUrl: string) => void;
}

export const QueueCard: React.FC<QueueCardProps> = React.memo(({
    item,
    index,
    onViewPhoto
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopyRef = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const textToCopy = item.guestRef || item.id;
        if (textToCopy) {
            void navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [item.guestRef, item.id]);

    const isNextInLine = index === 0 && !item.isFutureScheduled;

    return (
        <div
            className={`group relative bg-charcoal border p-3 sm:p-4 rounded-sm transition-all duration-300 flex gap-2.5 sm:gap-3.5 animate-queue-move shadow-inner ${
                isNextInLine 
                    ? 'border-gold/40 shadow-[0_0_15px_rgba(212,175,55,0.12)] hover:border-gold' 
                    : 'border-white/10 hover:border-gold/40'
            }`}
            style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'both' }}
        >
            {/* Left Accent Bar */}
            <div className={`w-1.5 rounded-full bg-gradient-to-b flex-shrink-0 self-stretch transition-colors ${
                isNextInLine 
                    ? 'from-gold via-amber-400 to-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]' 
                    : 'from-gold/60 via-gold/30 to-transparent'
            }`}></div>

            {/* Main Card Content */}
            <div className="flex-1 space-y-2.5 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        {/* Prominent Queue Position Badge */}
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-sm flex items-center justify-center font-mono font-bold text-xs flex-shrink-0 ${
                            isNextInLine 
                                ? 'bg-gold text-charcoal shadow-[0_0_12px_rgba(212,175,55,0.35)]' 
                                : 'bg-gold/15 border border-gold/40 text-gold'
                        }`}>
                            #{index + 1}
                        </div>

                        {/* Customer Avatar Circle */}
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30 flex items-center justify-center font-serif text-gold font-bold text-xs shadow-inner flex-shrink-0">
                            {item.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-xs border ${
                                    item.type === 'Reservation' ? 'bg-gold/15 text-gold border-gold/30' :
                                    item.type === 'Walk-in' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' :
                                    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                }`}>
                                    {item.type}
                                </span>
                                {isNextInLine && (
                                    <span className="text-[8px] font-bold font-mono tracking-widest uppercase bg-gold/10 text-gold px-1.5 py-0.5 rounded-xs border border-gold/30 animate-pulse">
                                        NEXT
                                    </span>
                                )}
                            </div>
                            <h5 className="font-bold text-ivory text-sm mt-0.5 group-hover:text-gold transition-colors truncate min-w-0 max-w-[130px] sm:max-w-[220px] md:max-w-[340px] lg:max-w-[200px] xl:max-w-[280px]" title={item.name}>{item.name}</h5>
                        </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                        {item.dateContext && (
                            <span className="text-[9px] font-mono font-bold text-ivory-dim uppercase tracking-wider block bg-white/5 px-1.5 py-0.5 rounded-xs border border-white/5 mb-0.5">
                                {item.dateContext}
                            </span>
                        )}
                        <span className="text-xs font-serif font-bold text-gold block tracking-wide">{item.eta}</span>
                        {item.estimatedCompletion && (
                            <span className="text-[9px] text-ivory-dim block mt-0.5">Est. completion {item.estimatedCompletion}</span>
                        )}
                        {item.status === 'Expired' && (
                            <span className="text-[9px] font-mono text-red-400 font-bold block mt-0.5 bg-red-500/10 px-1.5 py-0.5 rounded-xs border border-red-500/20">
                                Grace Expired
                            </span>
                        )}
                    </div>
                </div>

                {/* Specification & Reference Code with 1-Click Copy */}
                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 gap-2">
                    <span className="text-ivory-dim font-medium flex items-center gap-1.5 min-w-0 flex-1">
                        <Scissors className="w-3 h-3 text-gold/70 flex-shrink-0" />
                        <span className="truncate max-w-[150px] sm:max-w-[240px] md:max-w-[320px] lg:max-w-none" title={item.styleRef}>{item.styleRef}</span>
                    </span>

                    {item.guestRef && (
                        <button
                            onClick={handleCopyRef}
                            className="text-[10px] font-mono text-gold/90 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gold/40 px-2 py-0.5 rounded-xs transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                            title="Copy Reference Code"
                        >
                            <span>Ref: {item.guestRef}</span>
                            {copied ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                                <Copy className="w-3 h-3 text-gold/70 hover:text-gold" />
                            )}
                        </button>
                    )}
                </div>

                {/* Haircut Photo Badge if available */}
                {item.lastHaircutPhoto && (
                    <div className="flex items-center justify-between bg-gold/5 border border-gold/20 p-2 rounded-sm mt-1">
                        <div className="flex items-center gap-2">
                            <Camera className="w-3.5 h-3.5 text-gold" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gold">Haircut Photo Reference</span>
                        </div>
                        <button
                            onClick={() => onViewPhoto(item.name, item.lastHaircutPhoto!)}
                            className="flex items-center gap-1.5 px-2 py-1 bg-gold/10 hover:bg-gold/20 border border-gold/30 rounded-xs text-[10px] font-semibold text-gold transition-colors cursor-pointer"
                        >
                            <img
                                src={item.lastHaircutPhoto}
                                alt="Haircut photo"
                                className="w-5 h-5 rounded-xs object-cover"
                            />
                            <span>View Photo</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

QueueCard.displayName = 'QueueCard';
