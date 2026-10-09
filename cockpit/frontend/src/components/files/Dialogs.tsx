import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Give focus back to whatever had it (the file list) when the dialog closes, so keyboard
  // shortcuts keep working and Escape doesn't act on the list behind the dialog.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-ck-border bg-ck-surface p-5 shadow-2xl">
        <h3 className="font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

interface PromptProps {
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}

export function PromptDialog({ title, label, initial = "", submitLabel, validate, onSubmit, onClose }: PromptProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    // Select the name without its extension, like a desktop file manager.
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate?.(value) ?? null;
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label className="block text-sm text-ck-muted">
          {label}
          <input
            ref={input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            className="mt-1 block w-full rounded-lg border border-ck-border bg-ck-raised px-3 py-2 text-ck-text outline-none focus:border-ck-accent"
          />
        </label>
        {error && <p role="alert" className="text-sm text-ck-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-ck-border px-3 py-1.5 text-sm transition hover:bg-ck-raised">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-ck-accent px-3 py-1.5 text-sm font-medium text-ck-bg transition hover:brightness-110 disabled:opacity-50">{submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onClose }: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // Focus Cancel first: Enter or Space must never confirm a destructive action by accident.
  useEffect(() => cancel.current?.focus(), []);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mt-1 text-sm text-ck-muted">{message}</p>
      {error && <p role="alert" className="mt-2 text-sm text-ck-red">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button ref={cancel} onClick={onClose} className="rounded-lg border border-ck-border px-3 py-1.5 text-sm transition hover:bg-ck-raised">Cancel</button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
              setBusy(false);
            }
          }}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-ck-bg transition hover:brightness-110 disabled:opacity-50 ${danger ? "bg-ck-red" : "bg-ck-accent"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
