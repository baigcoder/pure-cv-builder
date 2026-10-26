"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/components/AccountPages.module.css";
import { Logo } from "@/components/Brand";
import { useAuth } from "@/components/AuthProvider";

const MIN_PASSWORD_LENGTH = 8;

/** Landing page for the password-reset email link; Supabase signs the user in from the URL. */
export default function ResetPasswordPage() {
  const { loading, user, updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) setError(result.error);
    else router.replace("/dashboard");
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Logo width={28} height={28} />
          ApplyForge
        </Link>
      </header>
      <main className={styles.authWrap}>
        <section className={styles.authCard} aria-labelledby="reset-title">
          <h1 id="reset-title">Choose a new password</h1>
          {loading ? (
            <p className={styles.authLead}>Checking your reset link...</p>
          ) : !user ? (
            <>
              <p className={styles.authLead}>This reset link is invalid or has expired.</p>
              <Link href="/login?mode=signin" className="btn btn-primary btn-full">
                Request a new link
              </Link>
            </>
          ) : (
            <>
              <p className={styles.authLead}>Signed in as {user.email}.</p>
              {error && (
                <div className={`${styles.message} ${styles.messageError}`} role="alert">
                  {error}
                </div>
              )}
              <form className={styles.form} onSubmit={onSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-password">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="form-input"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="confirm-password">
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="form-input"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={submitting}>
                  {submitting ? "Saving..." : "Update password"}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
