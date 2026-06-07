import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import Navbar from "../components/Navbar";
import { AuthUser } from "../utils/auth";
import api from "../utils/api";

interface Props {
  user: AuthUser;
}

interface TicketResponse {
  id: number;
  response: string;
  category: string | null;
  sentiment: string | null;
  status: string;
  quality_score: number | null;
  citations: Array<{ source: string; chunk_id?: string }> | null;
  handoff_to_manager?: boolean;
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
  response?: {
    id: number;
    ticket_id: number;
    response_text: string;
    quality_score: number | null;
    citations: Array<{ source: string; chunk_id?: string }> | null;
  };
  escalation?: {
    reason?: string;
    assigned_agent_id?: number | null;
  } | null;
}

const sentimentColors: Record<string, string> = {
  Happy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Neutral: "bg-slate-100 text-slate-600 border-slate-200",
  Frustrated: "bg-amber-50 text-amber-700 border-amber-200",
  Angry: "bg-rose-50 text-rose-700 border-rose-200",
};

const handoffPatterns = [
  "human",
  "agent",
  "manager",
  "representative",
  "real person",
  "connect me",
  "someone from support",
];

export default function ChatPage({ user }: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState<number | null>(null);
  const [contactName, setContactName] = useState(localStorage.getItem("support_contact_name") || "");
  const [contactEmail, setContactEmail] = useState(localStorage.getItem("support_contact_email") || "");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceAssistEnabled, setVoiceAssistEnabled] = useState(
    localStorage.getItem("support_voice_assist_enabled") !== "false"
  );
  const [autoReadReplies, setAutoReadReplies] = useState(
    localStorage.getItem("support_voice_assist_autoplay") === "true"
  );
  const [speechRate, setSpeechRate] = useState(
    Number(localStorage.getItem("support_voice_assist_rate") || "1")
  );
  const [speakingTicketId, setSpeakingTicketId] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initializedHistoryRef = useRef(false);
  const spokenTicketIdsRef = useRef<Set<number>>(new Set());

  function stopSpeaking() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    setSpeakingTicketId(null);
  }

  function speakReply(ticketId: number, text: string) {
    if (
      typeof window === "undefined" ||
      !speechSupported ||
      !voiceAssistEnabled ||
      !text.trim()
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.pitch = 1;
    utterance.onstart = () => {
      spokenTicketIdsRef.current.add(ticketId);
      setSpeakingTicketId(ticketId);
    };
    utterance.onend = () => {
      setSpeakingTicketId((current) => (current === ticketId ? null : current));
    };
    utterance.onerror = () => {
      setSpeakingTicketId((current) => (current === ticketId ? null : current));
    };

    window.speechSynthesis.speak(utterance);
  }

  function toggleTicketSpeech(ticketId: number, text: string) {
    if (speakingTicketId === ticketId) {
      stopSpeaking();
      return;
    }
    speakReply(ticketId, text);
  }

  function readLatestReply() {
    const latestTicket = [...tickets].reverse().find((ticket) => ticket.response?.response_text);
    if (!latestTicket?.response?.response_text) {
      return;
    }
    speakReply(latestTicket.id, latestTicket.response.response_text);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSpeechSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);

    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [{ data: ticketData }, { data: me }] = await Promise.all([
          api.get<Ticket[]>("/api/tickets"),
          api.get<{ id: number; email: string; role: string }>("/auth/me"),
        ]);

        const sorted = ticketData.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const fullTickets = await Promise.all(
          sorted.map(async (ticket) => {
            const { data } = await api.get<Ticket>(`/api/tickets/${ticket.id}`);
            return data;
          })
        );

        setTickets(fullTickets);
        spokenTicketIdsRef.current = new Set(
          fullTickets.filter((ticket) => ticket.response?.response_text).map((ticket) => ticket.id)
        );
        initializedHistoryRef.current = true;
        setContactEmail((prev) => prev || me.email || "");
      } catch (err) {
        console.error("Failed to bootstrap chat page", err);
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    localStorage.setItem("support_contact_name", contactName);
  }, [contactName]);

  useEffect(() => {
    localStorage.setItem("support_contact_email", contactEmail);
  }, [contactEmail]);

  useEffect(() => {
    localStorage.setItem("support_voice_assist_enabled", String(voiceAssistEnabled));
  }, [voiceAssistEnabled]);

  useEffect(() => {
    localStorage.setItem("support_voice_assist_autoplay", String(autoReadReplies));
  }, [autoReadReplies]);

  useEffect(() => {
    localStorage.setItem("support_voice_assist_rate", String(speechRate));
  }, [speechRate]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      return;
    }

    const apiBase = api.defaults.baseURL || "http://localhost:8000";
    let wsUrl = "";
    if (apiBase.startsWith("/")) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}${apiBase}/ws/chat?token=${token}`;
    } else {
      wsUrl = apiBase.replace(/^http/, "ws") + `/ws/chat?token=${token}`;
    }

    let ws: WebSocket | undefined;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "agent_replied") {
            setTickets((prev) =>
              prev.map((ticket) =>
                ticket.id === data.ticket_id
                  ? {
                      ...ticket,
                      status: data.status,
                      resolved_at: new Date().toISOString(),
                      response: {
                        id: Date.now(),
                        ticket_id: ticket.id,
                        response_text: data.response_text,
                        quality_score: null,
                        citations: null,
                      },
                    }
                  : ticket
              )
            );
          }
        } catch (parseError) {
          console.error("Failed to parse chat websocket payload", parseError);
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000);
      };
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
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tickets, loading]);

  useEffect(() => {
    if (
      !initializedHistoryRef.current ||
      !speechSupported ||
      !voiceAssistEnabled ||
      !autoReadReplies
    ) {
      return;
    }

    const latestUnreadReply = [...tickets]
      .reverse()
      .find(
        (ticket) =>
          ticket.response?.response_text &&
          !spokenTicketIdsRef.current.has(ticket.id)
      );

    if (!latestUnreadReply?.response?.response_text) {
      return;
    }

    speakReply(latestUnreadReply.id, latestUnreadReply.response.response_text);
  }, [tickets, autoReadReplies, speechSupported, voiceAssistEnabled, speechRate]);

  const handoffRequested = useMemo(() => {
    const normalized = message.toLowerCase();
    return handoffPatterns.some((pattern) => normalized.includes(pattern));
  }, [message]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || message.length > 1000) {
      return;
    }

    if (handoffRequested && !contactName.trim()) {
      setError("Add your name before requesting a manager so we can hand your chat over properly.");
      return;
    }

    const currentMessage = message.trim();
    const optimisticTicket: Ticket = {
      id: Date.now(),
      user_id: user.id,
      customer_name: contactName || null,
      customer_email: contactEmail || null,
      message: currentMessage,
      category: null,
      sentiment: null,
      status: "open",
      created_at: new Date().toISOString(),
      resolved_at: null,
    };

    setMessage("");
    setError(null);
    setLoading(true);
    setTickets((prev) => [...prev, optimisticTicket]);

    try {
      const payload = {
        message: currentMessage,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
      };
      const { data } = await api.post<TicketResponse>("/api/tickets", payload);

      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === optimisticTicket.id
            ? {
                ...ticket,
                id: data.id,
                category: data.category,
                sentiment: data.sentiment,
                status: data.status,
                escalation: data.handoff_to_manager ? { reason: "Manager handoff" } : null,
                response: {
                  id: Date.now(),
                  ticket_id: data.id,
                  response_text: data.response,
                  quality_score: data.quality_score,
                  citations: data.citations,
                },
              }
            : ticket
        )
      );
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to send message. Please try again.";
      setError(detail);
      setTickets((prev) => prev.filter((ticket) => ticket.id !== optimisticTicket.id));
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(ticketId: number, type: "up" | "down") {
    if (feedbackLoading === ticketId) {
      return;
    }

    setFeedbackLoading(ticketId);
    try {
      await api.post(`/api/tickets/${ticketId}/feedback`, { feedback_type: type });
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === ticketId && ticket.response
            ? {
                ...ticket,
                response: {
                  ...ticket.response,
                  quality_score: type === "up" ? 9 : 3,
                },
              }
            : ticket
        )
      );
    } catch (err) {
      console.error("Failed to submit feedback", err);
    } finally {
      setFeedbackLoading(null);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#efeae2]">
      <Navbar user={user} />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 flex flex-col overflow-hidden">
        <section className="bg-white rounded-t-3xl border border-slate-200 border-b-0 px-6 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Support Chat</h1>
              <p className="text-sm text-slate-500">
                Fast AI guidance first. If you need a human manager, we will hand this over with your details.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Live replies enabled
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Your name for manager handoff"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Your contact email"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Voice Assist</p>
                <p className="text-xs text-slate-500">
                  Listen to AI replies aloud and auto-read new support answers.
                </p>
              </div>
              <div className="text-xs font-medium">
                <span
                  className={`rounded-full px-3 py-1 ${
                    speechSupported
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {speechSupported ? "Browser audio ready" : "Speech not supported"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={voiceAssistEnabled}
                  onChange={(e) => {
                    setVoiceAssistEnabled(e.target.checked);
                    if (!e.target.checked) {
                      stopSpeaking();
                    }
                  }}
                  disabled={!speechSupported}
                />
                Enable voice assist
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoReadReplies}
                  onChange={(e) => setAutoReadReplies(e.target.checked)}
                  disabled={!speechSupported || !voiceAssistEnabled}
                />
                Auto-read new replies
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                Speed
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(Number(e.target.value))}
                  disabled={!speechSupported || !voiceAssistEnabled}
                />
                <span className="w-10 text-xs text-slate-500">{speechRate.toFixed(1)}x</span>
              </label>

              <button
                type="button"
                onClick={readLatestReply}
                disabled={
                  !speechSupported ||
                  !voiceAssistEnabled ||
                  !tickets.some((ticket) => ticket.response?.response_text)
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Read latest reply
              </button>
            </div>
          </div>
        </section>

        <section className="flex-1 overflow-y-auto border-x border-slate-200 bg-[#e5ddd5] px-5 py-6 space-y-6">
          {tickets.length === 0 && !loading ? (
            <div className="mx-auto mt-20 max-w-md rounded-3xl bg-white/90 px-6 py-8 text-center shadow-sm">
              <p className="text-lg font-semibold text-slate-800">Start the conversation</p>
              <p className="mt-2 text-sm text-slate-500">
                Ask about billing, technical issues, or subscription activation problems.
              </p>
            </div>
          ) : null}

          {tickets.map((ticket) => (
            <div key={ticket.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-3xl rounded-br-md bg-[#d9fdd3] px-5 py-3 shadow-sm">
                  <p className="text-sm leading-6 text-slate-800">{ticket.message}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pr-1 text-[11px]">
                {ticket.category ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                    {ticket.category}
                  </span>
                ) : null}
                {ticket.sentiment ? (
                  <span
                    className={`rounded-full border px-2.5 py-1 font-semibold ${
                      sentimentColors[ticket.sentiment] || "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {ticket.sentiment}
                  </span>
                ) : null}
              </div>

              {ticket.response ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-5 py-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">
                        {ticket.escalation ? "Support Manager" : "AI Support"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          ticket.status === "escalated"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {ticket.status === "escalated" ? "handoff" : "live"}
                      </span>
                    </div>

                    <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
                      {ticket.response.response_text}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => toggleTicketSpeech(ticket.id, ticket.response!.response_text)}
                        disabled={!speechSupported || !voiceAssistEnabled}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {speakingTicketId === ticket.id ? "Stop audio" : "Listen"}
                      </button>

                    {!ticket.escalation ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-medium text-slate-500">Was this useful?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFeedback(ticket.id, "up")}
                            disabled={feedbackLoading === ticket.id}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
                          >
                            Helpful
                          </button>
                          <button
                            onClick={() => handleFeedback(ticket.id, "down")}
                            disabled={feedbackLoading === ticket.id}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
                          >
                            Needs work
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Your manager handoff includes the contact details shown above so the team can continue from the same context.
                      </p>
                    )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-3xl rounded-bl-md bg-white px-5 py-4 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
                </div>
              </div>
            </div>
          ) : null}

          <div ref={chatEndRef} />
        </section>

        <section className="rounded-b-3xl border border-slate-200 border-t-0 bg-white p-4 shadow-sm">
          {error ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Example: I bought the subscription but it is not working on my TV."
              className="min-h-[52px] flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="h-[52px] rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>

          <p className="mt-2 text-xs text-slate-400">
            Ask anything directly. If you type that you want a human manager, add your name first so we can hand the conversation over cleanly.
          </p>
        </section>
      </main>
    </div>
  );
}
