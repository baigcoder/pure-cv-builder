"use client";

import { useEffect, useState } from "react";
import type { components } from "@/lib/api/schema";
import { postJSON } from "@/lib/api/client";
import { API_URL } from "@/lib/config";
import { CVData, DesignSettings, hasRenderableContent, toRenderableCVData } from "@/lib/cvBuilder";
import { THEME_DATA, getDownloadSectionOrder, getRenderThemeId } from "@/lib/themes";

type ThumbnailsResponse = components["schemas"]["ThumbnailsResponse"];

interface Options {
  cvData: CVData;
  designSettings: DesignSettings;
  /** Only fetch while a gallery is on screen. */
  enabled: boolean;
}

/**
 * Page one of the user's own CV in every template, as small PNG data URLs
 * keyed by template id. Empty until the CV has printable content, so callers
 * fall back to the static sample images.
 */
export function useTemplateThumbnails({ cvData, designSettings, enabled }: Options) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const renderable = toRenderableCVData(cvData);
    if (!enabled || !hasRenderableContent(renderable)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const result = await postJSON<ThumbnailsResponse>(
          `${API_URL}/api/preview/thumbnails`,
          {
            cv_data: renderable,
            design_settings: designSettings,
            items: THEME_DATA.map((theme) => ({
              theme: getRenderThemeId(theme.id),
              section_order: getDownloadSectionOrder(theme.id),
            })),
          },
          "Couldn't render template previews.",
          { signal: controller.signal },
        );
        const next: Record<string, string> = {};
        result.thumbnails.forEach((thumbnail, index) => {
          if (thumbnail.image) next[THEME_DATA[index].id] = thumbnail.image;
        });
        setThumbnails(next);
      } catch {
        // Keep the previous thumbnails (or the static samples) on failure.
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cvData, designSettings, enabled]);

  return { thumbnails, isLoading };
}
