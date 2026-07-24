import { useState } from "react";
import { useArchiveItem } from "../../features/inventory/hooks";
import { getErrorMessage } from "../../lib/errors";
import type { InventoryItem } from "../../types/domain";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

interface ArchiveItemDialogProps {
  item: InventoryItem | null;
  onClose: () => void;
}

export function ArchiveItemDialog({ item, onClose }: ArchiveItemDialogProps) {
  const mutation = useArchiveItem();
  const [error, setError] = useState("");
  const { notify } = useToast();

  async function archive() {
    if (!item) return;
    try {
      await mutation.mutateAsync(item.id);
      notify("Record archived. An administrator can recover it from the database.", "success");
      onClose();
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
    }
  }

  return (
    <Modal
      open={Boolean(item)}
      title="Archive inventory record?"
      description="This removes the record from active reports without permanently deleting it."
      onClose={onClose}
    >
      {item && (
        <div className="confirmation-summary">
          <span>Tag</span><strong>{item.tag}</strong>
          <span>Branch</span><strong>{item.branch_name}</strong>
        </div>
      )}
      {error && <p className="form-message error">{error}</p>}
      <div className="dialog-actions">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button danger" onClick={() => void archive()} disabled={mutation.isPending}>
          {mutation.isPending ? "Archiving…" : "Archive record"}
        </button>
      </div>
    </Modal>
  );
}
