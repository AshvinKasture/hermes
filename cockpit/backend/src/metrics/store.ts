import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export interface Sample {
  ts: number; // epoch ms
  cpuPct: number;
  memUsed: number;
  memTotal: number;
}

export interface Point extends Sample {
  memPct: number;
}

export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 365;
export const MAX_POINTS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export class MetricsStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        ts INTEGER PRIMARY KEY,
        cpu_pct REAL NOT NULL,
        mem_used INTEGER NOT NULL,
        mem_total INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  insert(s: Sample): void {
    this.db
      .prepare("INSERT OR REPLACE INTO metrics (ts, cpu_pct, mem_used, mem_total) VALUES (?, ?, ?, ?)")
      .run(s.ts, s.cpuPct, s.memUsed, s.memTotal);
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM metrics").get() as { n: number }).n;
  }

  /**
   * Average samples into at most `maxPoints` equal time buckets so long ranges
   * stay cheap to render. Short ranges return raw samples.
   */
  range(from: number, to: number, maxPoints = MAX_POINTS): Point[] {
    const span = Math.max(1, to - from);
    const points = Math.min(Math.max(1, Math.floor(maxPoints)), MAX_POINTS);
    const bucketMs = Math.max(1, Math.ceil(span / points));
    const rows = this.db
      .prepare(
        `SELECT CAST(ts / ? AS INTEGER) * ? AS bucket, AVG(cpu_pct) AS cpu, AVG(mem_used) AS used, AVG(mem_total) AS total
         FROM metrics WHERE ts >= ? AND ts <= ? GROUP BY bucket ORDER BY bucket`
      )
      .all(bucketMs, bucketMs, from, to) as { bucket: number; cpu: number; used: number; total: number }[];
    return rows.map((r) => ({
      ts: r.bucket,
      cpuPct: Math.round(r.cpu * 10) / 10,
      memUsed: Math.round(r.used),
      memTotal: Math.round(r.total),
      memPct: r.total ? Math.round((r.used / r.total) * 1000) / 10 : 0,
    }));
  }

  getRetentionDays(): number {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'retention_days'").get() as { value: string } | undefined;
    const n = row ? Number(row.value) : NaN;
    return Number.isInteger(n) && n >= MIN_RETENTION_DAYS && n <= MAX_RETENTION_DAYS ? n : DEFAULT_RETENTION_DAYS;
  }

  setRetentionDays(days: number): void {
    if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
      throw new RangeError(`retentionDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`);
    }
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('retention_days', ?)").run(String(days));
  }

  /** Delete samples older than the retention window. Returns rows removed. */
  prune(now = Date.now()): number {
    const cutoff = now - this.getRetentionDays() * DAY_MS;
    return Number(this.db.prepare("DELETE FROM metrics WHERE ts < ?").run(cutoff).changes);
  }

  close(): void {
    this.db.close();
  }
}
