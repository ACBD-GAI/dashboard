import { Archive, Pencil } from "lucide-react";
import type { InventoryItem } from "../../types/domain";

interface InventoryTableProps {
  rows: InventoryItem[];
  loading: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: (item: InventoryItem) => void;
  onArchive: (item: InventoryItem) => void;
}

export function InventoryTable({
  rows,
  loading,
  canEdit,
  canArchive,
  onEdit,
  onArchive,
}: InventoryTableProps) {
  return (
    <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Branch</th>
              <th>Lens type</th>
              <th>Description</th>
              <th>Tag</th>
              <th>SI</th>
              <th>Date</th>
              {(canEdit || canArchive) && <th className="actions-column">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className="skeleton-row" aria-hidden="true">
                  {Array.from({ length: canEdit || canArchive ? 7 : 6 }, (_, cell) => (
                    <td key={cell}>
                      <span />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={canEdit || canArchive ? 7 : 6} className="empty-cell">
                  <strong>No inventory records found</strong>
                  <span>Try a different branch, report, or search term.</span>
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="branch-badge">{item.branch_code}</span>
                  </td>
                  <td>{item.lens_type || "—"}</td>
                  <td>{item.description}</td>
                  <td><code>{item.tag}</code></td>
                  <td>{item.si || "—"}</td>
                  <td>
                    {item.inventory_date
                      ? new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                        }).format(new Date(item.inventory_date))
                      : "—"}
                  </td>
                  {(canEdit || canArchive) && (
                    <td>
                      <div className="table-actions">
                        {canEdit && (
                          <button
                            className="icon-button"
                            aria-label={`Edit SI for ${item.tag}`}
                            title="Edit SI"
                            onClick={() => onEdit(item)}
                          >
                            <Pencil />
                          </button>
                        )}
                        {canArchive && (
                          <button
                            className="icon-button danger"
                            aria-label={`Archive ${item.tag}`}
                            title="Archive record"
                            onClick={() => onArchive(item)}
                          >
                            <Archive />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
