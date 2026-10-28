import {
  CoverLetterDraft,
  DEFAULT_COVER_LETTER_DRAFT,
  DesignSettings,
  hasRenderableContent,
  normalizeCVData,
  normalizeDesignSettings,
  toRenderableCVData,
} from "@/lib/cvBuilder";
import type { ResumeContent } from "@/lib/resumesApi";

// Kept in sync with useDraftAutosave (key preserved for existing drafts).
const DRAFT_STORAGE_KEY = "purecv:draft:v1";
const importedFlagKey = (userId: string) => `applyforge:draft-imported:${userId}`;

/** The browser draft, if it has anything worth importing. */
export const readLocalDraft = (): ResumeContent | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      cvData?: unknown;
      theme?: string;
      designSettings?: Partial<DesignSettings>;
      coverLetter?: Partial<CoverLetterDraft>;
    };
    const cvData = normalizeCVData(parsed.cvData);
    if (!hasRenderableContent(toRenderableCVData(cvData))) return null;
    return {
      cvData,
      theme: parsed.theme || "classic",
      designSettings: normalizeDesignSettings(parsed.designSettings),
      coverLetter: { ...DEFAULT_COVER_LETTER_DRAFT, ...parsed.coverLetter },
    };
  } catch {
    return null;
  }
};

export const wasDraftImported = (userId: string): boolean => {
  try {
    return window.localStorage.getItem(importedFlagKey(userId)) === "1";
  } catch {
    return false;
  }
};

export const markDraftImported = (userId: string): void => {
  try {
    window.localStorage.setItem(importedFlagKey(userId), "1");
  } catch {
    // Storage unavailable: the banner may show again, which is harmless.
  }
};

export const draftTitle = (content: ResumeContent): string => {
  const name = content.cvData.name.replace(/\*\*/g, "").trim();
  return name ? `${name} CV` : "Imported CV";
};
