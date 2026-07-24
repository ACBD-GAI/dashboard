import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../features/auth/AuthProvider";
import { useBranches } from "../features/inventory/hooks";
import { getErrorMessage } from "../lib/errors";
import {
  listManagedUsers,
  updateManagedUser,
  type ManagedUser,
} from "../services/administration";
import type { UserRole } from "../types/domain";

function UserRow({ user, branchOptions }: { user: ManagedUser; branchOptions: { id: string; code: string }[] }) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [active, setActive] = useState(user.active);
  const [branchIds, setBranchIds] = useState(user.branch_ids);
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const mutation = useMutation({
    mutationFn: updateManagedUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      notify(`Updated access for ${user.email}.`, "success");
    },
  });
  return (
    <tr>
      <td><strong>{user.display_name || user.email}</strong><small className="table-subtitle">{user.email}</small></td>
      <td>
        <select aria-label={`Role for ${user.email}`} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="viewer">Viewer</option>
          <option value="staff">Staff</option>
          <option value="admin">Administrator</option>
        </select>
      </td>
      <td>
        <div className="branch-checks">
          {branchOptions.map((branch) => (
            <label key={branch.id}>
              <input
                type="checkbox"
                checked={branchIds.includes(branch.id)}
                onChange={(event) =>
                  setBranchIds((current) =>
                    event.target.checked
                      ? [...current, branch.id]
                      : current.filter((id) => id !== branch.id),
                  )
                }
              />
              {branch.code}
            </label>
          ))}
        </div>
      </td>
      <td><label className="switch-label"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label></td>
      <td>
        <button
          className="button secondary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ userId: user.id, role, active, branchIds })}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        {mutation.error && <small className="inline-error">{getErrorMessage(mutation.error)}</small>}
      </td>
    </tr>
  );
}

export function UserAdministrationPage() {
  const { profile } = useAuth();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: listManagedUsers });
  const branches = useBranches();
  if (profile?.role !== "admin") return <Navigate to="/" replace />;
  return (
    <AppShell>
      <section className="page-intro">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>User roles and branch access</h2>
          <p>Changes are authorized by a secure database function and recorded in the audit log.</p>
        </div>
        <a className="button secondary" href="/">Back to inventory</a>
      </section>
      {(users.error || branches.error) && <div className="error-banner">{getErrorMessage(users.error ?? branches.error)}</div>}
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Branches</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {users.isLoading && <tr><td colSpan={5} className="empty-cell">Loading users…</td></tr>}
              {users.data?.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  branchOptions={(branches.data ?? []).map(({ id, code }) => ({ id, code }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
