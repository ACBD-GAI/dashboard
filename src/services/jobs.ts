import { supabase } from "../lib/supabase/client";
import type { BackgroundJob } from "../types/domain";

export async function listRecentJobs(): Promise<BackgroundJob[]> {
  const [imports, exports] = await Promise.all([
    supabase
      .from("import_jobs")
      .select(
        "id,branch_id,status,rows_read,rows_inserted,rows_updated,rows_skipped,rows_rejected,error_message,created_at,completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("export_jobs")
      .select("id,branch_id,status,error_message,created_at,completed_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (imports.error) throw imports.error;
  if (exports.error) throw exports.error;
  return [...((imports.data ?? []) as BackgroundJob[]), ...((exports.data ?? []) as BackgroundJob[])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);
}
