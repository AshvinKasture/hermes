import { useState, useEffect, useCallback } from "react";
import { JobsResult, JobListing, FilterOptions } from "../types/job";

const BASE = "/jobs";
const API_BASE = `${BASE}/api/jobs`;

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
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
      setResult(null);
      setError(getErrorMessage(e));
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
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/filters`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOptions((await res.json()) as FilterOptions);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { options, loading, error, fetchOptions };
}

export async function fetchUser() {
  const res = await fetch(`${BASE}/auth/user`, { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function logout() {
  await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
}