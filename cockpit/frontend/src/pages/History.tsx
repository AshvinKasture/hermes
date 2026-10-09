import { useMemo, useState } from "react";
import { Card } from "../components/Card";
import { MetricChart } from "../components/MetricChart";
import { useFetch } from "../hooks";
import { DEFAULT_PRESET, PRESETS, formatBytes, fromLocalInput, toLocalInput } from "../lib/format";
import { fetchHistory } from "../lib/metrics";

interface Range {
  from: number;
  to: number;
}

type RamMode = "percent" | "value";

// Both charts share this id so hovering one shows the same timestamp on the other.
const SYNC_ID = "history";

export function History() {
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET);
  const [custom, setCustom] = useState<Range | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [tick, setTick] = useState(0); // bumps "now" for presets on refresh
  const [customError, setCustomError] = useState<string | null>(null);
  const [ramMode, setRamMode] = useState<RamMode>("percent");
  const [draft, setDraft] = useState(() => ({ from: toLocalInput(Date.now() - 3_600_000), to: toLocalInput(Date.now()) }));

  const range = useMemo<Range>(() => {
    if (custom) return custom;
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[5];
    const to = Date.now();
    return { from: to - preset.ms, to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, presetId, tick]);

  const { data, error, loading, reload } = useFetch(() => fetchHistory(range.from, range.to), [range.from, range.to]);

  function pick(id: string) {
    setCustom(null);
    setPresetId(id);
    setTick((t) => t + 1);
  }

  function useCustom(next: Range) {
    setPresetId(null);
    setCustom(next);
    setDraft({ from: toLocalInput(next.from), to: toLocalInput(next.to) });
  }

  function applyCustom() {
    const from = fromLocalInput(draft.from);
    const to = fromLocalInput(draft.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return setCustomError("Enter both a start and end time.");
    if (from >= to) return setCustomError("Start must be before end.");
    setCustomError(null);
    useCustom({ from, to });
  }

  function refresh() {
    if (custom) reload();
    else setTick((t) => t + 1);
  }

  const points = data?.points ?? [];
  const empty = !loading && !error && points.length === 0;
  const memTotal = points.reduce((m, p) => Math.max(m, p.memTotal), 0);
  const customActive = custom !== null;

  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-ck-accent font-medium text-ck-bg" : "bg-ck-raised text-ck-muted hover:text-ck-text"}`;

  const ramToggle = (
    <div role="group" aria-label="RAM unit" className="flex overflow-hidden rounded-lg border border-ck-border text-xs">
      {(["percent", "value"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setRamMode(m)}
          aria-pressed={ramMode === m}
          className={`px-2.5 py-1 transition ${ramMode === m ? "bg-ck-accent text-ck-bg" : "text-ck-muted hover:text-ck-text"}`}
        >
          {m === "percent" ? "%" : "GB"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>

      <Card>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => pick(p.id)} aria-pressed={presetId === p.id && !customActive} className={pill(presetId === p.id && !customActive)}>
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setCustomOpen((o) => !o)}
            aria-expanded={customOpen}
            aria-controls="custom-range"
            className={`${pill(customActive)} flex items-center gap-1.5`}
          >
            Custom <span aria-hidden className={`text-xs transition-transform ${customOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          <button onClick={refresh} className="ml-auto rounded-lg border border-ck-border px-3 py-1.5 text-sm text-ck-muted transition hover:text-ck-text">
            Refresh
          </button>
        </div>

        {customOpen && (
          <div id="custom-range" className="mt-4 flex flex-wrap items-end gap-3 border-t border-ck-border pt-4">
            <label className="text-xs text-ck-muted">
              From
              <input
                type="datetime-local"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="mt-1 block rounded-lg border border-ck-border bg-ck-raised px-2 py-1.5 text-sm text-ck-text [color-scheme:dark]"
              />
            </label>
            <label className="text-xs text-ck-muted">
              To
              <input
                type="datetime-local"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className="mt-1 block rounded-lg border border-ck-border bg-ck-raised px-2 py-1.5 text-sm text-ck-text [color-scheme:dark]"
              />
            </label>
            <button onClick={applyCustom} className="rounded-lg border border-ck-accent/50 px-3 py-1.5 text-sm text-ck-accent transition hover:bg-ck-accent/10">
              Apply
            </button>
            {customError && <p role="alert" className="text-sm text-ck-red">{customError}</p>}
          </div>
        )}
      </Card>

      {error ? (
        <Card><p role="alert" className="text-ck-red">Could not load history: {error}</p></Card>
      ) : empty ? (
        <Card><p className="py-16 text-center text-ck-muted">No data for this period yet. History builds up while Cockpit is running.</p></Card>
      ) : (
        <>
          <p className="text-xs text-ck-muted">Drag across either chart to zoom into a period.</p>
          <div className="grid gap-5 xl:grid-cols-2">
            <MetricChart
              title="CPU usage"
              data={points}
              dataKey="cpuPct"
              color="var(--color-ck-accent)"
              range={range}
              yDomain={[0, 100]}
              yTick={(v) => `${v}%`}
              valueLabel={(v) => `${v.toFixed(1)}%`}
              seriesName="CPU"
              syncId={SYNC_ID}
              onZoom={useCustom}
            />
            {ramMode === "percent" ? (
              <MetricChart
                title="Memory usage"
                data={points}
                dataKey="memPct"
                color="var(--color-ck-green)"
                range={range}
                yDomain={[0, 100]}
                yTick={(v) => `${v}%`}
                valueLabel={(v) => `${v.toFixed(1)}%`}
                seriesName="RAM"
                syncId={SYNC_ID}
                action={ramToggle}
                onZoom={useCustom}
              />
            ) : (
              <MetricChart
                title="Memory usage"
                data={points}
                dataKey="memUsed"
                color="var(--color-ck-green)"
                range={range}
                yDomain={[0, memTotal || 1]}
                yTick={(v) => formatBytes(v)}
                valueLabel={(v) => `${formatBytes(v)} of ${formatBytes(memTotal)}`}
                seriesName="RAM"
                syncId={SYNC_ID}
                action={ramToggle}
                onZoom={useCustom}
              />
            )}
          </div>
        </>
      )}
      {loading && <p className="text-xs text-ck-muted">Loading…</p>}
    </div>
  );
}
