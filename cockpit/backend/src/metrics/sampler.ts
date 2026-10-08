import type { MetricsCollector } from "./collector";
import type { MetricsStore } from "./store";

export const SAMPLE_INTERVAL_MS = 15_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/** Records a sample every interval and prunes expired history hourly. */
export class Sampler {
  private sampleTimer?: NodeJS.Timeout;
  private pruneTimer?: NodeJS.Timeout;

  constructor(
    private collector: MetricsCollector,
    private store: MetricsStore,
    private intervalMs = SAMPLE_INTERVAL_MS
  ) {}

  sampleOnce(now = Date.now()): void {
    try {
      const m = this.collector.current(now);
      this.store.insert({ ts: now, cpuPct: m.cpuPct, memUsed: m.mem.usedBytes, memTotal: m.mem.totalBytes });
    } catch (err) {
      console.error("[sampler] failed to record sample:", err);
    }
  }

  start(): void {
    if (this.sampleTimer) return;
    this.collector.current(); // establish a CPU baseline
    this.store.prune();
    this.sampleTimer = setInterval(() => this.sampleOnce(), this.intervalMs);
    this.pruneTimer = setInterval(() => this.store.prune(), PRUNE_INTERVAL_MS);
    this.sampleTimer.unref();
    this.pruneTimer.unref();
  }

  stop(): void {
    clearInterval(this.sampleTimer);
    clearInterval(this.pruneTimer);
    this.sampleTimer = this.pruneTimer = undefined;
  }
}
