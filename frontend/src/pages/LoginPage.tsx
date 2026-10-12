import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { Button, FormField, Input, PasswordInput } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login, error, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const emailError = submitted && !email.trim() ? "Enter your email address." : undefined;
  const passwordError = submitted && !password ? "Enter your password." : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!email.trim() || !password) return;

    const ok = await login(email.trim(), password);
    if (ok) navigate("/chat");
  }

  return (
    <AuthLayout mode="login">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-elevated sm:p-8">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold text-brand-600">AI Support workspace</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to your support workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <FormField label="Email address" htmlFor="login-email" error={emailError} required>
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={Boolean(emailError)}
              aria-describedby={emailError ? "login-email-error" : undefined}
            />
          </FormField>

          <FormField label="Password" htmlFor="login-password" error={passwordError} required>
            <PasswordInput
              id="login-password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={Boolean(passwordError)}
              aria-describedby={passwordError ? "login-password-error" : undefined}
            />
          </FormField>

          <div className="flex items-center gap-2">
            <input id="remember-me" type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500" />
            <label htmlFor="remember-me" className="text-sm text-slate-600">Remember me</label>
          </div>

          {error && (
            <div role="alert" aria-live="polite" className="flex gap-2.5 rounded-lg border border-error-200 bg-error-50 px-3.5 py-3 text-sm text-error-700">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" fullWidth size="lg" loading={loading}>
            {loading ? "Signing in…" : "Sign in"}
            {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
          </Button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-semibold text-brand-700 underline-offset-4 transition-interactive hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
