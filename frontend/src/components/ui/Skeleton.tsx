import { type HTMLAttributes } from "react";
import { cn } from "./cn";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rect" | "circle";
}

export function Skeleton({ className, variant = "rect", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-slate-200",
        variant === "text" && "h-3 rounded",
        variant === "rect" && "rounded-md",
        variant === "circle" && "rounded-full",
        className
      )}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading table" role="status">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, column) => <Skeleton key={column} variant="text" className="h-4" />)}
        </div>
      ))}
    </div>
  );
}
