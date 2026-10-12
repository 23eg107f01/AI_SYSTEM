import { Badge, type BadgeProps } from "./Badge";

export type Sentiment = "Happy" | "Neutral" | "Frustrated" | "Angry";

const sentimentConfig: Record<Sentiment, { variant: BadgeProps["variant"] }> = {
  Happy: { variant: "success" },
  Neutral: { variant: "neutral" },
  Frustrated: { variant: "warning" },
  Angry: { variant: "error" },
};

export interface SentimentBadgeProps extends Omit<BadgeProps, "children"> {
  sentiment: Sentiment | string;
}

export function SentimentBadge({ sentiment, ...props }: SentimentBadgeProps) {
  const config = sentimentConfig[sentiment as Sentiment] || { variant: "neutral" as const };
  return <Badge variant={config.variant} {...props}>{sentiment}</Badge>;
}
