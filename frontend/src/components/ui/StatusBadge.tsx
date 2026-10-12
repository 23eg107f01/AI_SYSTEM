import { Badge, type BadgeProps, type BadgeVariant } from "./Badge";

export type Status = "open" | "pending" | "processing" | "resolved" | "escalated" | "ready" | "failed" | "error";

const statusConfig: Record<Status, { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "info" },
  pending: { label: "Pending", variant: "neutral" },
  processing: { label: "Processing", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
  escalated: { label: "Escalated", variant: "warning" },
  ready: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  error: { label: "Error", variant: "error" },
};

export interface StatusBadgeProps extends Omit<BadgeProps, "children"> {
  status: Status | string;
}

export function StatusBadge({ status, ...props }: StatusBadgeProps) {
  const config = statusConfig[status as Status] || { label: status, variant: "neutral" as const };
  return <Badge variant={config.variant} {...props}>{config.label}</Badge>;
}
