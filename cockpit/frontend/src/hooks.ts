import { useCallback, useEffect, useState } from "react";
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
