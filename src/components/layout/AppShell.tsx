import { Boxes, LogOut, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { useAuth } from "../../features/auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/constants";

export function AppShell({ children }: PropsWithChildren) {
  const { profile, signOut } = useAuth();
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            <Boxes />
          </span>
          <div>
            <p className="eyebrow">Acebedo Optical</p>
            <h1>Central Inventory</h1>
          </div>
        </div>
        <div className="account">
          {profile?.role === "admin" && (
            <Link className="button ghost" to="/admin/users">
              <Users aria-hidden="true" />
              Users
            </Link>
          )}
          <div>
            <strong>{profile?.display_name || profile?.email}</strong>
            <span>{profile ? ROLE_LABELS[profile.role] : ""}</span>
          </div>
          <button className="button ghost" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
