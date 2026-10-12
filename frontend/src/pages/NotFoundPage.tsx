import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <FileQuestion aria-hidden="true" className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">That workspace page does not exist or may have moved.</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Return to workspace</Link>
      </div>
    </div>
  );
}
