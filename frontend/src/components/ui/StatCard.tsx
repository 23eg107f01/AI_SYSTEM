import { type ReactNode } from "react";
import { Card } from "./Card";
import { cn } from "./cn";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  trend?: { value: string; label: string; positive?: boolean };
  className?: string;
}

export function StatCard({ label, value, description, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        {icon && <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">{icon}</div>}
      </div>
      {(description || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {trend && (
            <span className={cn("font-semibold", trend.positive === false ? "text-error-700" : "text-success-700")}>
              {trend.value}
            </span>
          )}
          <span className="text-slate-500">{trend?.label || description}</span>
        </div>
      )}
    </Card>
  );
}
