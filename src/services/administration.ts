import { supabase } from "../lib/supabase/client";
import type { Branch, Profile, UserRole } from "../types/domain";

export interface ManagedUser extends Profile {
  branch_ids: string[];
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,display_name,role,active")
    .order("email");
  if (profileError) throw profileError;
  const { data: access, error: accessError } = await supabase
    .from("user_branch_access")
    .select("user_id,branch_id");
  if (accessError) throw accessError;
  return ((profiles ?? []) as Profile[]).map((profile) => ({
    ...profile,
    branch_ids: (access ?? [])
      .filter((entry) => entry.user_id === profile.id)
      .map((entry) => entry.branch_id as string),
  }));
}

export async function updateManagedUser(input: {
  userId: string;
  role: UserRole;
  active: boolean;
  branchIds: string[];
}) {
  const { error } = await supabase.rpc("admin_update_user", {
    p_user_id: input.userId,
    p_role: input.role,
    p_active: input.active,
    p_branch_ids: input.branchIds,
  });
  if (error) throw error;
}

export type { Branch };
