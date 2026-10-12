import { BrainCircuit, Bot, ChartNoAxesCombined, GitBranch, type LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "./ui";

interface Capability {
  label: string;
  icon: LucideIcon;
}

const capabilities: Capability[] = [
  { label: "Intelligent ticket routing", icon: GitBranch },
  { label: "Knowledge-grounded responses", icon: Bot },
  { label: "Real-time support insights", icon: ChartNoAxesCombined },
];

function BrandMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/25">
      <BrainCircuit aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
    </div>
  );
}

function WorkflowPreview() {
  return (
    <div aria-hidden="true" className="relative mt-12 hidden max-w-md lg:block">
      <div className="absolute -inset-5 rounded-3xl bg-brand-500/5 blur-2xl" />
      <div className="relative rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success-600" />
            <span className="text-xs font-semibold text-slate-600">Support workflow</span>
          </div>
          <span className="rounded-full bg-success-50 px-2 py-1 text-[10px] font-semibold text-success-700">Live</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
          {["Incoming ticket", "AI triage", "Agent ready"].map((label, index) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3 text-center">
              <div className={cn("mx-auto mb-2 h-2 w-2 rounded-full", index === 1 ? "bg-brand-600" : "bg-slate-300")} />
              <p className="text-[10px] font-semibold leading-tight text-slate-600">{label}</p>
            </div>
          )).flatMap((item, index, items) => (index < items.length - 1 ? [item, <span key={`line-${index}`} className="h-px bg-slate-200" />] : [item]))}
        </div>
        <div className="mt-4 flex items-end gap-1.5">
          {[38, 55, 44, 72, 62, 82, 68, 92].map((height, index) => (
            <span key={index} className="flex-1 rounded-t bg-brand-100" style={{ height: `${height / 2}px` }}>
              <span className="block h-1/2 rounded-t bg-brand-500" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthLayout({ children, mode }: { children: ReactNode; mode: "login" | "register" }) {
  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(27rem,0.92fr)]">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white px-6 py-8 sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-12 xl:px-20">
        <div className="relative mx-auto flex h-full max-w-2xl flex-col">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-lg font-bold tracking-tight text-slate-950">AI Support</span>
          </div>
          <div className="mt-14 max-w-xl sm:mt-20 lg:mt-auto lg:mb-auto lg:pt-20">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Support operations, intelligently connected</p>
            <h1 className="max-w-lg text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl xl:text-5xl xl:leading-[1.08]">
              Resolve support issues faster with AI
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
              AI-powered ticket classification, knowledge retrieval and intelligent escalation in one support workspace.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {capabilities.map(({ label, icon: Icon }) => (
                <li key={label} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
            <WorkflowPreview />
          </div>
          <p className="mt-10 hidden text-xs text-slate-400 lg:block">AI Support workspace · {mode === "login" ? "Secure sign in" : "New workspace access"}</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:min-h-screen lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
