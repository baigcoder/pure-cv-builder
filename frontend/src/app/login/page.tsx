"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "@/components/AccountPages.module.css";
import { Wordmark } from "@/components/Brand";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

type Mode = "signin" | "signup" | "reset";

const MIN_PASSWORD_LENGTH = 8;

/** Only allow same-site relative redirects. */
const safeNext = (value: string | null): string =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";

function LoginContent() {
  const { enabled, loading, user, signIn, signUp, sendPasswordReset } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, next, router, user]);

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        const result = await signIn(trimmedEmail, password);
        if (result.error) setError(result.error);
      } else if (mode === "signup") {
        const result = await signUp(trimmedEmail, password);
        if (result.error) setError(result.error);
        else if (result.needsConfirmation) {
          setNotice(`We sent a confirmation link to ${trimmedEmail}. Open it to finish creating your account.`);
        }
      } else {
        const result = await sendPasswordReset(trimmedEmail);
        if (result.error) setError(result.error);
        else setNotice(`If an account exists for ${trimmedEmail}, a reset link is on its way.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const heading = {
    signin: { title: "Welcome back", lead: "Sign in to open your saved CVs on any device." },
    signup: { title: "Create your account", lead: "Save every CV, keep version history, and tailor copies per job." },
    reset: { title: "Reset your password", lead: "Enter your account email and we'll send a reset link." },
  }[mode];

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Wordmark size={22} />
        </Link>
        <div className={styles.topbarActions}>
          <ThemeToggle />
          <Link href="/editor" className="btn btn-secondary">
            Continue without account
          </Link>
        </div>
      </header>

      <main className={styles.authWrap}>
        <section className={styles.authCard} aria-labelledby="auth-title">
          <h1 id="auth-title">{heading.title}</h1>
          <p className={styles.authLead}>{heading.lead}</p>

          {!enabled ? (
            <div className={`${styles.message} ${styles.messageError}`}>
              Accounts aren&apos;t enabled on this deployment. You can still build CVs; they&apos;re saved in this
              browser.
            </div>
          ) : (
            <>
              {mode !== "reset" && (
                <div className={styles.tabs} role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signin"}
                    className={`${styles.tab} ${mode === "signin" ? styles.tabActive : ""}`}
                    onClick={() => switchMode("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signup"}
                    className={`${styles.tab} ${mode === "signup" ? styles.tabActive : ""}`}
                    onClick={() => switchMode("signup")}
                  >
                    Create account
                  </button>
                </div>
              )}

              {error && (
                <div className={`${styles.message} ${styles.messageError}`} role="alert">
                  {error}
                </div>
              )}
              {notice && (
                <div className={`${styles.message} ${styles.messageSuccess}`} role="status">
                  {notice}
                </div>
              )}

              <form className={styles.form} onSubmit={onSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="form-input"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>

                {mode !== "reset" && (
                  <div className="form-group">
                    <div className={styles.passwordRow}>
                      <label className="form-label" htmlFor="password">
                        Password
                      </label>
                      {mode === "signin" && (
                        <button type="button" className={styles.linkButton} onClick={() => switchMode("reset")}>
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      id="password"
                      type="password"
                      className="form-input"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    {mode === "signup" && <p className={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</p>}
                  </div>
                )}

                <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={submitting}>
                  {submitting
                    ? "Please wait..."
                    : mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : "Send reset link"}
                </button>
              </form>

              <p className={styles.authFooter}>
                {mode === "reset" ? (
                  <button type="button" className={styles.linkButton} onClick={() => switchMode("signin")}>
                    Back to sign in
                  </button>
                ) : (
                  <>Your browser drafts can be imported after you sign in.</>
                )}
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
