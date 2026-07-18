import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastMsg {
  text: string;
  kind: 'info' | 'error';
}

interface ToastApi {
  notify(text: string): void;
  fail(text: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (text: string, kind: 'info' | 'error') => {
    setMsg({ text, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), kind === 'error' ? 6000 : 3000);
  };

  const api = useMemo<ToastApi>(
    () => ({ notify: (t) => show(t, 'info'), fail: (t) => show(t, 'error') }),
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {msg && <div className={`toast${msg.kind === 'error' ? ' error' : ''}`}>{msg.text}</div>}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
