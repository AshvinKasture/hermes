import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
}

const Ctx = createContext<{ notify: (kind: Toast["kind"], text: string) => void }>({ notify: () => {} });
export const useToasts = () => useContext(Ctx);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 6000 : 3000);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === "err" ? "alert" : "status"} className={`pointer-events-auto rounded-xl border px-4 py-2 text-sm shadow-xl ${t.kind === "err" ? "border-ck-red/40 bg-ck-surface text-ck-red" : "border-ck-green/40 bg-ck-surface text-ck-green"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
