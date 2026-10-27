"use client";

import {  } from "lucide-react";
import styles from "./AtsPanel.module.css";
import { Button } from "@/components/ui";

interface AtsPanelProps {
  contentScore: number;
  tip?: string;
  totalWords: number;
  /** Shown small under the button, e.g. "AI provider is not configured". */
  aiNote?: string;
  onEnhance: () => void;
  enhancing: boolean;
  disabled: boolean;
  /** Dark sidebar styling vs. light card styling (mobile). */
  tone?: "sidebar" | "card";
}

const toneFor = (score: number, good: number, ok: number) => (score >= good ? "good" : score >= ok ? "ok" : "low");

function Meter({ label, score, tone }: { label: string; score: number; tone: string }) {
  return (
    <div className={styles.meter}>
      <div className={styles.meterTop}>
        <span>{label}</span>
        <strong className={styles[`score_${tone}`]}>{score}%</strong>
      </div>
      <div className={styles.track} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
        <span className={`${styles.fill} ${styles[`fill_${tone}`]}`} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

/** CV checklist: how much of the content checklist the CV meets, the top tip, and suggested improvements. */
export function AtsPanel({ contentScore, tip, totalWords, aiNote, onEnhance, enhancing, disabled, tone = "sidebar" }: AtsPanelProps) {
  return (
    <section className={`${styles.panel} ${tone === "card" ? styles.panelCard : ""}`} aria-label="CV checklist">
      <span className={styles.title}>CV checklist</span>
      <Meter label="Content" score={contentScore} tone={toneFor(contentScore, 80, 60)} />
      {tip && <p className={styles.tip}>{tip}</p>}
      <Button
        variant="primary"
        size="sm"
        fullWidth
        loading={enhancing}
        disabled={disabled}
        onClick={onEnhance}
        title={
          tone === "sidebar" && aiNote
            ? `${aiNote} Suggestions use built-in rules instead.`
            : "Suggest edits to your headline, summary and bullets. You review each one before it changes anything."
        }
        className={styles.enhance}
      >
        {enhancing ? "Checking..." : "Suggest improvements"}
      </Button>
      <span className={styles.words}>About {totalWords} words</span>
      {/* The narrow sidebar shows the note as the button tooltip instead. */}
      {aiNote && tone === "card" && <span className={styles.words}>{aiNote}</span>}
    </section>
  );
}
