export const queryKeys = {
  dashboardStats: ["dashboard", "stats"] as const,
  dashboardEscalations: ["dashboard", "escalations"] as const,
  tickets: ["tickets", "list"] as const,
  escalations: "manager-escalations",
} as const;

export const pollingIntervals = {
  dashboard: 30_000,
  tickets: 60_000,
  escalations: 20_000,
} as const;

export const operationalQueryOptions = (staleTime: number, refetchInterval: number) => ({
  staleTime,
  refetchInterval,
  refetchOnWindowFocus: true,
  // React Query pauses interval polling while the document is hidden.
  refetchIntervalInBackground: false,
  retry: 1,
});
