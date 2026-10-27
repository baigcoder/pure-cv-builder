"use client";

import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Check, Copy, History, Pencil, Trash2, X } from "lucide-react";
import styles from "@/components/AccountPages.module.css";
import { ApiError } from "@/lib/api/client";
import { resumesApi, type ResumeSummary, type TokenGetter } from "@/lib/resumesApi";
import { getDownloadSectionOrder, getTheme } from "@/lib/themes";

// Rendered thumbnails survive re-renders and re-sorting for this page view.
const thumbnailCache = new Map<string, string | null>();

const formatUpdated = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes} min ago`;
  if (minutes < 60 * 24) return `Edited ${Math.round(minutes / 60)} h ago`;
  return `Edited ${new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })}`;
};

interface ResumeCardProps {
  resume: ResumeSummary;
  getAccessToken: TokenGetter;
  disabled: boolean;
  canDuplicate: boolean;
  onDuplicate: (resume: ResumeSummary) => void;
  onDelete: (resume: ResumeSummary) => void;
  onRenamed: (resume: ResumeSummary) => void;
  onError: (message: string) => void;
}

export function ResumeCard({
  resume,
  getAccessToken,
  disabled,
  canDuplicate,
  onDuplicate,
  onDelete,
  onRenamed,
  onError,
}: ResumeCardProps) {
  const theme = getTheme(resume.theme);
  // Keyed by last edit, so a changed CV is re-rendered and an unchanged one isn't.
  const cacheKey = `${resume.id}:${resume.updated_at}`;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // undefined = still loading, null = nothing to render (blank CV or failure).
  const thumbnail = thumbnailCache.get(cacheKey);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(resume.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (thumbnailCache.has(cacheKey)) return;
    const controller = new AbortController();
    resumesApi
      .thumbnail(getAccessToken, resume.id, getDownloadSectionOrder(resume.theme), controller.signal)
      .then((result) => {
        thumbnailCache.set(cacheKey, result.image ?? null);
        rerender();
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        thumbnailCache.set(cacheKey, null);
        rerender();
      });
    return () => controller.abort();
  }, [cacheKey, getAccessToken, resume.id, resume.theme]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startRename = () => {
    setTitle(resume.title);
    setEditing(true);
  };

  const saveRename = async () => {
    const next = title.trim() || "Untitled CV";
    if (next === resume.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const saved = await resumesApi.rename(getAccessToken, resume.id, resume.revision, next);
      onRenamed(saved);
      setEditing(false);
    } catch (error) {
      onError(
        error instanceof ApiError && error.status === 409
          ? "This CV changed elsewhere. Reload the page, then rename it."
          : error instanceof Error
            ? error.message
            : "Couldn't rename the CV.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onTitleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void saveRename();
    if (event.key === "Escape") setEditing(false);
  };

  const subtitle = [resume.name, resume.headline].filter(Boolean).join(" · ") || "No profile details yet";

  return (
    <article className={styles.card}>
      <Link href={`/editor?id=${resume.id}`} className={styles.cardThumb} aria-label={`Open ${resume.title}`}>
        {thumbnail === undefined ? (
          <span className={`skeleton ${styles.thumbSkeleton}`} aria-hidden="true" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- data URL render or static sample
          <img src={thumbnail ?? theme.image} alt="" className={thumbnail ? styles.thumbLive : undefined} />
        )}
        <span className={styles.themeBadge}>{theme.name}</span>
      </Link>

      {editing ? (
        <div className={styles.renameRow}>
          <input
            ref={inputRef}
            className="form-input"
            value={title}
            maxLength={120}
            aria-label="CV title"
            disabled={saving}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={onTitleKey}
          />
          <button type="button" className={styles.iconAction} onClick={() => void saveRename()} disabled={saving} aria-label="Save title">
            <Check size={15} />
          </button>
          <button type="button" className={styles.iconAction} onClick={() => setEditing(false)} disabled={saving} aria-label="Cancel rename">
            <X size={15} />
          </button>
        </div>
      ) : (
        <Link href={`/editor?id=${resume.id}`} className={styles.cardBody}>
          <span className={styles.cardTitle}>{resume.title}</span>
          <span className={styles.cardSub}>{subtitle}</span>
          <span className={styles.cardMeta}>{formatUpdated(resume.updated_at)}</span>
        </Link>
      )}

      <div className={styles.cardActions}>
        <Link href={`/editor?id=${resume.id}&history=1`} className={styles.iconAction} title="Version history">
          <History size={14} /> {resume.latest_version ?? 0}
        </Link>
        <button type="button" className={styles.iconAction} onClick={startRename} disabled={disabled || editing} aria-label={`Rename ${resume.title}`}>
          <Pencil size={14} /> Rename
        </button>
        <button
          type="button"
          className={styles.iconAction}
          onClick={() => onDuplicate(resume)}
          disabled={disabled || !canDuplicate}
          aria-label={`Duplicate ${resume.title}`}
        >
          <Copy size={14} /> Copy
        </button>
        <button
          type="button"
          className={`${styles.iconAction} ${styles.iconActionDanger}`}
          onClick={() => onDelete(resume)}
          disabled={disabled}
          aria-label={`Delete ${resume.title}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}
