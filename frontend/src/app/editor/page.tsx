"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Copy, Download, Eye, FileCode2, Mail, MapPin, Pencil, RotateCcw, Sparkles } from "lucide-react";
import styles from "./editor.module.css";
import { Logo, Icons } from "@/components/Brand";
import { TemplateCard } from "@/components/AppUI";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { useLivePreview } from "@/hooks/useLivePreview";
import {
    CoverLetterDraft,
    CVData,
    DEFAULT_COVER_LETTER_DRAFT,
    DEFAULT_CV_DATA,
    DEFAULT_DESIGN_SETTINGS,
    DesignSettings,
    Entry,
    REPEATABLE_SECTIONS,
    RepeatableSection,
    calculateATSScore as calculateATSScoreForData,
    calculateSectionProgress as calculateSectionProgressForData,
    getEmptyEntry,
    getSectionWordCount as getSectionWordCountForData,
    getString,
    getStringList,
    normalizeCVData,
    toRenderableCVData,
} from "@/lib/cvBuilder";
import {
    downloadCoverLetterPDF,
    downloadPDF as downloadPDFFile,
    exportYAML,
    generateCoverLetter as requestCoverLetter,
    requestCVEnhancement,
    requestAISuggestion,
    requestAIStatus,
} from "@/lib/editorApi";
import { API_URL } from "@/lib/config";
import { THEME_DATA, getSectionIdsForTheme, getTemplateFitScore, getTheme, recommendTemplate } from "@/lib/themes";

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
    cover_letter: { id: "cover_letter", name: "Cover Letter", icon: <Mail size={18} /> },
};

// Helper to get sections in theme order
const getSectionsForTheme = (themeId: string) => {
    return [...getSectionIdsForTheme(themeId), "cover_letter"].map(sectionId => BASE_SECTIONS[sectionId as keyof typeof BASE_SECTIONS]);
};

const getSectionName = (sectionId: string): string => {
    return BASE_SECTIONS[sectionId as keyof typeof BASE_SECTIONS]?.name || sectionId;
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

const COUNTRY_HINTS = [
    "Pakistan",
    "India",
    "United States",
    "USA",
    "Canada",
    "United Kingdom",
    "UK",
    "United Arab Emirates",
    "UAE",
    "Germany",
    "France",
    "Australia",
    "Saudi Arabia",
];

const inferCountryFromLocation = (location: string): string => {
    const normalizedLocation = location.trim();
    if (!normalizedLocation) return "";
    const directMatch = COUNTRY_HINTS.find(country =>
        new RegExp(`\\b${country.replace(/\s+/g, "\\s+")}\\b`, "i").test(normalizedLocation)
    );
    if (directMatch) return directMatch;
    const parts = normalizedLocation.split(",").map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : "";
};

const SKILL_CATEGORY_LABELS = new Set([
    "backend",
    "cloud",
    "databases",
    "devops",
    "frameworks",
    "frontend",
    "languages",
    "programming languages",
    "soft skills",
    "technical skills",
    "technologies",
    "tools",
]);

const cleanAutoText = (value: string): string => (
    value
        .replace(/\s*\|\s*live demo\b.*$/i, "")
        .replace(/\b(live demo|source code|github)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
);

const cleanAutoRole = (value: string): string => (
    cleanAutoText(value)
        .replace(/\s*\((project|contract|internship|remote)\)\s*/gi, " ")
        .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
);

const inferTargetRole = (cvData: CVData, currentRole: string): string => {
    const current = cleanAutoRole(currentRole);
    if (current) return current;
    const headline = cleanAutoRole(cvData.headline);
    if (headline) return headline;
    const firstExperience = cvData.experience.find(entry => getString(entry.position).trim());
    if (firstExperience) return cleanAutoRole(getString(firstExperience.position)) || "Professional";
    const firstProject = cvData.projects.find(entry => getString(entry.summary).trim());
    if (firstProject) return cleanAutoRole(getString(firstProject.summary)) || "Professional";
    return "Professional";
};

const getAutoSkillTerms = (cvData: CVData): string[] => {
    const terms = cvData.skills.flatMap(entry => {
        const label = getString(entry.label);
        const details = getString(entry.details);
        const parts = details.split(/[,;/|]/);
        if (label && !SKILL_CATEGORY_LABELS.has(label.trim().toLowerCase())) {
            parts.unshift(label);
        }
        return parts;
    });
    return Array.from(new Set(terms.map(term => cleanAutoText(term)).filter(Boolean))).slice(0, 14);
};

const buildAutoCoverLetterContext = (cvData: CVData, targetRole: string): string => {
    const country = inferCountryFromLocation(cvData.location);
    const skills = getAutoSkillTerms(cvData);
    const experience = cvData.experience
        .slice(0, 3)
        .map(entry => {
            const role = getString(entry.position);
            const company = getString(entry.company);
            const highlights = getStringList(entry.highlights).slice(0, 2).join("; ");
            return [role && company ? `${role} at ${company}` : role || company, highlights].filter(Boolean).join(": ");
        })
        .filter(Boolean);
    const projects = cvData.projects
        .slice(0, 2)
        .map(entry => {
            const summary = [getString(entry.name), getString(entry.summary)].filter(Boolean).join(": ");
            const liveLink = getString(entry.url);
            return [summary, liveLink ? `Live demo: ${liveLink}` : ""].filter(Boolean).join(" - ");
        })
        .filter(Boolean);
    const education = cvData.education
        .slice(0, 2)
        .map(entry => [getString(entry.degree), getString(entry.area), getString(entry.institution)].filter(Boolean).join(", "))
        .filter(Boolean);

    return [
        `Target role: ${targetRole}.`,
        cvData.location ? `Candidate location: ${cvData.location}.` : "",
        country ? `Country or market context: ${country}.` : "",
        cvData.summary ? `Professional summary: ${cvData.summary}` : "",
        skills.length ? `Key skills to emphasize: ${skills.join(", ")}.` : "",
        experience.length ? `Relevant experience: ${experience.join(" | ")}.` : "",
        projects.length ? `Relevant projects: ${projects.join(" | ")}.` : "",
        education.length ? `Education context: ${education.join(" | ")}.` : "",
        "Write a strong one-page cover letter for hiring teams. Match the candidate's location, skills, and edited live CV data. Keep it specific, confident, ATS-readable, and plain text.",
    ].filter(Boolean).join("\n");
};

function EditorContent() {
    const searchParams = useSearchParams();
    const themeOverride = searchParams.get("theme") || "";
    const sectionOverride = searchParams.get("section") || "";
    const initialTheme = themeOverride || "classic";

    const [cvData, setCVData] = useState<CVData>(DEFAULT_CV_DATA);
    const [theme, setTheme] = useState(initialTheme);
    const [activeSection, setActiveSection] = useState(sectionOverride === "cover_letter" ? "cover_letter" : "profile");
    const [isLoading, setIsLoading] = useState(false);
    const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('edit');
    const [isAISuggesting, setIsAISuggesting] = useState(false);
    const [isEnhancingCV, setIsEnhancingCV] = useState(false);
    const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
    const [aiStatusLabel, setAiStatusLabel] = useState("Checking AI writing tools...");
    const [atsEnhanceNotice, setAtsEnhanceNotice] = useState<string | null>(null);
    const [atsEnhanceError, setAtsEnhanceError] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [designSettings, setDesignSettings] = useState<DesignSettings>(DEFAULT_DESIGN_SETTINGS);
    const [coverLetter, setCoverLetter] = useState<CoverLetterDraft>(DEFAULT_COVER_LETTER_DRAFT);
    const [coverLetterStatus, setCoverLetterStatus] = useState<"idle" | "generating" | "copying" | "exporting">("idle");
    const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
    const [coverLetterNotice, setCoverLetterNotice] = useState<string | null>(null);

    const renderableData = useMemo(() => toRenderableCVData(cvData), [cvData]);
    const calculateSectionProgress = useCallback(
        (sectionId: string): number => calculateSectionProgressForData(cvData, sectionId),
        [cvData]
    );
    const getSectionWordCount = useCallback(
        (sectionId: string): number => getSectionWordCountForData(cvData, sectionId),
        [cvData]
    );
    const calculateATSScore = useCallback(
        (): { score: number; tips: string[] } => calculateATSScoreForData(cvData),
        [cvData]
    );

    const { isRestored, draftStatus, lastSavedAt, resetDraft } = useDraftAutosave({
        cvData,
        theme,
        designSettings,
        coverLetter,
        setCVData,
        setTheme,
        setDesignSettings,
        setCoverLetter,
        initialTheme: themeOverride,
    });

    const {
        previewUrl,
        isGenerating,
        fieldErrors,
        previewError,
    } = useLivePreview({
        apiUrl: API_URL,
        renderableData,
        theme,
        designSettings,
        enabled: isRestored,
    });

    const syncStatus = isGenerating ? "syncing" : draftStatus;
    const isAIUnavailable = aiAvailable === false;

    useEffect(() => {
        let isMounted = true;
        requestAIStatus(API_URL)
            .then((status) => {
                if (!isMounted) return;
                setAiAvailable(status.configured);
                setAiStatusLabel(
                    status.configured
                        ? `AI writing ready via ${status.provider} (${status.model}).`
                        : "AI provider is not configured. Local fallback suggestions remain available.",
                );
            })
            .catch(() => {
                if (!isMounted) return;
                setAiAvailable(false);
                setAiStatusLabel("AI status could not be reached. Editor and exports still work.");
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const getAISuggestion = async (text: string, type: string, context: string = "") => {
        setIsAISuggesting(true);
        try {
            const suggestion = await requestAISuggestion(API_URL, text, type, context);
            return suggestion;
        } catch (err) {
            console.error("AI suggestion error:", err);
            setAiAvailable(false);
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

    const enhanceCVForATS = async () => {
        if (!cvData.name.trim() && !cvData.summary.trim() && cvData.projects.length === 0 && cvData.skills.length === 0) {
            setAtsEnhanceError("Add profile, skills, or projects first so the optimizer has real CV material.");
            return;
        }

        const beforeScore = calculateATSScoreForData(cvData).score;
        const targetRole = inferTargetRole(cvData, coverLetter.targetRole);
        setIsEnhancingCV(true);
        setAtsEnhanceError(null);
        setAtsEnhanceNotice(null);

        try {
            const result = await requestCVEnhancement(
                API_URL,
                cvData,
                targetRole,
                coverLetter.jobDescription,
                beforeScore,
            );
            const enhancedData = normalizeCVData(result.cv_data);
            const afterScore = calculateATSScoreForData(enhancedData).score;
            setCVData(enhancedData);
            setActiveSection("profile");
            setAtsEnhanceNotice(
                `${result.source === "ai" ? "AI" : "Local"} ATS enhancement applied: ${beforeScore}% -> ${afterScore}%. ${result.changes[0] || "Updated live CV content."}`,
            );
            if (result.warnings.length > 0) {
                setAiAvailable(false);
            }
        } catch (error) {
            console.error("CV enhancement failed:", error);
            setAtsEnhanceError(error instanceof Error ? error.message : "CV enhancement failed.");
        } finally {
            setIsEnhancingCV(false);
        }
    };

    const updateCoverLetter = (patch: Partial<CoverLetterDraft>) => {
        setCoverLetter(prev => ({ ...prev, ...patch }));
        setCoverLetterError(null);
        setCoverLetterNotice(null);
    };

    const validateCoverLetterInputs = (): string | null => {
        if (!coverLetter.targetRole.trim()) return "Add the target role before generating a cover letter.";
        if (!coverLetter.company.trim()) return "Add the company name before generating a cover letter.";
        if (coverLetter.jobDescription.trim().length < 40) return "Paste at least a short job description so the letter can be tailored.";
        if (!cvData.name.trim() && !cvData.summary.trim() && cvData.experience.length === 0) {
            return "Add basic CV profile or experience details first so the letter has real material to use.";
        }
        return null;
    };

    const generateCoverLetterDraft = async () => {
        const validationError = validateCoverLetterInputs();
        if (validationError) {
            setCoverLetterError(validationError);
            return;
        }

        setCoverLetterStatus("generating");
        setCoverLetterError(null);
        setCoverLetterNotice(null);

        try {
            const result = await requestCoverLetter(API_URL, renderableData, coverLetter);
            setCoverLetter(prev => ({
                ...prev,
                letter: result.letter,
                source: result.source,
            }));
            setCoverLetterNotice(
                result.source === "ai"
                    ? "AI tailored the letter from your CV and the pasted job post."
                    : "Template draft created locally. Add an AI key later for richer tailoring.",
            );
            if (result.source === "template") setAiAvailable(false);
        } catch (error) {
            console.error("Cover letter generation failed:", error);
            setCoverLetterError(error instanceof Error ? error.message : "Cover letter generation failed.");
        } finally {
            setCoverLetterStatus("idle");
        }
    };

    const generateAutoCoverLetterDraft = async () => {
        if (!cvData.name.trim() && !cvData.summary.trim() && cvData.experience.length === 0 && cvData.skills.length === 0) {
            setCoverLetterError("Add profile, skills, or experience details first so the auto draft has real CV context.");
            return;
        }

        const targetRole = inferTargetRole(cvData, coverLetter.targetRole);
        const autoDraft: CoverLetterDraft = {
            ...coverLetter,
            targetRole,
            company: coverLetter.company.trim(),
            hiringManager: coverLetter.hiringManager.trim() || "Hiring Team",
            jobDescription: coverLetter.jobDescription.trim().length >= 40
                ? coverLetter.jobDescription
                : buildAutoCoverLetterContext(cvData, targetRole),
        };

        setCoverLetterStatus("generating");
        setCoverLetterError(null);
        setCoverLetterNotice(null);
        setCoverLetter(prev => ({ ...prev, ...autoDraft }));

        try {
            const result = await requestCoverLetter(API_URL, renderableData, autoDraft);
            setCoverLetter(prev => ({
                ...prev,
                targetRole: autoDraft.targetRole,
                company: autoDraft.company,
                hiringManager: autoDraft.hiringManager,
                jobDescription: autoDraft.jobDescription,
                letter: result.letter,
                source: result.source,
            }));
            setCoverLetterNotice(
                result.source === "ai"
                    ? "AI auto-drafted the letter from your live CV, location, skills, and application context."
                    : "Auto draft created from your live CV. Add an AI key later for richer tailoring.",
            );
            if (result.source === "template") setAiAvailable(false);
        } catch (error) {
            console.error("Auto cover letter generation failed:", error);
            setCoverLetterError(error instanceof Error ? error.message : "Auto cover letter generation failed.");
        } finally {
            setCoverLetterStatus("idle");
        }
    };

    const copyCoverLetter = async () => {
        if (!coverLetter.letter.trim()) return;
        setCoverLetterStatus("copying");
        setCoverLetterError(null);
        try {
            await navigator.clipboard.writeText(coverLetter.letter);
            setCoverLetterNotice("Cover letter copied to clipboard.");
        } catch {
            setCoverLetterError("Copy failed. Select the letter text and copy it manually.");
        } finally {
            setCoverLetterStatus("idle");
        }
    };

    const downloadCoverLetter = async () => {
        const validationError = validateCoverLetterInputs();
        if (validationError) {
            setCoverLetterError(validationError);
            return;
        }

        setCoverLetterStatus("exporting");
        setCoverLetterError(null);
        try {
            await downloadCoverLetterPDF(API_URL, renderableData, coverLetter);
        } catch (error) {
            console.error("Cover letter PDF export failed:", error);
            setCoverLetterError(error instanceof Error ? error.message : "Cover letter PDF export failed.");
        } finally {
            setCoverLetterStatus("idle");
        }
    };

    // Update Field
    const updateField = <K extends keyof CVData>(field: K, value: CVData[K]) => {
        setCVData(prev => ({ ...prev, [field]: value }));
    };

    const updateEntryList = (section: RepeatableSection, nextList: Entry[]) => {
        updateField(section, nextList);
    };

    const updateEntry = (section: RepeatableSection, index: number, patch: Partial<Entry>) => {
        const list = [...(cvData[section] as Entry[])];
        while (list.length <= index) {
            list.push(getEmptyEntry(section));
        }
        list[index] = { ...list[index], ...patch };
        updateEntryList(section, list);
    };

    const getVisibleEntries = (section: RepeatableSection): Entry[] => {
        const list = cvData[section] as Entry[];
        return list.length > 0 ? list : [getEmptyEntry(section)];
    };

    const moveEntry = (section: RepeatableSection, index: number, direction: 'up' | 'down') => {
        const list = [...(cvData[section] as Entry[])];
        if (direction === 'up' && index > 0) {
            [list[index], list[index - 1]] = [list[index - 1], list[index]];
        } else if (direction === 'down' && index < list.length - 1) {
            [list[index], list[index + 1]] = [list[index + 1], list[index]];
        }
        updateEntryList(section, list);
    };

    const removeEntry = (section: RepeatableSection, index: number) => {
        const list = (cvData[section] as Entry[]).filter((_, idx) => idx !== index);
        updateEntryList(section, list);
    };

    const downloadPDF = async () => {
        setIsLoading(true);
        setExportError(null);
        try {
            await downloadPDFFile({ apiUrl: API_URL, cvData: renderableData, theme, designSettings });
        } catch (error) {
            console.error("PDF export failed:", error);
            setExportError("PDF export failed. Check the preview error and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const downloadYAML = async () => {
        setIsLoading(true);
        setExportError(null);
        try {
            await exportYAML({ apiUrl: API_URL, cvData: renderableData, theme, designSettings });
        } catch (error) {
            console.error("YAML export failed:", error);
            setExportError("YAML export failed. Check the preview error and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const startNewDraft = () => {
        if (window.confirm("Start a new CV and clear the saved browser draft?")) {
            resetDraft();
            setActiveSection("profile");
            setEditorMode("edit");
            setExportError(null);
        }
    };

    const currentThemeData = getTheme(theme);
    const recommendedTheme = useMemo(() => recommendTemplate(cvData), [cvData]);
    const templateFit = useMemo(() => getTemplateFitScore(theme, cvData), [theme, cvData]);
    const orderedSectionIds = [...getSectionIdsForTheme(theme), "cover_letter"];
    const getEditorSectionProgress = (sectionId: string): number => {
        if (sectionId === "cover_letter") {
            if (coverLetter.letter.trim()) return 100;
            if (coverLetter.targetRole.trim() || coverLetter.company.trim() || coverLetter.jobDescription.trim()) return 50;
            return 0;
        }
        return calculateSectionProgress(sectionId);
    };
    const getEditorSectionWordCount = (sectionId: string): number => {
        if (sectionId === "cover_letter") return coverLetter.letter.trim().split(/\s+/).filter(Boolean).length;
        return getSectionWordCount(sectionId);
    };
    const completedSectionIds = orderedSectionIds.filter(sectionId => {
        if (sectionId === "cover_letter") {
            return Boolean(coverLetter.targetRole.trim() || coverLetter.company.trim() || coverLetter.letter.trim());
        }
        if (sectionId === "profile") {
            return Boolean(renderableData.name.trim() || renderableData.email.trim() || renderableData.phone.trim() || renderableData.summary.trim());
        }
        if (sectionId === "design") return true;
        return REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection)
            && renderableData[sectionId as RepeatableSection].length > 0;
    });
    const orderedContentSections = orderedSectionIds.filter(sectionId => sectionId !== "profile" && sectionId !== "design" && sectionId !== "cover_letter");
    const activeSectionIndex = orderedContentSections.indexOf(activeSection);
    const missingBeforeActive = activeSectionIndex > -1
        ? orderedContentSections
            .slice(0, activeSectionIndex)
            .filter(sectionId => REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection))
            .filter(sectionId => renderableData[sectionId as RepeatableSection].length === 0)
        : [];
    const nextRecommendedSection = orderedSectionIds.find(sectionId => {
        if (sectionId === "design") return false;
        if (sectionId === "cover_letter") return !coverLetter.letter.trim();
        if (sectionId === "profile") return calculateSectionProgress("profile") < 60;
        return REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection)
            && renderableData[sectionId as RepeatableSection].length === 0;
    });
    const printedSectionNames = orderedContentSections
        .filter(sectionId => REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection))
        .filter(sectionId => renderableData[sectionId as RepeatableSection].length > 0)
        .map(getSectionName);
    const coverLetterWordCount = coverLetter.letter.trim().split(/\s+/).filter(Boolean).length;
    const jobDescriptionLength = coverLetter.jobDescription.trim().length;
    const coverLetterReadyChecks = [
        { label: "Role", done: Boolean(coverLetter.targetRole.trim()) },
        { label: "Company", done: Boolean(coverLetter.company.trim()) },
        { label: "Job post", done: jobDescriptionLength >= 40 },
        { label: "CV context", done: Boolean(renderableData.summary.trim() || renderableData.experience.length || renderableData.skills.length) },
        { label: "Letter", done: Boolean(coverLetter.letter.trim()) },
    ];
    const completedCoverLetterChecks = coverLetterReadyChecks.filter(item => item.done).length;
    const inferredCountry = inferCountryFromLocation(cvData.location);
    const autoSkillPreview = getAutoSkillTerms(cvData).slice(0, 5);
    const inferredRolePreview = inferTargetRole(cvData, coverLetter.targetRole);
    const coverLetterWordStatus =
        coverLetterWordCount === 0
            ? "Draft pending"
            : coverLetterWordCount < 180
                ? "Likely too short"
                : coverLetterWordCount <= 380
                    ? "One-page range"
                    : "Trim for one page";

    return (
        <div className={styles.editorLayout}>
            <header className={styles.header}>
                <div className={styles.logoArea}>
                    <Logo width={28} height={28} />
                    <span style={{ letterSpacing: '0.03em', fontWeight: 800 }}>ApplyForge</span>
                </div>
                <div className={styles.headerActions}>
                    <button
                        onClick={() => setEditorMode(editorMode === 'preview' ? 'edit' : 'preview')}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {editorMode === 'preview' ? (
                            <>
                                <Pencil size={16} />
                                Edit CV
                            </>
                        ) : (
                            <>
                                <Eye size={16} />
                                Templates
                            </>
                        )}
                    </button>
                    <button onClick={startNewDraft} className="btn btn-secondary" title="Start a new CV">
                        <RotateCcw size={16} />
                        New
                    </button>
                    <button onClick={downloadYAML} className="btn btn-secondary" disabled={isLoading}>
                        <FileCode2 size={16} />
                        YAML
                    </button>
                    <Link href="/" className="btn btn-secondary">Exit</Link>
                    <button onClick={downloadPDF} className="btn btn-primary" disabled={isLoading}>
                        <Download size={16} />
                        {isLoading ? "Exporting..." : "PDF"}
                    </button>
                </div>
            </header>

            {editorMode === 'preview' ? (
                /* PREVIEW MODE: Template Gallery */
                <main className={`${styles.main} ${styles.templateGalleryMain}`}>
                    <div className={styles.templateGalleryShell}>
                        <div className={styles.templateGalleryHeader}>
                            <span className={styles.summaryEyebrow}>Design system</span>
                            <h1>Choose Your Template</h1>
                            <p>Select a parser-safe format for the role, seniority, and review path.</p>
                            <button
                                type="button"
                                className={styles.templateRecommendBtn}
                                onClick={() => setTheme(recommendedTheme.id)}
                            >
                                <Sparkles size={14} />
                                Use best ATS template: {recommendedTheme.name}
                            </button>
                        </div>

                        <div className={styles.templateGalleryGrid}>
                            {THEME_DATA.map((t) => (
                                <TemplateCard
                                    key={t.id}
                                    name={t.name}
                                    image={t.image}
                                    tags={t.tags}
                                    badge={recommendedTheme.id === t.id ? "Best ATS match" : `${t.atsScore}% ATS`}
                                    meta={t.atsRationale}
                                    selected={theme === t.id}
                                    onClick={() => setTheme(t.id)}
                                />
                            ))}
                        </div>

                        <div className={styles.templateGalleryActions}>
                            <button
                                onClick={() => setEditorMode('edit')}
                                className="btn btn-primary btn-lg"
                            >
                                <Pencil size={20} />
                                Edit Your CV
                            </button>
                        </div>
                    </div>
                </main>
            ) : (
                /* EDIT MODE: Form Editor */
                <main className={styles.main}>
                    <aside className={styles.sidebar}>
                        <div className={styles.builderSummary}>
                            <span className={styles.summaryEyebrow}>Template</span>
                            <strong>{currentThemeData.name}</strong>
                            <p>{currentThemeData.description}</p>
                            <div className={styles.progressTrack}>
                                <span style={{ width: `${Math.min(100, Math.round((completedSectionIds.length / orderedSectionIds.length) * 100))}%` }} />
                            </div>
                            <small>{completedSectionIds.length} of {orderedSectionIds.length} steps started</small>
                        </div>
                        {getSectionsForTheme(theme).map(s => {
                            const progress = getEditorSectionProgress(s.id);
                            const wordCount = getEditorSectionWordCount(s.id);
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
                                    .filter(s => s !== 'design' && s !== 'cover_letter')
                                    .reduce((sum, s) => sum + getSectionWordCount(s), 0);
                                const ats = calculateATSScore();
                                const scoreColor = ats.score >= 80 ? 'var(--success)' : ats.score >= 60 ? 'var(--warning)' : 'var(--error)';
                                const fitColor = templateFit.score >= 92 ? 'var(--success)' : templateFit.score >= 82 ? 'var(--warning)' : 'var(--error)';
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div className={styles.atsScore}>
                                            <span className={styles.atsLabel}>ATS Control</span>
                                            <div className={styles.atsMetricGrid}>
                                                <span>
                                                    <small>Content</small>
                                                    <strong style={{ color: scoreColor }}>{ats.score}%</strong>
                                                </span>
                                                <span>
                                                    <small>Template</small>
                                                    <strong style={{ color: fitColor }}>{templateFit.score}%</strong>
                                                </span>
                                            </div>
                                            {ats.tips.length > 0 && (
                                                <p style={{ fontSize: '0.65rem', color: 'var(--text-light)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                                                    {ats.tips[0]}
                                                </p>
                                            )}
                                            <p style={{ fontSize: '0.65rem', color: 'var(--text-light)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                                                {templateFit.tip}
                                            </p>
                                            <button
                                                className={styles.atsEnhanceBtn}
                                                onClick={enhanceCVForATS}
                                                disabled={isEnhancingCV || isGenerating}
                                                title="Enhance this live CV for ATS strength using the current role, skills, projects, and market keywords"
                                            >
                                                <Sparkles size={14} />
                                                {isEnhancingCV ? "Hardening..." : "Enhance CV"}
                                            </button>
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
                            {syncStatus === 'syncing'
                                ? "Rendering preview..."
                                : syncStatus === 'saving'
                                    ? "Saving draft..."
                                    : syncStatus === 'error'
                                        ? "Draft save failed"
                                        : lastSavedAt
                                            ? "Draft saved"
                                            : "Ready"}
                        </div>
                        <div className={styles.mobileAtsPanel}>
                            {(() => {
                                const totalWords = Object.keys(BASE_SECTIONS)
                                    .filter(s => s !== 'design' && s !== 'cover_letter')
                                    .reduce((sum, s) => sum + getSectionWordCount(s), 0);
                                const ats = calculateATSScore();
                                const scoreColor = ats.score >= 80 ? 'var(--success)' : ats.score >= 60 ? 'var(--warning)' : 'var(--error)';
                                const fitColor = templateFit.score >= 92 ? 'var(--success)' : templateFit.score >= 82 ? 'var(--warning)' : 'var(--error)';
                                return (
                                    <div className={styles.atsScore}>
                                        <span className={styles.atsLabel}>ATS Control</span>
                                        <div className={styles.atsMetricGrid}>
                                            <span>
                                                <small>Content</small>
                                                <strong style={{ color: scoreColor }}>{ats.score}%</strong>
                                            </span>
                                            <span>
                                                <small>Template</small>
                                                <strong style={{ color: fitColor }}>{templateFit.score}%</strong>
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: '0.55rem', lineHeight: 1.4 }}>
                                            {ats.tips[0] || templateFit.tip} Approx. {totalWords} words.
                                        </p>
                                        <button
                                            className={styles.atsEnhanceBtn}
                                            onClick={enhanceCVForATS}
                                            disabled={isEnhancingCV || isGenerating}
                                            title="Enhance this live CV for ATS strength using the current role, skills, projects, and market keywords"
                                        >
                                            <Sparkles size={14} />
                                            {isEnhancingCV ? "Hardening..." : "Enhance CV"}
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className={styles.workflowPanel}>
                            <div>
                                <span className={styles.summaryEyebrow}>Operator flow</span>
                                <p>
                                    {nextRecommendedSection
                                        ? `Next: ${getSectionName(nextRecommendedSection)}`
                                        : "Core CV structure is ready for final review."}
                                </p>
                            </div>
                            {missingBeforeActive.length > 0 && (
                                <div className={styles.positionNote}>
                                    {getSectionName(activeSection)} is later in this template. It will follow {missingBeforeActive.map(getSectionName).join(", ")} when those sections are added. Empty sections are not printed in a professional CV.
                                </div>
                            )}
                            {(atsEnhanceError || atsEnhanceNotice || exportError || aiStatusLabel) && (
                                <div className={styles.positionNote}>
                                    {atsEnhanceError || atsEnhanceNotice || exportError || aiStatusLabel}
                                </div>
                            )}
                        </div>
                        <div className={styles.sectionContent}>
                            {activeSection === "profile" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Build the candidate profile.</h1>

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
                                        <div className={styles.inlineFieldWithAction}>
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
                                                title={isAIUnavailable ? "Generate a local fallback headline" : "AI Generate Headline"}
                                            >
                                                {isAISuggesting ? "..." : "✨"}
                                            </button>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: cvData.headline.length > 80 ? '#d69e2e' : '#a0aec0' }}>
                                            {cvData.headline.length}/80 recommended
                                        </span>
                                    </div>

                                    <div className={styles.twoColumnGrid}>
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

                                    <div className={styles.twoColumnGrid}>
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

                                    <div className={styles.twoColumnGrid}>
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
                                    {getVisibleEntries("experience").map((exp, i) => (
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
                                                    value={exp.company || ""} onChange={e => updateEntry("experience", i, { company: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Position <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input
                                                    className="form-input" placeholder="e.g. Senior Software Engineer"
                                                    value={exp.position || ""} onChange={e => updateEntry("experience", i, { position: e.target.value })}
                                                />
                                            </div>
                                            <div className={styles.twoColumnGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">Start Date</label>
                                                    <input
                                                        className="form-input" placeholder="e.g. Jan 2020"
                                                        value={exp.start_date || ""} onChange={e => updateEntry("experience", i, { start_date: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">End Date</label>
                                                    <input
                                                        className="form-input" placeholder="e.g. Present"
                                                        value={exp.end_date || ""} onChange={e => updateEntry("experience", i, { end_date: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Location</label>
                                                <input
                                                    className="form-input" placeholder="e.g. San Francisco, CA"
                                                    value={exp.location || ""} onChange={e => updateEntry("experience", i, { location: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Summary (optional)</label>
                                                <input
                                                    className="form-input" placeholder="One-line summary of your role"
                                                    value={exp.summary || ""} onChange={e => updateEntry("experience", i, { summary: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Key Highlights</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {getStringList(exp.highlights).map((hl: string, j: number) => (
                                                        <div key={j} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                            <textarea
                                                                className="form-textarea"
                                                                style={{ flex: 1, fontSize: '0.875rem' }}
                                                                rows={2}
                                                                value={hl}
                                                                onChange={e => {
                                                                    const highlights = [...getStringList(exp.highlights)];
                                                                    highlights[j] = e.target.value;
                                                                    updateEntry("experience", i, { highlights });
                                                                }}
                                                            />
                                                            <button
                                                                title="AI Polish"
                                                                onClick={async () => {
                                                                    const suggestion = await getAISuggestion(hl, "bullet", `${exp.position} at ${exp.company} `);
                                                                    if (suggestion) {
                                                                        const highlights = [...getStringList(exp.highlights)];
                                                                        highlights[j] = suggestion;
                                                                        updateEntry("experience", i, { highlights });
                                                                    }
                                                                }}
                                                                disabled={isAISuggesting}
                                                                style={{ color: 'var(--accent)', padding: '0.5rem' }}
                                                            >
                                                                ✨
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    updateEntry("experience", i, {
                                                                        highlights: getStringList(exp.highlights).filter((_: unknown, idx: number) => idx !== j)
                                                                    });
                                                                }}
                                                                style={{ color: 'var(--text-light)', padding: '0.5rem' }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button className={styles.addBtn} style={{ fontSize: '0.75rem', marginTop: 0 }} onClick={() => {
                                                        updateEntry("experience", i, { highlights: [...getStringList(exp.highlights), ""] });
                                                    }}>+ Add Achievement</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("experience", [...cvData.experience, getEmptyEntry("experience")])
                                    }}>+ Add Experience</button>
                                </div>
                            )}
                            {/* Education Section */}
                            {activeSection === "education" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Education.</h1>
                                    {getVisibleEntries("education").map((edu, i) => (
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
                                                    value={edu.institution || ""} onChange={e => updateEntry("education", i, { institution: e.target.value })}
                                                />
                                            </div>
                                            <div className={styles.twoColumnGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">Degree</label>
                                                    <input className="form-input" placeholder="e.g. BS, MS, PhD"
                                                        value={edu.degree || ""} onChange={e => updateEntry("education", i, { degree: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Field of Study <span style={{ color: '#e53e3e' }}>*</span></label>
                                                    <input className="form-input" placeholder="e.g. Computer Science"
                                                        value={edu.area || ""} onChange={e => updateEntry("education", i, { area: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className={styles.threeColumnGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">Start Date</label>
                                                    <input className="form-input" placeholder="Sep 2018"
                                                        value={edu.start_date || ""} onChange={e => updateEntry("education", i, { start_date: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">End Date</label>
                                                    <input className="form-input" placeholder="May 2022"
                                                        value={edu.end_date || ""} onChange={e => updateEntry("education", i, { end_date: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Location</label>
                                                    <input className="form-input" placeholder="City, Country"
                                                        value={edu.location || ""} onChange={e => updateEntry("education", i, { location: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Summary (optional)</label>
                                                <input className="form-input" placeholder="Brief description of your studies"
                                                    value={edu.summary || ""} onChange={e => updateEntry("education", i, { summary: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Highlights (GPA, Honors, etc.)</label>
                                                {getStringList(edu.highlights).map((hl: string, j: number) => (
                                                    <div key={j} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <input className="form-input" value={hl} onChange={e => {
                                                            const highlights = [...getStringList(edu.highlights)];
                                                            highlights[j] = e.target.value;
                                                            updateEntry("education", i, { highlights });
                                                        }} style={{ flex: 1 }} />
                                                        <button className={styles.aiBtn}
                                                            disabled={isAISuggesting || !hl.trim()}
                                                            onClick={async () => {
                                                                const suggestion = await getAISuggestion(hl, "education", `${edu.degree} in ${edu.area} `);
                                                                if (suggestion) {
                                                                    const highlights = [...getStringList(edu.highlights)];
                                                                    highlights[j] = suggestion;
                                                                    updateEntry("education", i, { highlights });
                                                                }
                                                            }}
                                                            title="AI Polish"
                                                        >{isAISuggesting ? "..." : "✨"}</button>
                                                        <button onClick={() => {
                                                            updateEntry("education", i, {
                                                                highlights: getStringList(edu.highlights).filter((_: unknown, idx: number) => idx !== j)
                                                            });
                                                        }} style={{ color: 'var(--text-light)' }}>✕</button>
                                                    </div>
                                                ))}
                                                <button className={styles.addBtn} style={{ fontSize: '0.75rem' }} onClick={() => {
                                                    updateEntry("education", i, { highlights: [...getStringList(edu.highlights), ""] });
                                                }}>+ Add Highlight</button>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("education", [...cvData.education, getEmptyEntry("education")])
                                    }}>+ Add Education</button>
                                </div>
                            )}

                            {/* Skills Section */}
                            {activeSection === "skills" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Skills.</h1>
                                    {getVisibleEntries("skills").map((skill, i) => (
                                        <div key={i} className={styles.skillRowGrid}>
                                            <input className="form-input" placeholder="Category * (required)"
                                                value={skill.label || ""} onChange={e => updateEntry("skills", i, { label: e.target.value })}
                                            />
                                            <input className="form-input" placeholder="e.g. Python, JavaScript, React"
                                                value={skill.details || ""} onChange={e => updateEntry("skills", i, { details: e.target.value })}
                                            />
                                            <button onClick={() => {
                                                removeEntry("skills", i)
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("skills", [...cvData.skills, getEmptyEntry("skills")])
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
                                                updateEntryList("skills", [...cvData.skills, newCategory]);
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
                                    {getVisibleEntries("projects").map((proj, i) => (
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
                                                    value={proj.name || ""} onChange={e => updateEntry("projects", i, { name: e.target.value })}
                                                />
                                            </div>
                                            <div className={styles.threeColumnGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">Start Date</label>
                                                    <input className="form-input" placeholder="e.g. 2023-01"
                                                        value={proj.start_date || ""} onChange={e => updateEntry("projects", i, { start_date: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">End Date</label>
                                                    <input className="form-input" placeholder="e.g. present"
                                                        value={proj.end_date || ""} onChange={e => updateEntry("projects", i, { end_date: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Location</label>
                                                    <input className="form-input" placeholder="(optional)"
                                                        value={proj.location || ""} onChange={e => updateEntry("projects", i, { location: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Live Demo Link</label>
                                                <input type="url" inputMode="url" className="form-input" placeholder="https://your-demo.app"
                                                    value={proj.url || ""} onChange={e => updateEntry("projects", i, { url: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Summary</label>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <input className="form-input" placeholder="One-line description"
                                                        value={proj.summary || ""} onChange={e => updateEntry("projects", i, { summary: e.target.value })}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <button className={styles.aiBtn}
                                                        disabled={isAISuggesting || !getString(proj.summary).trim()}
                                                        onClick={async () => {
                                                            const suggestion = await getAISuggestion(getString(proj.summary), "project_summary", getString(proj.name));
                                                            if (suggestion) {
                                                                updateEntry("projects", i, { summary: suggestion });
                                                            }
                                                        }}
                                                        title="AI Polish"
                                                    >{isAISuggesting ? "..." : "✨"}</button>
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Highlights</label>
                                                {getStringList(proj.highlights).map((hl: string, j: number) => (
                                                    <div key={j} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <input className="form-input" value={hl} onChange={e => {
                                                            const highlights = [...getStringList(proj.highlights)];
                                                            highlights[j] = e.target.value;
                                                            updateEntry("projects", i, { highlights });
                                                        }} />
                                                        <button onClick={() => {
                                                            updateEntry("projects", i, {
                                                                highlights: getStringList(proj.highlights).filter((_: unknown, idx: number) => idx !== j)
                                                            });
                                                        }} style={{ color: 'var(--text-light)' }}>✕</button>
                                                    </div>
                                                ))}
                                                <button className={styles.addBtn} style={{ fontSize: '0.75rem' }} onClick={() => {
                                                    updateEntry("projects", i, { highlights: [...getStringList(proj.highlights), ""] });
                                                }}>+ Add Highlight</button>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("projects", [...cvData.projects, getEmptyEntry("projects")])
                                    }}>+ Add Project</button>
                                </div>
                            )}

                            {/* Publications Section */}
                            {activeSection === "publications" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Publications.</h1>
                                    {getVisibleEntries("publications").map((pub, i) => (
                                        <div key={i} className={styles.entryItem}>
                                            <div className={styles.entryHeader}>
                                                <span className="form-label">Publication {i + 1}</span>
                                                <button className={styles.removeBtn} onClick={() => {
                                                    removeEntry("publications", i)
                                                }}>Remove</button>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Title <span style={{ color: '#e53e3e' }}>*</span></label>
                                                <input className="form-input" placeholder="Paper/Article Title"
                                                    value={pub.title || ""} onChange={e => updateEntry("publications", i, { title: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Authors <span style={{ color: '#e53e3e' }}>*</span> <small style={{ fontWeight: 'normal', color: '#718096' }}>(comma-separated, use *name* for yourself)</small></label>
                                                <input className="form-input" placeholder="*John Doe*, Jane Smith, Bob Jones"
                                                    value={pub.authors || ""} onChange={e => updateEntry("publications", i, { authors: e.target.value })}
                                                />
                                            </div>
                                            <div className={styles.twoColumnGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">Journal/Conference</label>
                                                    <input className="form-input" placeholder="e.g. NeurIPS 2023"
                                                        value={pub.journal || ""} onChange={e => updateEntry("publications", i, { journal: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Date</label>
                                                    <input className="form-input" placeholder="e.g. 2023-07"
                                                        value={pub.date || ""} onChange={e => updateEntry("publications", i, { date: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className={styles.twoColumnGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">DOI (optional)</label>
                                                    <input className="form-input" placeholder="10.1234/example"
                                                        value={pub.doi || ""} onChange={e => updateEntry("publications", i, { doi: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">URL (optional)</label>
                                                    <input className="form-input" placeholder="https://..."
                                                        value={pub.url || ""} onChange={e => updateEntry("publications", i, { url: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("publications", [...cvData.publications, getEmptyEntry("publications")])
                                    }}>+ Add Publication</button>
                                </div>
                            )}

                            {/* Awards & Certifications Section */}
                            {activeSection === "honors" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Awards & Certifications.</h1>
                                    {getVisibleEntries("honors").map((honor, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <input className="form-input" placeholder="e.g. AWS Certified, Forbes 30 Under 30"
                                                value={honor.bullet || ""} onChange={e => updateEntry("honors", i, { bullet: e.target.value })}
                                            />
                                            <button onClick={() => {
                                                removeEntry("honors", i)
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("honors", [...cvData.honors, getEmptyEntry("honors")])
                                    }}>+ Add Award/Certification</button>
                                </div>
                            )}

                            {/* Patents Section */}
                            {activeSection === "patents" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Your Patents.</h1>
                                    {getVisibleEntries("patents").map((patent, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-light)', fontWeight: 600, minWidth: '1.5rem' }}>{i + 1}.</span>
                                            <input className="form-input" placeholder="e.g. Patent Title (US Patent XX,XXX,XXX)"
                                                value={patent.number || ""} onChange={e => updateEntry("patents", i, { number: e.target.value })}
                                            />
                                            <button onClick={() => {
                                                removeEntry("patents", i)
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("patents", [...cvData.patents, getEmptyEntry("patents")])
                                    }}>+ Add Patent</button>
                                </div>
                            )}

                            {/* Invited Talks Section */}
                            {activeSection === "talks" && (
                                <div className="animate-fade">
                                    <h1 className={styles.sectionTitle}>Invited Talks.</h1>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '1rem' }}>Listed in reverse order (most recent first)</p>
                                    {getVisibleEntries("talks").map((talk, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-light)', fontWeight: 600, minWidth: '1.5rem' }}>{cvData.talks.length - i}.</span>
                                            <input className="form-input" placeholder="e.g. Talk Title — Conference Name (Year)"
                                                value={talk.reversed_number || ""} onChange={e => updateEntry("talks", i, { reversed_number: e.target.value })}
                                            />
                                            <button onClick={() => {
                                                removeEntry("talks", i)
                                            }} style={{ color: 'var(--text-light)' }}>✕</button>
                                        </div>
                                    ))}
                                    <button className={styles.addBtn} onClick={() => {
                                        updateEntryList("talks", [...cvData.talks, getEmptyEntry("talks")])
                                    }}>+ Add Talk</button>
                                </div>
                            )}

                            {/* Cover Letter Section */}
                            {activeSection === "cover_letter" && (
                                <div className="animate-fade">
                                    <div className={styles.coverLetterHero}>
                                        <div className={styles.coverLetterHeroContent}>
                                            <span className={styles.coverLetterKicker}>Application packet</span>
                                            <h1 className={styles.sectionTitle}>Generate the role narrative.</h1>
                                            <p>Turn the live CV, role context, location, skills, and projects into a focused one-page letter with an editable final copy.</p>
                                            <div className={styles.coverLetterPills}>
                                                <span>{coverLetter.source === "ai" ? "AI tailored" : coverLetter.source === "template" ? "Template draft" : "Ready to draft"}</span>
                                                <span>{coverLetterWordStatus}</span>
                                            </div>
                                        </div>
                                        <div className={styles.coverLetterScore}>
                                            <strong>{completedCoverLetterChecks}/{coverLetterReadyChecks.length}</strong>
                                            <span>ready</span>
                                        </div>
                                    </div>

                                    <div className={styles.coverLetterChecklist}>
                                        {coverLetterReadyChecks.map(item => (
                                            <span key={item.label} className={item.done ? styles.coverLetterCheckDone : ""}>
                                                <span>{item.done ? "✓" : ""}</span>
                                                {item.label}
                                            </span>
                                        ))}
                                    </div>

                                    <div className={styles.coverLetterAutoPanel}>
                                        <div>
                                            <span className={styles.summaryEyebrow}>Auto CV analysis</span>
                                            <strong>{inferredRolePreview}</strong>
                                            <p>
                                                {cvData.location
                                                    ? `${cvData.location}${inferredCountry ? ` (${inferredCountry})` : ""}`
                                                    : "Add a location to tailor country or market context."}
                                            </p>
                                        </div>
                                        <div className={styles.coverLetterAutoTags}>
                                            {autoSkillPreview.length > 0
                                                ? autoSkillPreview.map(skill => <span key={skill}>{skill}</span>)
                                                : <span>Add skills for stronger targeting</span>}
                                        </div>
                                    </div>

                                    <div className={styles.coverLetterWorkspace}>
                                        <section className={styles.coverLetterPanel}>
                                            <div className={styles.coverLetterPanelHeader}>
                                                <div>
                                                    <span className={styles.summaryEyebrow}>Target</span>
                                                    <strong>Application brief</strong>
                                                </div>
                                                <small>Required for tailoring</small>
                                            </div>

                                            <div className={styles.coverLetterGrid}>
                                                <div className="form-group">
                                                    <label className="form-label">Target Role <span style={{ color: '#e53e3e' }}>*</span></label>
                                                    <input
                                                        className="form-input"
                                                        placeholder="Senior Full-Stack Engineer"
                                                        value={coverLetter.targetRole}
                                                        onChange={e => updateCoverLetter({ targetRole: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Company <span style={{ color: '#e53e3e' }}>*</span></label>
                                                    <input
                                                        className="form-input"
                                                        placeholder="Northstar Labs"
                                                        value={coverLetter.company}
                                                        onChange={e => updateCoverLetter({ company: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Hiring Manager</label>
                                                    <input
                                                        className="form-input"
                                                        placeholder="Hiring Team"
                                                        value={coverLetter.hiringManager}
                                                        onChange={e => updateCoverLetter({ hiringManager: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Tone</label>
                                                    <select
                                                        className="form-input"
                                                        value={coverLetter.tone}
                                                        onChange={e => updateCoverLetter({ tone: e.target.value })}
                                                    >
                                                        <option value="professional">Professional</option>
                                                        <option value="warm">Warm</option>
                                                        <option value="concise">Concise</option>
                                                        <option value="executive">Executive</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </section>

                                        <section className={styles.coverLetterPanel}>
                                            <div className={styles.coverLetterPanelHeader}>
                                                <div>
                                                    <span className={styles.summaryEyebrow}>Job match</span>
                                                    <strong>Role description</strong>
                                                </div>
                                                <small>{jobDescriptionLength} chars</small>
                                            </div>
                                            <textarea
                                                className={`${styles.coverLetterJobPost} form-textarea`}
                                                placeholder="Paste the role description, requirements, and responsibilities here..."
                                                value={coverLetter.jobDescription}
                                                onChange={e => updateCoverLetter({ jobDescription: e.target.value })}
                                                rows={7}
                                            />
                                            <div className={styles.coverLetterMeta}>
                                                <span>{jobDescriptionLength >= 40 ? "Enough context to tailor" : "Paste at least 40 characters"}</span>
                                                <span>Keywords are pulled from this text</span>
                                            </div>
                                        </section>

                                        <section className={styles.coverLetterPanel}>
                                            <div className={styles.coverLetterPanelHeader}>
                                                <div>
                                                    <span className={styles.summaryEyebrow}>Draft controls</span>
                                                    <strong>Generate and export</strong>
                                                </div>
                                                <small>{coverLetterStatus === "idle" ? "Ready" : coverLetterStatus}</small>
                                            </div>
                                            <div className={styles.coverLetterActions}>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={generateAutoCoverLetterDraft}
                                                    disabled={coverLetterStatus === "generating"}
                                                    title="Build a cover letter from the live CV, location, skills, projects, and experience"
                                                >
                                                    <MapPin size={16} />
                                                    Auto Draft from CV
                                                </button>
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={generateCoverLetterDraft}
                                                    disabled={coverLetterStatus === "generating"}
                                                >
                                                    <Sparkles size={16} />
                                                    {coverLetterStatus === "generating" ? "Drafting..." : coverLetter.letter.trim() ? "Regenerate" : "Generate"}
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={copyCoverLetter}
                                                    disabled={!coverLetter.letter.trim() || coverLetterStatus === "copying"}
                                                >
                                                    <Copy size={16} />
                                                    Copy
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={downloadCoverLetter}
                                                    disabled={coverLetterStatus === "exporting"}
                                                >
                                                    <Download size={16} />
                                                    {coverLetterStatus === "exporting" ? "Exporting..." : "Cover PDF"}
                                                </button>
                                            </div>
                                            {(coverLetterError || coverLetterNotice) && (
                                                <div className={coverLetterError ? styles.coverLetterError : styles.coverLetterNotice}>
                                                    {coverLetterError || coverLetterNotice}
                                                </div>
                                            )}
                                        </section>

                                        <section className={styles.coverLetterDocumentPanel}>
                                            <div className={styles.coverLetterDocumentToolbar}>
                                                <div>
                                                    <span className={styles.summaryEyebrow}>Letter workspace</span>
                                                    <strong>{coverLetter.targetRole || "Target role"}{coverLetter.company ? ` at ${coverLetter.company}` : ""}</strong>
                                                </div>
                                                <div className={styles.coverLetterStats}>
                                                    <span>{coverLetterWordCount} words</span>
                                                    <span>{coverLetterWordStatus}</span>
                                                </div>
                                            </div>
                                            <div className={styles.coverLetterPaper}>
                                                <div className={styles.coverLetterPaperHeader}>
                                                    <strong>{cvData.name || "Your Name"}</strong>
                                                    <span>{[cvData.email, cvData.phone, cvData.location].filter(Boolean).join(" | ") || "Contact details from your CV"}</span>
                                                </div>
                                                <textarea
                                                    className={styles.coverLetterTextarea}
                                                    placeholder="Your tailored cover letter will appear here. You can edit it before copying or exporting."
                                                    value={coverLetter.letter}
                                                    onChange={e => updateCoverLetter({ letter: e.target.value, source: coverLetter.source || "template" })}
                                                    rows={18}
                                                />
                                            </div>
                                            <div className={styles.coverLetterFooter}>
                                                <span>Recommended: 250-350 words</span>
                                                <span>Plain text, one page, ATS-readable</span>
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            )}

                            {/* Design Section */}
                            {activeSection === "design" && (
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
                        <div className={styles.previewShell}>
                            <div className={styles.previewToolbar}>
                                <div>
                                    <span className={styles.summaryEyebrow}>Live PDF preview</span>
                                    <strong>{printedSectionNames.length ? printedSectionNames.join(" / ") : "No printable sections yet"}</strong>
                                </div>
                                <span>{currentThemeData.name}</span>
                            </div>
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
                                        <div className={styles.previewEmptyState}>
                                            <strong>{previewError ? "Preview needs attention" : "Start with profile or any complete section"}</strong>
                                            <p>
                                                {previewError || "The preview prints only completed CV sections. Empty template sections stay out of the final document."}
                                            </p>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                        </div>
                    </div>
                </main>
            )}
        </div>
    );
}

export default function EditorPage() {
    return (
        <Suspense fallback={<div>Loading ApplyForge...</div>}>
            <EditorContent />
        </Suspense>
    );
}
