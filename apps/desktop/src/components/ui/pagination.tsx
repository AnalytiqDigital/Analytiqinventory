import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export interface PaginationProps {
  page: number;
  pageCount: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

type PageItem = { kind: 'page'; value: number } | { kind: 'gap'; key: string };

/** First, last and the current page's neighbours — enough to orient a cashier. */
function pageWindow(page: number, pageCount: number): PageItem[] {
  const candidates = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...candidates].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const items: PageItem[] = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1]! > 1) {
      items.push({ kind: 'gap', key: `gap-${value}` });
    }
    items.push({ kind: 'page', value });
  });
  return items;
}

export function Pagination({
  page,
  pageCount,
  total,
  onPageChange,
  className,
}: PaginationProps): JSX.Element {
  const count = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), count);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 text-sm', className)}
    >
      <span className="tabular-nums text-slate-600 dark:text-slate-300">
        Page {current} of {count}
        {total != null ? ` · ${total.toLocaleString()} items` : ''}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous page"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Prev
        </Button>
        {pageWindow(current, count).map((item) =>
          item.kind === 'gap' ? (
            <span key={item.key} className="px-1 text-slate-400" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item.value}
              type="button"
              aria-label={`Page ${item.value}`}
              aria-current={item.value === current ? 'page' : undefined}
              onClick={() => onPageChange(item.value)}
              className={cn(
                'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                item.value === current
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              {item.value}
            </button>
          )
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next page"
          disabled={current >= count}
          onClick={() => onPageChange(current + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
