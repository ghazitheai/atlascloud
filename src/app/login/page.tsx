"use client";
import { useState, useEffect } from "react";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get("invite") ?? ""),
    [],
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        token ? "/api/onboarding/accept" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            token ? { token, name, password } : { email, password },
          ),
        },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (token) {
        setToken("");
        setEmail(b.email);
        setError("Account created. Sign in to access your portal.");
        window.history.replaceState(null, "", "/login");
      } else window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          ◈ ATLAS <small>PROCUREMENT CLOUD</small>
        </div>
        <span className="eyebrow">EVERY DECISION. CONNECTED.</span>
        <h1>
          Clarity across
          <br />
          your supply chain.
        </h1>
        <p>
          From the first request to the final receipt, give every team one place
          to work.
        </p>
        <div className="login-metrics">
          <div>
            <strong>01</strong>
            <span>Source with confidence</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Approve with context</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Track every movement</span>
          </div>
        </div>
        <p className="subtle">
          Secure internal workspace & dedicated supplier portal
        </p>
      </section>
      <section className="login-form">
        <span className="eyebrow">WELCOME TO ATLAS</span>
        <h2>
          {token ? "Join the supplier portal" : "Sign in to your workspace"}
        </h2>
        <p className="muted">
          {token
            ? "Set a password of at least 14 characters."
            : "Use your organization account to continue."}
        </p>
        <form onSubmit={submit}>
          {token ? (
            <label>
              Full name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          ) : (
            <label>
              Email address
              <input
                autoComplete="username"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </label>
          )}
          <label>
            Password
            <input
              autoComplete={token ? "new-password" : "current-password"}
              required
              type="password"
              minLength={token ? 14 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy
              ? "Please wait…"
              : token
                ? "Create vendor account"
                : "Sign in →"}
          </button>
        </form>
        <p className="muted tiny">
          Access is limited to authorized employees and invited suppliers. Demo
          credentials are documented in the project README.
        </p>
      </section>
    </main>
  );
}
