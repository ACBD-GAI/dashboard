import { useEffect, useState, type FormEvent } from "react";
import { useUpdateSi } from "../../features/inventory/hooks";
import { getErrorMessage } from "../../lib/errors";
import { siSchema } from "../../lib/validation/inventory";
import type { InventoryItem } from "../../types/domain";
import { useToast } from "../ui/ToastProvider";
import { Modal } from "../ui/Modal";

interface EditSiDialogProps {
  item: InventoryItem | null;
  onClose: () => void;
}

export function EditSiDialog({ item, onClose }: EditSiDialogProps) {
  const [si, setSi] = useState("");
  const [error, setError] = useState("");
  const mutation = useUpdateSi();
  const { notify } = useToast();

  useEffect(() => setSi(item?.si ?? ""), [item]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    const parsed = siSchema.safeParse(si);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid SI value.");
      return;
    }
    try {
      await mutation.mutateAsync({ id: item.id, si: parsed.data });
      notify("SI updated and recorded in the audit log.", "success");
      onClose();
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
    }
  }

  return (
    <Modal
      open={Boolean(item)}
      title="Edit Sold Out SI"
      description={item ? `Record ${item.tag} at ${item.branch_name}` : undefined}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="edit-si">SI number</label>
          <input
            id="edit-si"
            value={si}
            onChange={(event) => setSi(event.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="form-message error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save SI"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
