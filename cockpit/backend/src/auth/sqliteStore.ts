import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import session from "express-session";

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

/** Minimal persistent express-session store backed by node:sqlite. */
export class SqliteSessionStore extends session.Store {
  private db: DatabaseSync;
  private sweeper: NodeJS.Timeout;

  constructor(dbPath: string) {
    super();
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)"
    );
    this.sweeper = setInterval(() => this.sweep(), 15 * 60 * 1000);
    this.sweeper.unref();
  }

  private expiresAt(sess: session.SessionData): number {
    const exp = sess.cookie?.expires;
    return exp ? new Date(exp).getTime() : Date.now() + DEFAULT_TTL_MS;
  }

  private sweep(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  }

  get(sid: string, cb: (err?: unknown, sess?: session.SessionData | null) => void): void {
    try {
      const row = this.db.prepare("SELECT data, expires FROM sessions WHERE sid = ?").get(sid) as
        | { data: string; expires: number }
        | undefined;
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    try {
      this.db
        .prepare("INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)")
        .run(sid, JSON.stringify(sess), this.expiresAt(sess));
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    this.set(sid, sess, cb);
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  close(): void {
    clearInterval(this.sweeper);
    this.db.close();
  }
}
