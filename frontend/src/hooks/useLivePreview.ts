"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CVData, DesignSettings, hasRenderableContent } from "@/lib/cvBuilder";
import { getDownloadSectionOrder, getRenderThemeId } from "@/lib/themes";

interface UseLivePreviewOptions {
  apiUrl: string;
  renderableData: CVData;
  theme: string;
  designSettings: DesignSettings;
  enabled: boolean;
}

const extractFieldErrors = (errorText: string): Record<string, string> => {
  try {
    const errorData = JSON.parse(errorText);
    const detail = String(errorData.detail || "");
    const match = detail.match(/location=\([^)]*'([^']+)'\)/);
    const msgMatch = detail.match(/message='([^']+)'/);
    if (match && msgMatch) {
      return { [match[1]]: msgMatch[1] };
    }
  } catch {
    return {};
  }
  return {};
};

export const useLivePreview = ({
  apiUrl,
  renderableData,
  theme,
  designSettings,
  enabled,
}: UseLivePreviewOptions) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const lastObjectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const clearPreview = useCallback(() => {
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewError(null);
    setFieldErrors({});
  }, []);

  const generatePreview = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!hasRenderableContent(renderableData)) {
        clearPreview();
        setIsGenerating(false);
        return;
      }

      setIsGenerating(true);
      setFieldErrors({});

      try {
        const response = await fetch(`${apiUrl}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            cv_data: {
              ...renderableData,
              name: renderableData.name.replace(/\*\*/g, ""),
            },
            theme: getRenderThemeId(theme),
            format: "png",
            design_settings: designSettings,
            section_order: getDownloadSectionOrder(theme),
          }),
        });

        if (signal?.aborted || requestId !== requestIdRef.current) return;

        if (response.ok) {
          const blob = await response.blob();
          if (signal?.aborted || requestId !== requestIdRef.current) return;

          const nextUrl = URL.createObjectURL(blob);
          if (lastObjectUrlRef.current) {
            URL.revokeObjectURL(lastObjectUrlRef.current);
          }
          lastObjectUrlRef.current = nextUrl;
          setPreviewUrl(nextUrl);
          setPreviewError(null);
          setFieldErrors({});
          return;
        }

        const errorText = await response.text();
        if (signal?.aborted || requestId !== requestIdRef.current) return;

        setFieldErrors(extractFieldErrors(errorText));
        setPreviewError("Preview could not be generated. Check the highlighted fields or simplify the latest entry.");
      } catch (error) {
        if (signal?.aborted) return;
        console.error("Preview error:", error);
        setPreviewError("Preview service is not reachable. Confirm the backend is running on the configured API URL.");
      } finally {
        if (!signal?.aborted && requestId === requestIdRef.current) {
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
    }, 900);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, generatePreview]);

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) {
        URL.revokeObjectURL(lastObjectUrlRef.current);
      }
    };
  }, []);

  return {
    previewUrl,
    isGenerating,
    fieldErrors,
    previewError,
    generatePreview,
  };
};
