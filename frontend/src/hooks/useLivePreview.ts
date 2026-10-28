"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CVData, DesignSettings, hasRenderableContent } from "@/lib/cvBuilder";
import { parseApiError, type PreviewPagesResponse, type RenderRequest } from "@/lib/api/client";
import { getDownloadSectionOrder, getRenderThemeId } from "@/lib/themes";

interface UseLivePreviewOptions {
  apiUrl: string;
  renderableData: CVData;
  theme: string;
  designSettings: DesignSettings;
  enabled: boolean;
}

export const useLivePreview = ({
  apiUrl,
  renderableData,
  theme,
  designSettings,
  enabled,
}: UseLivePreviewOptions) => {
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const clearPreview = useCallback(() => {
    setPreviewPages([]);
    setPageCount(0);
    setPreviewError(null);
    setFieldErrors({});
  }, []);

  const generatePreview = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const isStale = () => signal?.aborted || requestId !== requestIdRef.current;

      if (!hasRenderableContent(renderableData)) {
        clearPreview();
        setIsGenerating(false);
        return;
      }

      setIsGenerating(true);

      const payload: RenderRequest = {
        cv_data: {
          ...renderableData,
          name: renderableData.name.replace(/\*\*/g, ""),
        } as RenderRequest["cv_data"],
        theme: getRenderThemeId(theme),
        format: "png",
        design_settings: designSettings,
        section_order: getDownloadSectionOrder(theme),
      };

      try {
        const response = await fetch(`${apiUrl}/api/preview/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify(payload),
        });
        if (isStale()) return;

        if (response.ok) {
          const data = (await response.json()) as PreviewPagesResponse;
          if (isStale()) return;
          setPreviewPages(data.pages);
          setPageCount(data.page_count);
          setPreviewError(null);
          setFieldErrors({});
          return;
        }

        const apiError = await parseApiError(response, "Preview could not be generated.");
        if (isStale()) return;
        setFieldErrors(apiError.fields);
        setPreviewError(
          apiError.status === 429
            ? apiError.message
            : `${apiError.message} Check the highlighted fields or simplify the latest entry.`,
        );
      } catch (error) {
        if (signal?.aborted) return;
        console.error("Preview error:", error);
        setPreviewError("Preview service is not reachable. Confirm the backend is running on the configured API URL.");
      } finally {
        if (!isStale()) {
          setIsGenerating(false);
        }
      }
    },
    [apiUrl, clearPreview, designSettings, renderableData, theme],
  );

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      generatePreview(controller.signal);
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, generatePreview]);

  return {
    previewPages,
    previewUrl: previewPages[0] ?? null,
    pageCount,
    isGenerating,
    fieldErrors,
    previewError,
    generatePreview,
  };
};
