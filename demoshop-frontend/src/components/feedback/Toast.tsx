import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { Notification } from '@demoshop/shared-types';

export type ToastType = Notification['type'] | 'loading';

interface ToastProps {
  id: string;
  type?: ToastType;
  title?: string;
  message: string;
  onClose: (id: string) => void;
  duration?: number | null;
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
  loading: <Loader2 className="w-5 h-5 text-gold animate-spin" />,
};

const borderColors: Record<ToastType, string> = {
  success: 'border-green-500/30',
  error: 'border-red-500/30',
  info: 'border-blue-500/30',
  warning: 'border-yellow-500/30',
  loading: 'border-gold/40',
};

export const Toast: React.FC<ToastProps> = ({ 
  id, 
  type = 'info', 
  title, 
  message, 
  onClose, 
  duration 
}) => {
  const effectiveDuration = duration !== undefined ? duration : (type === 'loading' ? null : 5000);

  useEffect(() => {
    if (effectiveDuration === null) return;
    const timer = setTimeout(() => {
      onClose(id);
    }, effectiveDuration);

    return () => clearTimeout(timer);
  }, [id, effectiveDuration, onClose]);

  return (
    <div className={`
      relative flex w-full sm:w-auto min-w-0 sm:min-w-[320px] max-w-md items-start gap-4 p-4 rounded-sm border bg-charcoal-light/95 backdrop-blur-md shadow-2xl animate-fade-in
      ${borderColors[type]}
    `}>
      <div className="shrink-0 mt-0.5">
        {icons[type]}
      </div>
      
      <div className="min-w-0 flex-1 mr-2">
        {title && <h4 className="text-sm font-bold text-ivory mb-1">{title}</h4>}
        <p className="text-xs text-ivory-dim leading-relaxed whitespace-pre-line break-words">{message}</p>
      </div>

      <button 
        onClick={() => onClose(id)}
        className="text-ivory-dim hover:text-ivory transition-colors shrink-0 cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress Bar (hidden during active loading) */}
      {effectiveDuration !== null && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-current opacity-20 w-full overflow-hidden rounded-b-sm">
          <div 
            className={`h-full ${
              type === 'success' ? 'bg-green-400' :
              type === 'error' ? 'bg-red-400' :
              type === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'
            } animate-[cut-progress_linear_forwards]`}
            style={{ animationDuration: `${effectiveDuration}ms` }}
          ></div>
        </div>
      )}
    </div>
  );
};
