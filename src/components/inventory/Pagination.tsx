import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  disabled,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav className="pagination" aria-label="Inventory pages">
      <span>
        {first}–{last} of {total.toLocaleString()}
      </span>
      <div>
        <button
          className="button secondary"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
          Previous
        </button>
        <span>
          Page {Math.min(page, totalPages)} of {totalPages}
        </span>
        <button
          className="button secondary"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight />
        </button>
      </div>
    </nav>
  );
}
