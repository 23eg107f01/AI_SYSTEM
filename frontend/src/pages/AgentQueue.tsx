import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import Navbar from "../components/Navbar";
import { AuthUser } from "../utils/auth";
import api from "../utils/api";

interface Props {
  user: AuthUser;
}

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

const sentimentColors: Record<string, string> = {
  Happy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Neutral: "bg-slate-100 text-slate-600 border-slate-200",
  Frustrated: "bg-amber-50 text-amber-700 border-amber-200",
  Angry: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function AgentQueue({ user }: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [wsConnected, setWsConnected] = useState(false);

  const { data: tickets = [], isLoading, error } = useQuery<EscalatedTicket[]>(
    "manager-escalations",
    () => api.get("/agent/queue").then((response) => response.data),
    { staleTime: 5000, refetchOnWindowFocus: true }
  );

  useEffect(() => {
    if (!tickets.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !tickets.some((ticket) => ticket.ticket_id === selectedId)) {
      setSelectedId(tickets[0].ticket_id);
    }
  }, [tickets, selectedId]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.ticket_id === selectedId) || null,
    [tickets, selectedId]
  );

  const respondMutation = useMutation(
    ({ ticketId, responseText }: { ticketId: number; responseText: string }) =>
      api.post(`/agent/tickets/${ticketId}/respond`, { response_text: responseText }).then((response) => response.data),
    {
      onSuccess: (_, variables) => {
        qc.invalidateQueries("manager-escalations");
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[variables.ticketId];
          return next;
        });
      },
    }
  );

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      return;
    }

    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsUrl = apiBaseUrl.replace(/^http/, "ws") + `/ws/agent/queue?token=${token}`;

    let ws: WebSocket | undefined;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => setWsConnected(true);
      ws.onmessage = () => qc.invalidateQueries("manager-escalations");
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [qc]);

  function setDraft(ticketId: number, value: string) {
    setDrafts((prev) => ({ ...prev, [ticketId]: value }));
  }

  function useSuggestion(ticket: EscalatedTicket) {
    if (!ticket.suggested_reply) {
      return;
    }
    setDraft(ticket.ticket_id, ticket.suggested_reply);
  }

  function submitReply(ticket: EscalatedTicket) {
    const responseText = drafts[ticket.ticket_id]?.trim();
    if (!responseText) {
      return;
    }
    respondMutation.mutate({ ticketId: ticket.ticket_id, responseText });
  }

  return (
    <div className="min-h-screen bg-[#0b141a] flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        <div className="grid h-[calc(100vh-110px)] overflow-hidden rounded-[28px] border border-slate-800 bg-[#111b21] shadow-2xl md:grid-cols-[340px_1fr]">
          <aside className="border-r border-slate-800 bg-[#111b21]">
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-white">Manager Chats</h1>
                  <p className="text-xs text-slate-400">Escalated users waiting for human support</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {wsConnected ? "Live" : "Retrying"}
                </div>
              </div>
            </div>

            <div className="h-full overflow-y-auto">
              {isLoading ? (
                <div className="px-5 py-6 text-sm text-slate-400">Loading chats...</div>
              ) : error ? (
                <div className="px-5 py-6 text-sm text-rose-300">Failed to load escalations.</div>
              ) : tickets.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-400">No active manager handoffs.</div>
              ) : (
                tickets.map((ticket) => {
                  const active = ticket.ticket_id === selectedId;
                  return (
                    <button
                      key={ticket.ticket_id}
                      onClick={() => setSelectedId(ticket.ticket_id)}
                      className={`w-full border-b border-slate-900 px-5 py-4 text-left transition ${
                        active ? "bg-[#202c33]" : "bg-transparent hover:bg-[#1f2c34]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {ticket.customer_name || `Customer ${ticket.user_id}`}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {ticket.customer_email || "No contact email"}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs text-slate-300">{ticket.message}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {new Date(ticket.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex h-full flex-col bg-[#0b141a]">
            {selectedTicket ? (
              <>
                <div className="border-b border-slate-800 bg-[#202c33] px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-white">
                        {selectedTicket.customer_name || `Customer ${selectedTicket.user_id}`}
                      </h2>
                      <p className="text-sm text-slate-400">{selectedTicket.customer_email || "No contact email provided"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {selectedTicket.category ? (
                        <span className="rounded-full border border-sky-900 bg-sky-950/70 px-2.5 py-1 font-semibold text-sky-300">
                          {selectedTicket.category}
                        </span>
                      ) : null}
                      {selectedTicket.sentiment ? (
                        <span
                          className={`rounded-full border px-2.5 py-1 font-semibold ${
                            sentimentColors[selectedTicket.sentiment] || "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {selectedTicket.sentiment}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(32,44,51,0.55),_transparent_45%),linear-gradient(180deg,#0b141a_0%,#111b21_100%)] px-6 py-6">
                  <div className="mx-auto max-w-3xl space-y-4">
                    <div className="flex justify-center">
                      <div className="rounded-full bg-[#1f2c34] px-3 py-1 text-[11px] text-slate-400">
                        Handoff opened {new Date(selectedTicket.created_at).toLocaleString()}
                      </div>
                    </div>

                    {selectedTicket.context_summary ? (
                      <div className="rounded-3xl border border-amber-900/50 bg-amber-950/40 p-4 text-sm text-amber-100">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-300">AI summary</p>
                        {selectedTicket.context_summary}
                      </div>
                    ) : null}

                    <div className="flex justify-start">
                      <div className="max-w-[82%] rounded-3xl rounded-bl-md bg-[#202c33] px-5 py-4 text-sm leading-6 text-slate-100 shadow-sm">
                        {selectedTicket.message}
                      </div>
                    </div>

                    {selectedTicket.response_text ? (
                      <div className="flex justify-start">
                        <div className="max-w-[82%] rounded-3xl rounded-bl-md bg-[#1f2c34] px-5 py-4 text-sm leading-6 text-slate-300 shadow-sm">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Auto reply already sent</p>
                          {selectedTicket.response_text}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-slate-800 bg-[#111b21] px-6 py-5">
                  {selectedTicket.suggested_reply ? (
                    <div className="mb-4 rounded-3xl border border-sky-900/50 bg-sky-950/30 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-sky-300">Suggested reply</p>
                        <button
                          onClick={() => useSuggestion(selectedTicket)}
                          className="rounded-full border border-sky-700 px-3 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-900/40"
                        >
                          Use suggestion
                        </button>
                      </div>
                      <p className="text-sm leading-6 text-slate-200">{selectedTicket.suggested_reply}</p>
                    </div>
                  ) : null}

                  <div className="mx-auto max-w-3xl">
                    <textarea
                      rows={4}
                      value={drafts[selectedTicket.ticket_id] || ""}
                      onChange={(e) => setDraft(selectedTicket.ticket_id, e.target.value)}
                      placeholder="Reply as the support manager..."
                      className="w-full rounded-3xl border border-slate-700 bg-[#202c33] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500"
                    />

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        Replying here resolves the handoff and pushes the answer back to the customer chat in real time.
                      </p>
                      <button
                        onClick={() => submitReply(selectedTicket)}
                        disabled={
                          respondMutation.isLoading || !(drafts[selectedTicket.ticket_id] || "").trim()
                        }
                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {respondMutation.isLoading && respondMutation.variables?.ticketId === selectedTicket.ticket_id
                          ? "Sending..."
                          : "Send reply"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="m-auto text-center">
                <p className="text-lg font-semibold text-white">No handoff selected</p>
                <p className="mt-2 text-sm text-slate-400">
                  Pick a customer chat from the left when a manager handoff arrives.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
