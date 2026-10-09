import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../components/Card";
import { useFetch } from "../hooks";
import { DEFAULT_PRESET, PRESETS, formatTimeTick, fromLocalInput, timeTicks, toLocalInput } from "../lib/format";
import { fetchHistory } from "../lib/metrics";

interface Range {
  from: number;
  to: number;
}

export function History() {
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET);
  const [custom, setCustom] = useState<Range | null>(null);
  const [tick, setTick] = useState(0); // bumps "now" for presets on refresh
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => ({ from: toLocalInput(Date.now() - 3_600_000), to: toLocalInput(Date.now()) }));

  const range = useMemo<Range>(() => {
    if (custom) return custom;
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[5];
    const to = Date.now();
    return { from: to - preset.ms, to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, presetId, tick]);

  const { data, error, loading, reload } = useFetch(() => fetchHistory(range.from, range.to), [range.from, range.to]);
  const span = range.to - range.from;
  const axis = useMemo(() => timeTicks(range.from, range.to), [range.from, range.to]);

  function pick(id: string) {
    setCustom(null);
    setPresetId(id);
    setTick((t) => t + 1);
  }

  function applyCustom() {
    const from = fromLocalInput(draft.from);
    const to = fromLocalInput(draft.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return setCustomError("Enter both a start and end time.");
    if (from >= to) return setCustomError("Start must be before end.");
    setCustomError(null);
    setPresetId(null);
    setCustom({ from, to });
  }

  function refresh() {
    if (custom) reload();
    else setTick((t) => t + 1);
  }

  function endDrag() {
    if (drag && drag.a !== drag.b) {
      const [from, to] = drag.a < drag.b ? [drag.a, drag.b] : [drag.b, drag.a];
      setPresetId(null);
      setCustom({ from, to });
      setDraft({ from: toLocalInput(from), to: toLocalInput(to) });
    }
    setDrag(null);
  }

  const points = data?.points ?? [];
  const empty = !loading && !error && points.length === 0;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>

      <Card>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              aria-pressed={presetId === p.id && !custom}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                presetId === p.id && !custom ? "bg-ck-accent font-medium text-ck-bg" : "bg-ck-raised text-ck-muted hover:text-ck-text"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button onClick={refresh} className="ml-auto rounded-lg border border-ck-border px-3 py-1.5 text-sm text-ck-muted transition hover:text-ck-text">
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ck-border pt-4">
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
            Apply custom range
          </button>
          {customError && <p role="alert" className="text-sm text-ck-red">{customError}</p>}
        </div>
      </Card>

      <Card title="CPU and memory usage" action={<span className="text-xs text-ck-muted">Drag on the chart to zoom</span>}>
        <div className="h-80 select-none">
          {error ? (
            <p role="alert" className="text-ck-red">Could not load history: {error}</p>
          ) : empty ? (
            <p className="flex h-full items-center justify-center text-ck-muted">No data for this period yet. History builds up while Cockpit is running.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                onMouseDown={(e) => typeof e?.activeLabel === "number" && setDrag({ a: e.activeLabel, b: e.activeLabel })}
                onMouseMove={(e) => drag && typeof e?.activeLabel === "number" && setDrag({ ...drag, b: e.activeLabel })}
                onMouseUp={endDrag}
                onMouseLeave={() => setDrag(null)}
              >
                <CartesianGrid stroke="var(--color-ck-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={[range.from, range.to]}
                  ticks={axis.ticks}
                  interval={0}
                  tickFormatter={(v: number) => formatTimeTick(v, axis.step, span)}
                  stroke="var(--color-ck-muted)"
                  fontSize={12}
                />
                <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} stroke="var(--color-ck-muted)" fontSize={12} width={44} />
                <Tooltip
                  contentStyle={{ background: "var(--color-ck-raised)", border: "1px solid var(--color-ck-border)", borderRadius: 12 }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                />
                <Legend />
                <Line type="monotone" dataKey="cpuPct" name="CPU" stroke="var(--color-ck-accent)" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="memPct" name="RAM" stroke="var(--color-ck-green)" dot={false} strokeWidth={2} isAnimationActive={false} />
                {drag && <ReferenceArea x1={drag.a} x2={drag.b} fill="var(--color-ck-accent)" fillOpacity={0.15} />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {loading && <p className="mt-2 text-xs text-ck-muted">Loading…</p>}
      </Card>
    </div>
  );
}
