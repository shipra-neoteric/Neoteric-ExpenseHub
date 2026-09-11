import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function getPageNumbers(page, totalPages) {
  const maxVisible = 5;
  if (totalPages <= maxVisible) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  let start = Math.max(2, page - 1);
  let end = Math.min(totalPages - 1, page + 1);
  if (page <= 3) end = 4;
  if (page >= totalPages - 2) start = totalPages - 3;
  if (start > 2) pages.push('...');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

export default function IMSPagination({ page, totalPages, total, limit, onPageChange }) {
  if (totalPages <= 0) return null;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:gap-4 sm:px-4">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        Showing {start} to {end} of {total} items
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Prev</span>
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[32px] rounded border px-2.5 py-1.5 text-sm sm:px-3 ${
                p === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
