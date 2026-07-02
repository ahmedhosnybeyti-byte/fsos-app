import { useState, type FormEvent } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

interface LoginProps {
  onLogin: (email: string, password: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    // No backend wired up yet — mock authentication accepts any credentials.
    setTimeout(() => onLogin(email.trim(), password), 400);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar px-4">
      {/* Subtle noise texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo.png" alt={`${APP_NAME} — ${APP_TAGLINE}`} className="h-44 w-44 object-contain" />
        </div>

        {/* Card */}
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-6 shadow-xl">
          <div className="mb-5">
            <h1 className="text-base font-semibold text-sidebar-foreground">مرحبًا بعودتك</h1>
            <p className="mt-1 text-sm text-sidebar-foreground/50">سجل الدخول للوصول إلى لوحة عملك</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-sidebar-foreground/70">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@fsos.ae"
                  autoComplete="username"
                  className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 pl-9 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-sidebar-foreground/70">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 pl-9 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
                />
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-sidebar-border" />
                Remember me
              </label>
              <button type="button" className="text-xs text-sidebar-primary hover:underline">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sidebar-primary px-4 py-3.5 text-sm font-medium text-sidebar-primary-foreground transition-colors hover:bg-sidebar-primary/90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Signing in…" : "Log In"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-sidebar-foreground/30">
          © 2026 {APP_NAME} — {APP_TAGLINE}
        </p>
      </div>
    </div>
  );
}
