import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, []);

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onKeyDown={(e) => {
        const btns = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") btns[(i + 1) % btns.length]?.focus();
        else if (e.key === "ArrowUp") btns[(i - 1 + btns.length) % btns.length]?.focus();
        else return;
        e.preventDefault();
      }}
      className="fixed z-50 w-52 rounded-xl border border-ck-border bg-ck-surface p-1 shadow-2xl shadow-black/50"
    >
      {items.map((it, i) => (
        <div key={i}>
          {it.separator && <div className="my-1 border-t border-ck-border" />}
          <button
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition focus:outline-none disabled:opacity-40 ${
              it.danger ? "text-ck-red hover:bg-ck-red/10 focus:bg-ck-red/10" : "hover:bg-ck-raised focus:bg-ck-raised"
            }`}
          >
            {it.label}
            {it.hint && <span className="text-xs text-ck-muted">{it.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
