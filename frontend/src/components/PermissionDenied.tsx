import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function PermissionDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-warning-200 bg-warning-50 px-6 py-10 text-center" role="alert">
        <ShieldAlert aria-hidden="true" className="mx-auto h-7 w-7 text-warning-700" />
        <h1 className="mt-3 text-lg font-semibold text-warning-950">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-warning-800">Your account does not have permission to view this workspace.</p>
        <Link to="/" className="mt-5 inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Return to workspace</Link>
      </div>
    </div>
  );
}
