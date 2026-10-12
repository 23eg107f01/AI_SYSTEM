import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button aria-label="Close dialog" className="absolute inset-0 cursor-default bg-slate-950/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        className={cn("relative z-10 max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-elevated sm:p-6", className)}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-slate-950">{title}</h2>
            {description && <p id="dialog-description" className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}><X aria-hidden="true" className="h-4 w-4" /></IconButton>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
