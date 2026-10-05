import { useState, useEffect, useCallback } from "react";
import { JobsResult, JobListing, FilterOptions } from "../types/job";

const API_BASE = "/api/jobs";

interface FetchJobsParams {
  company?: string;
  role?: string;
  location?: string;
  experience?: string;
  skills?: string;
  source?: string;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

function buildQuery(params: FetchJobsParams): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== "" && val !== null) {
      q.set(key, String(val));
    }
  }
  return q.toString();
}

export function useJobs() {
  const [result, setResult] = useState<JobsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async (params: FetchJobsParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}?${buildQuery(params)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as JobsResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, fetchJobs };
}

export function useFilterOptions() {
  const [options, setOptions] = useState<FilterOptions>({
    companies: [],
    locations: [],
    sources: [],
  });
  const [loading, setLoading] = useState(false);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/filters`, { credentials: "include" });
      if (res.ok) {
        setOptions((await res.json()) as FilterOptions);
      }
    } catch {
      // silently fail — options are not critical
    } finally {
      setLoading(false);
    }
  }, []);

  return { options, loading, fetchOptions };
}

export async function fetchUser() {
  const res = await fetch("/auth/user", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export async function logout() {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
}