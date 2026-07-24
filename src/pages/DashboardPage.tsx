import { useMemo, useState } from "react";
import { ArchiveX, Download, RefreshCw, Upload } from "lucide-react";
import { InventoryFilters } from "../components/dashboard/InventoryFilters";
import { SummaryCards } from "../components/dashboard/SummaryCards";
import { ArchiveItemDialog } from "../components/dialogs/ArchiveItemDialog";
import { ClearReportDialog } from "../components/dialogs/ClearReportDialog";
import { EditSiDialog } from "../components/dialogs/EditSiDialog";
import { ExportDialog } from "../components/dialogs/ExportDialog";
import { ImportDialog } from "../components/dialogs/ImportDialog";
import { InventoryTable } from "../components/inventory/InventoryTable";
import { Pagination } from "../components/inventory/Pagination";
import { JobStatusCenter } from "../components/jobs/JobStatusCenter";
import { AppShell } from "../components/layout/AppShell";
import { useAuth } from "../features/auth/AuthProvider";
import {
  canArchive,
  canClearReport,
  canEditSi,
  canExport,
  canImport,
} from "../features/auth/permissions";
import {
  useBranches,
  useInventoryPage,
  useInventorySummary,
} from "../features/inventory/hooks";
import { PAGE_SIZE } from "../lib/constants";
import { getErrorMessage } from "../lib/errors";
import type { InventoryItem, ReportType } from "../types/domain";

type DialogName = "import" | "export" | "clear" | null;

export function DashboardPage() {
  const { profile } = useAuth();
  const branchesQuery = useBranches();
  const [branchCode, setBranchCode] = useState("");
  const [reportType, setReportType] = useState<ReportType>("stocks");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [archiveItem, setArchiveItem] = useState<InventoryItem | null>(null);

  const filters = useMemo(
    () => ({ branchCode, reportType, search, page, pageSize: PAGE_SIZE }),
    [branchCode, reportType, search, page],
  );
  const inventory = useInventoryPage(filters);
  const summary = useInventorySummary(branchCode, search);
  const branches = branchesQuery.data ?? [];
  const selectedBranch = branches.find((branch) => branch.code === branchCode);
  const scopeLabel = selectedBranch
    ? `${selectedBranch.code} — ${selectedBranch.name}`
    : "all branches you are authorized to access";
  const editable = canEditSi(profile, reportType);
  const archivable = canArchive(profile);

  function applySearch() {
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function selectBranch(value: string) {
    setBranchCode(value);
    setPage(1);
  }

  function selectReport(value: ReportType) {
    setReportType(value);
    setPage(1);
  }

  return (
    <AppShell>
      <section className="page-intro">
        <div>
          <p className="eyebrow">Inventory dashboard</p>
          <h2>Find and maintain stock across branches</h2>
          <p>All totals, filtering, and pagination are calculated securely on the server.</p>
        </div>
        <div className="toolbar">
          <button
            className="button secondary"
            onClick={() => void Promise.all([inventory.refetch(), summary.refetch()])}
          >
            <RefreshCw /> Refresh
          </button>
          {canImport(profile) && (
            <button className="button secondary" onClick={() => setDialog("import")}>
              <Upload /> Update stocks
            </button>
          )}
          {canExport(profile) && (
            <button className="button secondary" onClick={() => setDialog("export")}>
              <Download /> Export
            </button>
          )}
          {canClearReport(profile) && (
            <button className="button danger-subtle" onClick={() => setDialog("clear")}>
              <ArchiveX /> Clear report
            </button>
          )}
        </div>
      </section>

      <InventoryFilters
        branches={branches}
        branchCode={branchCode}
        reportType={reportType}
        searchDraft={searchDraft}
        loading={inventory.isFetching}
        onBranchChange={selectBranch}
        onReportChange={selectReport}
        onSearchDraftChange={setSearchDraft}
        onSearch={applySearch}
      />

      {(branchesQuery.error || inventory.error || summary.error) && (
        <div className="error-banner" role="alert">
          {getErrorMessage(branchesQuery.error ?? inventory.error ?? summary.error)}
        </div>
      )}

      <SummaryCards
        summary={summary.data}
        showing={inventory.data?.total ?? 0}
        loading={summary.isLoading}
        scopeLabel={scopeLabel}
      />
      <InventoryTable
        rows={inventory.data?.rows ?? []}
        loading={inventory.isLoading}
        canEdit={editable}
        canArchive={archivable}
        onEdit={setEditItem}
        onArchive={setArchiveItem}
      />
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={inventory.data?.total ?? 0}
        disabled={inventory.isFetching}
        onPageChange={setPage}
      />
      <JobStatusCenter />

      <EditSiDialog item={editItem} onClose={() => setEditItem(null)} />
      <ArchiveItemDialog item={archiveItem} onClose={() => setArchiveItem(null)} />
      <ImportDialog open={dialog === "import"} branches={branches} onClose={() => setDialog(null)} />
      <ExportDialog open={dialog === "export"} branches={branches} onClose={() => setDialog(null)} />
      <ClearReportDialog open={dialog === "clear"} branches={branches} onClose={() => setDialog(null)} />
    </AppShell>
  );
}
