import { type HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant = "neutral" | "brand" | "success" | "warning" | "error" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variants: Record<BadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  success: "border-success-100 bg-success-50 text-success-700",
  warning: "border-warning-100 bg-warning-50 text-warning-700",
  error: "border-error-100 bg-error-50 text-error-700",
  info: "border-info-100 bg-info-50 text-info-700",
};

export function Badge({ className, variant = "neutral", size = "sm", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
