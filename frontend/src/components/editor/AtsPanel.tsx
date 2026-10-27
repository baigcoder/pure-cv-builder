"use client";

import { Sparkles } from "lucide-react";
import styles from "./AtsPanel.module.css";
import { Button } from "@/components/ui";

interface AtsPanelProps {
  contentScore: number;
  templateScore: number;
  tip?: string;
  templateTip?: string;
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

/** ATS readiness: content and template-fit scores, the top tip, and one-click enhancement. */
export function AtsPanel({ contentScore, templateScore, tip, templateTip, totalWords, aiNote, onEnhance, enhancing, disabled, tone = "sidebar" }: AtsPanelProps) {
  return (
    <section className={`${styles.panel} ${tone === "card" ? styles.panelCard : ""}`} aria-label="ATS readiness">
      <span className={styles.title}>ATS readiness</span>
      <Meter label="Content" score={contentScore} tone={toneFor(contentScore, 80, 60)} />
      <Meter label="Template fit" score={templateScore} tone={toneFor(templateScore, 92, 82)} />
      {(tip || templateTip) && <p className={styles.tip}>{tip || templateTip}</p>}
      <Button
        variant="primary"
        size="sm"
        fullWidth
        icon={<Sparkles size={14} />}
        loading={enhancing}
        disabled={disabled}
        onClick={onEnhance}
        title={
          tone === "sidebar" && aiNote
            ? `${aiNote} Enhance uses local improvements instead.`
            : "Strengthen wording, headline, summary and skills for ATS using your role and market keywords"
        }
        className={styles.enhance}
      >
        {enhancing ? "Enhancing..." : "Enhance CV"}
      </Button>
      <span className={styles.words}>About {totalWords} words</span>
      {/* The narrow sidebar shows the note as the button tooltip instead. */}
      {aiNote && tone === "card" && <span className={styles.words}>{aiNote}</span>}
    </section>
  );
}
