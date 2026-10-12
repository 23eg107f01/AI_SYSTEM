import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { Button, FormField, Input, PasswordInput } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

export default function RegisterPage() {
  const { register, error, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const emailError = submitted && !email.trim() ? "Enter your email address." : undefined;
  const passwordError = submitted && password.length < 8 ? "Use at least 8 characters." : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!email.trim() || password.length < 8) return;

    const ok = await register(email.trim(), password, "customer");
    if (ok) {
      setSuccess(true);
      window.setTimeout(() => navigate("/chat"), 1500);
    }
  }

  return (
    <AuthLayout mode="register">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-elevated sm:p-8">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold text-brand-600">Get started with AI Support</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Create your account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Start managing customer support with more clarity and speed.</p>
        </div>

        {success ? (
          <div role="status" aria-live="polite" className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700">
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Account created successfully</p>
                <p className="mt-1">You&apos;re being signed in to your workspace.</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <FormField label="Email address" htmlFor="register-email" error={emailError} required>
              <Input
                id="register-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={Boolean(emailError)}
                aria-describedby={emailError ? "register-email-error" : "register-email-description"}
              />
            </FormField>

            <FormField label="Password" htmlFor="register-password" hint="Minimum 8 characters" error={passwordError} required>
              <PasswordInput
                id="register-password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Create a secure password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={Boolean(passwordError)}
                aria-describedby={passwordError ? "register-password-error" : "register-password-description"}
              />
            </FormField>

            {error && (
              <div role="alert" aria-live="polite" className="flex gap-2.5 rounded-lg border border-error-200 bg-error-50 px-3.5 py-3 text-sm text-error-700">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {loading ? "Creating account…" : "Create account"}
              {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </form>
        )}

        <p className="mt-7 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-700 underline-offset-4 transition-interactive hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
