import * as React from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
 label?: string;
 error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
 { label, error, className, id, ...props },
 ref,
): JSX.Element {
 const inputId = id ?? props.name ?? 'input';
 return (
 <div className="w-full">
 {label ? (
 <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
 {label}
 </label>
 ) : null}
 <input
 ref={ref}
 id={inputId}
 className={cn(
 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white',
 error && 'border-red-500 focus:border-red-500',
 className,
 )}
 {...props}
 />
 {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
 </div>
 );
});
