import { useState, useEffect } from "react";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { fetchUser, logout } from "./hooks/useJobs";
import { AppUser } from "./types/job";

export function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser()
      .then((u) => setUser(u))
      .catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : "Unknown error");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-hermes-bg flex items-center justify-center">
        <p className="text-hermes-muted text-lg">Loading...</p>
      </div>
    );
  }

  if (authError) {
    const accessDenied = authError === "HTTP 403";
    return (
      <div className="min-h-screen bg-hermes-bg text-hermes-text flex flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-bold">{accessDenied ? "Access denied" : "Unable to verify access"}</h1>
        <p className="text-hermes-muted" role="alert">
          {accessDenied
            ? "This Google account is not authorized to use the job dashboard."
            : `The server could not verify your session (${authError}). Try again.`}
        </p>
        <button
          className="bg-hermes-accent text-white px-4 py-2 rounded-lg"
          onClick={async () => {
            if (accessDenied) {
              await logout();
              window.location.href = "/jobs/";
            } else {
              window.location.reload();
            }
          }}
        >
          {accessDenied ? "Sign out" : "Retry"}
        </button>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}