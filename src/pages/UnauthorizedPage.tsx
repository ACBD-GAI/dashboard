import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

export function UnauthorizedPage() {
  const { signOut } = useAuth();
  return (
    <main className="full-page-state">
      <div className="state-card">
        <h1>Access not assigned</h1>
        <p>
          Your sign-in succeeded, but this account is inactive or has no inventory
          profile. Ask an administrator to assign a role and branch.
        </p>
        <div className="button-row">
          <Link className="button secondary" to="/">
            Try again
          </Link>
          <button className="button primary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
