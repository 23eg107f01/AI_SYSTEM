import { Loader2 } from "lucide-react";

export default function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-card">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-brand-600" />
        Loading workspace…
      </div>
    </div>
  );
}
