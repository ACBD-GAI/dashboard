import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { FullPageState } from "../ui/FullPageState";

export function ProtectedRoute() {
  const { session, profile, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageState title="Restoring your session…" busy />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (error) return <FullPageState title="Account unavailable" message={error} />;
  if (!profile || !profile.active) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <Outlet />;
}
