import { Badge, type BadgeProps } from "./Badge";

export type Priority = "low" | "medium" | "high" | "urgent";

const priorityConfig: Record<Priority, { label: string; variant: BadgeProps["variant"] }> = {
  low: { label: "Low", variant: "neutral" },
  medium: { label: "Medium", variant: "info" },
  high: { label: "High", variant: "warning" },
  urgent: { label: "Urgent", variant: "error" },
};

export interface PriorityBadgeProps extends Omit<BadgeProps, "children"> {
  priority: Priority | string;
}

export function PriorityBadge({ priority, ...props }: PriorityBadgeProps) {
  const config = priorityConfig[priority as Priority] || { label: priority, variant: "neutral" as const };
  return <Badge variant={config.variant} {...props}>{config.label}</Badge>;
}
