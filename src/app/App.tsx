import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { AuthCallbackPage } from "../pages/AuthCallbackPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { UnauthorizedPage } from "../pages/UnauthorizedPage";
import { UserAdministrationPage } from "../pages/UserAdministrationPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="/admin/users" element={<UserAdministrationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
