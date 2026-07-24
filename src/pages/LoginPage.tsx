import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { supabase } from "../lib/supabase/client";
import { supabaseConfigured } from "../lib/env";
import { emailSchema } from "../lib/validation/inventory";

type LoginMode = "magic-link" | "password";
type LoginState = "idle" | "submitting" | "sent" | "error";

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<LoginMode>("magic-link");
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");

  if (!loading && session) {
    const destination =
      (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
      "/";
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setState("error");
      setMessage(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }
    if (!supabaseConfigured) {
      setState("error");
      setMessage("Supabase is not configured. Copy .env.example to .env.local.");
      return;
    }
    if (mode === "password" && !password) {
      setState("error");
      setMessage("Enter your password.");
      return;
    }
    setState("submitting");
    setMessage("");

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data,
        password,
      });
      if (error) {
        setState("error");
        setMessage("The email or password is incorrect.");
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      setState("error");
      setMessage("We could not send a sign-in link. Check your account or try again.");
      return;
    }
    setState("sent");
    setMessage("Check your email for the secure sign-in link.");
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          <ShieldCheck />
        </div>
        <p className="eyebrow">Acebedo Optical</p>
        <h1 id="login-title">Inventory access</h1>
        <p className="muted">
          Sign in with the email address invited by your administrator.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <div className="input-with-icon">
            <Mail aria-hidden="true" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              disabled={state === "submitting" || state === "sent"}
            />
          </div>
          {mode === "password" && (
            <>
              <label htmlFor="password">Password</label>
              <div className="input-with-icon">
                <LockKeyhole aria-hidden="true" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  disabled={state === "submitting"}
                />
              </div>
            </>
          )}
          <button
            className="button primary wide"
            type="submit"
            disabled={state === "submitting" || state === "sent"}
          >
            {state === "submitting"
              ? mode === "password"
                ? "Signing in…"
                : "Sending…"
              : mode === "password"
                ? "Sign in"
                : "Send secure sign-in link"}
          </button>
        </form>
        {state !== "sent" && (
          <button
            className="login-mode-button"
            type="button"
            onClick={() => {
              setMode((current) =>
                current === "magic-link" ? "password" : "magic-link",
              );
              setState("idle");
              setMessage("");
            }}
            disabled={state === "submitting"}
          >
            {mode === "magic-link"
              ? "Sign in with password instead"
              : "Email me a secure sign-in link instead"}
          </button>
        )}
        {message && (
          <p
            className={state === "error" ? "form-message error" : "form-message success"}
            role={state === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
