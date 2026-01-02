"use client";

import { useRef, useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./editor.module.css";
import { Logo, Icons } from "@/components/Brand";

// API Base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Section order definitions matching RenderCV template structure
const THEME_SECTION_ORDER = {
    // Standard RenderCV order (from example YAML)
    standard: ["profile", "education", "experience", "projects", "publications", "honors", "skills", "patents", "talks", "design"],
    // Academic - Publications more prominent
    academic: ["profile", "education", "publications", "experience", "projects", "honors", "skills", "patents", "talks", "design"],
    // Tech - Skills first (recruiters scan for skills)
    tech: ["profile", "skills", "experience", "projects", "education", "publications", "patents", "honors", "talks", "design"],
    // Entry Level - Education first, projects prominent
    entry_level: ["profile", "education", "projects", "skills", "experience", "honors", "publications", "patents", "talks", "design"],
};

// Theme data - Only valid RenderCV core themes
const THEME_DATA = [
    { id: "classic", name: "Classic", image: "/theme-classic.png", description: "Traditional professional layout", orderType: "standard" },
    { id: "moderncv", name: "ModernCV", image: "/theme-moderncv.png", description: "Modern two-column design", orderType: "standard" },
    { id: "sb2nov", name: "Academic", image: "/theme-sb2nov.png", description: "Research & academic careers", orderType: "academic" },
    { id: "engineeringresumes", name: "Tech", image: "/theme-engineeringresumes.png", description: "Tech & engineering focused", orderType: "tech" },
    { id: "engineeringclassic", name: "Entry Level", image: "/theme-engineeringclassic.png", description: "Students & new graduates", orderType: "entry_level" },
];

// Base sections with icons (will be reordered based on theme)
const BASE_SECTIONS = {
    profile: { id: "profile", name: "Profile", icon: <Icons.profile /> },
    experience: { id: "experience", name: "Work", icon: <Icons.experience /> },
    education: { id: "education", name: "Education", icon: <Icons.education /> },
    projects: { id: "projects", name: "Projects", icon: <Icons.projects /> },
    skills: { id: "skills", name: "Skills", icon: <Icons.skills /> },
    publications: { id: "publications", name: "Publications", icon: <Icons.publications /> },
    honors: { id: "honors", name: "Awards & Certs", icon: <Icons.honors /> },
    patents: { id: "patents", name: "Patents", icon: <Icons.patents /> },
    talks: { id: "talks", name: "Talks", icon: <Icons.talks /> },
    design: { id: "design", name: "Design", icon: <Icons.design /> },
};

// Helper to get sections in theme order
const getSectionsForTheme = (themeId: string) => {
    const theme = THEME_DATA.find(t => t.id === themeId);
    const orderType = theme?.orderType || "industry";
    const order = THEME_SECTION_ORDER[orderType as keyof typeof THEME_SECTION_ORDER];
    return order.map(sectionId => BASE_SECTIONS[sectionId as keyof typeof BASE_SECTIONS]);
};

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

// Types
interface Entry {
    id: string;
    [key: string]: any;
}

interface CVData {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    website: string;
    linkedin: string;
    github: string;
    summary: string;
    photo: string;  // Base64 encoded photo
    experience: any[];
    education: any[];
    skills: any[];
    projects: any[];
    publications: any[];
    honors: any[];
    patents: any[];
    talks: any[];
}

function EditorContent() {
    const searchParams = useSearchParams();
    const initialTheme = searchParams.get("theme") || "classic";

    // State
    const [cvData, setCVData] = useState<CVData>({
        name: "", headline: "", email: "", phone: "", location: "", website: "",
        linkedin: "", github: "", summary: "", photo: "",
        experience: [], education: [], skills: [], projects: [],
        publications: [], honors: [], patents: [], talks: []
    });
    const [theme, setTheme] = useState(initialTheme);
    const [activeSection, setActiveSection] = useState("profile");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('edit');
    const [isAISuggesting, setIsAISuggesting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const themeScrollRef = useRef<HTMLDivElement>(null);
    const [designSettings, setDesignSettings] = useState({
        primaryColor: "#004F90",
        fontFamily: "Source Sans 3",
    });
    const [syncStatus, setSyncStatus] = useState<'saved' | 'syncing'>('saved');

    // Section Progress Logic
    const calculateSectionProgress = (sectionId: string): number => {
        if (sectionId === "profile") {
            const fields = ["name", "email", "phone", "location", "summary", "headline"];
            const filled = fields.filter(f => !!(cvData[f as keyof CVData] as string)?.trim()).length;
            return Math.floor((filled / fields.length) * 100);
        }
        if (sectionId === "design") return 100;

        const list = cvData[sectionId as keyof CVData] as any[];
        if (!list || list.length === 0) return 0;

        const first = list[0];
        if (sectionId === "experience") return first.company && first.position ? 100 : 50;
        if (sectionId === "education") return first.institution ? 100 : 50;
        if (sectionId === "skills") return first.label ? 100 : 50;
        if (sectionId === "projects") return first.name ? 100 : 50;

        return 100;
    };

    // Word count per section
    const getSectionWordCount = (sectionId: string): number => {
        const countWords = (text: string): number => text.trim().split(/\s+/).filter(w => w.length > 0).length;

        if (sectionId === "profile") {
            return countWords(cvData.summary) + countWords(cvData.headline);
        }
        if (sectionId === "design") return 0;

        const list = cvData[sectionId as keyof CVData] as any[];
        if (!list || list.length === 0) return 0;

        return list.reduce((total, item) => {
            const fields = Object.values(item).filter(v => typeof v === 'string') as string[];
            return total + fields.reduce((sum, text) => sum + countWords(text), 0);
        }, 0);
    };

    // Date validation helper
    const validateDateRange = (startDate: string, endDate: string): { valid: boolean; message: string } => {
        if (!startDate || !endDate) return { valid: true, message: '' };
        if (endDate.toLowerCase() === 'present') return { valid: true, message: '' };

        const parseDate = (d: string): Date | null => {
            const formats = [
                /^(\d{4})-(\d{2})$/,  // 2020-01
                /^(\w+)\s+(\d{4})$/,   // Jan 2020
                /^(\d{4})$/            // 2020
            ];
            for (const fmt of formats) {
                const match = d.match(fmt);
                if (match) {
                    if (fmt === formats[0]) return new Date(parseInt(match[1]), parseInt(match[2]) - 1);
                    if (fmt === formats[1]) return new Date(d);
                    if (fmt === formats[2]) return new Date(parseInt(match[1]), 0);
                }
            }
            return null;
        };

        const start = parseDate(startDate);
        const end = parseDate(endDate);

        if (start && end && start > end) {
            return { valid: false, message: 'End date must be after start date' };
        }
        return { valid: true, message: '' };
    };

    // ATS Score Calculator
    const calculateATSScore = (): { score: number; tips: string[] } => {
        const tips: string[] = [];
        let score = 0;

        // Check contact info (20 points)
        if (cvData.name.trim()) score += 5;
        if (cvData.email.trim()) score += 5;
        if (cvData.phone.trim()) score += 5;
        if (cvData.location.trim()) score += 5;
        else tips.push('Add location for better ATS matching');

        // Check summary (15 points)
        if (cvData.summary.length > 50) score += 15;
        else tips.push('Summary should be at least 50 characters');

        // Check experience (25 points)
        const hasExperience = cvData.experience.some(e => e.company && e.position);
        if (hasExperience) score += 15;
        else tips.push('Add at least one work experience');

        const hasHighlights = cvData.experience.some(e => e.highlights && e.highlights.length > 0);
        if (hasHighlights) score += 10;
        else tips.push('Add bullet points to experience');

        // Check education (15 points)
        const hasEducation = cvData.education.some(e => e.institution);
        if (hasEducation) score += 15;
        else tips.push('Add education information');

        // Check skills (15 points)
        const hasSkills = cvData.skills.length > 0 && cvData.skills.some(s => s.label);
        if (hasSkills) score += 15;
        else tips.push('Add skills section');

        // Check formatting (10 points)
        const wordCount = Object.keys(BASE_SECTIONS)
            .filter(s => s !== 'design')
            .reduce((sum, s) => sum + getSectionWordCount(s), 0);
        if (wordCount >= 300 && wordCount <= 700) score += 10;
        else tips.push('Aim for 300-700 total words');

        return { score, tips };
    };

    const getAISuggestion = async (text: string, type: string, context: string = "") => {
        setIsAISuggesting(true);
        try {
            const response = await fetch(`${API_URL}/api/ai/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, type, context }),
            });
            if (response.ok) {
                const data = await response.json();
                return data.suggestion;
            }
        } catch (err) {
            console.error("AI suggestion error:", err);
        } finally {
            setIsAISuggesting(false);
        }
        return null;
    };

    const improveSummary = async () => {
        if (!cvData.summary.trim() && !cvData.name.trim()) return;
        const suggestion = await getAISuggestion(
            cvData.summary || cvData.name,
            cvData.summary ? "summary" : "generate",
            cvData.name
        );
        if (suggestion) updateField("summary", suggestion);
    };

    // Update Field
    const updateField = (field: keyof CVData, value: any) => {
        setCVData(prev => ({ ...prev, [field]: value }));
    };

    const moveEntry = (section: keyof CVData, index: number, direction: 'up' | 'down') => {
        const list = [...(cvData[section] as any[])];
        if (direction === 'up' && index > 0) {
            [list[index], list[index - 1]] = [list[index - 1], list[index]];
        } else if (direction === 'down' && index < list.length - 1) {
            [list[index], list[index + 1]] = [list[index + 1], list[index]];
        }
        updateField(section, list);
    };

    const removeEntry = (section: keyof CVData, index: number) => {
        const list = (cvData[section] as any[]).filter((_, idx) => idx !== index);
        updateField(section, list);
    };

    // Generate Preview
    const generatePreview = useCallback(async () => {
        // Check if there's any content to render
        const hasContent = cvData.name.trim() || cvData.headline.trim() || cvData.email.trim() ||
            cvData.phone.trim() || cvData.location.trim() || cvData.website.trim() ||
            cvData.linkedin.trim() || cvData.github.trim() || cvData.summary.trim() ||
            cvData.experience.length > 0 || cvData.education.length > 0 ||
            cvData.skills.length > 0 || cvData.projects.length > 0 ||
            cvData.publications.length > 0 || cvData.honors.length > 0 ||
            cvData.patents.length > 0 || cvData.talks.length > 0;
        if (!hasContent) {
            setPreviewUrl(null); // Clear preview when no content
            return;
        }

        // Send data as-is, backend handles defaults
        // But strip markdown from name for filename safety (Windows doesn't allow * in filenames)
        const dataToSend = {
            ...cvData,
            name: cvData.name.replace(/\*\*/g, '') // Strip bold markdown for filename
        };

        setSyncStatus('syncing');
        setIsGenerating(true);
        setFieldErrors({}); // Clear previous errors
        try {
            // Get section order for current theme (exclude profile and design)
            const currentTheme = THEME_DATA.find(t => t.id === theme);
            const orderType = currentTheme?.orderType || "industry";
            const themeOrder = THEME_SECTION_ORDER[orderType as keyof typeof THEME_SECTION_ORDER];
            // Filter out 'profile' and 'design' as they're not CV sections
            const sectionOrder = themeOrder.filter(s => s !== 'profile' && s !== 'design');

            const response = await fetch(`${API_URL}/api/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cv_data: dataToSend,
                    theme,
                    format: "png",
                    design_settings: designSettings,
                    section_order: sectionOrder
                }),
            });
            if (response.ok) {
                const blob = await response.blob();
                setPreviewUrl(URL.createObjectURL(blob));
                setSyncStatus('saved');
                setFieldErrors({});
            } else {
                const errorText = await response.text();
                console.error("Preview failed:", response.status, errorText);

                // Parse validation errors and set field-level messages
                try {
                    const errorData = JSON.parse(errorText);
                    if (errorData.detail && errorData.detail.includes('RenderCVValidationError')) {
                        // Extract field name and message from error
                        const match = errorData.detail.match(/location=\([^)]*'([^']+)'\)/);
                        const msgMatch = errorData.detail.match(/message='([^']+)'/);
                        if (match && msgMatch) {
                            const fieldName = match[1];
                            const message = msgMatch[1];
                            setFieldErrors({ [fieldName]: message });
                        }
                    }
                } catch {
                    // Ignore parse errors
                }
                setSyncStatus('saved');
            }
        } catch (err) {
            console.error("Preview error:", err);
            setSyncStatus('saved');
        } finally {
            setIsGenerating(false);
        }
    }, [cvData, theme, designSettings]);

    // Auto-save/preview effect - use JSON.stringify for deep comparison
    const cvDataKey = JSON.stringify(cvData);
    useEffect(() => {
        const timer = setTimeout(generatePreview, 1500);
        return () => clearTimeout(timer);
    }, [cvDataKey, theme, designSettings, generatePreview]);

    const downloadPDF = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/download`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cv_data: cvData,
                    theme,
                    format: "pdf",
                    design_settings: designSettings
                }),
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `CV_${cvData.name.replace(/\s+/g, "_")}.pdf`;
                a.click();
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.editorLayout}>
            <header className={styles.header}>
                <div className={styles.logoArea}>
                    <Logo width={28} height={28} />
                    <span style={{ letterSpacing: '0.1em', fontWeight: 800 }}>PURE</span>
                </div>
                <div className={styles.headerActions}>
                    <button
                        onClick={() => setEditorMode(editorMode === 'preview' ? 'edit' : 'preview')}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {editorMode === 'preview' ? (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Edit CV
                            </>
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                Preview
                            </>
                        )}
                    </button>
                    <Link href="/" className="btn btn-secondary">Exit</Link>
                    <button onClick={downloadPDF} className="btn btn-primary" disabled={isLoading}>
                        {isLoading ? "Exporting..." : "Download PDF"}
                    </button>
                </div>
            </header>

            {editorMode === 'preview' ? (
                /* PREVIEW MODE: Template Gallery */
                <main className={styles.main} style={{ display: 'block', padding: '2rem 3rem' }}>
                    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                                Choose Your Template
                            </h1>
                            <p style={{ color: 'var(--text-light)' }}>
                                Select a design that best represents your professional identity
                            </p>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '1.5rem',
                            marginBottom: '2rem'
                        }}>
                            {THEME_DATA.map((t) => (
                                <div
                                    key={t.id}
                                    onClick={() => setTheme(t.id)}
                                    style={{
                                        border: theme === t.id ? '3px solid #6366F1' : '2px solid #E2E8F0',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        background: 'white',
                                        boxShadow: theme === t.id ? '0 8px 25px rgba(99, 102, 241, 0.2)' : '0 4px 12px rgba(0,0,0,0.05)',
                                        transform: theme === t.id ? 'scale(1.02)' : 'scale(1)'
                                    }}
                                >
                                    <div style={{
                                        height: '320px',
                                        background: '#F8FAFC',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden'
                                    }}>
                                        <img
                                            src={t.image}
                                            alt={t.name}
                                            style={{
                                                width: '90%',
                                                height: '90%',
                                                objectFit: 'contain',
                                                borderRadius: '8px',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                            }}
                                        />
                                    </div>
                                    <div style={{ padding: '1rem', textAlign: 'center' }}>
                                        <h3 style={{
                                            fontWeight: 600,
                                            color: theme === t.id ? '#6366F1' : 'var(--text)',
                                            marginBottom: '0.25rem'
                                        }}>{t.name}</h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{t.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                            <button
                                onClick={() => setEditorMode('edit')}
                                className="btn btn-primary btn-lg"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '1rem 2.5rem',
                                    fontSize: '1.1rem'
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Edit Your CV
                            </button>
                        </div>
                    </div>
                </main>
            ) : (
                /* EDIT MODE: Form Editor */
                <main className={styles.main}>
                    <aside className={styles.sidebar}>
                        {getSectionsForTheme(theme).map(s => {
                            const progress = calculateSectionProgress(s.id);
                            const wordCount = getSectionWordCount(s.id);
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ""}`}
                                >
                                    <span className={styles.navIcon}>{s.icon}</span>
                                    <span className={styles.navText}>{s.name}</span>
                                    {wordCount > 0 && s.id !== "design" && (
                                        <span style={{
                                            fontSize: '0.65rem',
                                            color: 'var(--text-light)',
                                            marginLeft: 'auto',
                                            marginRight: '0.5rem',
                                            opacity: 0.7
                                        }}>
                                            {wordCount}w
                                        </span>
                                    )}
                                    {progress === 100 && (
                                        <div style={{ marginLeft: wordCount > 0 ? '0' : 'auto' }}>
                                            <svg style={{ color: 'var(--success)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                        </div>
                                    )}
                                </button>
                            );
                        })}


                        <div className={styles.sidebarFooter}>
                            {(() => {
                                const totalWords = Object.keys(BASE_SECTIONS)
                                    .filter(s => s !== 'design')
                                    .reduce((sum, s) => sum + getSectionWordCount(s), 0);
                                const ats = calculateATSScore();
                                const scoreColor = ats.score >= 80 ? 'var(--success)' : ats.score >= 60 ? 'var(--warning)' : 'var(--error)';
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div className={styles.atsScore}>
                                            <span className={styles.atsLabel}>ATS Strength</span>
                                            <span style={{ color: scoreColor }} className={styles.atsValue}>
                                                {ats.score}%
                                            </span>
                                            {ats.tips.length > 0 && (
                                                <p style={{ fontSize: '0.65rem', color: 'var(--text-light)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                                                    {ats.tips[0]}
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-light)',
                                                fontWeight: 500,
                                                letterSpacing: '0.02em'
                                            }}>
                                                Approx. {totalWords} words
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </aside>

                    <div className={styles.formArea}>
                        <div className={styles.statusBar}>
                            <div className={`${styles.statusDot} ${syncStatus === 'syncing' ? styles.statusDotPulse : ""}`} />
                            {syncStatus === 'syncing' ? "Syncing with Engine..." : "Purely Synchronized"}
                        </div>
                        <div className={styles.sectionContent}>
                            {activeSection === "profile" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Draft your profile.</h1>

                                    {/* Photo Upload */}
                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label className="form-label">Profile Photo</label>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem'
                                        }}>
                                            <div style={{
                                                width: '80px',
                                                height: '80px',
                                                borderRadius: '50%',
                                                border: '2px dashed var(--border)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                                background: cvData.photo ? 'transparent' : 'var(--bg-subtle)',
                                                cursor: 'pointer'
                                            }}
                                                onClick={() => document.getElementById('photo-upload')?.click()}
                                            >
                                                {cvData.photo ? (
                                                    <img src={cvData.photo} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span style={{ fontSize: '2rem', color: 'var(--text-light)' }}>👤</span>
                                                )}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <input
                                                    id="photo-upload"
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => {
                                                                updateField("photo", ev.target?.result as string);
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => document.getElementById('photo-upload')?.click()}
                                                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                                                >
                                                    {cvData.photo ? 'Change Photo' : 'Upload Photo'}
                                                </button>
                                                {cvData.photo && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField("photo", "")}
                                                        style={{
                                                            marginLeft: '0.5rem',
                                                            fontSize: '0.85rem',
                                                            color: '#e53e3e',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                                <p style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                                                    Optional • JPG or PNG • Max 2MB
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Full Name <span style={{ color: '#e53e3e' }}>*</span></label>
                                        <input
                                            type="text" className="form-input" placeholder="John Doe"
                                            value={cvData.name} onChange={e => updateField("name", e.target.value)}
                                        />
                                        {!cvData.name.trim() && <small style={{ color: '#718096', fontSize: '0.75rem' }}>Required for CV header</small>}
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Headline / Professional Title</label>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input
                                                type="text" className="form-input" placeholder="e.g. Senior Software Engineer | ML Expert"
                                                value={cvData.headline} onChange={e => updateField("headline", e.target.value)}
                                                style={{ flex: 1 }}
                                                maxLength={100}
                                            />
                                            <button
                                                className={styles.aiBtn}
                                                disabled={isAISuggesting || !cvData.name}
                                                onClick={async () => {
                                                    const suggestion = await getAISuggestion(cvData.name, "headline", cvData.summary || cvData.headline);
                                                    if (suggestion) updateField("headline", suggestion);
                                                }}
                                                title="AI Generate Headline"
                                            >
                                                {isAISuggesting ? "..." : "✨"}
                                            </button>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: cvData.headline.length > 80 ? '#d69e2e' : '#a0aec0' }}>
                                            {cvData.headline.length}/80 recommended
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Email</label>
                                            <input
                                                type="email" className="form-input" placeholder="you@example.com"
                                                value={cvData.email} onChange={e => updateField("email", e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Phone</label>
                                            <input
                                                type="tel" className={`form-input ${fieldErrors.phone ? 'form-input-error' : ''}`} placeholder="+1 (555) 123-4567"
                                                value={cvData.phone} onChange={e => updateField("phone", e.target.value)}
                                            />
                                            {fieldErrors.phone && <span className="form-error">{fieldErrors.phone}</span>}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Location</label>
                                            <input
                                                type="text" className="form-input" placeholder="City, Country"
                                                value={cvData.location} onChange={e => updateField("location", e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Website</label>
                                            <input
                                                type="url" className={`form-input ${fieldErrors.website ? 'form-input-error' : ''}`} placeholder="https://yoursite.com"
                                                value={cvData.website} onChange={e => updateField("website", e.target.value)}
                                            />
                                            {fieldErrors.website && <span className="form-error">{fieldErrors.website}</span>}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">LinkedIn Username</label>
                                            <input
                                                type="text" className="form-input" placeholder="yourprofile"
                                                value={cvData.linkedin} onChange={e => updateField("linkedin", e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">GitHub Username</label>
                                            <input
                                                type="text" className="form-input" placeholder="yourgithub"
                                                value={cvData.github} onChange={e => updateField("github", e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ position: 'relative' }}>
                                        <label className="form-label">Professional Summary</label>
                                        <textarea
                                            className="form-textarea" placeholder="Describe your professional essence..."
                                            value={cvData.summary} onChange={e => updateField("summary", e.target.value)}
                                            rows={5}
                                            maxLength={600}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                color: cvData.summary.length > 500 ? '#e53e3e' : cvData.summary.length > 400 ? '#d69e2e' : '#718096'
                                            }}>
                                                {cvData.summary.length}/500 characters {cvData.summary.length > 500 && '(too long)'}
                                            </span>
                                            <button
                                                onClick={improveSummary}
                                                disabled={isAISuggesting}
                                                className={styles.aiBtn}
                                            >
                                                {isAISuggesting ? "✨ Refining..." : "✨ AI Polish"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeSection === "experience" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Professional Journey.</h1>
                                    {cvData.experience.map((exp, i) => (
                                        <div key={i} className={styles.entryItem}>
                                            <div className={styles.entryHeader}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span className="form-label" style={{ margin: 0 }}>Role {i + 1}</span>
                                                    <button onClick={() => moveEntry("experience", i, "up")} disabled={i === 0}>↑</button>
                                                    <button onClick={() => moveEntry("experience", i, "down")} disabled={i === cvData.experience.length - 1}>↓</button>
                                                </div>
                                                <button onClick={() => removeEntry("experience", i)} className={styles.removeBtn}>Remove</button>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Company <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input
                                                    className="form-input" placeholder="e.g. Google"
                                                    value={exp.company || ""} onChange={e => {
                                                        const newExp = [...cvData.experience];
                                                        newExp[i].company = e.target.value;
                                                        updateField("experience", newExp);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Position <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input
                                                    className="form-input" placeholder="e.g. Senior Software Engineer"
                                                    value={exp.position || ""} onChange={e => {
                                                        const newExp = [...cvData.experience];
                                                        newExp[i].position = e.target.value;
                                                        updateField("experience", newExp);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">Start Date</label>
                                                    <input
                                                        className="form-input" placeholder="e.g. Jan 2020"
                                                        value={exp.start_date || ""} onChange={e => {
                                                            const newExp = [...cvData.experience];
                                                            newExp[i].start_date = e.target.value;
                                                            updateField("experience", newExp);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">End Date</label>
                                                    <input
                                                        className="form-input" placeholder="e.g. Present"
                                                        value={exp.end_date || ""} onChange={e => {
                                                            const newExp = [...cvData.experience];
                                                            newExp[i].end_date = e.target.value;
                                                            updateField("experience", newExp);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Location</label>
                                                <input
                                                    className="form-input" placeholder="e.g. San Francisco, CA"
                                                    value={exp.location || ""} onChange={e => {
                                                        const newExp = [...cvData.experience];
                                                        newExp[i].location = e.target.value;
                                                        updateField("experience", newExp);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Summary (optional)</label>
                                                <input
                                                    className="form-input" placeholder="One-line summary of your role"
                                                    value={exp.summary || ""} onChange={e => {
                                                        const newExp = [...cvData.experience];
                                                        newExp[i].summary = e.target.value;
                                                        updateField("experience", newExp);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Key Highlights</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {(exp.highlights || []).map((hl: string, j: number) => (
                                                        <div key={j} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                            <textarea
                                                                className="form-textarea"
                                                                style={{ flex: 1, fontSize: '0.875rem' }}
                                                                rows={2}
                                                                value={hl}
                                                                onChange={e => {
                                                                    const newExp = [...cvData.experience];
                                                                    newExp[i].highlights[j] = e.target.value;
                                                                    updateField("experience", newExp);
                                                                }}
                                                            />
                                                            <button
                                                                title="AI Polish"
                                                                onClick={async () => {
                                                                    const suggestion = await getAISuggestion(hl, "bullet", `${exp.position} at ${exp.company} `);
                                                                    if (suggestion) {
                                                                        const newExp = [...cvData.experience];
                                                                        newExp[i].highlights[j] = suggestion;
                                                                        updateField("experience", newExp);
                                                                    }
                                                                }}
                                                                disabled={isAISuggesting}
                                                                style={{ color: 'var(--accent)', padding: '0.5rem' }}
                                                            >
                                                                ✨
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newExp = [...cvData.experience];
                                                                    newExp[i].highlights = newExp[i].highlights.filter((_: any, idx: number) => idx !== j);
                                                                    updateField("experience", newExp);
                                                                }}
                                                                style={{ color: 'var(--text-light)', padding: '0.5rem' }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button className={styles.addBtn} style={{ fontSize: '0.75rem', marginTop: 0 }} onClick={() => {
                                                        const newExp = [...cvData.experience];
                                                        newExp[i].highlights = [...(newExp[i].highlights || []), ""];
                                                        updateField("experience", newExp);
                                                    }}>+ Add Achievement</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("experience", [...cvData.experience, { company: "", position: "", highlights: [] }])
                                    }}>+ Add Experience</button>
                                </div>
                            )}
                            {/* Education Section */}
                            {activeSection === "education" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Education.</h1>
                                    {cvData.education.map((edu, i) => (
                                        <div key={i} className={styles.entryItem}>
                                            <div className={styles.entryHeader}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span className="form-label" style={{ margin: 0 }}>Education {i + 1}</span>
                                                    <button onClick={() => moveEntry("education", i, "up")} disabled={i === 0}>↑</button>
                                                    <button onClick={() => moveEntry("education", i, "down")} disabled={i === cvData.education.length - 1}>↓</button>
                                                </div>
                                                <button onClick={() => removeEntry("education", i)} className={styles.removeBtn}>Remove</button>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Institution <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input className="form-input" placeholder="e.g. MIT"
                                                    value={edu.institution || ""} onChange={e => {
                                                        const newEdu = [...cvData.education];
                                                        newEdu[i].institution = e.target.value;
                                                        updateField("education", newEdu);
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">Degree</label>
                                                    <input className="form-input" placeholder="e.g. BS, MS, PhD"
                                                        value={edu.degree || ""} onChange={e => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].degree = e.target.value;
                                                            updateField("education", newEdu);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Field of Study <span style={{ color: '#e53e3e' }}>*</span></label>
                                                    <input className="form-input" placeholder="e.g. Computer Science"
                                                        value={edu.area || ""} onChange={e => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].area = e.target.value;
                                                            updateField("education", newEdu);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">Start Date</label>
                                                    <input className="form-input" placeholder="Sep 2018"
                                                        value={edu.start_date || ""} onChange={e => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].start_date = e.target.value;
                                                            updateField("education", newEdu);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">End Date</label>
                                                    <input className="form-input" placeholder="May 2022"
                                                        value={edu.end_date || ""} onChange={e => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].end_date = e.target.value;
                                                            updateField("education", newEdu);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Location</label>
                                                    <input className="form-input" placeholder="City, Country"
                                                        value={edu.location || ""} onChange={e => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].location = e.target.value;
                                                            updateField("education", newEdu);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Summary (optional)</label>
                                                <input className="form-input" placeholder="Brief description of your studies"
                                                    value={edu.summary || ""} onChange={e => {
                                                        const newEdu = [...cvData.education];
                                                        newEdu[i].summary = e.target.value;
                                                        updateField("education", newEdu);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Highlights (GPA, Honors, etc.)</label>
                                                {(edu.highlights || []).map((hl: string, j: number) => (
                                                    <div key={j} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <input className="form-input" value={hl} onChange={e => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].highlights[j] = e.target.value;
                                                            updateField("education", newEdu);
                                                        }} style={{ flex: 1 }} />
                                                        <button className={styles.aiBtn}
                                                            disabled={isAISuggesting || !hl.trim()}
                                                            onClick={async () => {
                                                                const suggestion = await getAISuggestion(hl, "education", `${edu.degree} in ${edu.area} `);
                                                                if (suggestion) {
                                                                    const newEdu = [...cvData.education];
                                                                    newEdu[i].highlights[j] = suggestion;
                                                                    updateField("education", newEdu);
                                                                }
                                                            }}
                                                            title="AI Polish"
                                                        >{isAISuggesting ? "..." : "✨"}</button>
                                                        <button onClick={() => {
                                                            const newEdu = [...cvData.education];
                                                            newEdu[i].highlights = newEdu[i].highlights.filter((_: any, idx: number) => idx !== j);
                                                            updateField("education", newEdu);
                                                        }} style={{ color: 'var(--text-light)' }}>✕</button>
                                                    </div>
                                                ))}
                                                <button className={styles.addBtn} style={{ fontSize: '0.75rem' }} onClick={() => {
                                                    const newEdu = [...cvData.education];
                                                    newEdu[i].highlights = [...(newEdu[i].highlights || []), ""];
                                                    updateField("education", newEdu);
                                                }}>+ Add Highlight</button>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("education", [...cvData.education, { institution: "", degree: "", area: "", start_date: "", end_date: "", location: "", highlights: [] }])
                                    }}>+ Add Education</button>
                                </div>
                            )}

                            {/* Skills Section */}
                            {activeSection === "skills" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Skills.</h1>
                                    {cvData.skills.map((skill, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <input className="form-input" placeholder="Category * (required)"
                                                value={skill.label || ""} onChange={e => {
                                                    const newSkills = [...cvData.skills];
                                                    newSkills[i].label = e.target.value;
                                                    updateField("skills", newSkills);
                                                }}
                                            />
                                            <input className="form-input" placeholder="e.g. Python, JavaScript, React"
                                                value={skill.details || ""} onChange={e => {
                                                    const newSkills = [...cvData.skills];
                                                    newSkills[i].details = e.target.value;
                                                    updateField("skills", newSkills);
                                                }}
                                            />
                                            <button onClick={() => {
                                                updateField("skills", cvData.skills.filter((_, idx) => idx !== i))
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("skills", [...cvData.skills, { label: "", details: "" }])
                                    }}>+ Add Skill Category</button>
                                    <button
                                        className={styles.aiBtn}
                                        style={{ marginLeft: '0.5rem' }}
                                        disabled={isAISuggesting || !cvData.headline}
                                        onClick={async () => {
                                            const currentSkills = cvData.skills.map(s => s.details).join(", ");
                                            const suggestion = await getAISuggestion(currentSkills, "skills", cvData.headline || "Professional");
                                            if (suggestion) {
                                                const newCategory = { label: "Suggested", details: suggestion };
                                                updateField("skills", [...cvData.skills, newCategory]);
                                            }
                                        }}
                                        title="AI Suggest Skills"
                                    >✨ Suggest</button>
                                </div>
                            )}

                            {/* Projects Section */}
                            {activeSection === "projects" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Projects.</h1>
                                    {cvData.projects.map((proj, i) => (
                                        <div key={i} className={styles.entryItem}>
                                            <div className={styles.entryHeader}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span className="form-label" style={{ margin: 0 }}>Project {i + 1}</span>
                                                    <button onClick={() => moveEntry("projects", i, "up")} disabled={i === 0}>↑</button>
                                                    <button onClick={() => moveEntry("projects", i, "down")} disabled={i === cvData.projects.length - 1}>↓</button>
                                                </div>
                                                <button onClick={() => removeEntry("projects", i)} className={styles.removeBtn}>Remove</button>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Project Name <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input className="form-input" placeholder="e.g. Open Source CLI Tool"
                                                    value={proj.name || ""} onChange={e => {
                                                        const newProj = [...cvData.projects];
                                                        newProj[i].name = e.target.value;
                                                        updateField("projects", newProj);
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">Start Date</label>
                                                    <input className="form-input" placeholder="e.g. 2023-01"
                                                        value={proj.start_date || ""} onChange={e => {
                                                            const newProj = [...cvData.projects];
                                                            newProj[i].start_date = e.target.value;
                                                            updateField("projects", newProj);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">End Date</label>
                                                    <input className="form-input" placeholder="e.g. present"
                                                        value={proj.end_date || ""} onChange={e => {
                                                            const newProj = [...cvData.projects];
                                                            newProj[i].end_date = e.target.value;
                                                            updateField("projects", newProj);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Location</label>
                                                    <input className="form-input" placeholder="(optional)"
                                                        value={proj.location || ""} onChange={e => {
                                                            const newProj = [...cvData.projects];
                                                            newProj[i].location = e.target.value;
                                                            updateField("projects", newProj);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">URL (Optional)</label>
                                                <input className="form-input" placeholder="https://github.com/..."
                                                    value={proj.url || ""} onChange={e => {
                                                        const newProj = [...cvData.projects];
                                                        newProj[i].url = e.target.value;
                                                        updateField("projects", newProj);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Summary</label>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <input className="form-input" placeholder="One-line description"
                                                        value={proj.summary || ""} onChange={e => {
                                                            const newProj = [...cvData.projects];
                                                            newProj[i].summary = e.target.value;
                                                            updateField("projects", newProj);
                                                        }}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <button className={styles.aiBtn}
                                                        disabled={isAISuggesting || !proj.summary?.trim()}
                                                        onClick={async () => {
                                                            const suggestion = await getAISuggestion(proj.summary, "project_summary", proj.name);
                                                            if (suggestion) {
                                                                const newProj = [...cvData.projects];
                                                                newProj[i].summary = suggestion;
                                                                updateField("projects", newProj);
                                                            }
                                                        }}
                                                        title="AI Polish"
                                                    >{isAISuggesting ? "..." : "✨"}</button>
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Highlights</label>
                                                {(proj.highlights || []).map((hl: string, j: number) => (
                                                    <div key={j} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <input className="form-input" value={hl} onChange={e => {
                                                            const newProj = [...cvData.projects];
                                                            newProj[i].highlights[j] = e.target.value;
                                                            updateField("projects", newProj);
                                                        }} />
                                                        <button onClick={() => {
                                                            const newProj = [...cvData.projects];
                                                            newProj[i].highlights = newProj[i].highlights.filter((_: any, idx: number) => idx !== j);
                                                            updateField("projects", newProj);
                                                        }} style={{ color: 'var(--text-light)' }}>✕</button>
                                                    </div>
                                                ))}
                                                <button className={styles.addBtn} style={{ fontSize: '0.75rem' }} onClick={() => {
                                                    const newProj = [...cvData.projects];
                                                    newProj[i].highlights = [...(newProj[i].highlights || []), ""];
                                                    updateField("projects", newProj);
                                                }}>+ Add Highlight</button>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("projects", [...cvData.projects, { name: "", date: "", summary: "", url: "", highlights: [] }])
                                    }}>+ Add Project</button>
                                </div>
                            )}

                            {/* Publications Section */}
                            {activeSection === "publications" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Publications.</h1>
                                    {cvData.publications.map((pub, i) => (
                                        <div key={i} className={styles.entryItem}>
                                            <div className={styles.entryHeader}>
                                                <span className="form-label">Publication {i + 1}</span>
                                                <button className={styles.removeBtn} onClick={() => {
                                                    updateField("publications", cvData.publications.filter((_, idx) => idx !== i))
                                                }}>Remove</button>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Title <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input className="form-input" placeholder="Paper/Article Title"
                                                    value={pub.title || ""} onChange={e => {
                                                        const newPub = [...cvData.publications];
                                                        newPub[i].title = e.target.value;
                                                        updateField("publications", newPub);
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Authors <span style={{ color: '#e53e3e' }}>*</span> <small style={{ fontWeight: 'normal', color: '#718096' }}>(comma-separated, use *name* for yourself)</small></label>
                                                <input className="form-input" placeholder="*John Doe*, Jane Smith, Bob Jones"
                                                    value={pub.authors || ""} onChange={e => {
                                                        const newPub = [...cvData.publications];
                                                        newPub[i].authors = e.target.value;
                                                        updateField("publications", newPub);
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">Journal/Conference</label>
                                                    <input className="form-input" placeholder="e.g. NeurIPS 2023"
                                                        value={pub.journal || ""} onChange={e => {
                                                            const newPub = [...cvData.publications];
                                                            newPub[i].journal = e.target.value;
                                                            updateField("publications", newPub);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Date</label>
                                                    <input className="form-input" placeholder="e.g. 2023-07"
                                                        value={pub.date || ""} onChange={e => {
                                                            const newPub = [...cvData.publications];
                                                            newPub[i].date = e.target.value;
                                                            updateField("publications", newPub);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">DOI (optional)</label>
                                                    <input className="form-input" placeholder="10.1234/example"
                                                        value={pub.doi || ""} onChange={e => {
                                                            const newPub = [...cvData.publications];
                                                            newPub[i].doi = e.target.value;
                                                            updateField("publications", newPub);
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">URL (optional)</label>
                                                    <input className="form-input" placeholder="https://..."
                                                        value={pub.url || ""} onChange={e => {
                                                            const newPub = [...cvData.publications];
                                                            newPub[i].url = e.target.value;
                                                            updateField("publications", newPub);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("publications", [...cvData.publications, { title: "", authors: "", journal: "", date: "", doi: "", url: "" }])
                                    }}>+ Add Publication</button>
                                </div>
                            )}

                            {/* Awards & Certifications Section */}
                            {activeSection === "honors" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Awards & Certifications.</h1>
                                    {cvData.honors.map((honor, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <input className="form-input" placeholder="e.g. AWS Certified, Forbes 30 Under 30"
                                                value={honor.bullet || ""} onChange={e => {
                                                    const newHonors = [...cvData.honors];
                                                    newHonors[i].bullet = e.target.value;
                                                    updateField("honors", newHonors);
                                                }}
                                            />
                                            <button onClick={() => {
                                                updateField("honors", cvData.honors.filter((_, idx) => idx !== i))
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("honors", [...cvData.honors, { bullet: "" }])
                                    }}>+ Add Award/Certification</button>
                                </div>
                            )}

                            {/* Patents Section */}
                            {activeSection === "patents" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Patents.</h1>
                                    {cvData.patents.map((patent, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-light)', fontWeight: 600, minWidth: '1.5rem' }}>{i + 1}.</span>
                                            <input className="form-input" placeholder="e.g. Patent Title (US Patent XX,XXX,XXX)"
                                                value={patent.number || ""} onChange={e => {
                                                    const newPatents = [...cvData.patents];
                                                    newPatents[i].number = e.target.value;
                                                    updateField("patents", newPatents);
                                                }}
                                            />
                                            <button onClick={() => {
                                                updateField("patents", cvData.patents.filter((_, idx) => idx !== i))
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("patents", [...cvData.patents, { number: "" }])
                                    }}>+ Add Patent</button>
                                </div>
                            )}

                            {/* Invited Talks Section */}
                            {activeSection === "talks" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Invited Talks.</h1>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '1rem' }}>Listed in reverse order (most recent first)</p>
                                    {cvData.talks.map((talk, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-light)', fontWeight: 600, minWidth: '1.5rem' }}>{cvData.talks.length - i}.</span>
                                            <input className="form-input" placeholder="e.g. Talk Title — Conference Name (Year)"
                                                value={talk.reversed_number || ""} onChange={e => {
                                                    const newTalks = [...cvData.talks];
                                                    newTalks[i].reversed_number = e.target.value;
                                                    updateField("talks", newTalks);
                                                }}
                                            />
                                            <button onClick={() => {
                                                updateField("talks", cvData.talks.filter((_, idx) => idx !== i))
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateField("talks", [...cvData.talks, { reversed_number: "" }])
                                    }}>+ Add Talk</button>
                                </div>
                            )}

                            {/* Design Section */}
                            {activeSection === "design" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Customize Design.</h1>

                                    {/* Template Selection - Grid Layout */}
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '1rem' }}>Choose Template</label>
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
                            )}
                        </div>
                    </div>

                    <div className={styles.previewArea}>
                        <div className={styles.canvas}>
                            {isGenerating && (
                                <div style={{
                                    position: 'absolute',
                                    top: '1.5rem',
                                    right: '1.5rem',
                                    zIndex: 20,
                                    background: 'var(--white)',
                                    color: 'var(--primary)',
                                    padding: '0.625rem 1.25rem',
                                    borderRadius: 'var(--radius-full)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    boxShadow: 'var(--shadow-lg)',
                                    border: '1px solid var(--border)',
                                    animation: 'slideUp 0.4s ease'
                                }}>
                                    <div className="spinner" style={{ width: '14px', height: '14px' }}></div>
                                    SYNCHRONIZING
                                </div>
                            )}

                            {isGenerating && !previewUrl && (
                                <div className="skeleton" style={{ width: '100%', height: '100%' }}></div>
                            )}

                            {previewUrl ? (
                                <div className={isGenerating ? "" : "animate-fade"} style={{ width: '100%', height: '100%', opacity: isGenerating ? 0.6 : 1, transition: 'opacity 0.3s ease' }}>
                                    <img src={previewUrl} alt="Preview" className={styles.previewImage} />
                                </div>
                            ) : (
                                !isGenerating && (
                                    <div className={styles.previewPlaceholder}>
                                        <div style={{
                                            padding: '2rem',
                                            border: '2px dashed var(--border)',
                                            borderRadius: 'var(--radius-lg)',
                                            background: 'var(--white)',
                                            color: 'var(--text-light)',
                                            fontWeight: 500,
                                            fontSize: '0.9rem'
                                        }}>
                                            Your CV will appear here as you type.
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </main>
            )}
        </div>
    );
}

export default function EditorPage() {
    return (
        <Suspense fallback={<div>Loading PureCV...</div>}>
            <EditorContent />
        </Suspense>
    );
}
