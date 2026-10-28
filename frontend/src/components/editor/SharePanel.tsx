"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Globe, X } from "lucide-react";
import styles from "./SharePanel.module.css";
import { Button } from "@/components/ui";
import { resumesApi, type ShareStatus, type TokenGetter } from "@/lib/resumesApi";

interface SharePanelProps {
  resumeId: string;
  getAccessToken: TokenGetter;
  /** The section order the editor prints, so the public page matches. */
  sectionOrder: string[];
  onClose: () => void;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

/** Public, read-only link for a saved CV, with view and download counts. */
export function SharePanel({ resumeId, getAccessToken, sectionOrder, onClose }: SharePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let active = true;
    resumesApi
      .share(getAccessToken, resumeId)
      .then(async (current) => {
        // Keep the printed order current whenever the panel opens on a live link.
        const next = current.enabled ? await resumesApi.setShare(getAccessToken, resumeId, true, sectionOrder) : current;
        if (active) setStatus(next);
      })
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [getAccessToken, resumeId, sectionOrder]);

  const link = status?.slug && typeof window !== "undefined" ? `${window.location.origin}/s/${status.slug}` : "";

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await resumesApi.setShare(getAccessToken, resumeId, !status?.enabled, sectionOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update sharing.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy. Select the link and copy it manually.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="share-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === dialogRef.current && onClose()}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className="label">Share</p>
            <h2 id="share-title" className={styles.title}>A link to your CV</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.toggleRow}>
          <span className={styles.toggleIcon} data-on={status?.enabled ? "true" : "false"} aria-hidden="true">
            <Globe size={18} />
          </span>
          <div className={styles.toggleText}>
            <strong>{status?.enabled ? "Anyone with the link can view" : "Sharing is off"}</strong>
            <span>
              {status?.enabled
                ? "Recruiters see the latest version and can download a PDF. They can't edit anything."
                : "Turn on a read-only page you can send instead of an attachment."}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(status?.enabled)}
            aria-label="Public link"
            className={styles.switch}
            disabled={!status || busy}
            onClick={toggle}
          >
            <span />
          </button>
        </div>

        {status?.enabled && link && (
          <>
            <div className={styles.linkRow}>
              <input className="form-input" value={link} readOnly aria-label="Share link" onFocus={(event) => event.target.select()} />
              <Button variant="primary" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <dl className={styles.stats}>
              <div>
                <dt className="label">Views</dt>
                <dd>{status.views}</dd>
              </div>
              <div>
                <dt className="label">Downloads</dt>
                <dd>{status.downloads}</dd>
              </div>
              <div>
                <dt className="label">Last viewed</dt>
                <dd className={styles.small}>{formatDate(status.last_viewed_at) || "Not yet"}</dd>
              </div>
            </dl>
            <a className={styles.preview} href={link} target="_blank" rel="noreferrer">
              Open the public page <ExternalLink size={13} />
            </a>
          </>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
