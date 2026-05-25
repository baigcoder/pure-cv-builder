import { CVData, CoverLetterDraft, DesignSettings } from "@/lib/cvBuilder";
import { getDownloadSectionOrder } from "@/lib/themes";

interface ExportOptions {
  apiUrl: string;
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
}

const buildRenderPayload = ({ cvData, theme, designSettings }: ExportOptions, format: "pdf" | "png" = "pdf") => ({
  cv_data: cvData,
  theme,
  format,
  design_settings: designSettings,
  section_order: getDownloadSectionOrder(theme),
});

const buildCoverLetterPayload = (
  cvData: CVData,
  coverLetter: CoverLetterDraft,
  aiOnly = false,
) => ({
  cv_data: cvData,
  cover_letter: {
    target_role: coverLetter.targetRole,
    company: coverLetter.company,
    hiring_manager: coverLetter.hiringManager,
    job_description: coverLetter.jobDescription,
    tone: coverLetter.tone,
    letter: coverLetter.letter,
  },
  ai_only: aiOnly,
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
  const response = await fetch(`${options.apiUrl}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRenderPayload(options, "pdf")),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  downloadBlob(await response.blob(), safeFileName(options.cvData.name, "pdf"));
};

export const exportYAML = async (options: ExportOptions) => {
  const response = await fetch(`${options.apiUrl}/api/yaml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRenderPayload(options, "pdf")),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { yaml: string };
  downloadBlob(new Blob([data.yaml], { type: "text/yaml;charset=utf-8" }), safeFileName(options.cvData.name, "yaml"));
};

export const requestAISuggestion = async (
  apiUrl: string,
  text: string,
  type: string,
  context = "",
): Promise<string | null> => {
  const response = await fetch(`${apiUrl}/api/ai/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type, context }),
  });

  if (response.status === 503) {
    throw new Error("AI service is not configured for this deployment.");
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { suggestion?: string };
  return data.suggestion || null;
};

export interface CVEnhancementResult {
  cv_data: Partial<CVData>;
  source: "ai" | "fallback";
  changes: string[];
  warnings: string[];
  market_keywords: string[];
}

export const requestCVEnhancement = async (
  apiUrl: string,
  cvData: CVData,
  targetRole = "",
  jobDescription = "",
  currentScore = 0,
): Promise<CVEnhancementResult> => {
  const response = await fetch(`${apiUrl}/api/ai/enhance-cv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cv_data: cvData,
      target_role: targetRole,
      job_description: jobDescription,
      current_score: currentScore,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "CV enhancement failed." }));
    throw new Error(errorData.detail || `CV enhancement failed with status ${response.status}`);
  }

  return (await response.json()) as CVEnhancementResult;
};

export interface AIStatus {
  configured: boolean;
  provider: string;
  base_url: string;
  model: string;
  supported_tasks: string[];
  fallback_available: boolean;
}

export const requestAIStatus = async (apiUrl: string): Promise<AIStatus> => {
  const response = await fetch(`${apiUrl}/api/ai/status`);

  if (!response.ok) {
    throw new Error("AI status is not available.");
  }

  return (await response.json()) as AIStatus;
};

export interface CoverLetterGenerateResult {
  letter: string;
  source: "ai" | "template";
  word_count: number;
}

export const generateCoverLetter = async (
  apiUrl: string,
  cvData: CVData,
  coverLetter: CoverLetterDraft,
  aiOnly = false,
): Promise<CoverLetterGenerateResult> => {
  const response = await fetch(`${apiUrl}/api/cover-letter/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCoverLetterPayload(cvData, coverLetter, aiOnly)),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Cover letter generation failed." }));
    throw new Error(errorData.detail || `Cover letter generation failed with status ${response.status}`);
  }

  return (await response.json()) as CoverLetterGenerateResult;
};

export const downloadCoverLetterPDF = async (
  apiUrl: string,
  cvData: CVData,
  coverLetter: CoverLetterDraft,
) => {
  const response = await fetch(`${apiUrl}/api/cover-letter/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCoverLetterPayload(cvData, coverLetter)),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Cover letter export failed." }));
    throw new Error(errorData.detail || `Cover letter export failed with status ${response.status}`);
  }

  downloadBlob(await response.blob(), safeFileName(cvData.name || "Cover_Letter", "pdf").replace("_CV.", "_Cover_Letter."));
};

export interface PDFExtractResult {
  success: boolean;
  cv_data: Record<string, unknown>;
  raw_text_length: number;
  message: string;
}

export const extractPDF = async (
  apiUrl: string,
  file: File,
): Promise<PDFExtractResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiUrl}/api/extract-pdf`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
  }

  return (await response.json()) as PDFExtractResult;
};
