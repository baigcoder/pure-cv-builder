"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, FileText, PenLine, Rocket, Sparkles, Upload, WandSparkles, X, ArrowLeft } from "lucide-react";
import styles from "./page.module.css";
import { Logo } from "@/components/Brand";
import { ActionBar, SectionHeader, TemplateCard } from "@/components/AppUI";
import { THEME_DATA } from "@/lib/themes";

export default function Home() {
  const templates = THEME_DATA;

  const features = [
    {
      icon: <WandSparkles size={24} />,
      title: "AI Writing Ops",
      description: "Generate stronger summaries, bullets, cover letters, and ATS upgrades with safe local fallbacks."
    },
    {
      icon: <CheckCircle2 size={24} />,
      title: "ATS Control Loop",
      description: "Live score, market keyword checks, and one-click CV enhancement from the current editor state."
    },
    {
      icon: <FileText size={24} />,
      title: "Render-Grade Preview",
      description: "Keep the editable form and final PDF output visible in the same production workspace."
    },
    {
      icon: <PenLine size={24} />,
      title: "Application Packet",
      description: "Build a matching one-page cover letter from the same CV, role, skills, location, and projects."
    }
  ];

  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  return (
    <div className={styles.landing}>
      <div className={styles.meshGradient} />
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <Logo width={28} height={28} />
            <span className={styles.logoWord}>ApplyForge</span>
          </div>
          <div className={styles.headerActions}>
            <Link href="/upload" className="btn btn-secondary">
              Upload PDF
            </Link>
            <Link href="/editor" className="btn btn-primary">
              Launch Editor
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTag}>
              <Rocket size={14} />
              Industrial ATS workspace
            </div>
            <h1 className={styles.heroTitle}>
              Forge every application asset from one live CV system.
            </h1>
            <p className={styles.heroSubtitle}>
              ApplyForge combines PDF import, RenderCV previews, live ATS diagnostics,
              AI enhancement, and cover-letter drafting into one focused operator console.
            </p>
            <ActionBar align="center">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="btn btn-primary btn-lg"
            >
              <PenLine size={20} />
              Open Workspace
            </button>
            <Link
              href="/upload"
              className="btn btn-secondary btn-lg"
            >
              <Upload size={20} />
              Upload Existing PDF
            </Link>
            <Link href="/editor?section=cover_letter" className="btn btn-secondary btn-lg">
              <Sparkles size={20} />
              Cover Letter
            </Link>
            </ActionBar>
          </div>

          <div className={styles.heroShowcase} aria-label="Product preview">
            <div className={styles.previewRail}>
              {templates.slice(0, 3).map((theme) => (
                <img key={theme.id} src={theme.image} alt={`${theme.name} preview`} />
              ))}
            </div>
            <div className={styles.workflowCard}>
              <span>Workspace</span>
              <strong>CV editor + ATS engine + cover-letter studio</strong>
              <p>Import once, strengthen the signal, tailor for every role, export clean documents.</p>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className={styles.trustIndicators}>
            <div className={styles.trustItem}>
              <CheckCircle2 size={16} className={styles.trustIcon} />
              <span>RenderCV PDFs</span>
            </div>
            <div className={styles.trustItem}>
              <CheckCircle2 size={16} className={styles.trustIcon} />
              <span>ATS Optimized</span>
            </div>
            <div className={styles.trustItem}>
              <CheckCircle2 size={16} className={styles.trustIcon} />
              <span>No account wall</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className={styles.features}>
          <SectionHeader
            eyebrow="Document workflow"
            title="A serious operating system for job documents"
            description="Built for scanning, editing, checking, and exporting application material without marketing clutter."
          />
          <div className={styles.featureGrid}>
            {features.map((feature, index) => (
              <div key={index} className={styles.featureCard}>
                <div className={styles.featureIcon}>{feature.icon}</div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDesc}>{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.templates}>
          <SectionHeader
            eyebrow="Templates"
            title="Select the format that fits the hiring lane"
            description="RenderCV-backed templates for engineering, academic, entry-level, and professional submissions."
          />

          <div className={styles.templateGrid}>
            {templates.map((theme) => (
              <TemplateCard
                key={theme.id}
                name={theme.name}
                image={theme.image}
                tags={theme.tags}
                badge={theme.atsScore >= 94 ? "Best ATS" : `${theme.atsScore}% ATS`}
                meta={theme.atsRationale}
                onClick={() => { setSelectedTemplate(theme); setShowTemplateModal(true); }}
              />
            ))}
          </div>
        </section>

        {/* How It Works Section */}
        <section className={styles.howItWorks}>
          <SectionHeader
            eyebrow="Flow"
            title="Move from raw resume to application packet"
            description="A compact workflow for importing, strengthening, previewing, and sending."
          />
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Pick a target format</h3>
              <p className={styles.stepDesc}>Choose a theme that matches the role, seniority, and review context.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Strengthen the signal</h3>
              <p className={styles.stepDesc}>Use live ATS scoring, AI polish, market keywords, and project links.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Export the packet</h3>
              <p className={styles.stepDesc}>Download the CV PDF and draft a matching cover letter from the same data.</p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <h2 className={styles.ctaTitle}>Ready to harden your application packet?</h2>
          <p className={styles.ctaSubtitle}>Open ApplyForge and turn your current CV into a role-ready submission.</p>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="btn btn-primary btn-lg"
          >
            Launch ApplyForge
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/editor" className={styles.footerLink}>Editor</Link>
          <Link href="/upload" className={styles.footerLink}>Upload</Link>
          <Link href="/editor?section=cover_letter" className={styles.footerLink}>Cover Letter</Link>
        </div>
        <p>ApplyForge. Built for disciplined application workflows.</p>
      </footer>

      {/* Template Selection Modal (triggered by Start Drafting) */}
      {showTemplateModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); }}
        >
          <div
            className={`${styles.modalContent} ${selectedTemplate ? styles.modalPreviewSize : styles.modalGridSize}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* If no template selected, show grid */}
            {!selectedTemplate ? (
              <>
                <div className={styles.modalHeader}>
                  <div className={styles.modalTitleArea}>
                    <h2>Choose a template</h2>
                    <p className={styles.modalSubtitle}>Preview the format, then open the editor workspace.</p>
                  </div>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setShowTemplateModal(false)}
                    aria-label="Close template picker"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className={styles.modalBody}>
                  <div className={styles.modalTemplateGrid}>
                    {templates.map((theme) => (
                      <TemplateCard
                        key={theme.id}
                        name={theme.name}
                        image={theme.image}
                        tags={theme.tags}
                        badge={theme.atsScore >= 94 ? "Best ATS" : `${theme.atsScore}% ATS`}
                        meta={theme.atsRationale}
                        onClick={() => setSelectedTemplate(theme)}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Show big preview with Start button */
              <>
                <div className={styles.modalHeader}>
                  <div className={styles.modalTitleArea}>
                    <h2>{selectedTemplate.name}</h2>
                    <p className={styles.modalSubtitle}>{selectedTemplate.description}</p>
                  </div>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setSelectedTemplate(null)}
                    aria-label="Back to templates"
                  >
                    <ArrowLeft size={18} />
                  </button>
                </div>

                <div className={styles.modalBody}>
                  <div className={styles.tagContainer}>
                    <span className={styles.tag}>{selectedTemplate.atsScore}% ATS estimate</span>
                    {selectedTemplate.tags.map(tag => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                  <p className={styles.modalSubtitle}>{selectedTemplate.atsRationale}</p>
                  <div className={styles.previewContainer}>
                    <img
                      src={selectedTemplate.image}
                      alt={selectedTemplate.name}
                      className={styles.modalImg}
                    />
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="btn btn-secondary"
                  >
                    <ArrowLeft size={18} /> Back
                  </button>
                  <Link
                    href={`/editor?theme=${selectedTemplate.id}`}
                    className="btn btn-primary"
                  >
                    <PenLine size={18} />
                    Open Editor
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
