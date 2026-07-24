import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}
interface ToastApi {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      5_000,
    );
  }, []);
  const api = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.message}
            <button
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((current) => current.filter((item) => item.id !== toast.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// The hook intentionally shares the provider's private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within ToastProvider");
  return api;
}
