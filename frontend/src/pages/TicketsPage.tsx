import { useEffect, useMemo, useState } from "react";
import { useQuery } from "react-query";
import { ArrowUpDown, ExternalLink, FilterX, Plus, RefreshCw, Ticket as TicketIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Select,
  SentimentBadge,
  Skeleton,
  StatusBadge,
} from "../components/ui";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { operationalQueryOptions, pollingIntervals, queryKeys } from "../utils/queryConfig";

interface Ticket {
  id: number;
  user_id: number;
  customer_name: string | null;
  customer_email: string | null;
  message: string;
  category: string | null;
  sentiment: string | null;
  status: string;
  created_at: string;
  resolved_at?: string | null;
}

type SortOption = "newest" | "oldest";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTicketLabel(ticket: Ticket) {
  return ticket.message.trim().replace(/\s+/g, " ");
}

function TicketTableSkeleton() {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading tickets">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid grid-cols-5 gap-4 border-b border-slate-100 py-4 last:border-0">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function TicketCard({ ticket, onOpen }: { ticket: Ticket; onOpen: (ticket: Ticket) => void }) {
  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-interactive hover:border-brand-200 hover:shadow-elevated focus-within:ring-2 focus-within:ring-brand-500"
      onClick={() => onOpen(ticket)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket #{ticket.id}</p>
          <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{getTicketLabel(ticket)}</h2>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ticket.category && <span className="text-xs font-medium text-slate-600">{ticket.category}</span>}
        {ticket.sentiment && <SentimentBadge sentiment={ticket.sentiment} />}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{ticket.customer_name || ticket.customer_email || "Unknown customer"}</span>
        <time dateTime={ticket.created_at}>{formatDate(ticket.created_at)}</time>
      </div>
      <button
        type="button"
        className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition-interactive hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(ticket);
        }}
      >
        Open ticket <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

export default function TicketsPage() {
  const navigate = useNavigate();
  const isTabVisible = usePageVisibility();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");

  const { data: tickets = [], isLoading, isFetching, isError, error: queryError, refetch, dataUpdatedAt } = useQuery<Ticket[]>(
    queryKeys.tickets,
    () => api.get<Ticket[]>("/api/tickets").then((response) => response.data),
    operationalQueryOptions(15_000, pollingIntervals.tickets)
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const categories = useMemo(
    () => Array.from(new Set(tickets.map((ticket) => ticket.category).filter((value): value is string => Boolean(value)))).sort(),
    [tickets]
  );

  const filteredTickets = useMemo(() => {
    const result = tickets.filter((ticket) => {
      const searchable = `${ticket.id} ${ticket.message} ${ticket.customer_name || ""} ${ticket.customer_email || ""}`.toLowerCase();
      return (
        (!debouncedSearch || searchable.includes(debouncedSearch)) &&
        (!status || ticket.status === status) &&
        (!category || ticket.category === category) &&
        (!sentiment || ticket.sentiment === sentiment)
      );
    });

    return result.sort((a, b) => {
      const difference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "newest" ? -difference : difference;
    });
  }, [tickets, debouncedSearch, status, category, sentiment, sort]);

  const hasFilters = Boolean(search || status || category || sentiment || sort !== "newest");

  function clearFilters() {
    setSearch("");
    setStatus("");
    setCategory("");
    setSentiment("");
    setSort("newest");
  }

  function openTicket(ticket: Ticket) {
    navigate(`/tickets/${ticket.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Review, prioritize and follow up on customer support requests."
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()} loading={isFetching} aria-label="Refresh tickets">
              {!isFetching && <RefreshCw aria-hidden="true" className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button type="button" onClick={() => navigate("/chat")}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              New Ticket
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="min-w-0 flex-1 xl:max-w-md">
              <label htmlFor="ticket-search" className="sr-only">Search tickets</label>
              <SearchInput
                id="ticket-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tickets, customers or messages"
                aria-label="Search tickets, customers or messages"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:flex xl:flex-1">
              <label className="sr-only" htmlFor="ticket-status">Filter by status</label>
              <Select id="ticket-status" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </Select>
              <label className="sr-only" htmlFor="ticket-category">Filter by category</label>
              <Select id="ticket-category" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
                <option value="">All categories</option>
                {categories.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
              <label className="sr-only" htmlFor="ticket-sentiment">Filter by sentiment</label>
              <Select id="ticket-sentiment" value={sentiment} onChange={(event) => setSentiment(event.target.value)} aria-label="Filter by sentiment">
                <option value="">All sentiment</option>
                <option value="Happy">Happy</option>
                <option value="Neutral">Neutral</option>
                <option value="Frustrated">Frustrated</option>
                <option value="Angry">Angry</option>
              </Select>
              <label className="sr-only" htmlFor="ticket-sort">Sort tickets</label>
              <Select id="ticket-sort" value={sort} onChange={(event) => setSort(event.target.value as SortOption)} aria-label="Sort tickets">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </Select>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters} className="shrink-0">
              <FilterX aria-hidden="true" className="h-4 w-4" />
              Clear filters
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span aria-live="polite">
              {isLoading ? "Loading tickets…" : `${filteredTickets.length} of ${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}`}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              {dataUpdatedAt > 0 && <span>Last updated {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(dataUpdatedAt)}</span>}
              {isFetching && !isLoading ? <span role="status">Updating…</span> : isTabVisible ? <span>Auto-refresh active · 60 sec</span> : <span>Auto-refresh resumes when active</span>}
              {sort === "oldest" && <span className="inline-flex items-center gap-1"><ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" /> Oldest first</span>}
            </span>
          </div>
        </div>

        {isLoading ? (
          <TicketTableSkeleton />
        ) : isError ? (
          <div className="p-5">
            <ErrorState error={queryError} action={<Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>} />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={tickets.length ? "No tickets match these filters" : "No tickets yet"}
              description={tickets.length ? "Try broadening your search or clearing a filter." : "New customer requests will appear here."}
              icon={<TicketIcon aria-hidden="true" className="h-5 w-5" />}
              action={tickets.length ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left">
                <caption className="sr-only">Support tickets</caption>
                <thead className="border-b border-slate-200 bg-white">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-5 py-3">Ticket</th>
                    <th scope="col" className="px-5 py-3">Request</th>
                    <th scope="col" className="px-5 py-3">Category</th>
                    <th scope="col" className="px-5 py-3">Sentiment</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3">Created</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      tabIndex={0}
                      className="cursor-pointer text-sm text-slate-700 transition-colors hover:bg-brand-50/40 focus-visible:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                      onClick={() => openTicket(ticket)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openTicket(ticket);
                        }
                      }}
                    >
                      <th scope="row" className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">#{ticket.id}</th>
                      <td className="max-w-[280px] px-5 py-4">
                        <p className="truncate font-medium text-slate-900">{getTicketLabel(ticket)}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{ticket.customer_name || ticket.customer_email || "Unknown customer"}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">{ticket.category || "Unclassified"}</td>
                      <td className="px-5 py-4">{ticket.sentiment ? <SentimentBadge sentiment={ticket.sentiment} /> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-5 py-4"><StatusBadge status={ticket.status} /></td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500"><time dateTime={ticket.created_at}>{formatDate(ticket.created_at)}</time></td>
                      <td className="px-5 py-4 text-right"><span className="text-xs font-semibold text-brand-700">Open <span aria-hidden="true">→</span></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {filteredTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={openTicket} />)}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
