import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast, ToastType } from './Toast';

export interface ToastOptions {
  id?: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number | null;
}

interface ToastInstance extends ToastOptions {
  id: string;
}

interface ToastContextType {
  addToast: (options: ToastOptions) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastInstance[]>([]);

  const addToast = useCallback(({ id: explicitId, type, title, message, duration }: ToastOptions): string => {
    const id = explicitId || Date.now().toString();
    setToasts((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { id, type, title, message, duration };
        return next;
      }
      return [...prev, { id, type, title, message, duration }];
    });
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 left-4 right-4 z-[9999] flex flex-col items-end gap-3 pointer-events-none sm:bottom-8 sm:left-auto sm:right-8">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast {...toast} onClose={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
