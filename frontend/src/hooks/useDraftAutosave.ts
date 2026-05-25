"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CVData,
  CoverLetterDraft,
  DEFAULT_COVER_LETTER_DRAFT,
  DEFAULT_CV_DATA,
  DEFAULT_DESIGN_SETTINGS,
  DesignSettings,
  IMPORTED_CV_STORAGE_KEY,
  SyncStatus,
  normalizeCVData,
} from "@/lib/cvBuilder";

export const DRAFT_STORAGE_KEY = "purecv:draft:v1";

interface DraftState {
  version: 1;
  savedAt: string;
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
  coverLetter: CoverLetterDraft;
}

interface UseDraftAutosaveOptions {
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
  coverLetter: CoverLetterDraft;
  setCVData: (data: CVData) => void;
  setTheme: (theme: string) => void;
  setDesignSettings: (settings: DesignSettings) => void;
  setCoverLetter: (data: CoverLetterDraft) => void;
  initialTheme: string;
}

export const useDraftAutosave = ({
  cvData,
  theme,
  designSettings,
  coverLetter,
  setCVData,
  setTheme,
  setDesignSettings,
  setCoverLetter,
  initialTheme,
}: UseDraftAutosaveOptions) => {
  const [isRestored, setIsRestored] = useState(false);
  const [draftStatus, setDraftStatus] = useState<SyncStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Check for imported PDF data first (from /upload page)
      const importedRaw =
        window.sessionStorage.getItem(IMPORTED_CV_STORAGE_KEY) ||
        window.localStorage.getItem(IMPORTED_CV_STORAGE_KEY);
      if (importedRaw) {
        try {
          const imported = JSON.parse(importedRaw) as {
            cvData: Partial<CVData>;
            theme?: string;
            source?: string;
          };
          if (imported.cvData) {
            const normalizedCV = normalizeCVData(imported.cvData);
            const importedTheme = initialTheme || imported.theme || "classic";
            const importedDesignSettings = DEFAULT_DESIGN_SETTINGS;
            const importedCoverLetter = DEFAULT_COVER_LETTER_DRAFT;
            const savedAt = new Date().toISOString();
            const importedDraft: DraftState = {
              version: 1,
              savedAt,
              cvData: normalizedCV,
              theme: importedTheme,
              designSettings: importedDesignSettings,
              coverLetter: importedCoverLetter,
            };

            window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(importedDraft));
            setCVData(normalizedCV);
            setTheme(importedTheme);
            setDesignSettings(importedDesignSettings);
            setCoverLetter(importedCoverLetter);
            setLastSavedAt(savedAt);
            // Persist before clearing so React dev remounts cannot fall back to
            // an older draft after the one-time import payload is removed.
            window.sessionStorage.removeItem(IMPORTED_CV_STORAGE_KEY);
            window.localStorage.removeItem(IMPORTED_CV_STORAGE_KEY);
            setIsRestored(true);
            return;
          }
        } catch (importErr) {
          console.warn("Could not parse imported CV data", importErr);
          window.sessionStorage.removeItem(IMPORTED_CV_STORAGE_KEY);
          window.localStorage.removeItem(IMPORTED_CV_STORAGE_KEY);
        }
      }

      const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as Partial<DraftState>;
        setCVData(normalizeCVData(parsed.cvData));
        setTheme(initialTheme || parsed.theme || "classic");
        setDesignSettings({
          ...DEFAULT_DESIGN_SETTINGS,
          ...(parsed.designSettings || {}),
        });
        setCoverLetter({
          ...DEFAULT_COVER_LETTER_DRAFT,
          ...(parsed.coverLetter || {}),
        });
        setLastSavedAt(parsed.savedAt || null);
      }
    } catch (error) {
      console.warn("Could not restore CV draft", error);
    } finally {
      setIsRestored(true);
    }
  }, [initialTheme, setCoverLetter, setCVData, setDesignSettings, setTheme]);

  const draftKey = useMemo(
    () => JSON.stringify({ cvData, theme, designSettings, coverLetter }),
    [coverLetter, cvData, theme, designSettings],
  );

  useEffect(() => {
    if (!isRestored) return;

    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        const draft: DraftState = {
          version: 1,
          savedAt,
          cvData,
          theme,
          designSettings,
          coverLetter,
        };
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        setLastSavedAt(savedAt);
        setDraftStatus("saved");
      } catch (error) {
        console.error("Could not save CV draft", error);
        setDraftStatus("error");
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [coverLetter, cvData, designSettings, draftKey, isRestored, theme]);

  const resetDraft = () => {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setCVData(DEFAULT_CV_DATA);
    setTheme(initialTheme || "classic");
    setDesignSettings(DEFAULT_DESIGN_SETTINGS);
    setCoverLetter(DEFAULT_COVER_LETTER_DRAFT);
    setLastSavedAt(null);
    setDraftStatus("saved");
  };

  return {
    isRestored,
    draftStatus,
    lastSavedAt,
    resetDraft,
  };
};
