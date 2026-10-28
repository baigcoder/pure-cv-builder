"use client";

import { useCallback, useMemo, type SetStateAction } from "react";
import { CVData, DEFAULT_CV_DATA, DEFAULT_DESIGN_SETTINGS, DesignSettings } from "@/lib/cvBuilder";
import { useUndoableState, useUndoShortcuts } from "@/hooks/useUndoableState";
import { getTemplateDesign } from "@/lib/themes";

interface CVDocument {
  cvData: CVData;
  theme: string;
  designSettings: DesignSettings;
}

const resolve = <T,>(action: SetStateAction<T>, previous: T): T =>
  typeof action === "function" ? (action as (value: T) => T)(previous) : action;

/**
 * The editable CV (content, theme, design) with one shared undo history.
 *
 * `setCVData` / `setTheme` / `setDesignSettings` record undo steps. The
 * `loaders` versions replace values without history; draft restore and cloud
 * load use them so undo can't step back past what was loaded.
 */
export function useCVDocument(initialTheme: string) {
  const { state, setState, reset, undo, redo, canUndo, canRedo } = useUndoableState<CVDocument>({
    cvData: DEFAULT_CV_DATA,
    theme: initialTheme,
    designSettings: getTemplateDesign(initialTheme, DEFAULT_DESIGN_SETTINGS),
  });

  useUndoShortcuts(undo, redo);

  const setCVData = useCallback(
    (action: SetStateAction<CVData>) => setState((doc) => ({ ...doc, cvData: resolve(action, doc.cvData) })),
    [setState],
  );
  const setTheme = useCallback(
    (action: SetStateAction<string>) => setState((doc) => ({ ...doc, theme: resolve(action, doc.theme) })),
    [setState],
  );
  const setDesignSettings = useCallback(
    (action: SetStateAction<DesignSettings>) =>
      setState((doc) => ({ ...doc, designSettings: resolve(action, doc.designSettings) })),
    [setState],
  );

  /** Switch template in one undo step; trending presets also apply their font and colour. */
  const chooseTemplate = useCallback(
    (theme: string) => setState((doc) => ({ ...doc, theme, designSettings: getTemplateDesign(theme, doc.designSettings) })),
    [setState],
  );

  const loaders = useMemo(
    () => ({
      setCVData: (cvData: CVData) => reset((doc) => ({ ...doc, cvData })),
      setTheme: (theme: string) => reset((doc) => ({ ...doc, theme })),
      setDesignSettings: (designSettings: DesignSettings) => reset((doc) => ({ ...doc, designSettings })),
    }),
    [reset],
  );

  return {
    cvData: state.cvData,
    theme: state.theme,
    designSettings: state.designSettings,
    setCVData,
    setTheme,
    setDesignSettings,
    chooseTemplate,
    loaders,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
