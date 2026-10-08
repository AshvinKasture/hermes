import type { ReactNode } from "react";

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-ck-border bg-ck-surface p-5 shadow-lg shadow-black/20 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-medium uppercase tracking-wider text-ck-muted">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
