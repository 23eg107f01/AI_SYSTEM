import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "./cn";

export interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, error = false, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn(
          "block min-h-10 w-full rounded-md border bg-white px-3 py-2 pr-10 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-interactive focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100",
          error
            ? "border-error-300 focus-visible:border-error-600 focus-visible:ring-error-500"
            : "border-slate-300 focus-visible:border-brand-600 focus-visible:ring-brand-500",
          className
        )}
        aria-invalid={error || undefined}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-interactive hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  );
});
