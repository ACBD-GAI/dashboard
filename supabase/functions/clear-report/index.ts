import { assertUuid, authorize } from "../_shared/auth.ts";
import {
  assertPost,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  readJson,
} from "../_shared/http.ts";
import { normalizeReport } from "../_shared/workbook.ts";

type ClearRequest = {
  branchId?: string;
  reportType?: string;
  confirmation?: string;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    assertPost(request);
    const body = await readJson<ClearRequest>(request);
    assertUuid(body.branchId, "branchId");
    if (!body.reportType) throw new HttpError(400, "reportType is required");
    const context = await authorize(request, ["admin"], body.branchId);
    const reportType = normalizeReport(body.reportType);
    const { data: branch, error: branchError } = await context.service
      .from("branches").select("code,name").eq("id", body.branchId).single();
    if (branchError || !branch) {
      throw new HttpError(404, "Branch was not found");
    }

    const expected = `CLEAR ${branch.code} ${reportType}`;
    if (body.confirmation !== expected) {
      throw new HttpError(
        400,
        `Confirmation must exactly match: ${expected}`,
        { expectedConfirmation: expected },
      );
    }

    const { data, error } = await context.service.rpc(
      "clear_inventory_report",
      {
        p_actor_id: context.user.id,
        p_branch_id: body.branchId,
        p_report_type: reportType,
      },
    );
    if (error) throw error;
    return json(request, {
      status: "completed",
      branch: branch.code,
      reportType,
      ...data,
      recovery:
        "An administrator can restore the affected soft-deleted rows using the audit event timestamp.",
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
