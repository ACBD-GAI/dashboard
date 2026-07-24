import { authorize } from "../_shared/auth.ts";
import {
  assertPost,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  readJson,
} from "../_shared/http.ts";
import { type CanonicalRow, normalizeReport } from "../_shared/workbook.ts";

type LegacyRecord = Partial<CanonicalRow> & {
  branch_code?: string;
  description?: string;
  source_metadata?: Record<string, unknown>;
};
type MigrationRequest = {
  source_fingerprint?: string;
  sourceFingerprint?: string;
  records?: LegacyRecord[];
};
type Branch = { id: string; code: string };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const createdJobIds: string[] = [];
  try {
    assertPost(request);
    const body = await readJson<MigrationRequest>(request, 15_000_000);
    const fingerprint =
      (body.source_fingerprint ?? body.sourceFingerprint ?? "")
        .toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new HttpError(
        400,
        "source_fingerprint must be a SHA-256 hex digest",
      );
    }
    if (request.headers.get("idempotency-key")?.toLowerCase() !== fingerprint) {
      throw new HttpError(
        400,
        "Idempotency-Key must exactly match source_fingerprint",
      );
    }
    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new HttpError(400, "records must be a non-empty array");
    }
    if (body.records.length > 10_000) {
      throw new HttpError(
        413,
        "A migration request may contain at most 10,000 rows",
      );
    }
    const context = await authorize(request, ["admin"]);

    const { data: branchRows, error: branchError } = await context.service
      .from("branches").select("id,code").eq("active", true);
    if (branchError) throw branchError;
    const branches = new Map(
      (branchRows as Branch[]).map((branch) => [branch.code, branch]),
    );

    const errors: Array<{ row: number; field: string; message: string }> = [];
    const grouped = new Map<string, { branch: Branch; rows: CanonicalRow[] }>();
    body.records.forEach((record, index) => {
      const sourceRow = Number(record.source_row_number ?? index + 1);
      const branchCode = String(record.branch_code ?? "").trim().toUpperCase();
      const branch = branches.get(branchCode);
      if (!branch) {
        errors.push({
          row: sourceRow,
          field: "branch_code",
          message: "Unknown or inactive branch",
        });
        return;
      }
      const description = String(record.description ?? "").trim();
      if (!description || description.length > 500) {
        errors.push({
          row: sourceRow,
          field: "description",
          message: "Description is required and limited to 500 characters",
        });
        return;
      }
      try {
        const report = normalizeReport(record.report_type ?? "stocks");
        const externalKey = String(record.external_key ?? "").trim();
        if (!externalKey) {
          errors.push({
            row: sourceRow,
            field: "external_key",
            message: "A stable external_key is required",
          });
          return;
        }
        const group = grouped.get(branchCode) ?? { branch, rows: [] };
        group.rows.push({
          report_type: report,
          lens_type: record.lens_type
            ? String(record.lens_type).trim().slice(0, 200)
            : null,
          description,
          tag: record.tag ? String(record.tag).trim().slice(0, 200) : null,
          si: record.si ? String(record.si).trim().slice(0, 120) : null,
          inventory_date: record.inventory_date
            ? String(record.inventory_date)
            : null,
          external_key: externalKey.slice(0, 300),
          source_row_number: sourceRow,
          source_metadata: {
            ...(record.source_metadata ?? {}),
            migrationFingerprint: fingerprint,
          },
        });
        grouped.set(branchCode, group);
      } catch (error) {
        errors.push({
          row: sourceRow,
          field: "report_type",
          message: error instanceof Error
            ? error.message
            : "Invalid report type",
        });
      }
    });
    if (errors.length > 0) {
      throw new HttpError(
        422,
        "Migration records failed validation",
        { errors: errors.slice(0, 500) },
      );
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const jobs: string[] = [];
    for (const { branch, rows } of grouped.values()) {
      const { data: previous } = await context.service.from("import_jobs")
        .select("id")
        .eq("branch_id", branch.id)
        .eq("source_sha256", fingerprint)
        .eq("mode", "apply")
        .like("source_path", "legacy-migration/%")
        .in("status", ["completed", "completed_with_errors"])
        .limit(1)
        .maybeSingle();
      if (previous) {
        jobs.push(previous.id as string);
        skipped += rows.length;
        continue;
      }

      const { data: job, error: jobError } = await context.service
        .from("import_jobs").insert({
          branch_id: branch.id,
          requested_by: context.user.id,
          status: "running",
          mode: "apply",
          strategy: "upsert",
          source_bucket: "legacy-migration",
          source_path: `legacy-migration/${fingerprint}/${branch.code}`,
          source_filename: `${fingerprint}.json`,
          source_sha256: fingerprint,
          rows_read: rows.length,
          started_at: new Date().toISOString(),
        }).select("id").single();
      if (jobError) throw jobError;
      const jobId = job.id as string;
      createdJobIds.push(jobId);
      jobs.push(jobId);

      const { data: applied, error: applyError } = await context.service.rpc(
        "apply_inventory_import",
        {
          p_job_id: jobId,
          p_actor_id: context.user.id,
          p_branch_id: branch.id,
          p_strategy: "upsert",
          p_rows: rows,
        },
      );
      if (applyError) throw applyError;
      inserted += Number(applied.inserted ?? 0);
      updated += Number(applied.updated ?? 0);
      skipped += Number(applied.skipped ?? 0);
      await context.service.from("import_jobs").update({
        status: "completed",
        rows_inserted: applied.inserted,
        rows_updated: applied.updated,
        rows_skipped: applied.skipped,
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      await context.service.from("audit_events").insert({
        actor_id: context.user.id,
        action: "inventory.legacy_migration",
        target_table: "import_jobs",
        target_id: jobId,
        branch_id: branch.id,
        after_state: { ...applied, sourceFingerprint: fingerprint },
      });
    }

    const { count, error: countError } = await context.service
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (countError) throw countError;

    return json(request, {
      status: skipped === body.records.length ? "already_applied" : "completed",
      jobs,
      source_fingerprint: fingerprint,
      inserted,
      updated,
      skipped,
      destination_count_after: count ?? null,
    });
  } catch (error) {
    if (createdJobIds.length > 0) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        await createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        ).from("import_jobs").update({
          status: "failed",
          error_message: error instanceof Error
            ? error.message.slice(0, 1000)
            : "Migration failed",
          completed_at: new Date().toISOString(),
        }).in("id", createdJobIds);
      } catch (jobUpdateError) {
        console.error("Could not mark migration jobs failed", jobUpdateError);
      }
    }
    return errorResponse(request, error);
  }
});
