import type { Me } from "../lib/api";

export function Shell({ user, onLogout }: { user: Me; onLogout: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-ck-border bg-ck-surface px-6 py-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden>🛩️</span> Cockpit
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user.picture && <img src={user.picture} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />}
          <span className="text-ck-muted">{user.email}</span>
          <button
            onClick={onLogout}
            className="rounded-lg border border-ck-border px-3 py-1 text-ck-text transition hover:bg-ck-raised"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Welcome, {user.name}</h2>
          <p className="mt-2 text-ck-muted">You&apos;re signed in. Dashboard, files and terminal are coming next.</p>
        </div>
      </main>
    </div>
  );
}
