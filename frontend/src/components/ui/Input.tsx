import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputClassName, error = false, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "block min-h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-interactive focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
        error
          ? "border-error-300 focus-visible:border-error-600 focus-visible:ring-error-500"
          : "border-slate-300 focus-visible:border-brand-600 focus-visible:ring-brand-500",
        inputClassName,
        className
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});
