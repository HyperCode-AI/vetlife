import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  className = '',
}) => {
  const safeTotalItems = Number.isFinite(Number(totalItems)) ? Math.max(0, Math.floor(Number(totalItems))) : 0;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 10;
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1;

  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));
  if (safeTotalItems <= 0) return null;

  const currentPage = Math.min(Math.max(1, safePage), totalPages);
  const startItem = safeTotalItems === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const endItem = Math.min(safeTotalItems, currentPage * safePageSize);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div
      className={`mt-5 pt-4 border-t border-[#e5e5ea] flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <p className="text-[12px] text-[#6e6e73]">
        Mostrando <span className="font-semibold text-[#1d1d1f]">{startItem}</span>–
        <span className="font-semibold text-[#1d1d1f]">{endItem}</span> de{' '}
        <span className="font-semibold text-[#1d1d1f]">{safeTotalItems}</span> registro(s)
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-8 px-3 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] disabled:opacity-40 disabled:pointer-events-none text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {pages.map((p, idx) =>
            p === '...' ? (
              <span key={`dots-${idx}`} className="px-1.5 text-[12px] text-[#86868b]">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-full text-[12px] font-semibold transition cursor-pointer ${
                  p === currentPage
                    ? 'bg-[#0b2240] text-white shadow-sm'
                    : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e5e5ea]'
                }`}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-8 px-3 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] disabled:opacity-40 disabled:pointer-events-none text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
        >
          Próxima <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
