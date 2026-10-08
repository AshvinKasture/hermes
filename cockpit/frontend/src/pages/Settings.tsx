import { useState, type FormEvent } from "react";
import { Card } from "../components/Card";
import { useFetch } from "../hooks";
import { fetchSettings, saveSettings, type Settings as SettingsData } from "../lib/metrics";

export function Settings() {
  const { data, error, loading } = useFetch(fetchSettings, []);
  if (loading) return <p className="text-ck-muted">Loading settings…</p>;
  if (error || !data) return <p role="alert" className="text-ck-red">Could not load settings: {error}</p>;
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }: { initial: SettingsData }) {
  const [value, setValue] = useState(String(initial.retentionDays));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { min, max } = initial.limits;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const days = Number(value);
    if (!Number.isInteger(days) || days < min || days > max) {
      setMsg({ kind: "err", text: `Enter a whole number of days between ${min} and ${max}.` });
      return;
    }
    setSaving(true);
    try {
      const res = await saveSettings(days);
      setMsg({ kind: "ok", text: res.pruned > 0 ? `Saved. Removed ${res.pruned} older samples.` : "Saved." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card title="Metrics history">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <label className="block text-sm">
            <span className="text-ck-text">Retention (days)</span>
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 block w-40 rounded-lg border border-ck-border bg-ck-raised px-3 py-2 text-ck-text"
            />
            <span className="mt-1 block text-xs text-ck-muted">
              Samples older than this are deleted. Allowed {min}–{max} days, default 90. Lowering it deletes older data immediately.
            </span>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-ck-accent px-4 py-2 text-sm font-medium text-ck-bg transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {msg && (
            <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-ck-red" : "text-ck-green"}`}>
              {msg.text}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
