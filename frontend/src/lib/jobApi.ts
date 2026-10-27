import type { components } from "@/lib/api/schema";
import { postJSON } from "@/lib/api/client";
import { API_URL } from "@/lib/config";
import { CVData, toRenderableCVData } from "@/lib/cvBuilder";

type Schemas = components["schemas"];

export type JobMatchResult = Schemas["JobMatchResponse"];
export type KeywordMatch = Schemas["KeywordMatch"];
export type TailorBulletsResult = Schemas["TailorBulletsResponse"];
export type BulletSuggestion = Schemas["BulletSuggestion"];
export type BulletHint = Schemas["BulletHint"];
export type TailoredCV = Schemas["TailorCVResponse"];

const apiCV = (cvData: CVData) => toRenderableCVData(cvData) as unknown as Schemas["CVData"];

export const requestJobMatch = (cvData: CVData, jobDescription: string, targetRole: string, signal?: AbortSignal) =>
  postJSON<JobMatchResult>(
    `${API_URL}/api/job/match`,
    { cv_data: apiCV(cvData), job_description: jobDescription, target_role: targetRole },
    "Couldn't analyse the job post.",
    { signal },
  );

/**
 * The whole CV tailored to a job. Sends the full CV (not the render copy) so
 * suggested edits line up with the editor's entries when applied.
 */
export const requestTailoredCV = (cvData: CVData, jobDescription: string, targetRole: string) =>
  postJSON<TailoredCV>(
    `${API_URL}/api/job/tailor-cv`,
    { cv_data: cvData as unknown as Schemas["CVData"], job_description: jobDescription, target_role: targetRole },
    "Couldn't tailor the CV.",
  );

export const requestTailoredBullets = (cvData: CVData, jobDescription: string, keywords: string[]) =>
  postJSON<TailorBulletsResult>(
    `${API_URL}/api/job/tailor-bullets`,
    { cv_data: apiCV(cvData), job_description: jobDescription, keywords, max_bullets: 12 },
    "Couldn't tailor bullets.",
  );
