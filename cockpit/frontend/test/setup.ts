import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Node 26 ships an experimental, file-backed localStorage that shadows jsdom's and is undefined
// without --localstorage-file. Use a plain in-memory Storage so tests behave the same everywhere.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.has(k) ? (this.data.get(k) as string) : null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
}
Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true });

beforeEach(() => {
  // The app is served under /cockpit; the router basename expects it.
  window.history.pushState({}, "", "/cockpit/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
