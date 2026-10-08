import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchMe, logout as apiLogout, type Me } from "./lib/api";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "authenticated"; user: Me };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((user) => !cancelled && setState({ status: "authenticated", user }))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) setState({ status: "anonymous" });
        else if (err instanceof ApiError && err.status === 403) setState({ status: "denied" });
        else setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "anonymous" });
  }, []);

  return { state, logout };
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Poll an async fetcher. Keeps the last good value while refreshing or on transient errors. */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetcherRef
        .current()
        .then((data) => !cancelled && setState({ data, error: null, loading: false }))
        .catch((e: unknown) =>
          !cancelled && setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : "Request failed", loading: false }))
        );
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}

/** Fetch once and whenever `deps` change. */
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetcherRef
      .current()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => !cancelled && setState({ data: null, error: e instanceof Error ? e.message : "Request failed", loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
