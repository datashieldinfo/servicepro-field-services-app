import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const config: Record<ToastType, { icon: typeof CheckCircle; bg: string; border: string; text: string }> = {
    success: { icon: CheckCircle, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
    error: { icon: XCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
    warning: { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 inset-x-0 flex flex-col items-center gap-2 z-[100] pointer-events-none">
        {toasts.map(toast => {
          const cfg = config[toast.type];
          const Icon = cfg.icon;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto ${cfg.bg} ${cfg.border} border rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 animate-in slide-in-from-top max-w-sm`}
            >
              <Icon className={`w-5 h-5 ${cfg.text} flex-shrink-0`} />
              <span className={`text-sm font-medium ${cfg.text}`}>{toast.message}</span>
              <button onClick={() => dismiss(toast.id)} className="ms-2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
