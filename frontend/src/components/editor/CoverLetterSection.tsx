"use client";

import { useState } from "react";
import { Copy, Download, MapPin, Sparkles } from "lucide-react";
import styles from "@/app/editor/editor.module.css";
import { API_URL } from "@/lib/config";
import type { CoverLetterDraft, CVData } from "@/lib/cvBuilder";
import { downloadCoverLetterPDF, generateCoverLetter as requestCoverLetter } from "@/lib/editorApi";
import {
    buildAutoCoverLetterContext,
    getAutoSkillTerms,
    inferCountryFromLocation,
    inferTargetRole,
} from "@/lib/coverLetterContext";

interface CoverLetterSectionProps {
    cvData: CVData;
    /** CV data with incomplete entries removed, as sent to the API. */
    renderableData: CVData;
    coverLetter: CoverLetterDraft;
    setCoverLetter: (update: (previous: CoverLetterDraft) => CoverLetterDraft) => void;
    /** Called when the server fell back to the template (AI unavailable). */
    onTemplateFallback: () => void;
}

/** Cover letter brief, generation, editing, copy and PDF export. */
export function CoverLetterSection({ cvData, renderableData, coverLetter, setCoverLetter, onTemplateFallback }: CoverLetterSectionProps) {
    const [coverLetterStatus, setCoverLetterStatus] = useState<"idle" | "generating" | "copying" | "exporting">("idle");
    const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
    const [coverLetterNotice, setCoverLetterNotice] = useState<string | null>(null);

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
            if (result.source === "template") onTemplateFallback();
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
            if (result.source === "template") onTemplateFallback();
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
    );
}
