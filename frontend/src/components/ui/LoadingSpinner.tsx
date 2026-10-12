import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ label = "Loading", size = "md", className }: LoadingSpinnerProps) {
  const sizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" };
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-slate-500", className)} role="status" aria-label={label}>
      <Loader2 aria-hidden="true" className={cn("animate-spin text-brand-600", sizes[size])} />
      {label}
    </span>
  );
}
