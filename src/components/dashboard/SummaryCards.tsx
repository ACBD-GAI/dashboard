import { CircleCheck, ClipboardCheck, PackageOpen, Rows3 } from "lucide-react";
import type { InventorySummary } from "../../types/domain";

interface SummaryCardsProps {
  summary?: InventorySummary;
  showing: number;
  loading: boolean;
  scopeLabel: string;
}

export function SummaryCards({
  summary,
  showing,
  loading,
  scopeLabel,
}: SummaryCardsProps) {
  const cards = [
    { label: "Available", value: summary?.available ?? 0, icon: PackageOpen },
    { label: "Sold Out", value: summary?.soldOut ?? 0, icon: CircleCheck },
    { label: "Audited", value: summary?.audited ?? 0, icon: ClipboardCheck },
    { label: "Showing", value: showing, icon: Rows3 },
  ];
  return (
    <section className="summary-section" aria-label={`Summary for ${scopeLabel}`}>
      <p className="scope-note">Totals for {scopeLabel}</p>
      <div className="summary-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <article className="summary-card" key={label}>
            <Icon aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{loading ? "—" : value.toLocaleString()}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
