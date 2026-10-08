import { levelFor, type Level } from "../lib/format";

const COLORS: Record<Level, string> = {
  ok: "var(--color-ck-green)",
  warn: "var(--color-ck-amber)",
  crit: "var(--color-ck-red)",
};

/** Circular progress gauge with the value in the centre. */
export function Gauge({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = COLORS[levelFor(clamped)];
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36" role="img" aria-label={`${label} ${clamped.toFixed(1)} percent`}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-ck-border)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - clamped / 100)}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums">{clamped.toFixed(1)}%</span>
          <span className="text-xs uppercase tracking-wider text-ck-muted">{label}</span>
        </div>
      </div>
      {sub && <p className="mt-3 text-sm text-ck-muted">{sub}</p>}
    </div>
  );
}
