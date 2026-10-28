"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "applyforge:theme";
const CHANGE_EVENT = "applyforge:theme-change";
const ORDER: ThemePreference[] = ["system", "light", "dark"];

/**
 * Runs before first paint (inlined in <head>) so a saved theme never flashes
 * the wrong colours. "system" leaves data-theme unset and CSS follows
 * prefers-color-scheme.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const read = (): ThemePreference => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** The saved theme preference, shared by every toggle and kept in sync across tabs. */
export function useThemePreference() {
  const preference = useSyncExternalStore(subscribe, read, () => "system" as ThemePreference);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: still apply for this page view.
    }
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const cycle = useCallback(() => {
    setPreference(ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length]);
  }, [setPreference]);

  return { preference, setPreference, cycle };
}

const LABELS: Record<ThemePreference, string> = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
};

/** Cycles system → light → dark. */
export function ThemeToggle({ className = "btn btn-secondary" }: { className?: string }) {
  const { preference, cycle } = useThemePreference();
  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  return (
    <button type="button" className={className} onClick={cycle} aria-label={`${LABELS[preference]}. Click to change.`} title={LABELS[preference]}>
      <Icon size={16} />
    </button>
  );
}
