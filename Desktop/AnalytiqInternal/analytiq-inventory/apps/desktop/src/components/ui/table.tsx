import * as React from 'react';
import { cn } from '../../lib/cn';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/50" {...props} />;
}

export function TRow(props: React.HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return <tr className="border-t border-slate-100 dark:border-slate-800" {...props} />;
}

export function TH(props: React.ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <th className="px-4 py-3 font-medium" {...props} />;
}

export function TD(props: React.TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <td className="px-4 py-3 text-slate-700 dark:text-slate-200" {...props} />;
}
