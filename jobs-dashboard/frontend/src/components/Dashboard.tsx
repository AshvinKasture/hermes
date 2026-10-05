import { AppUser } from "../types/job";
import { logout } from "../hooks/useJobs";

interface DashboardProps {
  user: AppUser;
  onLogout: () => void;
}

export function Dashboard({ user, onLogout }: DashboardProps) {
  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-hermes-bg text-hermes-text">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-hermes-border">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">Job Openings</h1>
          <span className="text-xs text-hermes-muted">Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {user.picture && (
            <img
              src={user.picture}
              alt=""
              className="w-7 h-7 rounded-full shrink-0"
            />
          )}
          <span className="text-sm text-hermes-muted">{user.email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-hermes-muted hover:text-hermes-red transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content area — placeholder for now */}
      <main className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-hermes-muted text-lg">Dashboard coming next.</p>
      </main>
    </div>
  );
}