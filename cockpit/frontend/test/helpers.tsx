import { vi } from "vitest";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Route-based fetch mock. Keys are matched as substrings of the URL, first match wins. */
export function mockApi(routes: Record<string, (init?: RequestInit, url?: string) => Response>) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
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
