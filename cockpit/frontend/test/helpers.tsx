import { vi } from "vitest";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Route-based fetch mock. A key matches when the URL contains it, first match wins. A key ending in
 * "$" must match the end of the URL, so "path=%2F$" matches the root but not "path=%2Fhome".
 */
export function mockApi(routes: Record<string, (init?: RequestInit, url?: string) => Response>) {
  const matches = (url: string, k: string) => (k.endsWith("$") ? url.endsWith(k.slice(0, -1)) : url.includes(k));
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => matches(url, k));
    return Promise.resolve(key ? routes[key](init, url) : json({ error: "not mocked: " + url }, 404));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const ME = { name: "Ashvin Kasture", email: "a@b.c", picture: "" };

export const CURRENT = {
  ts: 1,
  cpuPct: 42.5,
  cpuCores: [10, 75, 95, 0],
  coreCount: 4,
  mem: { totalBytes: 8 * 1024 ** 3, usedBytes: 2 * 1024 ** 3, availableBytes: 6 * 1024 ** 3, usedPct: 25, swapTotalBytes: 1024 ** 3, swapUsedBytes: 1024 ** 2 },
  uptimeSeconds: 90061,
  loadAvg: [0.5, 0.4, 0.3],
};
