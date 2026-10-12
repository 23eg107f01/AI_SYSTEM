import { type ReactNode } from "react";
import { cn } from "./cn";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, hint, error, required, children, className }: FormFieldProps) {
  const descriptionId = `${htmlFor}-description`;
  const errorId = `${htmlFor}-error`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true" className="ml-1 text-error-600">*</span>}
      </label>
      {children}
      {hint && !error && <p id={descriptionId} className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-error-700">{error}</p>}
    </div>
  );
}
