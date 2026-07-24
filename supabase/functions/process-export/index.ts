import { assertUuid, authorize } from "../_shared/auth.ts";
import {
  assertPost,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  readJson,
} from "../_shared/http.ts";
import { createExportWorkbook, normalizeReport } from "../_shared/workbook.ts";

type ExportRequest = { branchId?: string; reportType?: string | null };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  let jobId: string | null = null;
  try {
    assertPost(request);
    const body = await readJson<ExportRequest>(request);
    assertUuid(body.branchId, "branchId");
    const context = await authorize(request, ["admin", "staff"], body.branchId);
    const reportType = body.reportType
      ? normalizeReport(body.reportType)
      : null;

    const { data: branch, error: branchError } = await context.service
      .from("branches").select("code,name").eq("id", body.branchId).eq(
        "active",
        true,
      )
      .single();
    if (branchError || !branch) {
      throw new HttpError(404, "Branch was not found");
    }

    const { data: job, error: jobError } = await context.service.from(
      "export_jobs",
    )
      .insert({
        branch_id: body.branchId,
        requested_by: context.user.id,
        report_type: reportType,
        status: "running",
        started_at: new Date().toISOString(),
      }).select("id").single();
    if (jobError) throw jobError;
    jobId = job.id as string;

    const records: Array<Record<string, unknown>> = [];
    const pageSize = 1000;
    for (let from = 0; from < 100_000; from += pageSize) {
      let query = context.service.from("inventory_items")
        .select(
          "report_type,lens_type,description,tag,si,inventory_date,created_at,updated_at",
        )
        .eq("branch_id", body.branchId).is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (reportType) query = query.eq("report_type", reportType);
      const { data, error } = await query;
      if (error) throw error;
      records.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
      if (from + pageSize >= 100_000) {
        throw new HttpError(413, "Export exceeds the 100,000 row safety limit");
      }
    }

    const bytes = createExportWorkbook(branch, records);
    const path = `${body.branchId}/${context.user.id}/${jobId}.xlsx`;
    const { error: uploadError } = await context.service.storage
      .from("inventory-exports").upload(path, bytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await context.service.from("export_jobs")
      .update({
        status: "completed",
        destination_path: path,
        rows_exported: records.length,
        expires_at: expiresAt,
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    if (updateError) throw updateError;

    await context.service.from("audit_events").insert({
      actor_id: context.user.id,
      action: "inventory.export",
      target_table: "export_jobs",
      target_id: jobId,
      branch_id: body.branchId,
      after_state: { reportType, rowsExported: records.length, expiresAt },
    });

    const { data: signed, error: signedError } = await context.service.storage
      .from("inventory-exports").createSignedUrl(path, 600);
    if (signedError || !signed) {
      throw signedError ?? new Error("Signed URL failed");
    }

    return json(request, {
      jobId,
      status: "completed",
      rowsExported: records.length,
      downloadUrl: signed.signedUrl,
      signedUrlExpiresIn: 600,
      fileRetentionExpiresAt: expiresAt,
    });
  } catch (error) {
    if (jobId) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        await createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        ).from("export_jobs").update({
          status: "failed",
          error_message: error instanceof Error
            ? error.message.slice(0, 1000)
            : "Export failed",
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
      } catch (jobUpdateError) {
        console.error("Could not mark export job failed", jobUpdateError);
      }
    }
    return errorResponse(request, error);
  }
});
