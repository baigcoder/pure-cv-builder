"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, Clock3, Eye, History, RotateCcw, X } from "lucide-react";
import styles from "./VersionHistoryPanel.module.css";
import { ApiError, postJSON, type PreviewPagesResponse, type RenderRequest } from "@/lib/api/client";
import { API_URL } from "@/lib/config";
import { normalizeCVData, toRenderableCVData } from "@/lib/cvBuilder";
import { resumesApi, type ResumeDetail, type TokenGetter, type VersionSummary } from "@/lib/resumesApi";
import { getDownloadSectionOrder, getRenderThemeId, getTheme } from "@/lib/themes";

interface VersionHistoryPanelProps {
  open: boolean;
  resumeId: string;
  getAccessToken: TokenGetter;
  /** Saves pending edits so a named version captures what's on screen. */
  flush: () => Promise<void>;
  onRestored: (resume: ResumeDetail) => void;
  onClose: () => void;
  /** Bumped by the editor after each save so the list stays current. */
  latestVersion: number;
}

const SOURCE_LABELS: Record<VersionSummary["source"], string> = {
  create: "Created",
  import: "Imported",
  auto: "Autosave",
  manual: "Saved",
  restore: "Restored",
};

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export function VersionHistoryPanel({
  open,
  resumeId,
  getAccessToken,
  flush,
  onRestored,
  onClose,
  latestVersion,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"save" | number | null>(null);
  const [preview, setPreview] = useState<{ version: number; pages: string[] } | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVersions((await resumesApi.versions(getAccessToken, resumeId)).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load version history.");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, resumeId]);

  useEffect(() => {
    if (open) void loadVersions();
  }, [open, loadVersions, latestVersion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const saveVersion = async () => {
    setBusy("save");
    setError(null);
    try {
      await flush();
      await resumesApi.saveVersion(getAccessToken, resumeId, label.trim());
      setLabel("");
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save a version.");
    } finally {
      setBusy(null);
    }
  };

  const showPreview = async (version: number) => {
    setBusy(version);
    setError(null);
    try {
      const detail = await resumesApi.version(getAccessToken, resumeId, version);
      const body: RenderRequest = {
        cv_data: toRenderableCVData(normalizeCVData(detail.cv_data)) as unknown as RenderRequest["cv_data"],
        theme: getRenderThemeId(detail.theme),
        format: "png",
        design_settings: detail.design_settings,
        section_order: getDownloadSectionOrder(detail.theme),
      };
      const rendered = await postJSON<PreviewPagesResponse>(
        `${API_URL}/api/preview/pages`,
        body,
        "Couldn't render this version.",
      );
      setPreview({ version, pages: rendered.pages });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't render this version.");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (version: number) => {
    if (!window.confirm(`Restore version ${version}? Your current content is kept in history.`)) return;
    setBusy(version);
    setError(null);
    try {
      await flush();
      const resume = await resumesApi.restore(getAccessToken, resumeId, version);
      onRestored(resume);
      setPreview(null);
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't restore that version.");
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              <History size={14} /> Version history
            </span>
            <h2 id="version-history-title">Snapshots of this CV</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close version history">
            <X size={18} />
          </button>
        </header>

        <form
          className={styles.saveRow}
          onSubmit={(event) => {
            event.preventDefault();
            void saveVersion();
          }}
        >
          <input
            className="form-input"
            placeholder="Name this version, e.g. “Tailored for Stripe”"
            value={label}
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            <BookmarkPlus size={16} />
            {busy === "save" ? "Saving..." : "Save version"}
          </button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        {preview && (
          <div className={styles.previewBox}>
            <div className={styles.previewHeader}>
              <strong>Version {preview.version}</strong>
              <button type="button" className={styles.linkButton} onClick={() => setPreview(null)}>
                Close preview
              </button>
            </div>
            <div className={styles.previewPages}>
              {preview.pages.map((page, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- data URL from the render API
                <img key={index} src={page} alt={`Version ${preview.version}, page ${index + 1}`} />
              ))}
            </div>
          </div>
        )}

        <ol className={styles.list}>
          {loading && versions.length === 0 && <li className={styles.muted}>Loading history...</li>}
          {!loading && versions.length === 0 && !error && <li className={styles.muted}>No versions yet.</li>}
          {versions.map((version, index) => (
            <li key={version.version} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>
                  <span className={`${styles.badge} ${styles[`badge_${version.source}`] ?? ""}`}>
                    {SOURCE_LABELS[version.source]}
                  </span>
                  <strong>{version.label || `Version ${version.version}`}</strong>
                  {index === 0 && <span className={styles.current}>Latest</span>}
                </div>
                <div className={styles.itemMeta}>
                  <Clock3 size={12} /> {formatWhen(version.created_at)} · v{version.version} · {getTheme(version.theme).name}
                </div>
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void showPreview(version.version)}
                  disabled={busy !== null}
                  aria-label={`Preview version ${version.version}`}
                >
                  <Eye size={14} />
                  {busy === version.version ? "..." : "View"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void restore(version.version)}
                  disabled={busy !== null}
                  aria-label={`Restore version ${version.version}`}
                >
                  <RotateCcw size={14} />
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ol>

        <p className={styles.footnote}>
          Autosave snapshots are taken every few minutes while you edit. Named versions are never removed.
        </p>
      </aside>
    </div>
  );
}
