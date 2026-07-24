import type { MigrationResult } from "./types";

export interface WriteOptions {
  endpoint: string;
  accessToken: string;
  branchId: string;
}

export async function writeMigration(
  result: MigrationResult,
  options: WriteOptions,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  destination_count_after: number | null;
}> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": result.fingerprint,
    },
    body: JSON.stringify({
      branchId: options.branchId,
      sourceFingerprint: result.fingerprint,
      confirm: true,
      records: result.accepted,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
    throw new Error(`Migration endpoint rejected the write: ${message}`);
  }
  const alreadyApplied = body.status === "already_applied";
  return {
    inserted: Number(body.inserted ?? 0),
    updated: Number(body.updated ?? 0),
    skipped: Number(body.skipped ?? (alreadyApplied ? result.accepted.length : 0)),
    destination_count_after:
      typeof body.destination_count_after === "number"
        ? body.destination_count_after
        : null,
  };
}
