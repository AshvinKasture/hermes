import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUser, logout, useFilterOptions, useJobs } from "../src/hooks/useJobs";
import type { FilterOptions, JobsResult } from "../src/types/job";

const jobsResult: JobsResult = {
  jobs: [],
  total: 0,
  page: 1,
  totalPages: 1,
};

const filterOptions: FilterOptions = {
  companies: ["Acme"],
  locations: ["Pune"],
  sources: ["careers.acme.com"],
};

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useJobs", () => {
  it("builds a query from non-empty filters and stores the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, jobsResult));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJobs());

    await act(async () => {
      await result.current.fetchJobs({ company: "Acme", role: "", location: "Pune", page: 2 });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/jobs/api/jobs?company=Acme&location=Pune&page=2",
      { credentials: "include" },
    );
    expect(result.current.result).toEqual(jobsResult);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("clears stale results and records HTTP and non-Error failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, jobsResult))
      .mockResolvedValueOnce(response(503, {}))
      .mockRejectedValueOnce("network down");
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJobs());

    await act(async () => { await result.current.fetchJobs(); });
    expect(result.current.result).toEqual(jobsResult);

    await act(async () => { await result.current.fetchJobs(); });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe("HTTP 503");

    await act(async () => { await result.current.fetchJobs(); });
    expect(result.current.error).toBe("Unknown error");
    expect(result.current.loading).toBe(false);
  });
});

describe("useFilterOptions", () => {
  it("loads filter choices", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, filterOptions));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFilterOptions());

    await act(async () => { await result.current.fetchOptions(); });

    expect(fetchMock).toHaveBeenCalledWith("/jobs/api/jobs/filters", { credentials: "include" });
    expect(result.current.options).toEqual(filterOptions);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reports HTTP and network errors while retaining safe defaults", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(403, {}))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFilterOptions());

    await act(async () => { await result.current.fetchOptions(); });
    expect(result.current.error).toBe("HTTP 403");
    expect(result.current.options).toEqual({ companies: [], locations: [], sources: [] });

    await act(async () => { await result.current.fetchOptions(); });
    expect(result.current.error).toBe("offline");
    expect(result.current.loading).toBe(false);
  });
});

describe("auth helpers", () => {
  it("maps 401 to signed-out and returns the user for 200", async () => {
    const user = { id: "g1", name: "Ashvin", email: "allowed@example.com", picture: "" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(200, user));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUser()).resolves.toBeNull();
    await expect(fetchUser()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/jobs/auth/user", { credentials: "include" });
  });

  it("throws for non-401 errors and sends logout with POST", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(500, {}))
      .mockResolvedValueOnce(response(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUser()).rejects.toThrow("HTTP 500");
    await logout();
    expect(fetchMock).toHaveBeenLastCalledWith("/jobs/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });
});
