"use client";

import type { SetStateAction } from "react";
import { Check } from "lucide-react";
import styles from "./Design.module.css";
import editorStyles from "@/app/editor/editor.module.css";
import type { CVData, DesignSettings } from "@/lib/cvBuilder";
import { THEME_DATA, type ThemeMeta } from "@/lib/themes";
import { Badge, Button, Card, Field, SectionHeading } from "@/components/ui";
import { PageTypographyControls, SectionLayoutControls } from "./DesignControls";

const COLOR_PRESETS = [
    { name: "Classic Blue", value: "#004F90" },
    { name: "Professional Black", value: "#0F172A" },
    { name: "Navy Blue", value: "#1a365d" },
    { name: "Elegant Teal", value: "#0d9488" },
    { name: "Forest Green", value: "#16a34a" },
    { name: "Modern Indigo", value: "#6366f1" },
    { name: "Royal Purple", value: "#7c3aed" },
    { name: "Bold Red", value: "#dc2626" },
    { name: "Professional Gold", value: "#B8860B" },
    { name: "Slate Gray", value: "#475569" },
];

// Fonts bundled with the renderer; anything else would silently fall back.
const FONT_OPTIONS = [
    { group: "Sans serif", fonts: ["Source Sans 3", "Open Sauce Sans", "Lato", "Roboto", "Open Sans", "Noto Sans", "Poppins", "Raleway", "Mukta", "Ubuntu"] },
    { group: "Serif", fonts: ["EB Garamond", "Libertinus Serif", "Gentium Book Plus", "XCharter", "New Computer Modern", "Fontin"] },
    { group: "Monospace", fonts: ["DejaVu Sans Mono"] },
];

interface DesignSectionProps {
    /** Live renders of the user's CV per template id; falls back to samples. */
    thumbnails: Record<string, string>;
    theme: string;
    onThemeChange: (theme: string) => void;
    recommendedTheme: ThemeMeta;
    cvData: CVData;
    designSettings: DesignSettings;
    setDesignSettings: (action: SetStateAction<DesignSettings>) => void;
}

/** Template choice, colour and font, section layout, and page/typography controls. */
export function DesignSection({ thumbnails, theme, onThemeChange: setTheme, recommendedTheme, cvData, designSettings, setDesignSettings }: DesignSectionProps) {
    const setColor = (primaryColor: string) => setDesignSettings((previous) => ({ ...previous, primaryColor }));
    const isPreset = COLOR_PRESETS.some((color) => color.value.toLowerCase() === designSettings.primaryColor.toLowerCase());

    return (
        <div className="animate-fade">
            <SectionHeading
                eyebrow="Design"
                title="Look and layout"
                description="Pick a template, then fine-tune colour, type and spacing. The preview on the right updates as you go."
            />

            <Card
                title="Template"
                description="Thumbnails show your own CV in each template."
                actions={
                    theme !== recommendedTheme.id && (
                        <Button size="sm" variant="secondary"  onClick={() => setTheme(recommendedTheme.id)}>
                            Use suggested
                        </Button>
                    )
                }
                className={editorStyles.formCard}
            >
                <div className={styles.templateGrid} role="radiogroup" aria-label="Template">
                    {THEME_DATA.map((t) => {
                        const active = theme === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`${styles.template} ${active ? styles.templateActive : ""}`}
                                onClick={() => setTheme(t.id)}
                            >
                                <span className={styles.templateThumb}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- live data URL or static sample */}
                                    <img src={thumbnails[t.id] ?? t.image} alt="" />
                                    {active && (
                                        <span className={styles.activeMark} aria-hidden="true">
                                            <Check size={14} strokeWidth={3} />
                                        </span>
                                    )}
                                </span>
                                <span className={styles.templateInfo}>
                                    <span className={styles.templateName}>{t.name}</span>
                                    <span className={styles.templateBadges}>
                                        {recommendedTheme.id === t.id && <Badge tone="accent">Suggested</Badge>}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            <Card title="Colour and font" className={editorStyles.formCard}>
                <div className={styles.styleGrid}>
                    <div>
                        <span className="form-label" id="accent-color-label">Accent colour</span>
                        <div className={styles.swatches} role="radiogroup" aria-labelledby="accent-color-label">
                            {COLOR_PRESETS.map((color) => {
                                const selected = color.value.toLowerCase() === designSettings.primaryColor.toLowerCase();
                                return (
                                    <button
                                        key={color.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        aria-label={color.name}
                                        title={color.name}
                                        className={`${styles.swatch} ${selected ? styles.swatchSelected : ""}`}
                                        style={{ background: color.value }}
                                        onClick={() => setColor(color.value)}
                                    >
                                        {selected && <Check size={14} strokeWidth={3} />}
                                    </button>
                                );
                            })}
                            <label className={`${styles.swatch} ${styles.customSwatch} ${!isPreset ? styles.swatchSelected : ""}`} title="Custom colour">
                                <input
                                    type="color"
                                    value={designSettings.primaryColor}
                                    onChange={(event) => setColor(event.target.value)}
                                    aria-label="Custom accent colour"
                                />
                            </label>
                        </div>
                    </div>
                    <Field label="Font">
                        <select
                            className="form-input"
                            value={designSettings.fontFamily}
                            onChange={(event) => setDesignSettings((previous) => ({ ...previous, fontFamily: event.target.value }))}
                        >
                            {FONT_OPTIONS.map(({ group, fonts }) => (
                                <optgroup key={group} label={group}>
                                    {fonts.map((font) => (
                                        <option key={font} value={font}>{font}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </Field>
                </div>
            </Card>

            <Card className={editorStyles.formCard}>
                <SectionLayoutControls theme={theme} cvData={cvData} designSettings={designSettings} onChange={setDesignSettings} />
            </Card>
            <Card className={editorStyles.formCard}>
                <PageTypographyControls designSettings={designSettings} onChange={setDesignSettings} />
            </Card>
        </div>
    );
}
