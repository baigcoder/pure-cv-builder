"use client";

import type { SetStateAction } from "react";
import { Sparkles } from "lucide-react";
import styles from "@/app/editor/editor.module.css";
import type { CVData, DesignSettings } from "@/lib/cvBuilder";
import { THEME_DATA, type ThemeMeta } from "@/lib/themes";
import { PageTypographyControls, SectionLayoutControls } from "./DesignControls";

// Color presets for CV themes
const COLOR_PRESETS = [
    { name: "Classic Blue", value: "#004F90" },
    { name: "Professional Black", value: "#0F172A" },
    { name: "Modern Indigo", value: "#6366f1" },
    { name: "Elegant Teal", value: "#0d9488" },
    { name: "Bold Red", value: "#dc2626" },
    { name: "Forest Green", value: "#16a34a" },
    { name: "Royal Purple", value: "#7c3aed" },
    { name: "Slate Gray", value: "#475569" },
    { name: "Professional Gold", value: "#DAA520" },
    { name: "Navy Blue", value: "#1a365d" },
];

// Font options
const FONT_OPTIONS = [
    { name: "Source Sans 3", value: "Source Sans 3" },
    { name: "Inter", value: "Inter" },
    { name: "Roboto", value: "Roboto" },
    { name: "Open Sans", value: "Open Sans" },
    { name: "Lato", value: "Lato" },
    { name: "Georgia", value: "Georgia" },
    { name: "Times New Roman", value: "Times New Roman" },
];

interface DesignSectionProps {
    theme: string;
    onThemeChange: (theme: string) => void;
    recommendedTheme: ThemeMeta;
    cvData: CVData;
    designSettings: DesignSettings;
    setDesignSettings: (action: SetStateAction<DesignSettings>) => void;
}

/** Template choice, colour and font, section layout, and page/typography controls. */
export function DesignSection({ theme, onThemeChange: setTheme, recommendedTheme, cvData, designSettings, setDesignSettings }: DesignSectionProps) {
    return (
        <div className="animate-fade">
            <h1 className={styles.sectionTitle}>Customize Design.</h1>

            {/* Template Selection - Grid Layout */}
            <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '1rem' }}>Choose Template</label>
                <button
                    type="button"
                    className={styles.templateRecommendBtn}
                    style={{ marginBottom: '1rem' }}
                    onClick={() => setTheme(recommendedTheme.id)}
                >
                    <Sparkles size={14} />
                    Use best ATS template: {recommendedTheme.name}
                </button>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    {THEME_DATA.map((t) => (
                        <div
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            style={{
                                position: 'relative',
                                aspectRatio: '3/4',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: theme === t.id ? '3px solid var(--accent)' : '2px solid var(--border)',
                                boxShadow: theme === t.id ? '0 8px 24px rgba(99, 102, 241, 0.25)' : 'var(--shadow-md)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: theme === t.id ? 'scale(1.02)' : 'scale(1)',
                                background: 'white'
                            }}
                        >
                            <div style={{
                                position: 'absolute',
                                top: '12px',
                                left: '12px',
                                zIndex: 2,
                                background: recommendedTheme.id === t.id ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.92)',
                                color: recommendedTheme.id === t.id ? '#67e8f9' : 'var(--primary)',
                                padding: '4px 10px',
                                borderRadius: '100px',
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase'
                            }}>{recommendedTheme.id === t.id ? 'Best ATS match' : `${t.atsScore}% ATS`}</div>
                            <img
                                src={t.image}
                                alt={t.name}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transition: 'transform 0.5s ease'
                                }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                padding: '1rem',
                                background: 'linear-gradient(to top, rgba(15, 23, 42, 0.9), transparent)',
                                color: 'white'
                            }}>
                                <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{t.name}</p>
                                <p style={{ fontSize: '0.7rem', opacity: 0.8 }}>{t.description}</p>
                            </div>
                            {theme === t.id && (
                                <div style={{
                                    position: 'absolute',
                                    top: '12px',
                                    right: '12px',
                                    background: 'var(--accent)',
                                    color: 'white',
                                    padding: '4px 10px',
                                    borderRadius: '100px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.05em'
                                }}>ACTIVE</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Color & Typography */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2rem',
                padding: '1.5rem',
                background: 'rgba(248, 250, 252, 0.8)',
                backdropFilter: 'blur(8px)',
                borderRadius: '16px',
                border: '1px solid var(--border)'
            }}>
                <div>
                    <label className="form-label" style={{ marginBottom: '0.75rem' }}>Primary Color</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {COLOR_PRESETS.slice(0, 4).map((color) => (
                            <button
                                key={color.value}
                                onClick={() => setDesignSettings({ ...designSettings, primaryColor: color.value })}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: color.value,
                                    border: designSettings.primaryColor === color.value ? '3px solid var(--primary)' : '2px solid white',
                                    boxShadow: 'var(--shadow-sm)',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s'
                                }}
                                title={color.name}
                            />
                        ))}
                        <input
                            type="color"
                            value={designSettings.primaryColor}
                            onChange={(e) => setDesignSettings({ ...designSettings, primaryColor: e.target.value })}
                            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '50%' }}
                            title="Custom Color"
                        />
                    </div>
                </div>
                <div>
                    <label className="form-label" style={{ marginBottom: '0.75rem' }}>Font Family</label>
                    <select
                        className="form-input"
                        value={designSettings.fontFamily}
                        onChange={(e) => setDesignSettings({ ...designSettings, fontFamily: e.target.value })}
                        style={{ cursor: 'pointer' }}
                    >
                        {FONT_OPTIONS.map((font) => (
                            <option key={font.value} value={font.value}>{font.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className={styles.designPanel}>
                <SectionLayoutControls theme={theme} cvData={cvData} designSettings={designSettings} onChange={setDesignSettings} />
            </div>
            <div className={styles.designPanel}>
                <PageTypographyControls designSettings={designSettings} onChange={setDesignSettings} />
            </div>

            {/* Live Preview */}
            <div style={{
                marginTop: '2rem',
                padding: '2rem',
                background: 'white',
                borderRadius: '16px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)'
            }}>
                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: '1rem' }}>Live Preview</p>
                <p style={{ color: designSettings.primaryColor, fontFamily: designSettings.fontFamily, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {cvData.name || "Your Name"}
                </p>
                <p style={{ color: designSettings.primaryColor, fontFamily: designSettings.fontFamily, fontSize: '1rem', marginTop: '0.25rem' }}>
                    {cvData.headline || "Professional Title"}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                    <span>📧 {cvData.email || "email@example.com"}</span>
                    <span>📍 {cvData.location || "City, Country"}</span>
                </div>
            </div>
        </div>
    );
}
