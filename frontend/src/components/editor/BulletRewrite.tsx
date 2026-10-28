"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import styles from "./EditorParts.module.css";
import { API_URL } from "@/lib/config";
import { rewriteBullet, type BulletRewriteMode } from "@/lib/editorApi";
import { diffWords } from "@/lib/wordDiff";

const MODES: { mode: BulletRewriteMode; label: string }[] = [
  { mode: "improve", label: "Improve" },
  { mode: "quantify", label: "Add numbers" },
  { mode: "shorten", label: "Shorten" },
  { mode: "stronger", label: "Stronger verb" },
];

/** Bracketed prompts like [X%] are for the user to fill in; show them as such. */
function withPrompts(text: string) {
  return text.split(/(\[[^\]]+\])/g).map((part, index) =>
    /^\[[^\]]+\]$/.test(part) ? <mark key={index} className={styles.fillIn}>{part}</mark> : <span key={index}>{part}</span>,
  );
}

interface BulletRewriteProps {
  text: string;
  /** Role or entry context, e.g. "Senior Engineer at Northwind". */
  context: string;
  onUse: (text: string) => void;
  onClose: () => void;
}

/** Rewrites of one bullet in a chosen style, shown as tracked changes to accept or ignore. */
export function BulletRewrite({ text, context, onUse, onClose }: BulletRewriteProps) {
  const [mode, setMode] = useState<BulletRewriteMode>("improve");
  const [variants, setVariants] = useState<string[] | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    rewriteBullet(API_URL, text, mode, context)
      .then((result) => {
        if (!active) return;
        setVariants(result.variants);
        setSource(result.source);
        setError(null);
      })
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
    // Only refetch when the mode changes; edits to the bullet while open shouldn't spam requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const choose = (next: BulletRewriteMode) => {
    if (next === mode) return;
    setVariants(null);
    setMode(next);
  };

  return (
    <div className={styles.rewrite} role="region" aria-label="Rewrite suggestions">
      <div className={styles.rewriteHead}>
        <div className={styles.rewriteModes} role="tablist" aria-label="Rewrite style">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="tab"
              aria-selected={mode === option.mode}
              className={styles.rewriteMode}
              onClick={() => choose(option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close suggestions">
          <X size={14} />
        </button>
      </div>

      {error ? (
        <p className={styles.rewriteNote}>{error}</p>
      ) : variants === null ? (
        <div className={styles.rewriteLoading} aria-live="polite">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ) : variants.length === 0 ? (
        <p className={styles.rewriteNote}>No better version found for this style. Try another one.</p>
      ) : (
        <ul className={styles.rewriteList}>
          {variants.map((variant) => (
            <li key={variant}>
              <p className={styles.rewriteDiff}>
                {mode === "quantify"
                  ? withPrompts(variant)
                  : diffWords(text, variant).map((part, index) =>
                      part.kind === "same" ? (
                        <span key={index}>{part.text}</span>
                      ) : part.kind === "added" ? (
                        <ins key={index}>{part.text}</ins>
                      ) : (
                        <del key={index}>{part.text}</del>
                      ),
                    )}
              </p>
              <button type="button" className={styles.rewriteUse} onClick={() => onUse(variant)}>
                Use this
              </button>
            </li>
          ))}
        </ul>
      )}
      {source === "fallback" && variants && variants.length > 0 && (
        <p className={styles.rewriteNote}>Quick rewrite without AI. Connect an AI key for richer suggestions.</p>
      )}
      {mode === "quantify" && variants && variants.length > 0 && (
        <p className={styles.rewriteNote}>Replace the highlighted parts with your real numbers before you use it.</p>
      )}
    </div>
  );
}
