"use client";

import styles from "@/app/editor/editor.module.css";
import type { CVData } from "@/lib/cvBuilder";
import type { AIHelper } from "./types";

interface ProfileSectionProps {
    cvData: CVData;
    onFieldChange: <K extends keyof CVData>(field: K, value: CVData[K]) => void;
    /** Render errors keyed by field (e.g. "phone", "website"). */
    fieldErrors: Record<string, string>;
    ai: AIHelper;
    aiUnavailable: boolean;
}

export function ProfileSection({ cvData, onFieldChange: updateField, fieldErrors, ai, aiUnavailable: isAIUnavailable }: ProfileSectionProps) {
    const getAISuggestion = ai.suggest;
    const isAISuggesting = ai.busy;

    const improveSummary = async () => {
        if (!cvData.summary.trim() && !cvData.name.trim()) return;
        const suggestion = await getAISuggestion(
            cvData.summary || cvData.name,
            cvData.summary ? "summary" : "generate",
            cvData.name
        );
        if (suggestion) updateField("summary", suggestion);
    };

    return (
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
    );
}
