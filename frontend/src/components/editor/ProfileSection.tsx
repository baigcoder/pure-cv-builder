"use client";

import {  } from "lucide-react";
import styles from "@/app/editor/editor.module.css";
import type { CVData } from "@/lib/cvBuilder";
import { Button, Card, CharCounter, Field, SectionHeading } from "@/components/ui";
import type { AIHelper } from "./types";

interface ProfileSectionProps {
    cvData: CVData;
    onFieldChange: <K extends keyof CVData>(field: K, value: CVData[K]) => void;
    /** Render errors keyed by field (e.g. "phone", "website"). */
    fieldErrors: Record<string, string>;
    ai: AIHelper;
    aiUnavailable: boolean;
}

const HEADLINE_RECOMMENDED = 80;
const SUMMARY_RECOMMENDED = 500;

export function ProfileSection({ cvData, onFieldChange: updateField, fieldErrors, ai, aiUnavailable }: ProfileSectionProps) {
    const improveSummary = async () => {
        if (!cvData.summary.trim() && !cvData.name.trim()) return;
        const suggestion = await ai.suggest(
            cvData.summary || cvData.name,
            cvData.summary ? "summary" : "generate",
            cvData.name
        );
        if (suggestion) updateField("summary", suggestion);
    };

    const suggestHeadline = async () => {
        const suggestion = await ai.suggest(cvData.name, "headline", cvData.summary || cvData.headline);
        if (suggestion) updateField("headline", suggestion);
    };

    return (
        <div className="animate-fade">
            <SectionHeading
                eyebrow="Profile"
                title="Who you are"
                description="Your name, headline and contact details form the top of every template."
            />

            <Card title="Identity" className={styles.formCard}>
                <Field label="Full name" required hint={!cvData.name.trim() ? "Shown as the title of your CV." : undefined}>
                    <input
                        type="text" className="form-input" placeholder="John Doe" autoComplete="name"
                        value={cvData.name} onChange={e => updateField("name", e.target.value)}
                    />
                </Field>
                <Field
                    label="Headline"
                    hint="Your target role and one or two strengths, e.g. “Backend Engineer | Python, AWS”."
                    aside={<CharCounter length={cvData.headline.length} recommended={HEADLINE_RECOMMENDED} />}
                >
                    <input
                        type="text" className="form-input" placeholder="e.g. Senior Software Engineer | ML Expert"
                        value={cvData.headline} onChange={e => updateField("headline", e.target.value)}
                        maxLength={100}
                    />
                </Field>
                <div className={styles.fieldActions}>
                    <Button
                        size="sm"
                        variant="ghost"
                        
                        loading={ai.busy}
                        disabled={!cvData.name.trim()}
                        onClick={suggestHeadline}
                        title={aiUnavailable ? "Generate a local fallback headline" : "Suggest a headline with AI"}
                    >
                        Suggest headline
                    </Button>
                </div>
            </Card>

            <Card title="Contact and links" className={styles.formCard}>
                <div className={styles.twoColumnGrid}>
                    <Field label="Email">
                        <input
                            type="email" className="form-input" placeholder="you@example.com" autoComplete="email"
                            value={cvData.email} onChange={e => updateField("email", e.target.value)}
                        />
                    </Field>
                    <Field label="Phone" error={fieldErrors.phone}>
                        <input
                            type="tel" className="form-input" placeholder="+1 (555) 123-4567" autoComplete="tel"
                            value={cvData.phone} onChange={e => updateField("phone", e.target.value)}
                        />
                    </Field>
                    <Field label="Location">
                        <input
                            type="text" className="form-input" placeholder="City, Country"
                            value={cvData.location} onChange={e => updateField("location", e.target.value)}
                        />
                    </Field>
                    <Field label="Website" error={fieldErrors.website}>
                        <input
                            type="url" className="form-input" placeholder="https://yoursite.com" autoComplete="url"
                            value={cvData.website} onChange={e => updateField("website", e.target.value)}
                        />
                    </Field>
                    <Field label="LinkedIn username">
                        <input
                            type="text" className="form-input" placeholder="yourprofile"
                            value={cvData.linkedin} onChange={e => updateField("linkedin", e.target.value)}
                        />
                    </Field>
                    <Field label="GitHub username">
                        <input
                            type="text" className="form-input" placeholder="yourgithub"
                            value={cvData.github} onChange={e => updateField("github", e.target.value)}
                        />
                    </Field>
                </div>
            </Card>

            <Card title="Professional summary" description="Two or three sentences on what you do and the impact you bring." className={styles.formCard}>
                <Field
                    label="Summary"
                    aside={<CharCounter length={cvData.summary.length} recommended={SUMMARY_RECOMMENDED} max={600} />}
                    error={cvData.summary.length > SUMMARY_RECOMMENDED ? "A little long; aim for 500 characters or fewer." : undefined}
                >
                    <textarea
                        className="form-textarea" placeholder="Describe what you do, for whom, and the results you deliver..."
                        value={cvData.summary} onChange={e => updateField("summary", e.target.value)}
                        rows={5}
                        maxLength={600}
                    />
                </Field>
                <div className={styles.fieldActions}>
                    <Button size="sm" variant="ghost"  loading={ai.busy} onClick={improveSummary}>
                        {cvData.summary.trim() ? "Polish with AI" : "Draft with AI"}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
