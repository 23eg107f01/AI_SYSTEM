import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { AlertCircle, Clock3, ExternalLink, Filter, LifeBuoy, MessageSquare, RefreshCw, Search, Send, Wifi, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../utils/api";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { operationalQueryOptions, pollingIntervals, queryKeys } from "../utils/queryConfig";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SentimentBadge,
  Skeleton,
} from "../components/ui";

interface EscalatedTicket {
  ticket_id: number;
  user_id: number;
  customer_name: string | null;
  customer_email: string | null;
  message: string;
  category: string | null;
  sentiment: string | null;
  created_at: string;
  escalation_reason: string | null;
  assigned_agent_id: number | null;
  context_summary: string | null;
  suggested_reply: string | null;
  response_text: string | null;
}

function formatElapsed(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${minutes}m waiting`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m waiting`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h waiting`;
}

function isHighRisk(ticket: EscalatedTicket) {
  return ticket.sentiment === "Angry" || ticket.sentiment === "Frustrated";
}

function QueueSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading escalations">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="p-5"><div className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-24" /></div></Card>
      ))}
    </div>
  );
}

function EscalationCard({ ticket, onSelect, selected }: { ticket: EscalatedTicket; onSelect: () => void; selected: boolean }) {
  const highRisk = isHighRisk(ticket);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-4 text-left transition-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? "border-brand-400 bg-brand-50/60 shadow-sm" : highRisk ? "border-warning-200 bg-warning-50/40 hover:border-warning-300" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-card"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket #{ticket.ticket_id}</p><h2 className="mt-1 truncate text-sm font-semibold text-slate-900">{ticket.customer_name || `Customer ${ticket.user_id}`}</h2></div>
        {highRisk && <Badge variant="warning">High attention</Badge>}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{ticket.message}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">{ticket.category && <span className="text-xs font-medium text-slate-600">{ticket.category}</span>}{ticket.sentiment && <SentimentBadge sentiment={ticket.sentiment} />}</div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" /><time dateTime={ticket.created_at}>{formatElapsed(ticket.created_at)}</time></div>
    </button>
  );
}

export default function AgentQueue() {
  const queryClient = useQueryClient();
  const isTabVisible = usePageVisibility();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "high">("all");
  const [wsConnected, setWsConnected] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const queueQuery = useQuery<EscalatedTicket[]>(
    queryKeys.escalations,
    () => api.get<EscalatedTicket[]>("/agent/queue").then((response) => response.data),
    operationalQueryOptions(5000, pollingIntervals.escalations)
  );
  const tickets = queueQuery.data || [];

  useEffect(() => {
    if (!tickets.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !tickets.some((ticket) => ticket.ticket_id === selectedId)) setSelectedId(tickets[0].ticket_id);
  }, [tickets, selectedId]);

  const visibleTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch = !term || `${ticket.ticket_id} ${ticket.customer_name || ""} ${ticket.customer_email || ""} ${ticket.message} ${ticket.category || ""}`.toLowerCase().includes(term);
      return matchesSearch && (riskFilter === "all" || isHighRisk(ticket));
    });
  }, [tickets, search, riskFilter]);

  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.ticket_id === selectedId) || null, [tickets, selectedId]);

  const respondMutation = useMutation(
    ({ ticketId, responseText }: { ticketId: number; responseText: string }) => api.post(`/agent/tickets/${ticketId}/respond`, { response_text: responseText }),
    {
      onSuccess: (_, variables) => {
        setFeedback(`Ticket #${variables.ticketId} resolved and the customer has been notified.`);
        setDrafts((previous) => { const next = { ...previous }; delete next[variables.ticketId]; return next; });
        queryClient.invalidateQueries("manager-escalations");
        queryClient.invalidateQueries(["tickets", "detail", variables.ticketId]);
        queryClient.invalidateQueries(["tickets", "list"]);
      },
      onError: () => setFeedback("The response could not be sent. Please try again."),
    }
  );

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    const apiBase = api.defaults.baseURL || "http://localhost:8000";
    const wsUrl = apiBase.startsWith("/")
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${apiBase}/ws/agent/queue?token=${token}`
      : `${apiBase.replace(/^http/, "ws")}/ws/agent/queue?token=${token}`;
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => setWsConnected(true);
      socket.onmessage = () => queryClient.invalidateQueries("manager-escalations");
      socket.onclose = () => { setWsConnected(false); reconnect = setTimeout(connect, 3000); };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { socket?.close(); if (reconnect) clearTimeout(reconnect); };
  }, [queryClient]);

  function submitReply() {
    const text = selectedTicket ? drafts[selectedTicket.ticket_id]?.trim() : "";
    if (!selectedTicket || !text || respondMutation.isLoading) return;
    respondMutation.mutate({ ticketId: selectedTicket.ticket_id, responseText: text });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalations"
        description="Prioritize tickets that need human judgment and direct customer care."
        actions={<div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => queueQuery.refetch()} loading={queueQuery.isFetching} aria-label="Refresh escalations">{!queueQuery.isFetching && <RefreshCw aria-hidden="true" className="h-4 w-4" />}<span className="hidden sm:inline">Refresh</span></Button><span className="rounded-full border border-warning-200 bg-warning-50 px-3 py-1.5 text-sm font-semibold text-warning-800">{tickets.length} unresolved</span><span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex">{wsConnected ? <Wifi aria-hidden="true" className="h-3.5 w-3.5 text-success-600" /> : <WifiOff aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />}{wsConnected ? "Live updates" : "Reconnecting"}</span></div>}
      />
      {feedback && <div className={`rounded-lg border px-4 py-3 text-sm ${feedback.includes("could not") ? "border-error-200 bg-error-50 text-error-800" : "border-success-200 bg-success-50 text-success-800"}`} role="status" aria-live="polite">{feedback}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <section className="min-w-0 space-y-4" aria-labelledby="queue-heading">
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><label htmlFor="escalation-search" className="sr-only">Search escalations</label><Input id="escalation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, ticket or message" className="pl-9" /></div>
              <div className="flex items-center gap-2"><Filter aria-hidden="true" className="h-4 w-4 text-slate-400" /><Button type="button" size="sm" variant={riskFilter === "high" ? "secondary" : "outline"} onClick={() => setRiskFilter((current) => current === "high" ? "all" : "high")} aria-pressed={riskFilter === "high"}>High attention</Button></div>
            </div>
            <p id="queue-heading" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite"><span>{visibleTickets.length} of {tickets.length} escalations shown</span><span>{queueQuery.dataUpdatedAt ? `Last updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(queueQuery.dataUpdatedAt)}` : "Waiting for data"} · {queueQuery.isFetching && !queueQuery.isLoading ? "Updating…" : isTabVisible ? "Auto-refresh active · 20 sec" : "Auto-refresh resumes when active"}</span></p>
          </Card>

          {queueQuery.isLoading ? <QueueSkeleton /> : queueQuery.isError ? <ErrorState error={queueQuery.error} action={<Button variant="outline" size="sm" onClick={() => queueQuery.refetch()}>Try again</Button>} /> : visibleTickets.length === 0 ? <EmptyState title={tickets.length ? "No escalations match" : "Queue is clear"} description={tickets.length ? "Try a different search or remove the high-attention filter." : "New human-review tickets will appear here when the AI pipeline escalates them."} icon={<LifeBuoy aria-hidden="true" className="h-5 w-5" />} /> : <div className="space-y-3">{visibleTickets.map((ticket) => <EscalationCard key={ticket.ticket_id} ticket={ticket} selected={ticket.ticket_id === selectedId} onSelect={() => setSelectedId(ticket.ticket_id)} />)}</div>}
        </section>

        <section className="min-w-0 xl:sticky xl:top-6 xl:self-start" aria-label="Selected escalation">
          {selectedTicket ? (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/70 p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket #{selectedTicket.ticket_id}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{selectedTicket.customer_name || `Customer ${selectedTicket.user_id}`}</h2><p className="mt-1 text-sm text-slate-500">{selectedTicket.customer_email || "No contact email provided"}</p></div><Badge variant="warning">Escalated</Badge></div>
                <div className="mt-4 flex flex-wrap items-center gap-2">{selectedTicket.category && <Badge variant="info">{selectedTicket.category}</Badge>}{selectedTicket.sentiment && <SentimentBadge sentiment={selectedTicket.sentiment} />}<span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{formatElapsed(selectedTicket.created_at)}</span></div>
              </div>
              <div className="space-y-5 p-5">
                <div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer request</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedTicket.message}</p></div>
                <div className="rounded-lg border border-warning-200 bg-warning-50/60 p-4"><div className="flex gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" /><div><p className="text-sm font-semibold text-warning-900">Why it needs attention</p><p className="mt-1 text-sm leading-6 text-warning-800">{selectedTicket.escalation_reason || "The automated workflow routed this request for human review."}</p></div></div></div>
                {selectedTicket.context_summary && <div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI context summary</h3><p className="mt-2 text-sm leading-6 text-slate-600">{selectedTicket.context_summary}</p></div>}
                <div className="border-t border-slate-100 pt-5"><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="agent-response" className="text-sm font-semibold text-slate-900">Human response</label>{selectedTicket.suggested_reply && <Button type="button" variant="ghost" size="sm" onClick={() => setDrafts((current) => ({ ...current, [selectedTicket.ticket_id]: selectedTicket.suggested_reply || "" }))}>Use AI suggestion</Button>}</div><textarea id="agent-response" value={drafts[selectedTicket.ticket_id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [selectedTicket.ticket_id]: event.target.value }))} placeholder="Write a response to resolve this escalation..." className="min-h-32 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" disabled={respondMutation.isLoading} /><Button type="button" className="mt-3 w-full" loading={respondMutation.isLoading} disabled={!drafts[selectedTicket.ticket_id]?.trim()} onClick={submitReply}><Send aria-hidden="true" className="h-4 w-4" /> Send response & resolve</Button></div>
                <Link to={`/tickets/${selectedTicket.ticket_id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Open full ticket <ExternalLink aria-hidden="true" className="h-4 w-4" /></Link>
              </div>
            </Card>
          ) : (
            <Card className="p-5"><EmptyState title="Select an escalation" description="Choose a ticket to review its context and respond." icon={<MessageSquare aria-hidden="true" className="h-5 w-5" />} /></Card>
          )}
        </section>
      </div>
    </div>
  );
}
