import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // The app is served under /cockpit; the router basename expects it.
  window.history.pushState({}, "", "/cockpit/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
