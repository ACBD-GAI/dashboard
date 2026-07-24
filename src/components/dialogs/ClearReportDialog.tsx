import { useMemo, useState, type FormEvent } from "react";
import { ArchiveX } from "lucide-react";
import { REPORT_OPTIONS } from "../../lib/constants";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase/client";
import type { Branch, ReportType } from "../../types/domain";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

interface ClearReportDialogProps {
  open: boolean;
  branches: Branch[];
  onClose: () => void;
}

export function ClearReportDialog({ open, branches, onClose }: ClearReportDialogProps) {
  const [branchId, setBranchId] = useState("");
  const [reportType, setReportType] = useState<ReportType>("stocks");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { notify } = useToast();
  const branch = useMemo(
    () => branches.find((candidate) => candidate.id === branchId),
    [branchId, branches],
  );
  const reportLabel = REPORT_OPTIONS.find((item) => item.value === reportType)?.label;
  const phrase = branch ? `CLEAR ${branch.code} ${reportType}` : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!branch || confirmation !== phrase) {
      setError(`Type “${phrase || "CLEAR BRANCH report"}” exactly to confirm.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "clear-report",
        { body: { branchId, reportType, confirmation } },
      );
      if (invokeError) throw invokeError;
      notify(`${data?.affectedRows ?? 0} records archived.`, "success");
      onClose();
    } catch (operationError) {
      setError(getErrorMessage(operationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Archive a report dataset"
      description="Admin-only. Records are soft-deleted and the action is audited."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="clear-branch">Branch</label>
          <select id="clear-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Select a branch</option>
            {branches.map((item) => (
              <option value={item.id} key={item.id}>{item.code} — {item.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="clear-report">Report</label>
          <select id="clear-report" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
            {REPORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="clear-confirmation">Type {phrase ? <strong>{phrase}</strong> : "the confirmation phrase"} to confirm</label>
          <input id="clear-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
        </div>
        <p className="warning-box">
          This archives the complete {reportLabel} dataset. It does not permanently erase it.
        </p>
        {error && <p className="form-message error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button danger" disabled={busy || !branch || confirmation !== phrase}>
            <ArchiveX /> {busy ? "Archiving…" : "Archive report"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
