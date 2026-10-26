import type { components } from "@/lib/api/schema";
import { ApiError, parseApiError } from "@/lib/api/client";
import { API_URL } from "@/lib/config";
import type { CoverLetterDraft, CVData, DesignSettings } from "@/lib/cvBuilder";

type Schemas = components["schemas"];

export type ResumeSummary = Schemas["ResumeSummary"];
export type ResumeDetail = Schemas["ResumeDetail"];
export type ResumeListResponse = Schemas["ResumeListResponse"];
export type VersionSummary = Schemas["VersionSummary"];
export type VersionDetail = Schemas["VersionDetail"];
export type ResumeCreate = Schemas["ResumeCreate"];
export type ResumeUpdate = Schemas["ResumeUpdate"];

export type TokenGetter = () => Promise<string | null>;

/** The editor's state, in the shape the API stores. */
export interface ResumeContent {
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
  coverLetter: CoverLetterDraft;
}

export const toApiContent = ({ cvData, theme, designSettings, coverLetter }: ResumeContent) => ({
  cv_data: cvData as unknown as ResumeCreate["cv_data"],
  theme,
  design_settings: designSettings,
  cover_letter: coverLetter,
});

const request = async <T>(
  getToken: TokenGetter,
  path: string,
  init: RequestInit & { json?: unknown } = {},
  fallbackError = "Request failed.",
): Promise<T> => {
  const token = await getToken();
  if (!token) {
    throw new ApiError(401, { detail: "Please sign in to continue.", code: "unauthorized" }, fallbackError);
  }

  const { json, headers, ...rest } = init;
  const response = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!response.ok) {
    throw await parseApiError(response, fallbackError);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const resumesApi = {
  list: (getToken: TokenGetter) =>
    request<ResumeListResponse>(getToken, "/resumes", {}, "Couldn't load your CVs."),

  get: (getToken: TokenGetter, id: string) =>
    request<ResumeDetail>(getToken, `/resumes/${id}`, {}, "Couldn't load this CV."),

  create: (getToken: TokenGetter, body: ResumeCreate) =>
    request<ResumeDetail>(getToken, "/resumes", { method: "POST", json: body }, "Couldn't create the CV."),

  update: (getToken: TokenGetter, id: string, body: ResumeUpdate, signal?: AbortSignal) =>
    request<ResumeDetail>(getToken, `/resumes/${id}`, { method: "PATCH", json: body, signal }, "Couldn't save changes."),

  remove: (getToken: TokenGetter, id: string) =>
    request<void>(getToken, `/resumes/${id}`, { method: "DELETE" }, "Couldn't delete the CV."),

  duplicate: (getToken: TokenGetter, id: string) =>
    request<ResumeDetail>(getToken, `/resumes/${id}/duplicate`, { method: "POST" }, "Couldn't duplicate the CV."),

  versions: (getToken: TokenGetter, id: string) =>
    request<Schemas["VersionListResponse"]>(getToken, `/resumes/${id}/versions`, {}, "Couldn't load version history."),

  version: (getToken: TokenGetter, id: string, version: number) =>
    request<VersionDetail>(getToken, `/resumes/${id}/versions/${version}`, {}, "Couldn't load that version."),

  saveVersion: (getToken: TokenGetter, id: string, label: string) =>
    request<VersionSummary>(
      getToken,
      `/resumes/${id}/versions`,
      { method: "POST", json: { label } },
      "Couldn't save a version.",
    ),

  restore: (getToken: TokenGetter, id: string, version: number) =>
    request<ResumeDetail>(
      getToken,
      `/resumes/${id}/versions/${version}/restore`,
      { method: "POST" },
      "Couldn't restore that version.",
    ),
};
