import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export type AppRole = "admin" | "staff" | "viewer";
export type AuthorizedContext = {
  user: { id: string; email?: string };
  role: AppRole;
  service: SupabaseClient;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function authorize(
  request: Request,
  allowedRoles: AppRole[],
  branchId?: string,
): Promise<AuthorizedContext> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication required");
  }

  const url = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    throw new HttpError(401, "Session is invalid or expired");
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role,active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.active) {
    throw new HttpError(403, "This account is not active");
  }
  const role = profile.role as AppRole;
  if (!allowedRoles.includes(role)) {
    throw new HttpError(403, "You do not have permission for this operation");
  }

  if (branchId && role !== "admin") {
    const { data: access, error: accessError } = await service
      .from("user_branch_access")
      .select("branch_id")
      .eq("user_id", authData.user.id)
      .eq("branch_id", branchId)
      .maybeSingle();
    if (accessError || !access) {
      throw new HttpError(403, "You do not have access to this branch");
    }
  }

  return {
    user: { id: authData.user.id, email: authData.user.email },
    role,
    service,
  };
}

export function assertUuid(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    throw new HttpError(400, `${field} must be a valid UUID`);
  }
}
