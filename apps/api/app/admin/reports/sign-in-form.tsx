"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./page.module.css";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.status === 404) {
        setError("This page isn't available.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "Couldn't sign in. Check your email and password.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't sign in. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className={styles.signInCard}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1 className={styles.signInTitle}>Sign in</h1>
      <p className={styles.signInBody}>Use your repin email and password.</p>
      <label className={styles.fieldLabel} htmlFor="admin-email">Email</label>
      <input
        autoComplete="username"
        className={styles.field}
        id="admin-email"
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        value={email}
      />
      <label className={styles.fieldLabel} htmlFor="admin-password">Password</label>
      <input
        autoComplete="current-password"
        className={styles.field}
        id="admin-password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
      <button className={styles.primaryButton} disabled={pending} type="submit">
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
