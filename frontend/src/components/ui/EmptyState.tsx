import { Inbox } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center", className)}>
      <div className="mb-4 rounded-full bg-slate-100 p-3 text-slate-500">{icon || <Inbox aria-hidden="true" className="h-5 w-5" />}</div>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
