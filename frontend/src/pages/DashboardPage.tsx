import { useMemo, useState } from "react";
import { useQueries, useQueryClient } from "react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  LifeBuoy,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, ErrorState, SentimentBadge, Skeleton, StatCard, StatusBadge, TableSkeleton } from "../components/ui";
import api from "../utils/api";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { operationalQueryOptions, pollingIntervals, queryKeys } from "../utils/queryConfig";

interface DashboardStats {
  total_tickets: number;
  today_tickets: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  by_sentiment: Record<string, number>;
  avg_quality_score: number;
  quality_trend: Array<{ date: string; score: number }>;
  escalation_rate: number;
  avg_response_time_minutes: number;
  sla_compliance_rate: number;
  sla: { amber_count: number; red_count: number };
  today_llm_cost_usd: number;
  generated_at: string;
}

interface Ticket {
  id: number;
  user_id: number;
  customer_name?: string | null;
  customer_email?: string | null;
  message: string;
  category: string | null;
  sentiment: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

interface EscalatedTicket {
  ticket_id: number;
  message: string;
  category: string | null;
  sentiment: string | null;
  created_at: string;
  escalation_reason: string | null;
}

interface QueryResult<T> {
  data?: T;
  dataUpdatedAt: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

const chartColors = ["#4f46e5", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6"];

function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }
  ).format(date);
}

function formatMinutes(value: number): string {
  if (value < 1) return "<1m";
  if (value < 60) return `${value.toFixed(1)}m`;
  return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ChartPanel({ title, description, children, className = "" }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`min-w-0 p-5 sm:p-6 ${className}`}>
      <div className="mb-5">
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="h-64 min-w-0 w-full overflow-hidden" role="img" aria-label={`${title}: ${description}`}>
        {children}
      </div>
    </Card>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-64 w-full rounded-lg" />;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const isTabVisible = usePageVisibility();
  const [refreshing, setRefreshing] = useState(false);
  const results = useQueries([
    {
      queryKey: queryKeys.dashboardStats,
      queryFn: () => api.get<DashboardStats>("/api/dashboard/stats").then((response) => response.data),
      ...operationalQueryOptions(15_000, pollingIntervals.dashboard),
    },
    {
      queryKey: queryKeys.tickets,
      queryFn: () => api.get<Ticket[]>("/api/tickets").then((response) => response.data),
      ...operationalQueryOptions(30_000, pollingIntervals.dashboard),
    },
    {
      queryKey: queryKeys.dashboardEscalations,
      queryFn: () => api.get<EscalatedTicket[]>("/api/agent/queue").then((response) => response.data),
      ...operationalQueryOptions(10_000, pollingIntervals.dashboard),
    },
  ]) as [QueryResult<DashboardStats>, QueryResult<Ticket[]>, QueryResult<EscalatedTicket[]>];

  const [statsQuery, ticketsQuery, escalationsQuery] = results;
  const stats = statsQuery.data;
  const tickets = ticketsQuery.data || [];
  const escalations = escalationsQuery.data || [];
  const loading = results.some((query) => query.isLoading);
  const fetching = results.some((query) => query.isFetching);
  const hasError = results.some((query) => query.error);
  const lastUpdatedAt = Math.max(...results.map((query) => query.dataUpdatedAt || 0));

  const resolvedTickets = stats?.by_status.resolved || 0;
  const openTickets = stats?.by_status.open || 0;
  const escalatedTickets = stats?.by_status.escalated || 0;
  const resolutionRate = stats && stats.total_tickets > 0
    ? Math.round((resolvedTickets / stats.total_tickets) * 100)
    : 0;

  const categoryData = useMemo(
    () => Object.entries(stats?.by_category || {}).map(([name, value]) => ({ name: humanize(name), value })),
    [stats?.by_category]
  );
  const statusData = useMemo(
    () => Object.entries(stats?.by_status || {}).map(([name, value]) => ({ name: humanize(name), value })),
    [stats?.by_status]
  );
  const sentimentData = useMemo(
    () => Object.entries(stats?.by_sentiment || {}).map(([name, value]) => ({ name, value })),
    [stats?.by_sentiment]
  );
  const recentTickets = tickets.slice(0, 8);

  async function refreshDashboard() {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries(queryKeys.dashboardStats),
        queryClient.invalidateQueries(queryKeys.tickets),
        queryClient.invalidateQueries(queryKeys.dashboardEscalations),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  if (hasError && !stats) {
    return (
      <div className="mx-auto max-w-7xl">
        <ErrorState
          title="Support overview unavailable"
          description={undefined}
          error={statsQuery.error || ticketsQuery.error || escalationsQuery.error}
          action={<Button onClick={refreshDashboard} loading={refreshing}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Operations dashboard</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Support Overview</h1>
          <p className="mt-2 text-sm text-slate-600">Monitor ticket activity, AI performance and escalations.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-right text-xs text-slate-500">
            <span className="block font-medium text-slate-600">{lastUpdatedAt ? `Last updated ${formatDate(new Date(lastUpdatedAt).toISOString(), true)}` : "Waiting for data"}</span>
            <span className="mt-0.5 block">{fetching ? "Updating cached data…" : isTabVisible ? "Auto-refresh active · 30 sec" : "Auto-refresh resumes when active"}</span>
          </p>
          <Button variant="outline" size="sm" onClick={refreshDashboard} loading={refreshing} aria-label="Refresh support overview">
            {!refreshing && <RefreshCw aria-hidden="true" className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {hasError && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800" role="status">
          Some dashboard sections could not be updated. Showing the latest available data.
        </div>
      )}

      <section aria-label="Support key performance indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total tickets" value={loading ? <Skeleton className="h-8 w-20" /> : stats?.total_tickets ?? "—"} description={stats ? `${stats.today_tickets} created today` : "Loading"} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Open tickets" value={loading ? <Skeleton className="h-8 w-20" /> : openTickets} description="Awaiting resolution" icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Resolved tickets" value={loading ? <Skeleton className="h-8 w-20" /> : resolvedTickets} description={stats ? `${resolutionRate}% resolution rate` : "Loading"} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Escalated tickets" value={loading ? <Skeleton className="h-8 w-20" /> : escalatedTickets} description={stats ? `${stats.escalation_rate}% of all tickets` : "Loading"} icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label="AI quality score" value={loading ? <Skeleton className="h-8 w-20" /> : stats ? `${stats.avg_quality_score}/10` : "—"} description={stats ? `Avg. response time ${formatMinutes(stats.avg_response_time_minutes)}` : "Loading"} icon={<Sparkles className="h-5 w-5" />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {loading ? <ChartPanel title="Tickets by category" description="Distribution of classified support tickets"><ChartSkeleton /></ChartPanel> : categoryData.length ? (
          <ChartPanel title="Tickets by category" description="Distribution of classified support tickets">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#eef2ff" }} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
                <Bar dataKey="value" name="Tickets" fill="#4f46e5" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        ) : <EmptyState title="No category data yet" description="Classified tickets will appear here." />}

        {loading ? <ChartPanel title="Ticket status" description="Current distribution of support work"><ChartSkeleton /></ChartPanel> : statusData.length ? (
          <ChartPanel title="Ticket status" description="Current distribution of support work">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={3}>
                  {statusData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>
        ) : <EmptyState title="No status data yet" description="Ticket statuses will appear here." />}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        {loading ? <ChartPanel title="AI quality trend" description="Daily average response quality from available responses"><ChartSkeleton /></ChartPanel> : stats?.quality_trend.length ? (
          <ChartPanel title="AI quality trend" description="Daily average response quality from available responses">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.quality_trend} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value: number) => [`${value}/10`, "Quality"]} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
                <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 3, fill: "#4f46e5" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        ) : <EmptyState title="No quality trend yet" description="AI response quality appears after responses are recorded." />}

        {loading ? <ChartPanel title="Sentiment distribution" description="Sentiment detected across support tickets"><ChartSkeleton /></ChartPanel> : sentimentData.length ? (
          <ChartPanel title="Sentiment distribution" description="Sentiment detected across support tickets">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={3}>
                  {sentimentData.map((entry, index) => <Cell key={entry.name} fill={chartColors[(index + 2) % chartColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>
        ) : <EmptyState title="No sentiment data yet" description="Analyzed ticket sentiment will appear here." />}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Recent tickets</h2>
              <p className="mt-1 text-xs text-slate-500">The latest support activity from the ticket queue.</p>
            </div>
            <span className="text-xs font-medium text-slate-400">{tickets.length} available</span>
          </div>
          <div className="sm:hidden">
            {loading ? <div className="space-y-3 p-4"><TableSkeleton rows={4} columns={3} /></div> : recentTickets.length ? (
              <div className="divide-y divide-slate-100">
                {recentTickets.map((ticket) => (
                  <article key={ticket.id} className="min-w-0 space-y-3 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">#{ticket.id}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">{ticket.message}</p>
                      </div>
                      {ticket.status === "escalated" ? <Link to="/agent" className="shrink-0 text-xs font-semibold text-brand-700">Open</Link> : <span className="shrink-0 text-xs text-slate-400">Tracked</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.category && <span className="max-w-full break-words text-xs text-slate-600">{ticket.category}</span>}
                      {ticket.sentiment && <SentimentBadge sentiment={ticket.sentiment} />}
                      <StatusBadge status={ticket.status} />
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState className="m-5" title="No tickets yet" description="New support tickets will appear here." />}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            {loading ? <div className="p-6"><TableSkeleton rows={5} columns={5} /></div> : recentTickets.length ? (
              <table className="w-full min-w-[680px] text-left text-sm">
                <caption className="sr-only">Recent support tickets</caption>
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold sm:px-6">Ticket</th>
                    <th className="px-3 py-3 font-semibold">Category</th>
                    <th className="px-3 py-3 font-semibold">Sentiment</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Created</th>
                    <th className="px-5 py-3 text-right font-semibold sm:px-6">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTickets.map((ticket) => (
                    <tr key={ticket.id} className="transition-colors hover:bg-slate-50">
                      <td className="max-w-[240px] px-5 py-3.5 sm:px-6">
                        <p className="font-semibold text-slate-800">#{ticket.id}</p>
                        <p className="truncate text-xs text-slate-500">{ticket.message}</p>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-600">{ticket.category || "Unclassified"}</td>
                      <td className="px-3 py-3.5">{ticket.sentiment ? <SentimentBadge sentiment={ticket.sentiment} /> : <span className="text-xs text-slate-400">—</span>}</td>
                      <td className="px-3 py-3.5"><StatusBadge status={ticket.status} /></td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-500">{formatDate(ticket.created_at, true)}</td>
                      <td className="px-5 py-3.5 text-right sm:px-6">
                        {ticket.status === "escalated" ? <Link to="/agent" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Open <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link> : <span className="text-xs text-slate-400">Tracked</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState className="m-5" title="No tickets yet" description="New support tickets will appear in this table." />}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Escalation preview</h2>
              <p className="mt-1 text-xs text-slate-500">Tickets waiting for human attention.</p>
            </div>
            <ShieldAlert aria-hidden="true" className="h-5 w-5 text-warning-600" />
          </div>
          <div className="p-5">
            {loading ? <div className="space-y-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : escalations.length ? (
              <div className="space-y-3">
                {escalations.slice(0, 4).map((ticket) => (
                  <Link key={ticket.ticket_id} to="/agent" className="block rounded-xl border border-slate-200 p-3 transition-interactive hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-bold text-slate-800">Ticket #{ticket.ticket_id}</p>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-warning-500" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{ticket.message}</p>
                    <p className="mt-2 text-[11px] text-slate-400">{ticket.category || "Unclassified"} · {formatDate(ticket.created_at, true)}</p>
                  </Link>
                ))}
                <Link to="/agent" className="flex items-center justify-center gap-1 pt-2 text-xs font-semibold text-brand-700 hover:text-brand-600">View escalation queue <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
              </div>
            ) : <EmptyState title="No active escalations" description="Tickets requiring human support will appear here." icon={<LifeBuoy aria-hidden="true" className="h-5 w-5" />} />}
          </div>
        </Card>
      </section>

      {stats && (
        <footer className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning-600" /> SLA at risk: {stats.sla.amber_count + stats.sla.red_count}</div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success-600" /> SLA compliance: {stats.sla_compliance_rate}%</div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Sparkles aria-hidden="true" className="h-4 w-4 text-brand-600" /> Today&apos;s AI cost: ${stats.today_llm_cost_usd.toFixed(4)}</div>
        </footer>
      )}
    </div>
  );
}
