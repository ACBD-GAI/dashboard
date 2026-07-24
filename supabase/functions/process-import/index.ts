import { assertUuid, authorize } from "../_shared/auth.ts";
import {
  assertPost,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  readJson,
} from "../_shared/http.ts";
import {
  createErrorWorkbook,
  fileSha256,
  normalizeReport,
  parseInventoryWorkbook,
} from "../_shared/workbook.ts";

type ImportRequest = {
  branchId?: string;
  storagePath?: string;
  sourceFilename?: string;
  mode?: "preview" | "apply";
  strategy?: "append" | "upsert" | "replace";
  reportType?: string;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  let jobId: string | null = null;
  try {
    assertPost(request);
    const body = await readJson<ImportRequest>(request);
    assertUuid(body.branchId, "branchId");
    if (typeof body.storagePath !== "string" || !body.storagePath) {
      throw new HttpError(400, "storagePath is required");
    }
    const filename = body.sourceFilename ??
      body.storagePath.split("/").at(-1) ?? "";
    if (!/\.(xlsx|xls)$/i.test(filename)) {
      throw new HttpError(400, "Only .xlsx and .xls files are accepted");
    }
    const mode = body.mode ?? "preview";
    const strategy = body.strategy ?? "upsert";
    if (!["preview", "apply"].includes(mode)) {
      throw new HttpError(400, "Invalid mode");
    }
    if (!["append", "upsert", "replace"].includes(strategy)) {
      throw new HttpError(400, "Invalid strategy");
    }

    const context = await authorize(request, ["admin"], body.branchId);
    const expectedPrefix = `${body.branchId}/${context.user.id}/`;
    if (
      !body.storagePath.startsWith(expectedPrefix) ||
      body.storagePath.includes("..")
    ) {
      throw new HttpError(
        403,
        "The upload path does not belong to this user and branch",
      );
    }

    const { data: job, error: jobError } = await context.service
      .from("import_jobs")
      .insert({
        branch_id: body.branchId,
        requested_by: context.user.id,
        status: "running",
        mode,
        strategy,
        source_bucket: "inventory-imports",
        source_path: body.storagePath,
        source_filename: filename,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobError) throw jobError;
    jobId = job.id as string;

    const { data: file, error: downloadError } = await context.service.storage
      .from("inventory-imports")
      .download(body.storagePath);
    if (downloadError || !file) {
      throw new HttpError(422, "Uploaded workbook was not found");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new HttpError(413, "Workbook exceeds 10 MB");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = await fileSha256(bytes);
    await context.service.from("import_jobs").update({ source_sha256: digest })
      .eq("id", jobId);

    if (mode === "apply") {
      const { data: duplicate } = await context.service
        .from("import_jobs")
        .select("id")
        .eq("branch_id", body.branchId)
        .eq("source_sha256", digest)
        .eq("mode", "apply")
        .eq("strategy", strategy)
        .in("status", ["completed", "completed_with_errors"])
        .neq("id", jobId)
        .limit(1)
        .maybeSingle();
      if (duplicate) {
        throw new HttpError(
          409,
          "This workbook was already applied to the branch",
        );
      }
    }

    const fallback = normalizeReport(body.reportType ?? "stocks");
    const parsed = await parseInventoryWorkbook(bytes, fallback);
    let errorReportPath: string | null = null;
    let errorReportUrl: string | null = null;
    if (parsed.errors.length > 0) {
      errorReportPath =
        `${body.branchId}/${context.user.id}/${jobId}-errors.xlsx`;
      const report = createErrorWorkbook(parsed.errors);
      const { error: uploadError } = await context.service.storage
        .from("inventory-imports")
        .upload(errorReportPath, report, {
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data: signed } = await context.service.storage
        .from("inventory-imports")
        .createSignedUrl(errorReportPath, 600);
      errorReportUrl = signed?.signedUrl ?? null;
    }

    let applied = { inserted: 0, updated: 0, archived: 0, skipped: 0 };
    if (mode === "apply" && parsed.rows.length > 0) {
      const { data, error } = await context.service.rpc(
        "apply_inventory_import",
        {
          p_job_id: jobId,
          p_actor_id: context.user.id,
          p_branch_id: body.branchId,
          p_strategy: strategy,
          p_rows: parsed.rows,
        },
      );
      if (error) throw error;
      applied = data as typeof applied;
    }

    const status = parsed.errors.length > 0
      ? "completed_with_errors"
      : "completed";
    const result = {
      status,
      rows_read: parsed.rowsRead,
      rows_inserted: applied.inserted,
      rows_updated: applied.updated,
      rows_skipped: mode === "preview" ? parsed.rows.length : applied.skipped,
      rows_rejected: parsed.errors.length,
      row_errors: parsed.errors.slice(0, 500),
      error_report_path: errorReportPath,
      completed_at: new Date().toISOString(),
    };
    const { error: updateError } = await context.service
      .from("import_jobs").update(result).eq("id", jobId);
    if (updateError) throw updateError;

    return json(request, {
      jobId,
      status,
      mode,
      summary: {
        rowsRead: parsed.rowsRead,
        rowsInserted: applied.inserted,
        rowsUpdated: applied.updated,
        rowsSkipped: result.rows_skipped,
        rowsRejected: parsed.errors.length,
        rowsArchived: applied.archived,
      },
      errors: parsed.errors.slice(0, 100),
      errorReportUrl,
      signedUrlExpiresIn: errorReportUrl ? 600 : null,
    });
  } catch (error) {
    if (jobId) {
      try {
        const url = Deno.env.get("SUPABASE_URL")!;
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const { createClient } = await import("@supabase/supabase-js");
        await createClient(url, key).from("import_jobs").update({
          status: "failed",
          error_message: error instanceof Error
            ? error.message.slice(0, 1000)
            : "Import failed",
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
      } catch (jobUpdateError) {
        console.error("Could not mark import job failed", jobUpdateError);
      }
    }
    return errorResponse(request, error);
  }
});
