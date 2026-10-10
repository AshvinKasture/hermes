import type { Request } from "express";

/** One line per sensitive action, collected by `docker logs` / journald.
 *  Accepts the Express request (HTTP routes) or a bare email (non-HTTP contexts like the
 *  terminal's WebSocket, which never gets a Request object). */
export function audit(who: Request | string, action: string, detail: string): void {
  const email = typeof who === "string" ? who : (who.user?.email ?? "anonymous");
  console.log(`[audit] ${new Date().toISOString()} ${email} ${action} ${JSON.stringify(detail)}`);
}
