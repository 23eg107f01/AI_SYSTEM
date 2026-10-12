import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error = false, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "block min-h-24 w-full resize-y rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-interactive focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100",
        error
          ? "border-error-300 focus-visible:border-error-600 focus-visible:ring-error-500"
          : "border-slate-300 focus-visible:border-brand-600 focus-visible:ring-brand-500",
        className
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});
