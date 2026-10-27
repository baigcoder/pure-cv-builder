"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, FileUp, Lightbulb, RotateCcw } from "lucide-react";
import styles from "./upload.module.css";
import { Wordmark } from "@/components/Brand";
import { TemplateCard } from "@/components/AppUI";
import { Badge, Button } from "@/components/ui";
import { THEME_DATA, getTemplateDesign, recommendTemplate } from "@/lib/themes";
import { extractPDF } from "@/lib/editorApi";
import { API_URL } from "@/lib/config";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { resumesApi, toApiContent } from "@/lib/resumesApi";
import {
  DEFAULT_COVER_LETTER_DRAFT,
  DEFAULT_DESIGN_SETTINGS,
  IMPORTED_CV_STORAGE_KEY,
  normalizeCVData,
  type CVData,
} from "@/lib/cvBuilder";

type UploadState = "idle" | "processing" | "success" | "error";

const STEPS = ["Reading the PDF", "Finding your sections", "Structuring your CV"];

interface ExtractedData {
  cvData: CVData;
  source: "ai" | "heuristic";
  warnings: string[];
  linkedin: boolean;
}

const SECTION_LABELS: [keyof CVData, string][] = [
  ["experience", "Experience"],
  ["education", "Education"],
  ["skills", "Skills"],
  ["projects", "Projects"],
  ["publications", "Publications"],
  ["honors", "Awards"],
  ["patents", "Patents"],
  ["talks", "Talks"],
];

export default function UploadPage() {
  const router = useRouter();
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [selectedTheme, setSelectedTheme] = useState("folio");
  const [fileName, setFileName] = useState("");
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    if (uploadState !== "processing") return;
    const interval = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(interval);
  }, [uploadState]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      setUploadState("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("That file is larger than 10 MB. Try exporting a smaller PDF.");
      setUploadState("error");
      return;
    }

    setFileName(file.name);
    setUploadState("processing");
    setStep(0);
    setError(null);
    try {
      const result = await extractPDF(API_URL, file);
      if (!result.success || !result.cv_data) throw new Error("We couldn't find any CV content in that PDF.");
      const cvData = normalizeCVData(result.cv_data);
      setExtracted({
        cvData,
        source: result.source ?? "heuristic",
        warnings: result.warnings ?? [],
        linkedin: result.detected_format === "linkedin",
      });
      setSelectedTheme(recommendTemplate(cvData).id);
      setUploadState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't read that PDF.");
      setUploadState("error");
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };

  const openInEditor = async () => {
    if (!extracted) return;
    const designSettings = getTemplateDesign(selectedTheme, DEFAULT_DESIGN_SETTINGS);

    // Signed in: save the import to the account and open it there.
    if (auth.user) {
      setIsOpening(true);
      try {
        const name = extracted.cvData.name.trim();
        const created = await resumesApi.create(auth.getAccessToken, {
          title: name ? `${name} CV` : fileName.replace(/\.pdf$/i, "") || "Imported CV",
          source: "import",
          ...toApiContent({ cvData: extracted.cvData, theme: selectedTheme, designSettings, coverLetter: DEFAULT_COVER_LETTER_DRAFT }),
        });
        router.push(`/editor?id=${created.id}`);
        return;
      } catch (err) {
        // Fall back to the browser-draft handoff so the import isn't lost.
        console.warn("Saving the import to the account failed:", err);
        setIsOpening(false);
      }
    }

    const payload = JSON.stringify({ cvData: extracted.cvData, theme: selectedTheme, source: "pdf_upload" });
    // Both storages, so the handoff survives route changes and privacy modes that clear one.
    sessionStorage.setItem(IMPORTED_CV_STORAGE_KEY, payload);
    localStorage.setItem(IMPORTED_CV_STORAGE_KEY, payload);
    router.push(`/editor?theme=${selectedTheme}&import=pdf`);
  };

  const reset = () => {
    setUploadState("idle");
    setError(null);
    setExtracted(null);
    setFileName("");
  };

  const cv = extracted?.cvData;
  const checks = cv
    ? [
        { label: "Name", done: Boolean(cv.name.trim()) },
        { label: "Email", done: Boolean(cv.email.trim()) },
        { label: "Phone", done: Boolean(cv.phone.trim()) },
        { label: "Summary", done: Boolean(cv.summary.trim()) },
        { label: "Experience", done: cv.experience.length > 0 },
        { label: "Skills", done: cv.skills.length > 0 },
      ]
    : [];
  const quality = checks.length ? Math.round((checks.filter((c) => c.done).length / checks.length) * 100) : 0;
  const recommended = cv ? recommendTemplate(cv) : null;
  const templates = recommended
    ? [recommended, ...THEME_DATA.filter((theme) => theme.id !== recommended.id && theme.tags.includes("Signature")), ...THEME_DATA.filter((theme) => theme.id !== recommended.id && theme.tags.includes("Trending"))].slice(0, 8)
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Folio home">
          <Wordmark size={22} />
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle className="btn btn-ghost btn-icon" />
          <Link href="/editor" className="btn btn-secondary">
            Start from scratch
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        {(uploadState === "idle" || uploadState === "error") && (
          <section className={styles.intro}>
            <p className="label">Import</p>
            <h1 className={styles.title}>
              Bring your <em>existing CV.</em>
            </h1>
            <p className={styles.lead}>
              Upload a PDF, or your LinkedIn profile saved as a PDF. Folio reads your roles, dates and skills so you start
              from your own words, then sets them in a template of your choice.
            </p>

            <div
              className={`${styles.drop} ${isDragging ? styles.dropActive : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <span className={styles.dropIcon} aria-hidden="true">
                <FileUp size={26} />
              </span>
              <strong>Drop your PDF here</strong>
              <span className={styles.dropOr}>or</span>
              <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                Choose a file
              </Button>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={onFileSelect} hidden />
              <span className="label">PDF &middot; up to 10 MB &middot; about 15 seconds</span>
            </div>

            {uploadState === "error" && error && (
              <p className={styles.error} role="alert">
                <CircleAlert size={16} /> {error}
              </p>
            )}

            <div className={styles.tip}>
              <Lightbulb size={16} aria-hidden="true" />
              <p>
                <strong>Coming from LinkedIn?</strong> Open your profile, choose <em>More</em> then <em>Save to PDF</em>, and
                upload that file. Folio recognises the format.
              </p>
            </div>
          </section>
        )}

        {uploadState === "processing" && (
          <section className={styles.processing} aria-live="polite">
            <p className="label">{fileName}</p>
            <h1 className={styles.title}>Reading your CV&hellip;</h1>
            <ol className={styles.steps}>
              {STEPS.map((label, index) => (
                <li key={label} data-state={index < step ? "done" : index === step ? "active" : "todo"}>
                  <span className={styles.stepMark} aria-hidden="true">
                    {index < step ? <Check size={13} strokeWidth={3} /> : index === step ? <span className="spinner" /> : null}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </section>
        )}

        {uploadState === "success" && cv && extracted && (
          <section className={styles.result}>
            <div className={styles.resultHead}>
              <div>
                <p className="label">Imported from {fileName}</p>
                <h1 className={styles.title}>Here&apos;s what we found.</h1>
              </div>
              <button type="button" className={styles.textButton} onClick={reset}>
                <RotateCcw size={14} /> Use a different file
              </button>
            </div>

            <div className={styles.resultGrid}>
              <aside className={styles.found}>
                <div className={styles.person}>
                  <strong>{cv.name || "No name found"}</strong>
                  {cv.headline && <span>{cv.headline}</span>}
                  <span className={styles.contact}>{[cv.email, cv.phone, cv.location].filter(Boolean).join(" · ")}</span>
                </div>
                <div className={styles.badges}>
                  {extracted.linkedin && <Badge tone="accent">LinkedIn profile</Badge>}
                  <Badge>{extracted.source === "ai" ? "AI structured" : "Read without AI"}</Badge>
                </div>
                <ul className={styles.sections}>
                  {SECTION_LABELS.map(([key, label]) => {
                    const count = (cv[key] as unknown[]).length;
                    return count ? (
                      <li key={key}>
                        <span>{label}</span>
                        <span className={styles.sectionCount}>{count}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
                <div className={styles.quality}>
                  <div className={styles.qualityTop}>
                    <span className="label">Details found</span>
                    <strong>{checks.filter((c) => c.done).length} of {checks.length}</strong>
                  </div>
                  <div className={styles.qualityTrack}>
                    <span style={{ width: `${quality}%` }} />
                  </div>
                  {checks.some((c) => !c.done) && (
                    <p className={styles.missing}>
                      Add in the editor: {checks.filter((c) => !c.done).map((c) => c.label.toLowerCase()).join(", ")}.
                    </p>
                  )}
                </div>
                {extracted.warnings.length > 0 && (
                  <ul className={styles.warnings}>
                    {extracted.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </aside>

              <div className={styles.choose}>
                <h2 className={styles.chooseTitle}>Pick a template</h2>
                <p className={styles.chooseLead}>You can switch any time in the editor.</p>
                <div className={styles.templateGrid}>
                  {templates.map((theme) => (
                    <TemplateCard
                      key={theme.id}
                      name={theme.name}
                      image={theme.image}
                      tags={theme.tags}
                      badge={theme.id === recommended?.id ? "Suggested" : undefined}
                      selected={selectedTheme === theme.id}
                      onClick={() => setSelectedTheme(theme.id)}
                    />
                  ))}
                </div>
                <div className={styles.openRow}>
                  <Button variant="primary" size="lg" loading={isOpening} onClick={openInEditor}>
                    {auth.user ? "Save and open in the editor" : "Open in the editor"} <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
