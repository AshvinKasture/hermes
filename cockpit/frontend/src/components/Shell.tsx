import { NavLink, Outlet } from "react-router-dom";
import type { Me } from "../lib/api";
import { Avatar } from "./Avatar";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/history", label: "History", icon: "↗", end: false },
  { to: "/files", label: "Files", icon: "▤", end: false },
  { to: "/settings", label: "Settings", icon: "⚙", end: false },
];

export function Shell({ user, onLogout }: { user: Me; onLogout: () => void }) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-ck-border bg-ck-surface md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4 text-lg font-semibold tracking-tight">
          <span aria-hidden>🛩️</span> Cockpit
        </div>
        <nav aria-label="Main" className="flex gap-1 px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? "bg-ck-accent/15 font-medium text-ck-accent" : "text-ck-muted hover:bg-ck-raised hover:text-ck-text"
                }`
              }
            >
              <span aria-hidden className="w-4 text-center">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 border-t border-ck-border p-4 md:flex">
          <Avatar name={user.name} src={user.picture} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-ck-muted">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="m-3 hidden rounded-xl border border-ck-border px-3 py-2 text-sm text-ck-muted transition hover:bg-ck-raised hover:text-ck-text md:block"
        >
          Sign out
        </button>
        <div className="flex items-center justify-between border-t border-ck-border px-4 py-2 md:hidden">
          <Avatar name={user.name} src={user.picture} />
          <button onClick={onLogout} className="rounded-lg border border-ck-border px-3 py-1 text-sm text-ck-muted">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
