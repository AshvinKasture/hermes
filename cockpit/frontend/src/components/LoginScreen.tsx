import { loginUrl } from "../lib/api";

export function LoginScreen({ denied = false }: { denied?: boolean }) {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ck-border bg-ck-surface p-8 shadow-2xl shadow-black/40">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>🛩️</span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Cockpit</h1>
            <p className="text-sm text-ck-muted">VM control panel</p>
          </div>
        </div>
        {denied && (
          <p role="alert" className="mb-4 rounded-lg border border-ck-red/40 bg-ck-red/10 px-3 py-2 text-sm text-ck-red">
            This Google account is not allowed to access Cockpit.
          </p>
        )}
        <a
          href={loginUrl()}
          className="flex w-full items-center justify-center rounded-xl bg-ck-accent px-4 py-2.5 font-medium text-ck-bg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ck-accent/60"
        >
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
