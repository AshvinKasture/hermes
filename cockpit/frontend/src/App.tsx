import { LoginScreen } from "./components/LoginScreen";
import { Shell } from "./components/Shell";
import { useAuth } from "./hooks";

export function App() {
  const { state, logout } = useAuth();

  switch (state.status) {
    case "loading":
      return <div className="flex h-full items-center justify-center text-ck-muted">Loading…</div>;
    case "anonymous":
      return <LoginScreen />;
    case "denied":
      return <LoginScreen denied />;
    case "error":
      return (
        <div role="alert" className="flex h-full items-center justify-center text-ck-red">
          Something went wrong: {state.message}
        </div>
      );
    case "authenticated":
      return <Shell user={state.user} onLogout={logout} />;
  }
}
