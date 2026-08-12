import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { cn } from '../lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const value: ToastContextValue = {
    showToast,
    success: (message) => showToast('success', message),
    error: (message) => showToast('error', message, 5000),
    warning: (message) => showToast('warning', message, 4000),
    info: (message) => showToast('info', message),
  };

  const icons = {
    success: <CheckCircle size={16} className="text-green-500" />,
    error: <XCircle size={16} className="text-red-500" />,
    warning: <AlertCircle size={16} className="text-yellow-500" />,
    info: <Info size={16} className="text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg animate-slide-in max-w-sm",
              bgColors[toast.type]
            )}
          >
            {icons[toast.type]}
            <span className="text-[13px] text-text-primary flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-black/5 rounded"
            >
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
