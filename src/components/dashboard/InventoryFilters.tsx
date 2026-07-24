import { Search } from "lucide-react";
import { REPORT_OPTIONS } from "../../lib/constants";
import type { Branch, ReportType } from "../../types/domain";

interface InventoryFiltersProps {
  branches: Branch[];
  branchCode: string;
  reportType: ReportType;
  searchDraft: string;
  loading: boolean;
  onBranchChange: (value: string) => void;
  onReportChange: (value: ReportType) => void;
  onSearchDraftChange: (value: string) => void;
  onSearch: () => void;
}

export function InventoryFilters({
  branches,
  branchCode,
  reportType,
  searchDraft,
  loading,
  onBranchChange,
  onReportChange,
  onSearchDraftChange,
  onSearch,
}: InventoryFiltersProps) {
  return (
    <section className="filter-panel" aria-label="Inventory filters">
      <div className="field">
        <label htmlFor="branch-filter">Branch</label>
        <select
          id="branch-filter"
          value={branchCode}
          onChange={(event) => onBranchChange(event.target.value)}
        >
          <option value="">All authorized branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.code}>
              {branch.code} — {branch.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-filter">Report</label>
        <select
          id="report-filter"
          value={reportType}
          onChange={(event) => onReportChange(event.target.value as ReportType)}
        >
          {REPORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field search-field">
        <label htmlFor="inventory-search">Tag, SI, or description</label>
        <input
          id="inventory-search"
          value={searchDraft}
          onChange={(event) => onSearchDraftChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onSearch()}
          placeholder="Search inventory"
        />
      </div>
      <button className="button primary search-button" onClick={onSearch} disabled={loading}>
        <Search aria-hidden="true" />
        {loading ? "Searching…" : "Search"}
      </button>
    </section>
  );
}
