"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileCheck2, FileText, Home, LayoutTemplate, LockKeyhole, PenLine, ScanText, ShieldCheck, Timer, Upload } from "lucide-react";
import styles from "./upload.module.css";
import { Logo } from "@/components/Brand";
import { StatusBanner, TemplateCard } from "@/components/AppUI";
import { THEME_DATA } from "@/lib/themes";
import { extractPDF } from "@/lib/editorApi";
import {
  IMPORTED_CV_STORAGE_KEY,
  normalizeCVData,
  type CVData,
} from "@/lib/cvBuilder";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type UploadState = "idle" | "processing" | "success" | "error";

const trustItems = [
  { label: "Input control", value: "PDF only", icon: <ShieldCheck size={16} /> },
  { label: "Upload ceiling", value: "10MB", icon: <FileCheck2 size={16} /> },
  { label: "Parse window", value: "10-20s", icon: <Timer size={16} /> },
];

const workflowItems = [
  { title: "Ingest", text: "Drop in the current resume PDF.", icon: <Upload size={18} /> },
  { title: "Normalize", text: "Convert detected content into editable CV fields.", icon: <ScanText size={18} /> },
  { title: "Deploy", text: "Open the live editor with the selected template.", icon: <LayoutTemplate size={18} /> },
];

interface ExtractedData {
  cvData: CVData;
  rawTextLength: number;
  message: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedTheme, setSelectedTheme] = useState("classic");
  const [fileName, setFileName] = useState<string>("");

  // Animate processing steps
  useEffect(() => {
    if (uploadState !== "processing") return;
    const steps = [0, 1, 2];
    let current = 0;
    const interval = setInterval(() => {
      current++;
      if (current < steps.length) {
        setProcessingStep(current);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [uploadState]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      setUploadState("error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large. Maximum size is 10MB.");
      setUploadState("error");
      return;
    }

    setFileName(file.name);
    setUploadState("processing");
    setProcessingStep(0);
    setError(null);

    try {
      const result = await extractPDF(API_URL, file);

      if (result.success && result.cv_data) {
        const normalizedCVData = normalizeCVData(result.cv_data);
        setExtractedData({
          cvData: normalizedCVData,
          rawTextLength: result.raw_text_length,
          message: result.message,
        });
        setUploadState("success");
      } else {
        throw new Error("Extraction returned no data");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to extract data from PDF";
      setError(message);
      setUploadState("error");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [processFile]);

  const handleUseTemplate = () => {
    if (!extractedData) return;

    const importPayload = JSON.stringify({
      cvData: extractedData.cvData,
      theme: selectedTheme,
      source: "pdf_upload",
    });

    // Store in both locations so the handoff survives Next.js route changes,
    // reloads, and browser privacy modes that clear one storage type.
    sessionStorage.setItem(IMPORTED_CV_STORAGE_KEY, importPayload);
    localStorage.setItem(IMPORTED_CV_STORAGE_KEY, importPayload);

    router.push(`/editor?theme=${selectedTheme}&import=pdf`);
  };

  const resetUpload = () => {
    setUploadState("idle");
    setError(null);
    setExtractedData(null);
    setFileName("");
    setProcessingStep(0);
  };

  const countExtractedSections = (): { label: string; count: number }[] => {
    if (!extractedData) return [];
    const cv = extractedData.cvData;
    const sections = [];
    if (cv.experience?.length) sections.push({ label: "Experience", count: cv.experience.length });
    if (cv.education?.length) sections.push({ label: "Education", count: cv.education.length });
    if (cv.skills?.length) sections.push({ label: "Skills", count: cv.skills.length });
    if (cv.projects?.length) sections.push({ label: "Projects", count: cv.projects.length });
    if (cv.publications?.length) sections.push({ label: "Publications", count: cv.publications.length });
    if (cv.honors?.length) sections.push({ label: "Awards", count: cv.honors.length });
    if (cv.patents?.length) sections.push({ label: "Patents", count: cv.patents.length });
    if (cv.talks?.length) sections.push({ label: "Talks", count: cv.talks.length });
    return sections;
  };

  const getExtractionQuality = () => {
    if (!extractedData) {
      return { score: 0, label: "Waiting for PDF", missing: [] as string[] };
    }

    const cv = extractedData.cvData;
    const checks = [
      { label: "Name", done: Boolean(cv.name.trim()) },
      { label: "Email", done: Boolean(cv.email.trim()) },
      { label: "Phone", done: Boolean(cv.phone.trim()) },
      { label: "Summary", done: Boolean(cv.summary.trim()) },
      { label: "Experience", done: cv.experience.length > 0 },
      { label: "Skills", done: cv.skills.length > 0 },
    ];
    const passed = checks.filter((check) => check.done).length;
    const score = Math.round((passed / checks.length) * 100);
    const missing = checks.filter((check) => !check.done).map((check) => check.label);
    const label = score >= 80 ? "Strong extraction" : score >= 50 ? "Review recommended" : "Manual cleanup needed";
    return { score, label, missing };
  };

  const extractionQuality = getExtractionQuality();

  return (
    <div className={styles.uploadPage}>
      <header className={styles.header}>
        <Link href="/" className={styles.headerLeft}>
          <Logo width={28} height={28} />
          <span>ApplyForge</span>
        </Link>
        <div className={styles.headerActions}>
          <Link href="/editor" className="btn btn-secondary">
            <PenLine size={16} />
            Manual Editor
          </Link>
          <Link href="/" className="btn btn-secondary">
            <Home size={16} />
            Home
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.heroSection}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTag}>
              <ScanText size={14} />
              Resume ingest console
            </div>
            <h1 className={styles.heroTitle}>
              Convert a PDF resume into an editable application workspace.
            </h1>
            <p className={styles.heroSubtitle}>
              Extract readable content, audit the detected sections, then route
              the structured CV into ApplyForge with your selected RenderCV template.
            </p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.heroPrimary}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={18} />
                Choose PDF
              </button>
              <Link href="/editor" className={styles.heroSecondary}>
                <PenLine size={18} />
                Start Manually
              </Link>
            </div>
          </div>

          <aside className={styles.heroPanel} aria-label="Upload requirements">
            <div className={styles.panelHeader}>
              <span className={styles.panelEyebrow}>Import readiness</span>
              <strong>Built for editable output</strong>
            </div>
            <div className={styles.trustGrid}>
              {trustItems.map((item) => (
                <div key={item.label} className={styles.trustItem}>
                  <span>{item.icon}</span>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className={styles.securityNote}>
              <LockKeyhole size={16} />
              Files are parsed into structured CV fields before they enter the editor.
            </div>
          </aside>
        </section>

        {/* Upload State: Idle */}
        {uploadState === "idle" && (
          <>
            <div className={styles.uploadWorkspace}>
              <div
                className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />

                <div className={styles.dropZoneIcon}>
                  <Upload size={32} />
                </div>

                <h3 className={styles.dropZoneTitle}>
                  {isDragging ? "Drop the resume PDF" : "Drag and drop a resume PDF"}
                </h3>
                <p className={styles.dropZoneSubtitle}>
                  ApplyForge will preserve the extracted data, selected template, and editor handoff.
                </p>

                <button
                  type="button"
                  className={styles.browseBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload size={16} />
                  Choose PDF File
                </button>

                <div className={styles.dropZoneFormats}>
                  <span><FileText size={13} /> PDF only</span>
                  <span>Max 10MB</span>
                  <span><ShieldCheck size={13} /> Structured extraction</span>
                </div>
              </div>

              <aside className={styles.workflowCard}>
                <span className={styles.panelEyebrow}>Workflow</span>
                <h2>Import pipeline</h2>
                <div className={styles.workflowList}>
                  {workflowItems.map((item, index) => (
                    <div key={item.title} className={styles.workflowItem}>
                      <span className={styles.workflowIcon}>{item.icon}</span>
                      <div>
                        <strong>{index + 1}. {item.title}</strong>
                        <p>{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.templatePreviewStrip}>
                  {THEME_DATA.slice(0, 3).map((theme) => (
                    <img key={theme.id} src={theme.image} alt={`${theme.name} preview`} />
                  ))}
                </div>
              </aside>
            </div>

            <div className={styles.infoCards}>
              {workflowItems.map((item) => (
                <div key={item.title} className={styles.infoCard}>
                  <div className={styles.infoCardIcon}>{item.icon}</div>
                  <div className={styles.infoCardTitle}>{item.title}</div>
                  <div className={styles.infoCardDesc}>{item.text}</div>
                </div>
              ))}
              </div>
          </>
        )}

        {/* Upload State: Processing */}
        {uploadState === "processing" && (
          <div className={styles.processingCard}>
            <div className={styles.processingSpinner} />
            <h2 className={styles.processingTitle}>Running document extraction...</h2>
            <p className={styles.processingSubtitle}>
              {fileName && <><strong>{fileName}</strong> — </>}
              This usually takes 10-20 seconds
            </p>

            <div className={styles.progressSteps}>
              <div className={`${styles.progressStep} ${processingStep >= 0 ? styles.active : ""} ${processingStep > 0 ? styles.done : ""}`}>
                <div className={styles.stepDot}>
                  {processingStep > 0 ? "✓" : "1"}
                </div>
                <span>Reading PDF text layer</span>
              </div>
              <div className={`${styles.progressStep} ${processingStep >= 1 ? styles.active : ""} ${processingStep > 1 ? styles.done : ""}`}>
                <div className={styles.stepDot}>
                  {processingStep > 1 ? "✓" : "2"}
                </div>
                <span>Detecting profile, skills, projects, and education</span>
              </div>
              <div className={`${styles.progressStep} ${processingStep >= 2 ? styles.active : ""}`}>
                <div className={styles.stepDot}>3</div>
                <span>Preparing editable ApplyForge data</span>
              </div>
            </div>
          </div>
        )}

        {/* Upload State: Error */}
        {uploadState === "error" && (
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}><AlertTriangle size={24} /></div>
            <h2 className={styles.errorTitle}>Extraction failed</h2>
            <p className={styles.errorMessage}>{error}</p>
            <div className={styles.errorActions}>
              <button onClick={resetUpload} className="btn btn-secondary">
                <ArrowLeft size={16} /> Try Again
              </button>
              <Link href="/editor" className="btn btn-primary">
                Enter Manually
              </Link>
            </div>
          </div>
        )}

        {/* Upload State: Success */}
        {uploadState === "success" && extractedData && (
          <div className={styles.successCard}>
            {/* Success Header */}
            <div className={styles.successHeader}>
              <div className={styles.successHeaderLeft}>
                <div className={styles.successIcon}><CheckCircle2 size={22} /></div>
                <div>
                  <div className={styles.successTitle}>
                    {extractedData.cvData.name || "Resume Data Extracted"}
                  </div>
                  <div className={styles.successSubtitle}>
                    {extractedData.rawTextLength.toLocaleString()} characters extracted from {fileName}
                  </div>
                </div>
              </div>
              <button onClick={resetUpload} className="btn btn-secondary">
                Upload Different
              </button>
            </div>

            <div className={styles.qualityPanel}>
              <StatusBanner
                tone={extractionQuality.score >= 80 ? "success" : extractionQuality.score >= 50 ? "warning" : "info"}
                title={`${extractionQuality.label} (${extractionQuality.score}%)`}
              >
                {extractionQuality.missing.length
                  ? `Review or add: ${extractionQuality.missing.join(", ")}.`
                  : "Core profile fields and resume sections were detected."}
              </StatusBanner>
            </div>

            {/* Extracted Data Preview */}
            <div className={styles.extractedPreview}>
              {/* Personal Info */}
              <div className={styles.extractedSection}>
                <div className={styles.extractedSectionTitle}>Personal Information</div>
                <div className={styles.extractedGrid}>
                  {extractedData.cvData.name && (
                    <div className={styles.extractedField}>
                      <div className={styles.extractedFieldLabel}>Name</div>
                      <div className={styles.extractedFieldValue}>{extractedData.cvData.name}</div>
                    </div>
                  )}
                  {extractedData.cvData.email && (
                    <div className={styles.extractedField}>
                      <div className={styles.extractedFieldLabel}>Email</div>
                      <div className={styles.extractedFieldValue}>{extractedData.cvData.email}</div>
                    </div>
                  )}
                  {extractedData.cvData.phone && (
                    <div className={styles.extractedField}>
                      <div className={styles.extractedFieldLabel}>Phone</div>
                      <div className={styles.extractedFieldValue}>{extractedData.cvData.phone}</div>
                    </div>
                  )}
                  {extractedData.cvData.location && (
                    <div className={styles.extractedField}>
                      <div className={styles.extractedFieldLabel}>Location</div>
                      <div className={styles.extractedFieldValue}>{extractedData.cvData.location}</div>
                    </div>
                  )}
                  {extractedData.cvData.headline && (
                    <div className={`${styles.extractedField} ${styles.extractedFieldWide}`}>
                      <div className={styles.extractedFieldLabel}>Headline</div>
                      <div className={styles.extractedFieldValue}>{extractedData.cvData.headline}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Extracted Sections Summary */}
              <div className={styles.extractedSection}>
                <div className={styles.extractedSectionTitle}>Extracted Sections</div>
                <div className={styles.badgeRow}>
                  {countExtractedSections().map(({ label, count }) => (
                    <span key={label} className={styles.extractedBadge}>
                      {label}: {count}
                    </span>
                  ))}
                  {extractedData.cvData.summary && (
                    <span className={styles.extractedBadge}>Summary detected</span>
                  )}
                  {countExtractedSections().length === 0 && !extractedData.cvData.summary && (
                    <span className={styles.mutedNote}>
                      No section data could be extracted. You can add it manually in the editor.
                    </span>
                  )}
                </div>
              </div>

              {/* Summary Preview */}
              {extractedData.cvData.summary && (
                <div className={styles.extractedSection}>
                  <div className={styles.extractedSectionTitle}>Professional Summary</div>
                  <p className={styles.summaryPreview}>
                    {extractedData.cvData.summary}
                  </p>
                </div>
              )}

              {/* Template Selection */}
              <div className={styles.templateSection}>
                <h3 className={styles.templateSectionTitle}>
                  Choose the target template
                </h3>
                <p className={styles.templateSectionDesc}>
                  Extracted fields will open in the live editor using this design.
                </p>

                <div className={styles.templateGrid}>
                  {THEME_DATA.map((theme) => (
                    <TemplateCard
                      key={theme.id}
                      name={theme.name}
                      image={theme.image}
                      tags={theme.tags}
                      selected={selectedTheme === theme.id}
                      onClick={() => setSelectedTheme(theme.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* CTA Actions */}
            <div className={styles.ctaSection}>
              <button onClick={resetUpload} className={styles.ctaBtnSecondary}>
                <ArrowLeft size={18} /> Upload Different PDF
              </button>
              <button onClick={handleUseTemplate} className={styles.ctaBtnPrimary}>
                <PenLine size={18} />
                Open ApplyForge Editor
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
