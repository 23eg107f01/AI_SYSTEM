import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error = false, children, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "block min-h-10 w-full appearance-none rounded-md border bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm transition-interactive focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100",
          error
            ? "border-error-300 focus-visible:border-error-600 focus-visible:ring-error-500"
            : "border-slate-300 focus-visible:border-brand-600 focus-visible:ring-brand-500",
          className
        )}
        aria-invalid={error || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
});
