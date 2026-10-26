"use client";

import { useEffect, useState, type SetStateAction } from "react";
import { Check, CircleAlert, Plus, Sparkles, Target, Wand2, X } from "lucide-react";
import editorStyles from "@/app/editor/editor.module.css";
import styles from "./JobMatch.module.css";
import { CoverLetterDraft, CVData, getEmptyEntry, getString, getStringList } from "@/lib/cvBuilder";
import { ApiError } from "@/lib/api/client";
import {
  requestJobMatch,
  requestTailoredBullets,
  type BulletHint,
  type BulletSuggestion,
  type JobMatchResult,
  type KeywordMatch,
} from "@/lib/jobApi";
import { diffWords } from "@/lib/wordDiff";

interface JobMatchSectionProps {
  cvData: CVData;
  setCVData: (action: SetStateAction<CVData>) => void;
  /** The target job lives on the cover letter draft so both features share it. */
  coverLetter: CoverLetterDraft;
  setCoverLetter: (update: (previous: CoverLetterDraft) => CoverLetterDraft) => void;
  onOpenSection: (sectionId: string) => void;
}

type Category = KeywordMatch["category"];

const SKILL_ROW: Partial<Record<Category, { label: string; matches: string[] }>> = {
  language: { label: "Languages", matches: ["language"] },
  framework: { label: "Frameworks & Libraries", matches: ["framework", "librar"] },
  data: { label: "Databases & Data", matches: ["data"] },
  cloud: { label: "Cloud & DevOps", matches: ["cloud", "devops", "infra"] },
  devops: { label: "Cloud & DevOps", matches: ["devops", "cloud", "infra"] },
  ai: { label: "AI & ML", matches: ["ai", "ml", "machine"] },
  tool: { label: "Tools", matches: ["tool"] },
};

const SECTION_LABEL: Record<string, string> = {
  summary: "Summary",
  headline: "Headline",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  other: "Other",
};

const IMPORTANCE_LABEL: Record<KeywordMatch["importance"], string> = {
  required: "Required",
  core: "Mentioned",
  preferred: "Nice to have",
};

const MIN_JOB_LENGTH = 40;

function scoreTone(score: number): { label: string; className: string } {
  if (score >= 75) return { label: "Strong match", className: styles.toneStrong };
  if (score >= 50) return { label: "Good start", className: styles.toneGood };
  return { label: "Needs work", className: styles.toneWeak };
}

function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  return (
    <div className={`${styles.ring} ${tone.className}`} role="img" aria-label={`Job match score ${score} out of 100: ${tone.label}`}>
      <svg viewBox="0 0 100 100" width="104" height="104" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className={styles.ringTrack} />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={styles.ringValue}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className={styles.ringLabel}>
        <strong>{score}</strong>
        <span>{tone.label}</span>
      </div>
    </div>
  );
}

export function JobMatchSection({ cvData, setCVData, coverLetter, setCoverLetter, onOpenSection }: JobMatchSectionProps) {
  const [match, setMatch] = useState<JobMatchResult | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tailor, setTailor] = useState<{ suggestions: BulletSuggestion[]; hints: BulletHint[]; message: string; source: string } | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [staleKeys, setStaleKeys] = useState<Set<string>>(new Set());

  const jobDescription = coverLetter.jobDescription;
  const hasJob = jobDescription.trim().length >= MIN_JOB_LENGTH;

  // Re-analyse shortly after the job post or the CV changes.
  useEffect(() => {
    if (!hasJob) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        setMatch(await requestJobMatch(cvData, jobDescription, coverLetter.targetRole, controller.signal));
        setMatchError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setMatchError(error instanceof ApiError ? error.message : "Couldn't analyse the job post.");
      } finally {
        if (!controller.signal.aborted) setIsAnalyzing(false);
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [coverLetter.targetRole, cvData, hasJob, jobDescription]);

  const updateTarget = (patch: Partial<CoverLetterDraft>) => setCoverLetter((previous) => ({ ...previous, ...patch }));

  const addToSkills = (item: KeywordMatch) => {
    const row = SKILL_ROW[item.category];
    if (!row) return;
    setCVData((previous) => {
      const skills = [...previous.skills];
      const index = skills.findIndex((skill) => row.matches.some((needle) => getString(skill.label).toLowerCase().includes(needle)));
      if (index === -1) {
        skills.push({ ...getEmptyEntry("skills"), label: row.label, details: item.keyword });
      } else {
        const details = getString(skills[index].details);
        const existing = details.split(/[,;]/).map((part) => part.trim().toLowerCase());
        if (!existing.includes(item.keyword.toLowerCase())) {
          skills[index] = { ...skills[index], details: details.trim() ? `${details.trim()}, ${item.keyword}` : item.keyword };
        }
      }
      return { ...previous, skills };
    });
  };

  const runTailor = async () => {
    setIsTailoring(true);
    setTailorError(null);
    setStaleKeys(new Set());
    try {
      const keywords = (match?.missing ?? []).map((item) => item.keyword);
      const result = await requestTailoredBullets(cvData, jobDescription, keywords);
      setTailor({
        suggestions: result.suggestions ?? [],
        hints: result.hints ?? [],
        message: result.message ?? "",
        source: result.source,
      });
    } catch (error) {
      setTailorError(error instanceof ApiError ? error.message : "Couldn't tailor bullets.");
    } finally {
      setIsTailoring(false);
    }
  };

  const keyOf = (item: { section: string; entry_index: number; bullet_index: number }) =>
    `${item.section}:${item.entry_index}:${item.bullet_index}`;

  const dismiss = (item: BulletSuggestion) =>
    setTailor((current) => current && { ...current, suggestions: current.suggestions.filter((other) => keyOf(other) !== keyOf(item)) });

  const accept = (item: BulletSuggestion) => {
    const entry = cvData[item.section][item.entry_index];
    const highlights = entry ? getStringList(entry.highlights) : [];
    if (highlights[item.bullet_index] !== item.original) {
      // The bullet was edited since the suggestion was made.
      setStaleKeys((current) => new Set(current).add(keyOf(item)));
      return;
    }
    setCVData((previous) => {
      const list = [...previous[item.section]];
      const next = [...getStringList(list[item.entry_index].highlights)];
      next[item.bullet_index] = item.suggestion;
      list[item.entry_index] = { ...list[item.entry_index], highlights: next };
      return { ...previous, [item.section]: list };
    });
    dismiss(item);
  };

  const entryTitle = (section: "experience" | "projects", index: number) => {
    const entry = cvData[section][index];
    if (!entry) return section === "experience" ? `Role ${index + 1}` : `Project ${index + 1}`;
    return section === "experience"
      ? [getString(entry.position), getString(entry.company)].filter(Boolean).join(" at ") || `Role ${index + 1}`
      : getString(entry.name) || `Project ${index + 1}`;
  };

  const missingTechnical = (match?.missing ?? []).filter((item) => SKILL_ROW[item.category]);
  const missingOther = (match?.missing ?? []).filter((item) => !SKILL_ROW[item.category]);

  return (
    <div className="animate-fade">
      <h1 className={editorStyles.sectionTitle}>Match a job.</h1>
      <p className={styles.lead}>
        Paste a job post to see which of its keywords your CV covers, what&apos;s missing, and where to add it. The same
        job powers your cover letter.
      </p>

      <div className={styles.targetCard}>
        <div className={editorStyles.twoColumnGrid}>
          <div className="form-group">
            <label className="form-label" htmlFor="job-role">Target role</label>
            <input
              id="job-role"
              className="form-input"
              placeholder="e.g. Senior Backend Engineer"
              value={coverLetter.targetRole}
              onChange={(event) => updateTarget({ targetRole: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="job-company">Company</label>
            <input
              id="job-company"
              className="form-input"
              placeholder="e.g. Northstar Labs"
              value={coverLetter.company}
              onChange={(event) => updateTarget({ company: event.target.value })}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="job-post">Job post</label>
          <textarea
            id="job-post"
            className="form-textarea"
            rows={8}
            placeholder="Paste the full job description, including requirements and nice-to-haves..."
            value={jobDescription}
            onChange={(event) => updateTarget({ jobDescription: event.target.value })}
          />
          <span className={styles.hint}>
            {hasJob ? `${jobDescription.trim().length} characters` : `Paste at least ${MIN_JOB_LENGTH} characters to analyse`}
          </span>
        </div>
      </div>

      {matchError && <p className={styles.error} role="alert">{matchError}</p>}

      {hasJob && match && (
        <>
          <div className={styles.scoreCard} aria-busy={isAnalyzing}>
            <ScoreRing score={match.score} />
            <div className={styles.scoreText}>
              <span className={styles.eyebrow}>
                <Target size={13} /> {match.target_title || "Job match"}
              </span>
              <p>{match.summary}</p>
              <div className={styles.facts}>
                <span className={match.title_match ? styles.factGood : styles.factWarn}>
                  {match.title_match ? <Check size={12} /> : <CircleAlert size={12} />}
                  {match.title_match ? "Title matches your headline" : "Title not in your headline or roles"}
                </span>
                {match.years_required != null && <span className={styles.fact}>{match.years_required}+ years asked</span>}
                <span className={styles.fact}>
                  {match.matched.length} matched · {match.missing.length} missing
                </span>
              </div>
            </div>
          </div>

          {missingTechnical.length > 0 && (
            <section className={styles.block}>
              <h2>Missing skills</h2>
              <p className={styles.blockHint}>Only add skills you genuinely have. Each one goes to the matching Skills row.</p>
              <ul className={styles.keywordList}>
                {missingTechnical.map((item) => (
                  <li key={item.keyword} className={styles.keywordRow}>
                    <span className={`${styles.chip} ${styles[`chip_${item.importance}`]}`}>{item.keyword}</span>
                    <span className={styles.importance}>{IMPORTANCE_LABEL[item.importance]}</span>
                    <button type="button" className={styles.addBtn} onClick={() => addToSkills(item)}>
                      <Plus size={13} /> I have this
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {missingOther.length > 0 && (
            <section className={styles.block}>
              <h2>Show these with evidence</h2>
              <ul className={styles.adviceList}>
                {missingOther.map((item) => (
                  <li key={item.keyword}>
                    <span className={`${styles.chip} ${styles[`chip_${item.importance}`]}`}>{item.keyword}</span>
                    <span>{item.suggestion}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {match.matched.length > 0 && (
            <section className={styles.block}>
              <h2>Already covered</h2>
              <div className={styles.chipCloud}>
                {match.matched.map((item) => (
                  <span
                    key={item.keyword}
                    className={`${styles.chip} ${styles.chipMatched}`}
                    title={`Found in ${(item.found_in ?? []).map((section) => SECTION_LABEL[section]).join(", ")}`}
                  >
                    <Check size={12} /> {item.keyword}
                    <small>{(item.found_in ?? []).map((section) => SECTION_LABEL[section]).join(" · ")}</small>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <div>
                <h2>Tailor your bullets</h2>
                <p className={styles.blockHint}>Reword experience and project bullets toward this job. You review every change.</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={runTailor} disabled={isTailoring}>
                <Wand2 size={16} />
                {isTailoring ? "Tailoring..." : tailor ? "Tailor again" : "Tailor bullets"}
              </button>
            </div>

            {tailorError && <p className={styles.error} role="alert">{tailorError}</p>}
            {tailor?.message && <p className={styles.notice}>{tailor.message}</p>}

            {tailor?.suggestions.map((item) => {
              const stale = staleKeys.has(keyOf(item));
              return (
                <div key={keyOf(item)} className={styles.suggestion}>
                  <div className={styles.suggestionMeta}>
                    <span>{entryTitle(item.section, item.entry_index)}</span>
                    {(item.keywords_added ?? []).map((keyword) => (
                      <span key={keyword} className={`${styles.chip} ${styles.chipAdded}`}>
                        <Sparkles size={11} /> {keyword}
                      </span>
                    ))}
                  </div>
                  <p className={styles.diff} aria-label={`Suggested: ${item.suggestion}`}>
                    {diffWords(item.original, item.suggestion).map((part, index) =>
                      part.kind === "same" ? (
                        <span key={index}>{part.text}</span>
                      ) : part.kind === "added" ? (
                        <ins key={index}>{part.text}</ins>
                      ) : (
                        <del key={index}>{part.text}</del>
                      ),
                    )}
                  </p>
                  {stale && <p className={styles.error}>This bullet changed since the suggestion was made. Run tailoring again.</p>}
                  <div className={styles.suggestionActions}>
                    <button type="button" className="btn btn-secondary" onClick={() => dismiss(item)}>
                      <X size={14} /> Reject
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => accept(item)} disabled={stale}>
                      <Check size={14} /> Accept
                    </button>
                  </div>
                </div>
              );
            })}

            {tailor && tailor.suggestions.length === 0 && tailor.hints.length > 0 && (
              <ul className={styles.hintList}>
                {tailor.hints.map((hint) => (
                  <li key={keyOf(hint)}>
                    <div>
                      <small>{entryTitle(hint.section, hint.entry_index)}</small>
                      <p>{hint.original}</p>
                      <span className={styles.hintKeywords}>
                        Could show:{" "}
                        {hint.keywords.map((keyword) => (
                          <span key={keyword} className={styles.chip}>{keyword}</span>
                        ))}
                      </span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => onOpenSection(hint.section)}>
                      Edit bullet
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {hasJob && !match && !matchError && <div className={`skeleton ${styles.scoreSkeleton}`} />}
    </div>
  );
}
