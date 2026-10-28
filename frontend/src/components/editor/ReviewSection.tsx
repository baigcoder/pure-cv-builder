"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { ArrowRight, Check, RotateCw, X } from "lucide-react";
import styles from "./Review.module.css";
import { Button, Card, SectionHeading } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { hasRenderableContent, type CVData, type DesignSettings, type Entry } from "@/lib/cvBuilder";
import { analyzeCV, type CVAnalysis, type CVIssue } from "@/lib/editorApi";
import { diffWords } from "@/lib/wordDiff";

interface ReviewSectionProps {
  /** CV data with incomplete entries removed, as rendered. */
  renderableData: CVData;
  theme: string;
  designSettings: DesignSettings;
  setCVData: (action: SetStateAction<CVData>) => void;
  onOpenSection: (sectionId: string) => void;
}

const SECTION_NAMES: Record<string, string> = {
  profile: "Profile",
  experience: "Work",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  design: "Design",
};

/** Replace one bullet, found by its text so incomplete entries hidden from the render can't shift indexes. */
const applyFix = (cv: CVData, issue: CVIssue): CVData => {
  const section = issue.section as "experience" | "projects";
  const entries = cv[section] as Entry[] | undefined;
  if (!entries) return cv;
  return {
    ...cv,
    [section]: entries.map((entry) => {
      const bullets = Array.isArray(entry.highlights) ? (entry.highlights as string[]) : [];
      const index = bullets.findIndex((bullet) => bullet.trim() === issue.quote);
      if (index === -1) return entry;
      const next = [...bullets];
      next[index] = issue.fix ?? bullets[index];
      return { ...entry, highlights: next };
    }),
  };
};

function IssueRow({ issue, onApply, onOpen, applied }: { issue: CVIssue; onApply: () => void; onOpen: () => void; applied: boolean }) {
  return (
    <li className={styles.issue} data-severity={issue.severity}>
      <span className={styles.dot} aria-label={issue.severity === "low" ? "Suggestion" : "Should fix"} />
      <div className={styles.issueBody}>
        <strong>{issue.message}</strong>
        {issue.detail && <span className={styles.detail}>{issue.detail}</span>}
        {issue.quote && (
          <p className={styles.quote}>
            {issue.fix && !applied
              ? diffWords(issue.quote, issue.fix).map((part, index) =>
                  part.kind === "same" ? <span key={index}>{part.text}</span> : part.kind === "added" ? <ins key={index}>{part.text}</ins> : <del key={index}>{part.text}</del>,
                )
              : (applied && issue.fix) || issue.quote}
          </p>
        )}
      </div>
      <div className={styles.issueActions}>
        {issue.fix && (applied ? (
          <span className={styles.applied}><Check size={13} strokeWidth={3} /> Applied</span>
        ) : (
          <Button size="sm" variant="secondary" onClick={onApply}>Apply fix</Button>
        ))}
        {issue.section && SECTION_NAMES[issue.section] && (
          <button type="button" className={styles.goto} onClick={onOpen}>
            {SECTION_NAMES[issue.section]} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Full CV review: what an ATS reads back, what to fix first, and smaller polish. */
export function ReviewSection({ renderableData, theme, designSettings, setCVData, onOpenSection }: ReviewSectionProps) {
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);
  const [checkedFor, setCheckedFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(() => new Set());
  const controller = useRef<AbortController | null>(null);
  const snapshot = useMemo(() => JSON.stringify([renderableData, theme, designSettings]), [renderableData, theme, designSettings]);

  const run = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeCV({ apiUrl: API_URL, cvData: renderableData, theme, designSettings }, current.signal);
      setAnalysis(result);
      setCheckedFor(snapshot);
      setApplied(new Set());
    } catch (err) {
      if (!current.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't review the CV.");
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [designSettings, renderableData, snapshot, theme]);

  // Check automatically once there's content (the saved draft may load after this
  // section opens); after that the user re-runs it.
  const hasContent = hasRenderableContent(renderableData);
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !hasContent) return;
    autoRan.current = true;
    void run();
  }, [hasContent, run]);

  // Abort only when the section closes, not when the CV data changes underneath it.
  useEffect(
    () => () => {
      controller.current?.abort();
      autoRan.current = false;
    },
    [],
  );

  const issues = analysis?.issues ?? [];
  const toFix = issues.filter((issue) => issue.severity !== "low");
  const polish = issues.filter((issue) => issue.severity === "low");
  const readOk = analysis?.read_back.filter((check) => check.ok).length ?? 0;
  const readTotal = analysis?.read_back.length ?? 0;
  const stale = Boolean(analysis) && checkedFor !== snapshot;

  const apply = (issue: CVIssue) => {
    setCVData((previous) => applyFix(previous, issue));
    setApplied((previous) => new Set(previous).add(issue.id));
  };

  const pageNote = !analysis
    ? ""
    : analysis.page_count === 1
      ? `${Math.round(analysis.last_page_fill * 100)}% of the page used`
      : analysis.last_page_fill < 0.2
        ? "Last page is nearly empty"
        : `Last page ${Math.round(analysis.last_page_fill * 100)}% full`;

  return (
    <div className={`animate-fade ${styles.root}`}>
      <SectionHeading
        eyebrow="Review"
        title="Check your CV"
        description="Folio prints your CV, reads it back the way an applicant tracking system does, and checks the writing. Nothing changes unless you apply a fix."
      />

      <div className={styles.toolbar}>
        <Button variant={stale ? "primary" : "secondary"} icon={<RotateCw size={15} />} loading={loading} disabled={!hasContent} onClick={() => void run()}>
          {analysis ? "Check again" : "Check my CV"}
        </Button>
        {stale && <span className={styles.stale}>Your CV changed since the last check.</span>}
      </div>

      {!hasContent && (
        <p className={styles.empty}>
          Add your profile and at least one section, such as work or education, then check your CV here.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          <X size={14} /> {error}
        </p>
      )}

      {!analysis && loading && (
        <div className={styles.loading} aria-live="polite">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      )}

      {analysis && (
        <>
          <dl className={styles.summary}>
            <div>
              <dt className="label">ATS read-back</dt>
              <dd>
                {readOk}<small>/{readTotal}</small>
              </dd>
              <span>{readOk === readTotal ? "Every field read correctly" : `${readTotal - readOk} not read correctly`}</span>
            </div>
            <div>
              <dt className="label">To fix</dt>
              <dd>{toFix.length}</dd>
              <span>{toFix.length ? "Worth changing before you apply" : "Nothing important"}</span>
            </div>
            <div>
              <dt className="label">Polish</dt>
              <dd>{polish.length}</dd>
              <span>Smaller suggestions</span>
            </div>
            <div>
              <dt className="label">Pages</dt>
              <dd>{analysis.page_count}</dd>
              <span>{pageNote}</span>
            </div>
          </dl>

          {toFix.length > 0 && (
            <Card title="Fix these first" description="Ordered by how much they're likely to cost you." className={styles.card}>
              <ul className={styles.issues}>
                {toFix.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} applied={applied.has(issue.id)} onApply={() => apply(issue)} onOpen={() => onOpenSection(issue.section ?? "")} />
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="What an ATS reads"
            description="Your exported PDF, read back as plain text. Anything marked here may be missed or mangled by an applicant tracking system."
            className={styles.card}
          >
            <table className={styles.readback}>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Your CV</th>
                  <th scope="col">Read back</th>
                  <th scope="col"><span className="sr-only">Status</span></th>
                </tr>
              </thead>
              <tbody>
                {analysis.read_back.map((check) => (
                  <tr key={check.label} data-ok={check.ok ? "true" : "false"}>
                    <th scope="row">{check.label}</th>
                    <td>{check.expected}</td>
                    <td>{check.read || <em>Not found</em>}</td>
                    <td className={styles.status}>{check.ok ? <Check size={14} strokeWidth={3} aria-label="Read correctly" /> : <X size={14} aria-label="Not read correctly" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {polish.length > 0 && (
            <Card title="Polish" description="Smaller things that make the CV read better." className={styles.card}>
              <ul className={styles.issues}>
                {polish.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} applied={applied.has(issue.id)} onApply={() => apply(issue)} onOpen={() => onOpenSection(issue.section ?? "")} />
                ))}
              </ul>
            </Card>
          )}

          {issues.length === 0 && readOk === readTotal && (
            <p className={styles.allClear}>
              <Check size={16} strokeWidth={3} /> No issues found. Spelling isn&apos;t checked here, so give it one last read.
            </p>
          )}
          {issues.length > 0 && <p className={styles.footnote}>Spelling and grammar aren&apos;t checked yet; your browser&apos;s spell-check underlines typos as you type.</p>}
        </>
      )}
    </div>
  );
}
