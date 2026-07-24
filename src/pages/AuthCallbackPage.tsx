import { Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { FullPageState } from "../components/ui/FullPageState";

export function AuthCallbackPage() {
  const { session, loading, error } = useAuth();
  if (loading) return <FullPageState title="Completing sign in…" busy />;
  if (error) return <FullPageState title="Sign-in link failed" message={error} />;
  return <Navigate to={session ? "/" : "/login"} replace />;
}
