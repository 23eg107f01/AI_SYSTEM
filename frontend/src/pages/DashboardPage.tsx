import { useState, useEffect } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { AlertTriangle, Clock, Activity, ShieldCheck, FileText } from "lucide-react";
import Navbar from "../components/Navbar";
import { AuthUser } from "../utils/auth";
import api from "../utils/api";

interface Props {
  user: AuthUser;
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function DashboardPage({ user }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [slaTickets, setSlaTickets] = useState<any[]>([]);
  const [kbDocs, setKbDocs] = useState<any[]>([]);
  const [wsError, setWsError] = useState(false);

  useEffect(() => {
    const apiBase = api.defaults.baseURL || "http://localhost:8000";
    let wsUrl = "";
    if (apiBase.startsWith("/")) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}${apiBase}/api/dashboard/ws`;
    } else {
      wsUrl = apiBase.replace(/^http/, "ws") + "/api/dashboard/ws";
    }
    let ws: WebSocket | null = null;

    async function loadDashboard() {
      try {
        const [statsRes, auditRes, slaRes, kbRes] = await Promise.all([
          api.get("/api/dashboard/stats"),
          api.get("/api/dashboard/audit"),
          api.get("/api/dashboard/sla-status"),
          api.get("/api/kb"),
        ]);
        setStats(statsRes.data);
        setAuditLogs(auditRes.data);
        setSlaTickets(slaRes.data);
        setKbDocs(kbRes.data);
      } catch (e) {
        console.error("Failed to load dashboard data", e);
      }
    }

    loadDashboard();

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setStats(data);
          setWsError(false);
        } catch (e) {
          console.error("Failed to parse WS data", e);
        }
      };
      ws.onerror = (e) => {
        console.error("WS Error", e);
        setWsError(true);
      };
      ws.onclose = () => setWsError(true);
    } catch (e) {
      console.error("Failed to open dashboard websocket", e);
      setWsError(true);
    }

    const interval = setInterval(() => {
      loadDashboard();
    }, 30000);

    return () => {
      if (ws) {
        ws.close();
      }
      clearInterval(interval);
    };
  }, []);

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center h-96">
          {wsError ? "Failed to connect to real-time stats." : "Loading dashboard..."}
        </div>
      </div>
    );
  }

  const categoryData = Object.entries(stats.by_category || {}).map(([name, value]) => ({ name, value }));
  const sentimentData = Object.entries(stats.by_sentiment || {}).map(([name, value]) => ({ name, value }));
  const qualityTrend = stats.quality_trend || [];
  
  // SLA compliance is a single percentage, we can render it as a single-bar chart or dial
  const slaComplianceData = [
    { name: "Compliant", value: stats.sla_compliance_rate },
    { name: "Breached", value: 100 - stats.sla_compliance_rate }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      <Navbar user={user} />
      
      <main className="px-6 py-8 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              Manager Dashboard
            </h1>
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Live Real-Time Data Connection Active
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Last updated: {new Date(stats.generated_at).toLocaleTimeString()}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Today's Tickets" value={stats.today_tickets} icon={<FileText size={20}/>} color="from-blue-500 to-blue-600" />
          <KpiCard title="Avg Response Time" value={`${stats.avg_response_time_minutes}m`} icon={<Clock size={20}/>} color="from-green-500 to-emerald-600" />
          <KpiCard title="Escalation Rate" value={`${stats.escalation_rate}%`} icon={<AlertTriangle size={20}/>} color="from-orange-500 to-amber-600" />
          <KpiCard title="Avg Quality Score" value={`${stats.avg_quality_score}/10`} icon={<ShieldCheck size={20}/>} color="from-purple-500 to-indigo-600" />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Ticket Volume by Category">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip cursor={{fill: '#374151', opacity: 0.4}} contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Sentiment Distribution">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                  {sentimentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Average Quality Score (Last 7 Days)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qualityTrend} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis domain={[0, 10]} stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="SLA Compliance Rate (%)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaComplianceData} layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" />
                <Tooltip cursor={{fill: '#374151', opacity: 0.4}} contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {slaComplianceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === 'Compliant' ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* SLA Breaches & Audit Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-1 bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-gray-200 flex items-center gap-2">
              <Activity size={20} className="text-red-400" /> SLA Breaches
            </h2>
            {slaTickets.length === 0 ? (
              <p className="text-gray-400 text-sm">No active SLA breaches.</p>
            ) : (
              <ul className="space-y-3">
                {slaTickets.map((t) => (
                  <li key={t.id} className={`p-3 rounded-lg border ${t.flag === 'red' ? 'bg-red-900/20 border-red-500/50' : 'bg-amber-900/20 border-amber-500/50'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className={`text-sm font-bold ${t.flag === 'red' ? 'text-red-400' : 'text-amber-400'}`}>
                          Ticket #{t.id}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{t.category}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${t.flag === 'red' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {t.open_minutes}m open
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-gray-200">Recent Audit Logs</h2>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm text-gray-400 whitespace-nowrap">
                <thead className="text-xs uppercase bg-gray-700/50 text-gray-300">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Action</th>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Tokens (In/Out)</th>
                    <th className="px-4 py-3">Cost ($)</th>
                    <th className="px-4 py-3 rounded-tr-lg">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 8).map(log => (
                    <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-300">{log.action}</td>
                      <td className="px-4 py-3">#{log.ticket_id || 'N/A'}</td>
                      <td className="px-4 py-3"><span className="bg-gray-700 px-2 py-1 rounded text-xs">{log.model_used || 'N/A'}</span></td>
                      <td className="px-4 py-3">{log.input_tokens} / {log.output_tokens}</td>
                      <td className="px-4 py-3 font-mono text-green-400">${log.cost_usd.toFixed(4)}</td>
                      <td className="px-4 py-3 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLogs.length === 0 && <p className="text-center py-4 text-gray-500">No audit logs found.</p>}
            </div>
          </div>
        </div>

        {/* Knowledge Base Documents */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-200">Knowledge Base Documents</h2>
            <div className="text-xs text-gray-400">Checked automatically to verify AI context availability</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400 whitespace-nowrap">
              <thead className="text-xs uppercase bg-gray-700/50 text-gray-300">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Filename</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg">Uploaded At</th>
                </tr>
              </thead>
              <tbody>
                {kbDocs.map(doc => (
                  <tr key={doc.id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-300">{doc.filename}</td>
                    <td className="px-4 py-3"><span className="bg-gray-700 px-2 py-1 rounded text-xs">{doc.category}</span></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        doc.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                        doc.status === 'error' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {doc.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{new Date(doc.uploaded_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {kbDocs.length === 0 && <p className="text-center py-4 text-gray-500">No documents found in Knowledge Base.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}

function KpiCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div className="relative overflow-hidden bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl group hover:shadow-2xl transition-all">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${color} opacity-10 rounded-full blur-3xl transform group-hover:scale-150 transition-transform duration-500`} />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${color} text-white`}>
            {icon}
          </div>
          <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        </div>
        <p className="text-3xl font-bold text-gray-100">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl h-80 flex flex-col hover:border-gray-600 transition-colors">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>
      <div className="flex-1 w-full min-h-0">
        {children}
      </div>
    </div>
  );
}
