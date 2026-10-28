"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, FileText, PenLine, TriangleAlert, X } from "lucide-react";
import editorStyles from "@/app/editor/editor.module.css";
import styles from "./CoverLetter.module.css";
import { Badge, Button, Card, CharCounter, Field, SectionHeading } from "@/components/ui";
import { API_URL } from "@/lib/config";
import type { CoverLetterDraft, CVData, DesignSettings } from "@/lib/cvBuilder";
import { downloadCoverLetterPDF, streamCoverLetter } from "@/lib/editorApi";
import { buildAutoCoverLetterContext, inferTargetRole } from "@/lib/coverLetterContext";
import { LETTER_LENGTHS, checkLetter, type LetterLength } from "@/lib/letterCheck";

interface CoverLetterSectionProps {
    cvData: CVData;
    /** CV data with incomplete entries removed, as sent to the API. */
    renderableData: CVData;
    coverLetter: CoverLetterDraft;
    setCoverLetter: (update: (previous: CoverLetterDraft) => CoverLetterDraft) => void;
    /** The CV's font and colour, so the letter PDF matches it. */
    designSettings: DesignSettings;
    /** Called when the server fell back to the template (AI unavailable). */
    onTemplateFallback: () => void;
}

const TONES = [
    { value: "professional", label: "Professional", hint: "Confident and polished" },
    { value: "warm", label: "Warm", hint: "Friendly and personable" },
    { value: "concise", label: "Concise", hint: "Short and direct" },
    { value: "executive", label: "Executive", hint: "Strategic, impact-led" },
    { value: "enthusiastic", label: "Enthusiastic", hint: "Energetic, upbeat" },
];

type Status = "idle" | "generating" | "exporting";
type Notice = { tone: "success" | "error"; text: string } | null;

/** Cover letter brief, style, streaming generation, live quality checks, copy and PDF export. */
export function CoverLetterSection({ cvData, renderableData, coverLetter, setCoverLetter, designSettings, onTemplateFallback }: CoverLetterSectionProps) {
    const [status, setStatus] = useState<Status>("idle");
    const [notice, setNotice] = useState<Notice>(null);
    const [copied, setCopied] = useState(false);

    const length: LetterLength = coverLetter.length || "standard";
    const highlights = coverLetter.highlights || "";
    const check = useMemo(() => checkLetter({ ...coverLetter, length }), [coverLetter, length]);
    const passed = check.items.filter((item) => item.status === "pass").length;
    const hasCvContent = Boolean(cvData.name.trim() || cvData.summary.trim() || cvData.experience.length || cvData.skills.length);
    const jobDescriptionLength = coverLetter.jobDescription.trim().length;
    const busy = status !== "idle";

    const update = (patch: Partial<CoverLetterDraft>) => {
        setCoverLetter((previous) => ({ ...previous, ...patch }));
        setNotice(null);
    };

    /** Stream a letter into the editor as it's written; resolves with the final text. */
    const streamLetter = (draft: CoverLetterDraft) => {
        setCoverLetter((previous) => ({ ...previous, letter: "", source: "" }));
        return streamCoverLetter(API_URL, renderableData, draft, {
            onDelta: (text) => setCoverLetter((previous) => ({ ...previous, letter: previous.letter + text })),
            onReset: () => setCoverLetter((previous) => ({ ...previous, letter: "" })),
        });
    };

    const generate = async (fromCvOnly: boolean) => {
        if (!hasCvContent) {
            setNotice({ tone: "error", text: "Add your profile, skills or experience first so the letter has real material to use." });
            return;
        }
        const targetRole = coverLetter.targetRole.trim() || (fromCvOnly ? inferTargetRole(cvData, "") : "");
        if (!targetRole) {
            setNotice({ tone: "error", text: "Add the job title you're applying for." });
            return;
        }
        if (!fromCvOnly && jobDescriptionLength < 40) {
            setNotice({ tone: "error", text: "Paste the job ad (at least a few sentences) so the letter can match it, or use Draft from CV only." });
            return;
        }

        const draft: CoverLetterDraft = {
            ...coverLetter,
            targetRole,
            length,
            highlights,
            jobDescription: jobDescriptionLength >= 40 ? coverLetter.jobDescription : buildAutoCoverLetterContext(cvData, targetRole),
        };
        setStatus("generating");
        setNotice(null);
        setCoverLetter((previous) => ({ ...previous, targetRole }));
        try {
            const result = await streamLetter(draft);
            setCoverLetter((previous) => ({ ...previous, targetRole, letter: result.letter, source: result.source }));
            if (result.source === "ai") {
                setNotice({ tone: "success", text: "Your letter is ready. Read it through and make it sound like you." });
            } else {
                setNotice({ tone: "success", text: "Drafted from a template because AI isn't available right now. Edit it to add your voice." });
                onTemplateFallback();
            }
        } catch (error) {
            setNotice({ tone: "error", text: error instanceof Error ? error.message : "Couldn't write the letter. Please try again." });
        } finally {
            setStatus("idle");
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(coverLetter.letter);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setNotice({ tone: "error", text: "Couldn't copy. Select the text and copy it manually." });
        }
    };

    const download = async () => {
        if (!coverLetter.targetRole.trim() || jobDescriptionLength < 40) {
            setNotice({ tone: "error", text: "Add the job title and job ad before downloading." });
            return;
        }
        setStatus("exporting");
        setNotice(null);
        try {
            await downloadCoverLetterPDF(API_URL, renderableData, { ...coverLetter, length, highlights }, designSettings);
        } catch (error) {
            setNotice({ tone: "error", text: error instanceof Error ? error.message : "Couldn't create the PDF." });
        } finally {
            setStatus("idle");
        }
    };

    const hasLetter = Boolean(coverLetter.letter.trim());
    const contact = [cvData.email, cvData.phone, cvData.location].filter(Boolean).join("  ·  ");

    return (
        <div className={`animate-fade ${styles.root}`}>
            <SectionHeading
                eyebrow="Cover letter"
                title="Write a letter for this job"
                description="Paste the job ad, pick a tone and length, and get a letter written from your CV. Edit anything before you download it."
            />

            <Card title="The job" description="The more of the job ad you paste, the better the letter matches it." className={editorStyles.formCard}>
                <div className={styles.jobGrid}>
                    <Field label="Job title" required>
                        <input className="form-input" placeholder="Senior Full-Stack Engineer" value={coverLetter.targetRole} onChange={(event) => update({ targetRole: event.target.value })} />
                    </Field>
                    <Field label="Company" optional>
                        <input className="form-input" placeholder="Northwind" value={coverLetter.company} onChange={(event) => update({ company: event.target.value })} />
                    </Field>
                    <Field label="Hiring manager" optional hint="A name gets more replies than “Hiring Team”.">
                        <input className="form-input" placeholder="Priya Shah" value={coverLetter.hiringManager} onChange={(event) => update({ hiringManager: event.target.value })} />
                    </Field>
                </div>
                <Field
                    label="Job ad"
                    hint={jobDescriptionLength >= 40 ? `${check.keywords.length} key terms found` : "Paste the responsibilities and requirements"}
                    aside={<CharCounter length={jobDescriptionLength} recommended={4000} max={12000} />}
                >
                    <textarea
                        className="form-textarea"
                        rows={6}
                        maxLength={12000}
                        placeholder="Paste the job description here..."
                        value={coverLetter.jobDescription}
                        onChange={(event) => update({ jobDescription: event.target.value })}
                    />
                </Field>
            </Card>

            <Card title="Style" className={editorStyles.formCard}>
                <div className={styles.styleRow}>
                    <div>
                        <span className="form-label" id="letter-tone-label">Tone</span>
                        <div className={styles.choices} role="radiogroup" aria-labelledby="letter-tone-label">
                            {TONES.map((tone) => (
                                <button
                                    key={tone.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={coverLetter.tone === tone.value}
                                    className={`${styles.choice} ${coverLetter.tone === tone.value ? styles.choiceActive : ""}`}
                                    onClick={() => update({ tone: tone.value })}
                                    title={tone.hint}
                                >
                                    {tone.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <span className="form-label" id="letter-length-label">Length</span>
                        <div className={styles.choices} role="radiogroup" aria-labelledby="letter-length-label">
                            {(Object.keys(LETTER_LENGTHS) as LetterLength[]).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="radio"
                                    aria-checked={length === key}
                                    className={`${styles.choice} ${length === key ? styles.choiceActive : ""}`}
                                    onClick={() => update({ length: key })}
                                >
                                    {LETTER_LENGTHS[key].label}
                                    <span className={styles.choiceMeta}>~{Math.round((LETTER_LENGTHS[key].min + LETTER_LENGTHS[key].max) / 2 / 10) * 10}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <Field label="What should it highlight?" optional hint="For example, why you want this company, or a project you're proud of." aside={<CharCounter length={highlights.length} recommended={400} max={1000} />}>
                    <textarea
                        className="form-textarea"
                        rows={3}
                        maxLength={1000}
                        placeholder="I've used Northwind as a seller for three years and..."
                        value={highlights}
                        onChange={(event) => update({ highlights: event.target.value })}
                    />
                </Field>
                <div className={styles.generateRow}>
                    <Button variant="primary" icon={<PenLine size={16} />} loading={status === "generating"} disabled={busy} onClick={() => generate(false)}>
                        {status === "generating" ? "Writing..." : hasLetter ? "Rewrite letter" : "Write my letter"}
                    </Button>
                    <Button variant="ghost" icon={<FileText size={16} />} disabled={busy} onClick={() => generate(true)} title="Write a general letter from your CV without a job ad">
                        Draft from CV only
                    </Button>
                </div>
                {notice && (
                    <div className={`${editorStyles.notice} ${editorStyles[`notice_${notice.tone}`]}`} role={notice.tone === "error" ? "alert" : "status"}>
                        <span>{notice.text}</span>
                        <button type="button" className={editorStyles.noticeClose} onClick={() => setNotice(null)} aria-label="Dismiss message">
                            <X size={14} />
                        </button>
                    </div>
                )}
            </Card>

            <div className={styles.letterLayout}>
                <section className={styles.paperCard} aria-label="Your letter">
                    <div className={styles.paperToolbar}>
                        <div className={styles.paperTitle}>
                            <strong>Your letter</strong>
                            {coverLetter.source === "ai" && <Badge tone="accent">AI written</Badge>}
                            {coverLetter.source === "template" && <Badge>Template</Badge>}
                            <span className={styles.wordCount}>{check.words} words</span>
                        </div>
                        <div className={styles.paperActions}>
                            <Button size="sm" variant="secondary" icon={copied ? <Check size={14} /> : <Copy size={14} />} disabled={!hasLetter} onClick={copy}>
                                {copied ? "Copied" : "Copy"}
                            </Button>
                            <Button size="sm" variant="primary" icon={<Download size={14} />} loading={status === "exporting"} disabled={!hasLetter || busy} onClick={download}>
                                Download PDF
                            </Button>
                        </div>
                    </div>
                    <div className={styles.paper}>
                        <div className={styles.paperHeader} style={{ borderColor: designSettings.primaryColor }}>
                            <strong style={{ color: designSettings.primaryColor }}>{cvData.name || "Your name"}</strong>
                            {cvData.headline && <span className={styles.paperHeadline} style={{ color: designSettings.primaryColor }}>{cvData.headline}</span>}
                            <span>{contact || "Contact details from your CV"}</span>
                        </div>
                        <textarea
                            className={styles.paperText}
                            aria-label="Letter text"
                            placeholder={"Your letter will appear here as it's written.\n\nYou can also type or paste your own and use the checks alongside to improve it."}
                            value={coverLetter.letter}
                            onChange={(event) => update({ letter: event.target.value, source: coverLetter.source || "template" })}
                        />
                    </div>
                    <p className={styles.paperNote}>The PDF uses your CV&apos;s font and accent colour and fits on one page.</p>
                </section>

                <Card
                    title="Letter check"
                    description={hasLetter ? `${passed} of ${check.items.length} looking good` : "Checks appear once there's a letter."}
                    className={styles.checkCard}
                >
                    {hasLetter && (
                        <ul className={styles.checkList}>
                            {check.items.map((item) => (
                                <li key={item.id} className={styles.checkItem} data-status={item.status}>
                                    <span className={styles.checkIcon} aria-hidden="true">
                                        {item.status === "pass" ? <Check size={13} strokeWidth={3} /> : <TriangleAlert size={13} />}
                                    </span>
                                    <span>
                                        <strong>{item.label}</strong>
                                        <span className={styles.checkDetail}>{item.detail}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {check.keywords.length > 0 && (
                        <div className={styles.keywords}>
                            <span className="form-label">Key terms from the job ad</span>
                            <div className={styles.keywordList}>
                                {check.keywords.map((keyword) => (
                                    <span key={keyword.term} className={styles.keyword} data-found={hasLetter && keyword.found ? "true" : "false"}>
                                        {hasLetter && keyword.found && <Check size={11} strokeWidth={3} aria-label="Used" />}
                                        {keyword.term}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
