"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "./EnhanceReview.module.css";
import { Badge, Button } from "@/components/ui";
import type { CVChange } from "@/lib/cvChanges";
import { diffWords } from "@/lib/wordDiff";

interface EnhanceReviewProps {
  changes: CVChange[];
  /** Skills worth adding only if they're true for the user; never applied automatically. */
  suggestedKeywords: string[];
  source: "ai" | "fallback";
  beforeScore: number;
  /** Score if the given changes were applied, or null when it can't be known for a partial selection. */
  scoreWith: (selected: CVChange[]) => number | null;
  /** What the score measures. */
  scoreLabel?: string;
  /** Heading for the dialog. */
  title?: string;
  onApply: (selected: CVChange[]) => void;
  onClose: () => void;
}

/** True when two comma-separated lists hold the same items in a different order. */
const isReorder = (before: string, after: string) => {
  const items = (text: string) => text.split(/,\s*/).map((item) => item.trim().toLowerCase()).sort().join("|");
  return before !== after && items(before) === items(after);
};

/** Review suggested CV improvements one by one before any of them touch the CV. */
export function EnhanceReview({ changes, suggestedKeywords, source, beforeScore, scoreWith, scoreLabel = "Checklist score", title = "Review suggested improvements", onApply, onClose }: EnhanceReviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rejected, setRejected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const selected = useMemo(() => changes.filter((change) => !rejected.has(change.id)), [changes, rejected]);
  const afterScore = useMemo(() => scoreWith(selected), [scoreWith, selected]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, CVChange[]>();
    changes.forEach((change) => byGroup.set(change.group, [...(byGroup.get(change.group) || []), change]));
    return [...byGroup.entries()];
  }, [changes]);

  const toggle = (id: string) =>
    setRejected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="enhance-review-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2 id="enhance-review-title" className={styles.title}>
              {title}
            </h2>
            <p className={styles.subtitle}>
              {changes.length === 0
                ? "Your CV's wording already covers what this check looks for."
                : `${source === "ai" ? "AI" : "Quick fixes"} found ${changes.length} ${changes.length === 1 ? "change" : "changes"}. Untick anything you don't want; nothing changes until you apply.`}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close without applying">
            <X size={18} />
          </button>
        </header>

        {changes.length > 0 && (
          <div className={styles.score} aria-live="polite">
            <span>{scoreLabel}</span>
            <strong>
              {beforeScore}%{" "}
              {afterScore !== null ? (
                <>
                  <span aria-hidden="true">→</span> <span className={afterScore > beforeScore ? styles.up : ""}>{afterScore}%</span>
                </>
              ) : (
                <span className={styles.scoreNote}>(tick every change to see the new score)</span>
              )}
            </strong>
          </div>
        )}

        <div className={styles.body}>
          {groups.map(([group, items]) => (
            <section key={group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group}</h3>
              <ul className={styles.list}>
                {items.map((change) => {
                  const accepted = !rejected.has(change.id);
                  return (
                    <li key={change.id} className={`${styles.item} ${accepted ? "" : styles.itemRejected}`}>
                      <label className={styles.itemLabel}>
                        <input type="checkbox" checked={accepted} onChange={() => toggle(change.id)} />
                        <span>{change.label}</span>
                        {!change.before && <Badge tone="accent">New</Badge>}
                      </label>
                      <p className={styles.diff}>
                        {change.before && isReorder(change.before, change.after) ? (
                          <>
                            <span className={styles.reordered}>Reordered:</span> {change.after}
                          </>
                        ) : change.before
                          ? diffWords(change.before, change.after).map((part, index) =>
                              part.kind === "same" ? (
                                <span key={index}>{part.text}</span>
                              ) : part.kind === "added" ? (
                                <ins key={index}>{part.text}</ins>
                              ) : (
                                <del key={index}>{part.text}</del>
                              ),
                            )
                          : <ins>{change.after}</ins>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {suggestedKeywords.length > 0 && (
            <section className={styles.group}>
              <h3 className={styles.groupTitle}>Skills employers look for</h3>
              <p className={styles.hint}>Add any of these to your Skills section only if you have real experience with them.</p>
              <div className={styles.keywords}>
                {suggestedKeywords.map((keyword) => (
                  <span key={keyword} className={styles.keyword}>{keyword}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          {changes.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setRejected(selected.length ? new Set(changes.map((change) => change.id)) : new Set())}>
              {selected.length ? "Untick all" : "Tick all"}
            </Button>
          )}
          <span className={styles.spacer} />
          <Button variant="secondary" onClick={onClose}>{changes.length ? "Cancel" : "Close"}</Button>
          {changes.length > 0 && (
            <Button variant="primary" disabled={selected.length === 0} onClick={() => onApply(selected)}>
              Apply {selected.length} {selected.length === 1 ? "change" : "changes"}
            </Button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
