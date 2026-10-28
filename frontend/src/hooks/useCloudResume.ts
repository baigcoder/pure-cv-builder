"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CoverLetterDraft,
  CVData,
  DEFAULT_COVER_LETTER_DRAFT,
  DesignSettings,
  normalizeCVData,
  normalizeDesignSettings,
} from "@/lib/cvBuilder";
import { ApiError } from "@/lib/api/client";
import { resumesApi, toApiContent, type ResumeDetail, type TokenGetter } from "@/lib/resumesApi";

export type CloudSyncStatus = "loading" | "saved" | "saving" | "offline" | "conflict" | "error";

interface UseCloudResumeOptions {
  resumeId: string | null;
  getAccessToken: TokenGetter;
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
  coverLetter: CoverLetterDraft;
  setCVData: (data: CVData) => void;
  setTheme: (theme: string) => void;
  setDesignSettings: (settings: DesignSettings) => void;
  setCoverLetter: (data: CoverLetterDraft) => void;
}

const SAVE_DEBOUNCE_MS = 1200;
const RETRY_MS = 5000;

interface EditorContent {
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
  coverLetter: CoverLetterDraft;
  title: string;
}

const snapshotOf = (content: EditorContent) =>
  JSON.stringify([content.title, content.cvData, content.theme, content.designSettings, content.coverLetter]);

/**
 * Loads a saved resume into the editor state and autosaves changes back.
 *
 * Saves are serialized: one PATCH at a time, each carrying the last known
 * `revision`. A 409 means another tab or device saved first; autosave pauses
 * until the user reloads so nothing is silently overwritten.
 */
export const useCloudResume = ({
  resumeId,
  getAccessToken,
  cvData,
  theme,
  designSettings,
  coverLetter,
  setCVData,
  setTheme,
  setDesignSettings,
  setCoverLetter,
}: UseCloudResumeOptions) => {
  const enabled = Boolean(resumeId);
  const [status, setStatus] = useState<CloudSyncStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitleState] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const revisionRef = useRef(1);
  const savedSnapshotRef = useRef("");
  const savingRef = useRef(false);
  const pausedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const latestRef = useRef<EditorContent>({ cvData, theme, designSettings, coverLetter, title });
  useEffect(() => {
    latestRef.current = { cvData, theme, designSettings, coverLetter, title };
  }, [coverLetter, cvData, designSettings, theme, title]);

  const applyServerResume = useCallback(
    (resume: ResumeDetail) => {
      const nextCV = normalizeCVData(resume.cv_data);
      const nextDesign = normalizeDesignSettings(resume.design_settings);
      const nextLetter = { ...DEFAULT_COVER_LETTER_DRAFT, ...resume.cover_letter } as CoverLetterDraft;
      setCVData(nextCV);
      setTheme(resume.theme);
      setDesignSettings(nextDesign);
      setCoverLetter(nextLetter);
      setTitleState(resume.title);
      revisionRef.current = resume.revision;
      setLatestVersion(resume.latest_version ?? 0);
      setLastSavedAt(resume.updated_at);
      savedSnapshotRef.current = snapshotOf({
        cvData: nextCV,
        theme: resume.theme,
        designSettings: nextDesign,
        coverLetter: nextLetter,
        title: resume.title,
      });
      pausedRef.current = false;
      setStatus("saved");
    },
    [setCVData, setCoverLetter, setDesignSettings, setTheme],
  );

  const load = useCallback(async () => {
    if (!resumeId) return;
    setStatus("loading");
    setLoadError(null);
    try {
      applyServerResume(await resumesApi.get(getAccessToken, resumeId));
      setIsLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load this CV.");
      setStatus("error");
    }
  }, [applyServerResume, getAccessToken, resumeId]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(async (): Promise<void> => {
    if (!resumeId || !isLoaded || pausedRef.current || savingRef.current) return;
    const content = latestRef.current;
    const snapshot = snapshotOf(content);
    if (snapshot === savedSnapshotRef.current) {
      setStatus("saved");
      return;
    }

    savingRef.current = true;
    setStatus("saving");
    try {
      const saved = await resumesApi.update(getAccessToken, resumeId, {
        revision: revisionRef.current,
        title: content.title.trim() || "Untitled CV",
        ...toApiContent(content),
      });
      revisionRef.current = saved.revision;
      savedSnapshotRef.current = snapshot;
      setLatestVersion(saved.latest_version ?? 0);
      setLastSavedAt(saved.updated_at);
      setStatus(snapshotOf(latestRef.current) === snapshot ? "saved" : "saving");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        pausedRef.current = true;
        setStatus("conflict");
      } else if (error instanceof ApiError && error.status < 500 && error.status !== 429) {
        setStatus("error");
      } else {
        setStatus("offline");
        retryTimerRef.current = window.setTimeout(() => void save(), RETRY_MS);
      }
    } finally {
      savingRef.current = false;
    }

    // Changes made while the request was in flight.
    if (!pausedRef.current && snapshotOf(latestRef.current) !== savedSnapshotRef.current) {
      window.setTimeout(() => void save(), 0);
    }
  }, [getAccessToken, isLoaded, resumeId]);

  useEffect(() => {
    if (!enabled || !isLoaded || pausedRef.current) return;
    if (snapshotOf(latestRef.current) === savedSnapshotRef.current) {
      // Edits were undone back to the saved content before they were sent.
      setStatus((current) => (current === "saving" && !savingRef.current ? "saved" : current));
      return;
    }
    setStatus((current) => (current === "offline" ? current : "saving"));
    const timer = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [coverLetter, cvData, designSettings, enabled, isLoaded, save, theme, title]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (snapshotOf(latestRef.current) !== savedSnapshotRef.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);

  /**
   * Resolve a conflict in favour of this tab: adopt the server's latest
   * revision, then save the local content over it. The other change is
   * snapshotted first so it can be restored from version history.
   */
  const keepMine = useCallback(async () => {
    if (!resumeId) return;
    setStatus("saving");
    try {
      await resumesApi.saveVersion(getAccessToken, resumeId, "Overwritten from another tab");
      const latest = await resumesApi.get(getAccessToken, resumeId);
      revisionRef.current = latest.revision;
      // Force a save even if the content happens to match the old snapshot.
      savedSnapshotRef.current = "";
      pausedRef.current = false;
      await save();
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 409 ? "conflict" : "error");
    }
  }, [getAccessToken, resumeId, save]);

  /** Wait for any in-flight save, then save pending edits. */
  const flush = useCallback(async () => {
    for (let waited = 0; savingRef.current && waited < 10000; waited += 100) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    await save();
  }, [save]);

  return {
    enabled,
    isLoaded,
    status,
    loadError,
    title,
    setTitle: setTitleState,
    lastSavedAt,
    latestVersion,
    flush,
    keepMine,
    reload: load,
    applyServerResume,
  };
};
