import { CVData, CoverLetterDraft, DesignSettings } from "@/lib/cvBuilder";
import { getDownloadSectionOrder, getRenderThemeId } from "@/lib/themes";
import type { components } from "@/lib/api/schema";
import {
  ApiError,
  parseApiError,
  postForBlob,
  postJSON,
  type AIEnhanceCVRequest,
  type AIEnhanceCVResponse,
  type AIStatusResponse,
  type AISuggestRequest,
  type AISuggestResponse,
  type ApiCVData,
  type CoverLetterRequest,
  type CoverLetterResponse,
  type ExtractPDFResponse,
  type RenderRequest,
  type YAMLResponse,
} from "@/lib/api/client";

interface ExportOptions {
  apiUrl: string;
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
}

// The editor's CVData keeps loosely typed entries for form state; the API
// validates the shape, so the boundary cast is checked server-side.
const toApiCV = (cvData: CVData): ApiCVData => cvData as unknown as ApiCVData;

const buildRenderPayload = (
  { cvData, theme, designSettings }: ExportOptions,
  format: "pdf" | "png" = "pdf",
): RenderRequest => ({
  cv_data: toApiCV(cvData),
  theme: getRenderThemeId(theme),
  format,
  design_settings: designSettings,
  section_order: getDownloadSectionOrder(theme),
});

const buildCoverLetterPayload = (
  cvData: CVData,
  coverLetter: CoverLetterDraft,
  aiOnly = false,
  designSettings?: DesignSettings,
): CoverLetterRequest => ({
  cv_data: toApiCV(cvData),
  cover_letter: {
    target_role: coverLetter.targetRole,
    company: coverLetter.company,
    hiring_manager: coverLetter.hiringManager,
    job_description: coverLetter.jobDescription,
    tone: coverLetter.tone,
    length: coverLetter.length || "standard",
    highlights: coverLetter.highlights || "",
    letter: coverLetter.letter,
  },
  ai_only: aiOnly,
  design_settings: designSettings,
});

const safeFileName = (name: string, extension: string) => {
  const baseName = name.trim().replace(/\s+/g, "_").replace(/[^\w.-]/g, "") || "CV";
  return `${baseName}_CV.${extension}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const downloadPDF = async (options: ExportOptions) => {
  const blob = await postForBlob(`${options.apiUrl}/api/download`, buildRenderPayload(options, "pdf"), "PDF export failed.");
  downloadBlob(blob, safeFileName(options.cvData.name, "pdf"));
};

export type CVAnalysis = components["schemas"]["AnalysisResponse"];
export type CVIssue = components["schemas"]["IssueOut"];

/** Render the CV, read it back like an ATS, and check writing, consistency and page fit. */
export const analyzeCV = (options: ExportOptions, signal?: AbortSignal) =>
  postJSON<CVAnalysis>(`${options.apiUrl}/api/analyze`, buildRenderPayload(options, "pdf"), "Couldn't review the CV.", { signal });

export const downloadDOCX = async (options: ExportOptions) => {
  const blob = await postForBlob(`${options.apiUrl}/api/download/docx`, buildRenderPayload(options, "pdf"), "Word export failed.");
  downloadBlob(blob, safeFileName(options.cvData.name, "docx"));
};

export type BulletRewriteMode = components["schemas"]["RewriteBulletRequest"]["mode"];

export const rewriteBullet = (apiUrl: string, text: string, mode: BulletRewriteMode, role = "", jobDescription = "") =>
  postJSON<components["schemas"]["RewriteBulletResponse"]>(
    `${apiUrl}/api/ai/rewrite-bullet`,
    { text, mode, role, job_description: jobDescription.slice(0, 4000) },
    "Couldn't rewrite this bullet.",
  );

export const fetchJobFromUrl = (apiUrl: string, url: string) =>
  postJSON<components["schemas"]["JobFetchResponse"]>(`${apiUrl}/api/job/fetch`, { url }, "Couldn't read that job link.");

export const exportYAML = async (options: ExportOptions) => {
  const data = await postJSON<YAMLResponse>(
    `${options.apiUrl}/api/yaml`,
    buildRenderPayload(options, "pdf"),
    "YAML export failed.",
  );
  downloadBlob(new Blob([data.yaml], { type: "text/yaml;charset=utf-8" }), safeFileName(options.cvData.name, "yaml"));
};

export const requestAISuggestion = async (
  apiUrl: string,
  text: string,
  type: AISuggestRequest["type"] | string,
  context = "",
): Promise<string | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const data = await postJSON<AISuggestResponse>(
      `${apiUrl}/api/ai/suggest`,
      { text, type, context },
      "AI suggestion failed.",
      { signal: controller.signal },
    );
    return data.suggestion || null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI suggestion timed out. Please try again.");
    }
    if (err instanceof ApiError && err.status === 503) {
      throw new Error("AI service is not configured for this deployment.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

export type CVEnhancementResult = AIEnhanceCVResponse;

export const requestCVEnhancement = async (
  apiUrl: string,
  cvData: CVData,
  targetRole = "",
  jobDescription = "",
  currentScore = 0,
): Promise<CVEnhancementResult> => {
  const body: AIEnhanceCVRequest = {
    cv_data: toApiCV(cvData),
    target_role: targetRole,
    job_description: jobDescription,
    current_score: currentScore,
  };
  return postJSON<AIEnhanceCVResponse>(`${apiUrl}/api/ai/enhance-cv`, body, "CV enhancement failed.");
};

export type AIStatus = AIStatusResponse;

export const requestAIStatus = async (apiUrl: string): Promise<AIStatus> => {
  const response = await fetch(`${apiUrl}/api/ai/status`);
  if (!response.ok) {
    throw await parseApiError(response, "AI status is not available.");
  }
  return (await response.json()) as AIStatus;
};

export type CoverLetterGenerateResult = CoverLetterResponse;

export const generateCoverLetter = async (
  apiUrl: string,
  cvData: CVData,
  coverLetter: CoverLetterDraft,
  aiOnly = false,
): Promise<CoverLetterGenerateResult> => {
  return postJSON<CoverLetterResponse>(
    `${apiUrl}/api/cover-letter/generate`,
    buildCoverLetterPayload(cvData, coverLetter, aiOnly),
    "Cover letter generation failed.",
  );
};

export const downloadCoverLetterPDF = async (
  apiUrl: string,
  cvData: CVData,
  coverLetter: CoverLetterDraft,
  designSettings?: DesignSettings,
) => {
  const blob = await postForBlob(
    `${apiUrl}/api/cover-letter/download`,
    buildCoverLetterPayload(cvData, coverLetter, false, designSettings),
    "Cover letter export failed.",
  );
  downloadBlob(blob, safeFileName(cvData.name || "Cover_Letter", "pdf").replace("_CV.", "_Cover_Letter."));
};

export type PDFExtractResult = ExtractPDFResponse;

export const extractPDF = async (apiUrl: string, file: File): Promise<PDFExtractResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiUrl}/api/extract-pdf`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw await parseApiError(response, `Upload failed with status ${response.status}`);
  }
  return (await response.json()) as PDFExtractResult;
};

export interface CoverLetterStreamHandlers {
  /** Called with each new piece of text as it arrives. */
  onDelta: (text: string) => void;
  /** The server discarded what it streamed so far and is starting over. */
  onReset?: () => void;
}

/**
 * Generate a cover letter as a stream of server-sent events. Resolves with
 * the final, normalised letter once the server sends `done`.
 */
export const streamCoverLetter = async (
  apiUrl: string,
  cvData: CVData,
  coverLetter: CoverLetterDraft,
  { onDelta, onReset }: CoverLetterStreamHandlers,
  aiOnly = false,
  signal?: AbortSignal,
): Promise<CoverLetterResponse> => {
  const response = await fetch(`${apiUrl}/api/cover-letter/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(buildCoverLetterPayload(cvData, coverLetter, aiOnly)),
    signal,
  });
  if (!response.ok || !response.body) {
    throw await parseApiError(response, "Cover letter generation failed.");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      const payload = data ? JSON.parse(data) : {};
      if (event === "delta") onDelta(payload.text ?? "");
      else if (event === "reset") onReset?.();
      else if (event === "error") throw new Error(payload.detail || "Cover letter generation failed.");
      else if (event === "done") return payload as CoverLetterResponse;
    }
  }
  throw new Error("The cover letter stream ended unexpectedly. Please try again.");
};
