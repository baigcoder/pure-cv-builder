/**
 * Typed access to the ApplyForge API.
 *
 * `schema.d.ts` is generated from the backend's OpenAPI schema. Regenerate after
 * changing any backend model:
 *   cd backend && python scripts/export_openapi.py
 *   cd frontend && npm run gen:api
 */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type ApiCVData = Schemas["CVData"];
export type RenderRequest = Schemas["RenderRequest"];
export type PreviewPagesResponse = Schemas["PreviewPagesResponse"];
export type YAMLResponse = Schemas["YAMLResponse"];
export type ThemesResponse = Schemas["ThemesResponse"];
export type ThemeMetadata = Schemas["ThemeMetadata"];
export type AISuggestRequest = Schemas["AISuggestRequest"];
export type AISuggestResponse = Schemas["AISuggestResponse"];
export type AIEnhanceCVRequest = Schemas["AIEnhanceCVRequest"];
export type AIEnhanceCVResponse = Schemas["AIEnhanceCVResponse"];
export type AIStatusResponse = Schemas["AIStatusResponse"];
export type CoverLetterRequest = Schemas["CoverLetterRequest"];
export type CoverLetterResponse = Schemas["CoverLetterResponse"];
export type ExtractPDFResponse = Schemas["ExtractPDFResponse"];

/** Shape of every non-2xx JSON body returned by the API. */
export interface ApiErrorBody {
  detail: string;
  code: string;
  request_id: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly fields: Record<string, string>;

  constructor(status: number, body: Partial<ApiErrorBody>, fallback: string) {
    super(typeof body.detail === "string" && body.detail ? body.detail : fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code ?? `http_${status}`;
    this.requestId = body.request_id ?? "";
    this.fields = body.fields ?? {};
  }
}

export const parseApiError = async (response: Response, fallback: string): Promise<ApiError> => {
  const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
  return new ApiError(response.status, body, fallback);
};

export const postJSON = async <TResponse>(
  url: string,
  body: unknown,
  fallbackError: string,
  init: RequestInit = {},
): Promise<TResponse> => {
  const response = await fetch(url, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await parseApiError(response, fallbackError);
  }
  return (await response.json()) as TResponse;
};

export const postForBlob = async (url: string, body: unknown, fallbackError: string): Promise<Blob> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await parseApiError(response, fallbackError);
  }
  return response.blob();
};
