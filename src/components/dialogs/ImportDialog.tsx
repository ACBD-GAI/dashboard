import { useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { validateImportFile } from "../../features/imports/validation";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase/client";
import type { Branch } from "../../types/domain";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

interface ImportDialogProps {
  open: boolean;
  branches: Branch[];
  onClose: () => void;
}

interface ImportPreview {
  storagePath: string;
  sourceFilename: string;
  summary: {
    rowsRead: number;
    rowsInserted: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsRejected: number;
    rowsArchived: number;
  };
  errorReportUrl?: string | null;
}

export function ImportDialog({ open, branches, onClose }: ImportDialogProps) {
  const [branchId, setBranchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { notify } = useToast();
  const queryClient = useQueryClient();

  function resetAndClose() {
    setBranchId("");
    setFile(null);
    setPreview(null);
    setError("");
    onClose();
  }

  async function requestPreview(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!branchId || !file) {
      setError("Select a branch and Excel file.");
      return;
    }
    const validationError = validateImportFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Your session has expired.");
      const objectPath = `${branchId}/${user.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("inventory-imports")
        .upload(objectPath, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data, error: invokeError } = await supabase.functions.invoke(
        "process-import",
        {
          body: {
            branchId,
            storagePath: objectPath,
            sourceFilename: file.name,
            mode: "preview",
            strategy: "replace",
            reportType: "stocks",
          },
        },
      );
      if (invokeError) throw invokeError;
      setPreview({
        storagePath: objectPath,
        sourceFilename: file.name,
        summary: data.summary,
        errorReportUrl: data.errorReportUrl,
      });
      notify("Workbook validation complete. Review the summary before applying.", "success");
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (operationError) {
      setError(getErrorMessage(operationError));
    } finally {
      setBusy(false);
    }
  }

  async function applyReplacement() {
    if (!preview || preview.summary.rowsRejected > 0) return;
    setBusy(true);
    setError("");
    try {
      const { error: invokeError } = await supabase.functions.invoke(
        "process-import",
        {
          body: {
            branchId,
            storagePath: preview.storagePath,
            sourceFilename: preview.sourceFilename,
            mode: "apply",
            strategy: "replace",
            reportType: "stocks",
          },
        },
      );
      if (invokeError) throw invokeError;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      notify("Branch Stocks replaced and the previous dataset archived.", "success");
      resetAndClose();
    } catch (operationError) {
      setError(getErrorMessage(operationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Update branch stocks"
      description="The original workbook is stored privately and validated on the server."
      onClose={resetAndClose}
    >
      <form onSubmit={requestPreview}>
        <div className="field">
          <label htmlFor="import-branch">Branch</label>
          <select
            id="import-branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={Boolean(preview)}
          >
            <option value="">Select a branch</option>
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>{branch.code} — {branch.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="import-file">Excel workbook</label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={Boolean(preview)}
          />
          <small>Maximum 10 MB. Required columns are documented in docs/operations.md.</small>
        </div>
        {preview && (
          <>
            <div className="import-summary" aria-label="Import validation summary">
              <span>Rows read<strong>{preview.summary.rowsRead}</strong></span>
              <span>Valid rows<strong>{preview.summary.rowsSkipped}</strong></span>
              <span>Rejected<strong>{preview.summary.rowsRejected}</strong></span>
            </div>
            {preview.errorReportUrl && (
              <a className="button secondary wide" href={preview.errorReportUrl}>
                Download validation errors
              </a>
            )}
            <p className="warning-box">
              {preview.summary.rowsRejected > 0
                ? "Resolve every rejected row and validate a corrected workbook before applying."
                : "Applying will archive the branch’s active Stocks and replace them transactionally."}
            </p>
          </>
        )}
        {error && <p className="form-message error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={resetAndClose}>Cancel</button>
          {!preview ? (
            <button className="button primary" disabled={busy}>
              <Upload /> {busy ? "Validating…" : "Validate workbook"}
            </button>
          ) : (
            <button
              type="button"
              className="button danger"
              disabled={busy || preview.summary.rowsRejected > 0}
              onClick={() => void applyReplacement()}
            >
              <Upload /> {busy ? "Applying…" : "Replace branch Stocks"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
