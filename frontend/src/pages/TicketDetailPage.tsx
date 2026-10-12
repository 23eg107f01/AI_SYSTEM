import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { ArrowLeft, CheckCircle2, Circle, Clock3, ExternalLink, FileText, MessageSquare, Sparkles, UserRound } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../utils/api";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SentimentBadge,
  Skeleton,
  StatusBadge,
} from "../components/ui";

interface TicketResponse {
  id: number;
  ticket_id: number;
  response_text: string;
  quality_score: number | null;
  citations: Array<{ source: string; chunk_id?: string }> | null;
}

interface TicketDetail {
  id: number;
  user_id: number;
  customer_name: string | null;
  customer_email: string | null;
  message: string;
  category: string | null;
  sentiment: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  response: TicketResponse | null;
  escalation: { reason?: string; assigned_agent_id?: number | null } | null;
}

interface WorkflowStage {
  label: string;
  description: string;
  complete: boolean;
  available: boolean;
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSubject(message: string) {
  const firstLine = message.split(/\r?\n/)[0].trim();
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine || "Support request";
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" role="status" aria-label="Loading ticket">
      <div className="space-y-6">
        <Skeleton className="h-9 w-2/3" />
        <Card className="space-y-4 p-6"><Skeleton className="h-5 w-28" /><Skeleton className="h-24 w-full" /><Skeleton className="h-5 w-40" /></Card>
        <Card className="space-y-4 p-6"><Skeleton className="h-5 w-36" /><Skeleton className="h-28 w-full" /></Card>
      </div>
      <Card className="space-y-5 p-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-36 w-full" /><Skeleton className="h-5 w-48" /></Card>
    </div>
  );
}

function Workflow({ ticket }: { ticket: TicketDetail }) {
  const stages: WorkflowStage[] = [
    { label: "Received", description: "Request entered the support workspace.", complete: true, available: true },
    { label: "Classified", description: "A category was detected for routing.", complete: Boolean(ticket.category), available: Boolean(ticket.category) },
    { label: "Sentiment checked", description: "Customer sentiment was analyzed.", complete: Boolean(ticket.sentiment), available: Boolean(ticket.sentiment) },
    { label: "Knowledge retrieved", description: "Citations were attached to the response.", complete: Boolean(ticket.response?.citations?.length), available: Boolean(ticket.response?.citations?.length) },
    { label: "Response generated", description: "An AI or human response is available.", complete: Boolean(ticket.response?.response_text), available: Boolean(ticket.response?.response_text) },
    { label: "Quality evaluated", description: "A helpfulness score was recorded.", complete: ticket.response?.quality_score !== null && ticket.response?.quality_score !== undefined, available: ticket.response?.quality_score !== null && ticket.response?.quality_score !== undefined },
  ];

  return (
    <ol className="space-y-1" aria-label="AI ticket workflow">
      {stages.map((stage, index) => (
        <li key={stage.label} className="relative flex gap-3 pb-4 last:pb-0">
          {index < stages.length - 1 && <span aria-hidden="true" className="absolute left-[9px] top-5 h-[calc(100%-8px)] w-px bg-slate-200" />}
          <span className="relative z-10 mt-0.5 bg-white">
            {stage.complete ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success-600" /> : <Circle aria-hidden="true" className="h-5 w-5 text-slate-300" />}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${stage.complete ? "text-slate-900" : "text-slate-500"}`}>{stage.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{stage.available ? stage.description : "Not confirmed by the available ticket data."}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const id = Number(ticketId);

  const { data: ticket, isLoading, isError, error: queryError, refetch } = useQuery<TicketDetail>(
    ["tickets", "detail", id],
    () => api.get<TicketDetail>(`/api/tickets/${id}`).then((response) => response.data),
    { enabled: Number.isInteger(id) && id > 0, staleTime: 15_000, refetchOnWindowFocus: true }
  );

  const resolveMutation = useMutation(
    () => api.patch(`/api/dashboard/tickets/${id}/resolve`),
    {
      onSuccess: async () => {
        setResolveOpen(false);
        setFeedback("Ticket marked as resolved.");
        await Promise.all([
          queryClient.invalidateQueries(["tickets", "detail", id]),
          queryClient.invalidateQueries(["tickets", "list"]),
          queryClient.invalidateQueries(["dashboard"]),
        ]);
      },
      onError: () => setFeedback("We couldn't resolve this ticket. Please try again."),
    }
  );

  const workflow = useMemo(() => ticket ? {
    citationCount: ticket.response?.citations?.length || 0,
    score: ticket.response?.quality_score,
  } : null, [ticket]);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !ticket) {
    return <ErrorState error={queryError} action={<Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>} />;
  }

  const isEscalated = ticket.status === "escalated" || Boolean(ticket.escalation);
  const isResolved = ticket.status === "resolved";

  return (
    <div className="space-y-6">
      <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/tickets")}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to tickets
      </Button>

      <PageHeader
        title={getSubject(ticket.message)}
        description={`Ticket #${ticket.id} · Opened ${formatDate(ticket.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} size="md" />
            {isEscalated && <Link to="/agent"><Button variant="outline" size="sm"><ExternalLink aria-hidden="true" className="h-4 w-4" /> Open escalation queue</Button></Link>}
            {!isResolved && !isEscalated && <Button size="sm" onClick={() => setResolveOpen(true)}><CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Resolve ticket</Button>}
          </div>
        }
      />

      {feedback && <div className={`rounded-lg border px-4 py-3 text-sm ${feedback.includes("couldn't") ? "border-error-200 bg-error-50 text-error-800" : "border-success-200 bg-success-50 text-success-800"}`} role="status">{feedback}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText aria-hidden="true" className="h-4 w-4 text-brand-600" /> Customer request</div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{ticket.message}</p>
            <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</dt><dd className="mt-1 flex items-center gap-2 text-sm text-slate-700"><UserRound aria-hidden="true" className="h-4 w-4 text-slate-400" />{ticket.customer_name || "Not provided"}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</dt><dd className="mt-1 text-sm text-slate-700">{ticket.customer_email || "Not provided"}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Created</dt><dd className="mt-1 flex items-center gap-2 text-sm text-slate-700"><Clock3 aria-hidden="true" className="h-4 w-4 text-slate-400" />{formatDate(ticket.created_at)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resolved</dt><dd className="mt-1 text-sm text-slate-700">{formatDate(ticket.resolved_at)}</dd></div>
            </dl>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare aria-hidden="true" className="h-4 w-4 text-brand-600" /> Generated support response</div>
            {ticket.response?.response_text ? (
              <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/50 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap">{ticket.response.response_text}</div>
            ) : (
              <EmptyState className="mt-4" title="No response recorded" description="A response will appear here after the AI pipeline or a support agent responds." />
            )}
            {workflow?.citationCount ? <p className="mt-4 text-xs text-slate-500">{workflow.citationCount} knowledge source{workflow.citationCount === 1 ? "" : "s"} attached to this response.</p> : null}
          </Card>

          {isEscalated && <Card className="border-warning-200 bg-warning-50/50 p-5 sm:p-6"><p className="text-sm font-semibold text-warning-900">Human support required</p><p className="mt-1 text-sm leading-6 text-warning-800">{ticket.escalation?.reason || "This ticket has been escalated for human review."}</p><Link to="/agent" className="mt-4 inline-flex text-sm font-semibold text-warning-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500">Review in escalation queue</Link></Card>}
        </main>

        <aside className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2"><Sparkles aria-hidden="true" className="h-5 w-5 text-brand-600" /><h2 className="text-base font-semibold text-slate-950">AI Analysis</h2></div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Signals exposed by the current ticket pipeline.</p>
            <dl className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-500">Detected category</dt><dd className="text-right text-sm font-semibold text-slate-900">{ticket.category || "Not available"}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-500">Sentiment</dt><dd>{ticket.sentiment ? <SentimentBadge sentiment={ticket.sentiment} /> : <span className="text-sm text-slate-400">Not available</span>}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-500">Escalation</dt><dd className="text-sm font-semibold text-slate-900">{isEscalated ? "Human review" : "Not escalated"}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-500">Helpfulness score</dt><dd className="text-sm font-semibold text-slate-900">{workflow?.score !== null && workflow?.score !== undefined ? `${workflow.score}/10` : "Not evaluated"}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-500">Clarity score</dt><dd className="text-sm text-slate-400">Not exposed</dd></div>
            </dl>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold text-slate-950">AI workflow</h2>
            <p className="mt-1 mb-5 text-xs leading-5 text-slate-500">Completed stages are based on confirmed ticket fields.</p>
            <Workflow ticket={ticket} />
          </Card>
        </aside>
      </div>

      <Dialog open={resolveOpen} onClose={() => setResolveOpen(false)} title="Resolve this ticket?" description="This records the ticket as resolved and timestamps the resolution.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setResolveOpen(false)}>Cancel</Button>
          <Button loading={resolveMutation.isLoading} onClick={() => resolveMutation.mutate()}><CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Confirm resolution</Button>
        </div>
      </Dialog>
    </div>
  );
}
