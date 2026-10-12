import { AlertCircle } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "./cn";
import { getApiErrorMessage, getApiStatus } from "../../utils/errorMessages";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  error?: unknown;
  className?: string;
}

export function ErrorState({ title, description, action, error, className }: ErrorStateProps) {
  const status = getApiStatus(error);
  const resolvedTitle = title || (status === 403 ? "Access restricted" : status === 404 ? "Not found" : "Something went wrong");
  const resolvedDescription = description || getApiErrorMessage(error, "We couldn't load this content. Please try again.");
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-error-100 bg-error-50 px-6 py-10 text-center", className)} role="alert">
      <AlertCircle aria-hidden="true" className="h-6 w-6 text-error-600" />
      <h2 className="mt-3 text-sm font-semibold text-error-900">{resolvedTitle}</h2>
      <p className="mt-1 max-w-sm text-sm text-error-700">{resolvedDescription}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
