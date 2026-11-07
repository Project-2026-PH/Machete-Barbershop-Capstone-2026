import React, { useEffect, ReactNode } from 'react';
import { X } from 'lucide-react';
import Portal from '@/components/common/Portal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  sidebarOffset?: boolean;
  bodyClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer, 
  headerExtra,
  size = 'md',
  sidebarOffset = false,
  bodyClassName = '',
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    '2xl': 'max-w-7xl'
  };

  return (
    <Portal>
      <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${sidebarOffset ? 'lg:pl-[17rem]' : ''}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 transform-gpu will-change-transform animate-fade-in"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className={`relative w-full ${sizes[size]} bg-charcoal text-ivory system-admin-scope border border-white/10 rounded-sm shadow-2xl animate-zoom-in flex flex-col max-h-[90vh] transform-gpu will-change-transform`}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h3 className="text-xl font-serif font-bold text-ivory">{title}</h3>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              onClick={onClose}
              className="text-ivory-dim hover:text-gold transition-colors p-1 hover:bg-white/5 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`p-6 overflow-y-auto custom-scrollbar ${bodyClassName}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
      </div>
    </Portal>
  );
};
