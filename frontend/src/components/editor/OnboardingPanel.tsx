"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { FileUp, PenLine, Sparkles, X } from "lucide-react";
import styles from "./Onboarding.module.css";

const DISMISSED_KEY = "applyforge:onboarding-dismissed";
const CHANGE_EVENT = "applyforge:onboarding-change";

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

const readDismissed = () => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** Whether the welcome panel was dismissed (assumed true on the server). */
export function useOnboardingDismissed() {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked: the panel hides for this view only.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return { dismissed, dismiss };
}

interface OnboardingPanelProps {
  onStartBlank: () => void;
  onLoadSample: () => void;
  onDismiss: () => void;
}

/** Shown on an empty CV: the three ways to get started. */
export function OnboardingPanel({ onStartBlank, onLoadSample, onDismiss }: OnboardingPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="onboarding-title">
      <button type="button" className={styles.close} onClick={onDismiss} aria-label="Dismiss getting started">
        <X size={16} />
      </button>
      <span className={styles.eyebrow}>Getting started</span>
      <h2 id="onboarding-title">How do you want to begin?</h2>
      <p className={styles.lead}>Everything saves as you type, and the PDF preview updates live.</p>

      <div className={styles.options}>
        <Link href="/upload" className={styles.option}>
          <span className={styles.icon}><FileUp size={20} /></span>
          <strong>Import my resume</strong>
          <span>Upload a PDF and we&apos;ll turn it into editable sections.</span>
        </Link>
        <button type="button" className={styles.option} onClick={onStartBlank}>
          <span className={styles.icon}><PenLine size={20} /></span>
          <strong>Start from scratch</strong>
          <span>Fill in your profile, then add experience and skills.</span>
        </button>
        <button type="button" className={styles.option} onClick={onLoadSample}>
          <span className={styles.icon}><Sparkles size={20} /></span>
          <strong>Explore with a sample</strong>
          <span>Load an example CV to try templates and tools. Undo with Ctrl+Z.</span>
        </button>
      </div>

      <p className={styles.tip}>
        Tip: press <kbd>Ctrl</kbd> <kbd>K</kbd> any time to jump to a section, switch templates, or download.
      </p>
    </section>
  );
}
