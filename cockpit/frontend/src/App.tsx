import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginScreen } from "./components/LoginScreen";
import { Shell } from "./components/Shell";
import { useAuth } from "./hooks";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";

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
      return (
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route element={<Shell user={state.user} onLogout={logout} />}>
              <Route index element={<Dashboard />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      );
  }
}
