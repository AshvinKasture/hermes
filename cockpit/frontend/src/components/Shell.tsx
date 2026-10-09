import { NavLink, Outlet } from "react-router-dom";
import type { Me } from "../lib/api";
import { usePersistentState } from "../hooks";
import { Avatar } from "./Avatar";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/history", label: "History", icon: "↗", end: false },
  { to: "/files", label: "Files", icon: "▤", end: false },
  { to: "/settings", label: "Settings", icon: "⚙", end: false },
];

export function Shell({ user, onLogout }: { user: Me; onLogout: () => void }) {
  const [collapsed, setCollapsed] = usePersistentState("shell.collapsed", false);
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className={`flex shrink-0 flex-col border-b border-ck-border bg-ck-surface transition-[width] md:border-b-0 md:border-r ${collapsed ? "md:w-16" : "md:w-56"}`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`m-3 hidden h-9 w-9 items-center justify-center rounded-lg text-ck-muted transition hover:bg-ck-raised hover:text-ck-text md:flex ${collapsed ? "md:mx-auto" : ""}`}
        >
          <span aria-hidden className="text-lg leading-none">☰</span>
        </button>
        <div className="flex items-center gap-2 px-5 py-4 text-lg font-semibold tracking-tight md:hidden">
          <span aria-hidden>🛩️</span> Cockpit
        </div>
        <nav aria-label="Main" className="flex gap-1 px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${collapsed ? "md:justify-center md:px-0" : ""} ${
                  isActive ? "bg-ck-accent/15 font-medium text-ck-accent" : "text-ck-muted hover:bg-ck-raised hover:text-ck-text"
                }`
              }
            >
              <span aria-hidden className="w-4 text-center">{n.icon}</span>
              {!collapsed && n.label}
            </NavLink>
          ))}
        </nav>
        <div className={`hidden items-center gap-3 border-t border-ck-border p-4 md:flex ${collapsed ? "md:justify-center md:px-0" : ""}`}>
          <Avatar name={user.name} src={user.picture} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-ck-muted">{user.email}</p>
            </div>
          )}
        </div>
        <button
          onClick={onLogout}
          title={collapsed ? "Sign out" : undefined}
          className={`m-3 hidden rounded-xl border border-ck-border px-3 py-2 text-sm text-ck-muted transition hover:bg-ck-raised hover:text-ck-text md:block ${collapsed ? "md:px-0" : ""}`}
        >
          {collapsed ? "⏻" : "Sign out"}
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
