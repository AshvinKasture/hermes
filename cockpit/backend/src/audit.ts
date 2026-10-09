import type { Request } from "express";

/** One line per sensitive action, collected by `docker logs` / journald. */
export function audit(req: Request, action: string, detail: string): void {
  const who = req.user?.email ?? "anonymous";
  console.log(`[audit] ${new Date().toISOString()} ${who} ${action} ${JSON.stringify(detail)}`);
}
