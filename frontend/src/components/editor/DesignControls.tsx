"use client";

import { Eye, EyeOff, GripVertical } from "lucide-react";
import styles from "./EditorParts.module.css";
import { SortableList } from "./SortableList";
import { CVData, DesignSettings, REPEATABLE_SECTIONS, SectionId, toRenderableCVData } from "@/lib/cvBuilder";
import { getDownloadSectionOrder } from "@/lib/themes";

const SECTION_LABELS: Record<SectionId, string> = {
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  publications: "Publications",
  honors: "Awards & Certifications",
  patents: "Patents",
  talks: "Invited Talks",
};

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as SectionId[];

/** The order sections print in: the CV's own order, else the theme's. */
export const resolveSectionOrder = (theme: string, design: DesignSettings): SectionId[] => {
  const themeOrder = ["summary", ...getDownloadSectionOrder(theme)].filter((id): id is SectionId =>
    ALL_SECTIONS.includes(id as SectionId),
  );
  const base = design.sectionOrder?.length ? design.sectionOrder : themeOrder;
  // Append anything missing so newly added section types still show up.
  return [...base, ...ALL_SECTIONS.filter((id) => !base.includes(id))];
};

interface ControlsProps {
  theme: string;
  cvData: CVData;
  designSettings: DesignSettings;
  /** Receives an updater so rapid successive edits never overwrite each other. */
  onChange: (update: (previous: DesignSettings) => DesignSettings) => void;
}

export function SectionLayoutControls({ theme, cvData, designSettings, onChange }: ControlsProps) {
  const order = resolveSectionOrder(theme, designSettings);
  const hidden = new Set(designSettings.hiddenSections ?? []);
  const renderable = toRenderableCVData(cvData);
  const countFor = (id: SectionId): number =>
    id === "summary" ? (renderable.summary.trim() ? 1 : 0) : REPEATABLE_SECTIONS.includes(id) ? renderable[id].length : 0;

  const toggle = (id: SectionId) => {
    onChange((previous) => {
      const next = new Set(previous.hiddenSections ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...previous, hiddenSections: ALL_SECTIONS.filter((section) => next.has(section)) };
    });
  };

  const isCustom = Boolean(designSettings.sectionOrder?.length) || hidden.size > 0;

  return (
    <div className="form-group">
      <label className="form-label">Section order &amp; visibility</label>
      <p className={styles.sectionHint} style={{ margin: "0 0 0.75rem" }}>
        Drag to reorder how sections print on this CV. Hidden sections keep their content but stay off the PDF.
      </p>
      <SortableList
        className={styles.layoutList}
        items={order}
        getId={(id) => id}
        onReorder={(next) => onChange((previous) => ({ ...previous, sectionOrder: next }))}
        renderItem={(id, _index, handle) => {
          const count = countFor(id);
          const isHidden = hidden.has(id);
          return (
            <div className={`${styles.layoutItem} ${isHidden ? styles.layoutItemHidden : ""}`}>
              <button type="button" className={styles.handle} aria-label={`Drag ${SECTION_LABELS[id]}`} {...handle}>
                <GripVertical size={14} />
              </button>
              <span className={styles.layoutName}>{SECTION_LABELS[id]}</span>
              <span className={styles.layoutMeta}>
                {isHidden ? "Hidden" : count === 0 ? "Empty" : id === "summary" ? "Filled" : `${count} ${count === 1 ? "entry" : "entries"}`}
              </span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => toggle(id)}
                aria-pressed={isHidden}
                aria-label={isHidden ? `Show ${SECTION_LABELS[id]}` : `Hide ${SECTION_LABELS[id]}`}
                title={isHidden ? "Show on CV" : "Hide from CV"}
              >
                {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          );
        }}
      />
      <div className={styles.layoutActions}>
        <button
          type="button"
          className={styles.linkBtn}
          disabled={!isCustom}
          onClick={() => onChange((previous) => ({ ...previous, sectionOrder: undefined, hiddenSections: [] }))}
        >
          Reset to template order
        </button>
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number | undefined;
  fallback: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, fallback, min, max, step, unit, onChange }: SliderProps) {
  const id = `design-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className={styles.control}>
      <div className={styles.controlLabel}>
        <label className="form-label" htmlFor={id} style={{ margin: 0 }}>
          {label}
        </label>
        <span className={styles.controlValue}>{value === undefined ? "Template" : `${value}${unit}`}</span>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? fallback}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

const DESIGN_KEYS = ["pageSize", "marginCm", "fontSizePt", "lineSpacingEm", "sectionSpacingCm", "showFooter"] as const;

export function PageTypographyControls({ designSettings, onChange }: Omit<ControlsProps, "theme" | "cvData">) {
  const set = <K extends keyof DesignSettings>(key: K, value: DesignSettings[K]) =>
    onChange((previous) => ({ ...previous, [key]: value }));
  const isCustom = DESIGN_KEYS.some((key) => designSettings[key] !== undefined);

  return (
    <div className="form-group">
      <label className="form-label">Page &amp; typography</label>
      <p className={styles.sectionHint} style={{ margin: "0 0 0.75rem" }}>
        Fit more on a page or give it room to breathe. Untouched settings use the template&apos;s defaults.
      </p>
      <div className={styles.controlGrid}>
        <div className={styles.control}>
          <span className="form-label" style={{ margin: 0 }}>
            Page size
          </span>
          <div className={styles.segmented} role="radiogroup" aria-label="Page size">
            {(
              [
                ["us-letter", "US Letter"],
                ["a4", "A4"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={(designSettings.pageSize ?? "us-letter") === value}
                className={`${styles.segment} ${(designSettings.pageSize ?? "us-letter") === value ? styles.segmentActive : ""}`}
                onClick={() => set("pageSize", value)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.control}>
          <span className="form-label" style={{ margin: 0 }}>
            Footer
          </span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={designSettings.showFooter ?? true}
              onChange={(event) => set("showFooter", event.target.checked)}
            />
            Show page numbers and name
          </label>
        </div>
        <Slider label="Margins" value={designSettings.marginCm} fallback={1.8} min={0.5} max={3} step={0.1} unit=" cm" onChange={(value) => set("marginCm", value)} />
        <Slider label="Body font size" value={designSettings.fontSizePt} fallback={10} min={8} max={14} step={0.5} unit=" pt" onChange={(value) => set("fontSizePt", value)} />
        <Slider label="Line spacing" value={designSettings.lineSpacingEm} fallback={0.6} min={0.3} max={1.5} step={0.05} unit=" em" onChange={(value) => set("lineSpacingEm", value)} />
        <Slider label="Space above sections" value={designSettings.sectionSpacingCm} fallback={0.5} min={0.1} max={1.5} step={0.05} unit=" cm" onChange={(value) => set("sectionSpacingCm", value)} />
      </div>
      <div className={styles.layoutActions}>
        <button
          type="button"
          className={styles.linkBtn}
          disabled={!isCustom}
          onClick={() =>
            onChange((previous) => {
              const next = { ...previous };
              DESIGN_KEYS.forEach((key) => delete next[key]);
              return next;
            })
          }
        >
          Reset to template defaults
        </button>
      </div>
    </div>
  );
}
