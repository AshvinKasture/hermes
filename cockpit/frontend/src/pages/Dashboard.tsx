import { Card } from "../components/Card";
import { Gauge } from "../components/Gauge";
import { usePolling } from "../hooks";
import { formatBytes, formatUptime, levelFor } from "../lib/format";
import { fetchCurrent } from "../lib/metrics";

const BAR: Record<string, string> = { ok: "bg-ck-green", warn: "bg-ck-amber", crit: "bg-ck-red" };

export function Dashboard() {
  const { data, error, loading } = usePolling(fetchCurrent, 3000);

  if (loading && !data) return <p className="text-ck-muted">Loading metrics…</p>;
  if (!data) return <p role="alert" className="text-ck-red">Could not load metrics: {error}</p>;

  const { mem } = data;
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        {error ? (
          <span role="status" className="text-sm text-ck-amber">Connection issue, showing last reading</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-ck-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-ck-green" /> Live
          </span>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card title="CPU">
          <Gauge pct={data.cpuPct} label="CPU" sub={`${data.coreCount} vCPU${data.coreCount === 1 ? "" : "s"} · load ${data.loadAvg.map((n) => n.toFixed(2)).join(" ")}`} />
        </Card>
        <Card title="Memory">
          <Gauge pct={mem.usedPct} label="RAM" sub={`${formatBytes(mem.usedBytes)} of ${formatBytes(mem.totalBytes)}`} />
        </Card>
        <Card title="Uptime">
          <div className="flex h-full flex-col items-center justify-center py-6">
            <p className="text-4xl font-semibold tabular-nums" data-testid="uptime">{formatUptime(data.uptimeSeconds)}</p>
            <p className="mt-2 text-sm text-ck-muted">since last boot</p>
            {mem.swapTotalBytes > 0 && (
              <p className="mt-4 text-xs text-ck-muted">Swap {formatBytes(mem.swapUsedBytes)} / {formatBytes(mem.swapTotalBytes)}</p>
            )}
          </div>
        </Card>
      </div>

      <Card title="Per-core usage">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.cpuCores.map((pct, i) => (
            <li key={i}>
              <div className="mb-1 flex justify-between text-xs text-ck-muted">
                <span>Core {i}</span>
                <span className="tabular-nums">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ck-raised">
                <div className={`h-full rounded-full transition-all duration-700 ${BAR[levelFor(pct)]}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
