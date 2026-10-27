"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CloudUpload, Command as CommandIcon, Download, Eye, FileCode2, History, Home, LayoutGrid, LayoutTemplate, Mail, Moon, Pencil, Redo2, RotateCcw, Search, Sparkles, Target, Undo2 } from "lucide-react";
import styles from "./editor.module.css";
import { Logo, Icons } from "@/components/Brand";
import { TemplateCard } from "@/components/AppUI";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { useCVDocument } from "@/hooks/useCVDocument";
import { useTemplateThumbnails } from "@/hooks/useTemplateThumbnails";
import { CommandPalette, useCommandPaletteShortcut, type Command } from "@/components/CommandPalette";
import { ThemeToggle, useThemePreference } from "@/components/ThemeToggle";
import { useCloudResume, type CloudSyncStatus } from "@/hooks/useCloudResume";
import { AccountMenu } from "@/components/AccountMenu";
import { useAuth } from "@/components/AuthProvider";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import {
    EducationSection,
    ExperienceSection,
    ProjectsSection,
    PublicationsSection,
    SimpleListSection,
    SkillsSection,
} from "@/components/editor/EntrySections";
import { resolveSectionOrder } from "@/components/editor/DesignControls";
import { ProfileSection } from "@/components/editor/ProfileSection";
import { CoverLetterSection } from "@/components/editor/CoverLetterSection";
import { JobMatchSection } from "@/components/editor/JobMatchSection";
import { OnboardingPanel, useOnboardingDismissed } from "@/components/editor/OnboardingPanel";
import { createSampleCV } from "@/lib/sampleCV";
import { DesignSection } from "@/components/editor/DesignSection";
import { inferTargetRole } from "@/lib/coverLetterContext";
import { resumesApi, toApiContent } from "@/lib/resumesApi";
import { draftTitle, markDraftImported } from "@/lib/localDraft";
import { useLivePreview } from "@/hooks/useLivePreview";
import {
    CoverLetterDraft,
    CVData,
    DEFAULT_COVER_LETTER_DRAFT,
    DesignSettings,
    Entry,
    REPEATABLE_SECTIONS,
    RepeatableSection,
    calculateATSScore as calculateATSScoreForData,
    calculateSectionProgress as calculateSectionProgressForData,
    getSectionWordCount as getSectionWordCountForData,
    hasRenderableContent,
    normalizeCVData,
    toRenderableCVData,
} from "@/lib/cvBuilder";
import {
    downloadPDF as downloadPDFFile,
    exportYAML,
    requestCVEnhancement,
    requestAISuggestion,
    requestAIStatus,
} from "@/lib/editorApi";
import { API_URL } from "@/lib/config";
import { THEME_DATA, getTemplateFitScore, getTheme, recommendTemplate } from "@/lib/themes";

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
    job_match: { id: "job_match", name: "Job Match", icon: <Target size={18} /> },
    cover_letter: { id: "cover_letter", name: "Cover Letter", icon: <Mail size={18} /> },
};

// Helper to get sections in theme order
// Editor nav order: profile first, then content sections in the CV's print
// order (custom or theme), then design and the cover letter.
const getEditorSectionIds = (themeId: string, design: DesignSettings): string[] => [
    "profile",
    ...resolveSectionOrder(themeId, design).filter(sectionId => sectionId !== "summary"),
    "design",
    "job_match",
    "cover_letter",
];

const getSectionName = (sectionId: string): string => {
    return BASE_SECTIONS[sectionId as keyof typeof BASE_SECTIONS]?.name || sectionId;
};

function EditorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const resumeId = searchParams.get("id");
    const auth = useAuth();
    const themeOverride = searchParams.get("theme") || "";
    const sectionOverride = searchParams.get("section") || "";
    const initialTheme = themeOverride || "classic";

    const {
        cvData,
        theme,
        designSettings,
        setCVData,
        setTheme,
        setDesignSettings,
        loaders,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useCVDocument(initialTheme);
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
    const [coverLetter, setCoverLetter] = useState<CoverLetterDraft>(DEFAULT_COVER_LETTER_DRAFT);


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

    const draft = useDraftAutosave({
        cvData,
        theme,
        designSettings,
        coverLetter,
        setCVData: loaders.setCVData,
        setTheme: loaders.setTheme,
        setDesignSettings: loaders.setDesignSettings,
        setCoverLetter,
        initialTheme: themeOverride,
        enabled: !resumeId,
    });
    const cloud = useCloudResume({
        resumeId,
        getAccessToken: auth.getAccessToken,
        cvData,
        theme,
        designSettings,
        coverLetter,
        setCVData: loaders.setCVData,
        setTheme: loaders.setTheme,
        setDesignSettings: loaders.setDesignSettings,
        setCoverLetter,
    });
    const { draftStatus, resetDraft } = draft;
    const isRestored = resumeId ? cloud.isLoaded : draft.isRestored;
    const lastSavedAt = resumeId ? cloud.lastSavedAt : draft.lastSavedAt;
    const [historyOpen, setHistoryOpen] = useState(searchParams.get("history") === "1");
    const [paletteOpen, setPaletteOpen] = useState(false);
    const onboarding = useOnboardingDismissed();
    useCommandPaletteShortcut(setPaletteOpen);
    const [isSavingToAccount, setIsSavingToAccount] = useState(false);

    // Saved resumes need a session; send signed-out visitors to sign in first.
    useEffect(() => {
        if (resumeId && auth.enabled && !auth.loading && !auth.user) {
            router.replace(`/login?next=${encodeURIComponent(`/editor?id=${resumeId}`)}`);
        }
    }, [auth.enabled, auth.loading, auth.user, resumeId, router]);

    const saveDraftToAccount = async () => {
        if (!auth.user) {
            router.push("/login?next=/dashboard");
            return;
        }
        setIsSavingToAccount(true);
        try {
            const content = { cvData, theme, designSettings, coverLetter };
            const created = await resumesApi.create(auth.getAccessToken, {
                title: draftTitle(content),
                source: "import",
                ...toApiContent(content),
            });
            markDraftImported(auth.user.id);
            router.push(`/editor?id=${created.id}`);
        } catch (error) {
            setExportError(error instanceof Error ? error.message : "Couldn't save to your account.");
            setIsSavingToAccount(false);
        }
    };

    const {
        previewPages,
        pageCount,
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

    // Live thumbnails of this CV in every template, while a gallery is open.
    const { thumbnails: templateThumbnails } = useTemplateThumbnails({
        cvData,
        designSettings,
        enabled: isRestored && (editorMode === "preview" || activeSection === "design"),
    });

    const syncStatus = isGenerating ? "syncing" : draftStatus;
    const CLOUD_STATUS_LABELS: Record<CloudSyncStatus, string> = {
        loading: "Loading CV...",
        saving: "Saving...",
        saved: "All changes saved",
        offline: "Offline, retrying...",
        conflict: "Changed in another tab",
        error: "Save failed",
    };
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
                `${result.source === "ai" ? "AI" : "Local"} ATS enhancement applied: ${beforeScore}% -> ${afterScore}%. ${result.changes?.[0] || "Updated live CV content."}`,
            );
            if ((result.warnings ?? []).length > 0) {
                setAiAvailable(false);
            }
        } catch (error) {
            console.error("CV enhancement failed:", error);
            setAtsEnhanceError(error instanceof Error ? error.message : "CV enhancement failed.");
        } finally {
            setIsEnhancingCV(false);
        }
    };

    // Update Field
    const updateField = <K extends keyof CVData>(field: K, value: CVData[K]) => {
        setCVData(prev => ({ ...prev, [field]: value }));
    };

    const updateEntryList = (section: RepeatableSection, nextList: Entry[]) => {
        updateField(section, nextList);
    };

    const aiHelper = { suggest: getAISuggestion, busy: isAISuggesting };

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
    const orderedSectionIds = getEditorSectionIds(theme, designSettings);
    const hasTargetJob = coverLetter.jobDescription.trim().length >= 40;
    const getEditorSectionProgress = (sectionId: string): number => {
        if (sectionId === "job_match") return hasTargetJob ? 100 : 0;
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
        if (sectionId === "job_match") return hasTargetJob;
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
    const NON_CONTENT_SECTIONS = ["profile", "design", "job_match", "cover_letter"];
    const orderedContentSections = orderedSectionIds.filter(sectionId => !NON_CONTENT_SECTIONS.includes(sectionId));
    const activeSectionIndex = orderedContentSections.indexOf(activeSection);
    const missingBeforeActive = activeSectionIndex > -1
        ? orderedContentSections
            .slice(0, activeSectionIndex)
            .filter(sectionId => REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection))
            .filter(sectionId => renderableData[sectionId as RepeatableSection].length === 0)
        : [];
    const nextRecommendedSection = orderedSectionIds.find(sectionId => {
        if (sectionId === "design" || sectionId === "job_match") return false;
        if (sectionId === "cover_letter") return !coverLetter.letter.trim();
        if (sectionId === "profile") return calculateSectionProgress("profile") < 60;
        return REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection)
            && renderableData[sectionId as RepeatableSection].length === 0;
    });
    const printedSectionNames = orderedContentSections
        .filter(sectionId => REPEATABLE_SECTIONS.includes(sectionId as RepeatableSection))
        .filter(sectionId => !(designSettings.hiddenSections ?? []).includes(sectionId as RepeatableSection))
        .filter(sectionId => renderableData[sectionId as RepeatableSection].length > 0)
        .map(getSectionName);

    const themePreference = useThemePreference();
    const loadSampleCV = () => {
        setCVData(createSampleCV());
        setActiveSection("profile");
        setEditorMode("edit");
        onboarding.dismiss();
    };
    const showOnboarding = isRestored && !onboarding.dismissed && activeSection === "profile" && !hasRenderableContent(renderableData);
    const goToSection = (sectionId: string) => {
        setEditorMode("edit");
        setActiveSection(sectionId);
    };
    const paletteCommands: Command[] = [
        ...orderedSectionIds.map((sectionId): Command => {
            const section = BASE_SECTIONS[sectionId as keyof typeof BASE_SECTIONS];
            return {
                id: `section-${sectionId}`,
                label: `Go to ${section.name}`,
                group: "Sections",
                icon: section.icon,
                keywords: sectionId.replace("_", " "),
                run: () => goToSection(sectionId),
            };
        }),
        { id: "download-pdf", label: "Download PDF", group: "Actions", icon: <Download size={16} />, run: () => void downloadPDF() },
        // Only offered on an empty CV so it can't overwrite real content.
        ...(hasRenderableContent(renderableData)
            ? []
            : [{ id: "sample", label: "Load the sample CV", group: "Actions", icon: <Sparkles size={16} />, keywords: "example demo try", run: loadSampleCV }]),
        { id: "home", label: "Go to home page", group: "Actions", icon: <LayoutGrid size={16} />, keywords: "exit landing", run: () => router.push("/") },
        { id: "export-yaml", label: "Export RenderCV YAML", group: "Actions", icon: <FileCode2 size={16} />, run: () => void downloadYAML() },
        {
            id: "theme-mode",
            label: `Switch appearance (now: ${themePreference.preference})`,
            group: "Actions",
            icon: <Moon size={16} />,
            keywords: "dark mode light theme",
            run: themePreference.cycle,
        },
        { id: "undo", label: "Undo", group: "Actions", icon: <Undo2 size={16} />, shortcut: "Ctrl Z", run: undo },
        { id: "redo", label: "Redo", group: "Actions", icon: <Redo2 size={16} />, shortcut: "Ctrl Shift Z", run: redo },
        {
            id: "gallery",
            label: editorMode === "preview" ? "Back to editing" : "Browse templates with my CV",
            group: "Actions",
            icon: <LayoutTemplate size={16} />,
            keywords: "gallery themes",
            run: () => setEditorMode(editorMode === "preview" ? "edit" : "preview"),
        },
        ...(resumeId
            ? [
                { id: "history", label: "Version history", group: "Actions", icon: <History size={16} />, keywords: "restore save version", run: () => setHistoryOpen(true) },
                { id: "my-cvs", label: "Go to My CVs", group: "Actions", icon: <LayoutGrid size={16} />, keywords: "dashboard", run: () => router.push("/dashboard") },
            ]
            : [
                { id: "new", label: "Start a new CV", group: "Actions", icon: <RotateCcw size={16} />, keywords: "reset clear", run: startNewDraft },
                ...(auth.user
                    ? [{ id: "save-account", label: "Save this draft to my account", group: "Actions", icon: <CloudUpload size={16} />, run: () => void saveDraftToAccount() }]
                    : []),
            ]),
        ...THEME_DATA.map((t): Command => ({
            id: `theme-${t.id}`,
            label: `Use template: ${t.name}${t.id === theme ? " (current)" : ""}`,
            group: "Templates",
            icon: <LayoutTemplate size={16} />,
            keywords: `${t.tags.join(" ")} ${t.atsScore}% ats`,
            run: () => setTheme(t.id),
        })),
    ];

    return (
        <div className={styles.editorLayout}>
            {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}
            {resumeId && cloud.loadError && (
                <div className={styles.cloudErrorOverlay} role="alert">
                    <div className={styles.cloudErrorCard}>
                        <strong>We couldn&apos;t open this CV</strong>
                        <p>{cloud.loadError}</p>
                        <div className={styles.cloudErrorActions}>
                            <button type="button" className="btn btn-secondary" onClick={() => void cloud.reload()}>Try again</button>
                            <Link href="/dashboard" className="btn btn-primary">Back to My CVs</Link>
                        </div>
                    </div>
                </div>
            )}
            {resumeId && auth.user && (
                <VersionHistoryPanel
                    open={historyOpen}
                    resumeId={resumeId}
                    getAccessToken={auth.getAccessToken}
                    flush={cloud.flush}
                    latestVersion={cloud.latestVersion}
                    onRestored={cloud.applyServerResume}
                    onClose={() => setHistoryOpen(false)}
                />
            )}
            <header className={styles.header}>
                <div className={styles.logoArea}>
                    <Link href={resumeId ? "/dashboard" : "/"} aria-label="ApplyForge home" style={{ display: 'flex' }}>
                        <Logo width={28} height={28} />
                    </Link>
                    {resumeId ? (
                        <div className={styles.docTitleWrap}>
                            <input
                                className={styles.docTitleInput}
                                value={cloud.title}
                                onChange={(event) => cloud.setTitle(event.target.value)}
                                onBlur={() => { if (!cloud.title.trim()) cloud.setTitle("Untitled CV"); }}
                                maxLength={120}
                                aria-label="CV title"
                                disabled={!cloud.isLoaded}
                            />
                            <span
                                className={`${styles.cloudStatus} ${styles[`cloudStatus_${cloud.status}`] ?? ""}`}
                                role="status"
                            >
                                {CLOUD_STATUS_LABELS[cloud.status]}
                                {cloud.status === "conflict" && (
                                    <>
                                        <button type="button" className={styles.cloudReload} onClick={() => void cloud.reload()} title="Discard this tab's unsaved edits and load the latest version">
                                            Load theirs
                                        </button>
                                        <button type="button" className={styles.cloudReload} onClick={() => void cloud.keepMine()} title="Save this tab's content over the other change">
                                            Keep mine
                                        </button>
                                    </>
                                )}
                            </span>
                        </div>
                    ) : (
                        <span style={{ letterSpacing: '0.03em', fontWeight: 800 }}>ApplyForge</span>
                    )}
                </div>
                <div className={styles.headerActions}>
                    <button type="button" className={styles.paletteTrigger} onClick={() => setPaletteOpen(true)} aria-label="Open command palette (Ctrl+K)">
                        <Search size={15} />
                        <span>Search or jump to...</span>
                        <kbd><CommandIcon size={11} />K</kbd>
                    </button>
                    <ThemeToggle />
                    <div className={styles.undoGroup} role="group" aria-label="Undo and redo">
                        <button type="button" className={styles.undoBtn} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
                            <Undo2 size={16} />
                        </button>
                        <button type="button" className={styles.undoBtn} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
                            <Redo2 size={16} />
                        </button>
                    </div>
                    <button
                        onClick={() => setEditorMode(editorMode === 'preview' ? 'edit' : 'preview')}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        aria-label={editorMode === 'preview' ? "Edit CV" : "Templates"}
                        title={editorMode === 'preview' ? "Edit CV" : "Browse templates"}
                    >
                        {editorMode === 'preview' ? (
                            <>
                                <Pencil size={16} />
                                <span className="btn-label">Edit CV</span>
                            </>
                        ) : (
                            <>
                                <Eye size={16} />
                                <span className="btn-label">Templates</span>
                            </>
                        )}
                    </button>
                    {resumeId ? (
                        <button onClick={() => setHistoryOpen(true)} className="btn btn-secondary" title="Version history" aria-label="Version history">
                            <History size={16} />
                            <span className="btn-label">History</span>
                        </button>
                    ) : (
                        <>
                            <button onClick={startNewDraft} className="btn btn-secondary" title="Start a new CV" aria-label="Start a new CV">
                                <RotateCcw size={16} />
                                <span className="btn-label">New</span>
                            </button>
                            {auth.enabled && auth.user && (
                                <button
                                    onClick={saveDraftToAccount}
                                    className="btn btn-secondary"
                                    disabled={isSavingToAccount}
                                    title="Save this browser draft to your account"
                                    aria-label="Save to account"
                                >
                                    <CloudUpload size={16} />
                                    <span className="btn-label">{isSavingToAccount ? "Saving..." : "Save to account"}</span>
                                </button>
                            )}
                        </>
                    )}
                    <button onClick={downloadYAML} className={`btn btn-secondary ${styles.hideOnMobile}`} disabled={isLoading} title="Export RenderCV YAML" aria-label="Export YAML">
                        <FileCode2 size={16} />
                        <span className="btn-label">YAML</span>
                    </button>
                    {resumeId ? (
                        <Link href="/dashboard" className="btn btn-secondary" title="My CVs" aria-label="My CVs">
                            <LayoutGrid size={16} />
                            <span className="btn-label">My CVs</span>
                        </Link>
                    ) : (
                        <>
                            <AccountMenu />
                            <Link href="/" className={`btn btn-secondary ${styles.hideOnMobile}`} title="Back to home" aria-label="Exit to home">
                                <Home size={16} />
                                <span className="btn-label">Exit</span>
                            </Link>
                        </>
                    )}
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
                                    image={templateThumbnails[t.id] ?? t.image}
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
                        <div className={styles.sidebarNav}>
                        <div className={styles.builderSummary}>
                            <span className={styles.summaryEyebrow}>Template</span>
                            <strong>{currentThemeData.name}</strong>
                            <p>{currentThemeData.description}</p>
                            <div className={styles.progressTrack}>
                                <span style={{ width: `${Math.min(100, Math.round((completedSectionIds.length / orderedSectionIds.length) * 100))}%` }} />
                            </div>
                            <small>{completedSectionIds.length} of {orderedSectionIds.length} steps started</small>
                        </div>
                        {orderedSectionIds.map(sectionId => BASE_SECTIONS[sectionId as keyof typeof BASE_SECTIONS]).map(s => {
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
                        </div>
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
                                : resumeId
                                    ? CLOUD_STATUS_LABELS[cloud.status]
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
                            {showOnboarding && (
                                <OnboardingPanel
                                    onStartBlank={() => {
                                        onboarding.dismiss();
                                        document.querySelector<HTMLInputElement>('input[placeholder="John Doe"]')?.focus();
                                    }}
                                    onLoadSample={loadSampleCV}
                                    onDismiss={onboarding.dismiss}
                                />
                            )}
                            {activeSection === "profile" && (
                                <ProfileSection
                                    cvData={cvData}
                                    onFieldChange={updateField}
                                    fieldErrors={fieldErrors}
                                    ai={aiHelper}
                                    aiUnavailable={isAIUnavailable}
                                />
                            )}

                            {activeSection === "experience" && (
                                <ExperienceSection entries={cvData.experience} onChange={(next) => updateEntryList("experience", next)} ai={aiHelper} />
                            )}
                            {activeSection === "education" && (
                                <EducationSection entries={cvData.education} onChange={(next) => updateEntryList("education", next)} ai={aiHelper} />
                            )}
                            {activeSection === "skills" && (
                                <SkillsSection entries={cvData.skills} onChange={(next) => updateEntryList("skills", next)} ai={aiHelper} headline={cvData.headline} />
                            )}
                            {activeSection === "projects" && (
                                <ProjectsSection entries={cvData.projects} onChange={(next) => updateEntryList("projects", next)} ai={aiHelper} />
                            )}
                            {activeSection === "publications" && (
                                <PublicationsSection entries={cvData.publications} onChange={(next) => updateEntryList("publications", next)} ai={aiHelper} />
                            )}
                            {(activeSection === "honors" || activeSection === "patents" || activeSection === "talks") && (
                                <SimpleListSection
                                    key={activeSection}
                                    section={activeSection}
                                    entries={cvData[activeSection]}
                                    onChange={(next) => updateEntryList(activeSection, next)}
                                />
                            )}

                            {activeSection === "job_match" && (
                                <JobMatchSection
                                    cvData={cvData}
                                    setCVData={setCVData}
                                    coverLetter={coverLetter}
                                    setCoverLetter={setCoverLetter}
                                    onOpenSection={setActiveSection}
                                />
                            )}
                            {activeSection === "cover_letter" && (
                                <CoverLetterSection
                                    cvData={cvData}
                                    renderableData={renderableData}
                                    coverLetter={coverLetter}
                                    setCoverLetter={setCoverLetter}
                                    onTemplateFallback={() => setAiAvailable(false)}
                                />
                            )}

                            {activeSection === "design" && (
                                <DesignSection
                                    thumbnails={templateThumbnails}
                                    theme={theme}
                                    onThemeChange={setTheme}
                                    recommendedTheme={recommendedTheme}
                                    cvData={cvData}
                                    designSettings={designSettings}
                                    setDesignSettings={setDesignSettings}
                                />
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
                                <span>
                                    {currentThemeData.name}
                                    {pageCount > 0 && ` · ${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
                                </span>
                            </div>
                        <div className={styles.pageStack}>
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

                            {isGenerating && previewPages.length === 0 && (
                                <div className="skeleton" style={{ width: '100%', height: '100%' }}></div>
                            )}

                            {previewPages.length > 0 ? (
                                <div className={isGenerating ? "" : "animate-fade"} style={{ width: '100%', height: '100%', opacity: isGenerating ? 0.6 : 1, transition: 'opacity 0.3s ease' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the render API */}
                                    <img src={previewPages[0]} alt="CV preview, page 1" className={styles.previewImage} />
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
                        {previewPages.slice(1).map((page, index) => (
                            <div key={index + 2} className={styles.canvas} style={{ opacity: isGenerating ? 0.6 : 1 }}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the render API */}
                                <img src={page} alt={`CV preview, page ${index + 2}`} className={styles.previewImage} />
                            </div>
                        ))}
                        {pageCount > previewPages.length && (
                            <p className={styles.pageOverflowNote}>
                                Showing {previewPages.length} of {pageCount} pages. Download the PDF to see the rest.
                            </p>
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
