import { useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { getErrorMessage } from "../../lib/errors";
import type { Branch } from "../../types/domain";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

interface ExportDialogProps {
  open: boolean;
  branches: Branch[];
  onClose: () => void;
}

export function ExportDialog({ open, branches, onClose }: ExportDialogProps) {
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { notify } = useToast();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!branchId) {
      setError("Select a branch.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "process-export",
        { body: { branchId } },
      );
      if (invokeError) throw invokeError;
      if (data?.downloadUrl) window.location.assign(data.downloadUrl);
      notify(
        data?.downloadUrl ? "Export ready. Download started." : "Export request completed.",
        "success",
      );
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
      title="Export branch inventory"
      description="Generated files are private and downloads use short-lived signed URLs."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="export-branch">Branch</label>
          <select id="export-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Select a branch</option>
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>{branch.code} — {branch.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="form-message error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>
            <Download /> {busy ? "Preparing…" : "Create export"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
