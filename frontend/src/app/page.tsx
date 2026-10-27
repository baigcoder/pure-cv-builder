"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, FileText, PenLine, Rocket, Upload, WandSparkles, X, ArrowLeft } from "lucide-react";
import styles from "./page.module.css";
import { Logo } from "@/components/Brand";
import { ActionBar, SectionHeader, TemplateCard } from "@/components/AppUI";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_DATA, type ThemeMeta } from "@/lib/themes";

type TemplateFilter = "all" | "trending" | "ats" | "academic";

const TEMPLATE_FILTERS: Record<TemplateFilter, { label: string; match: (theme: ThemeMeta) => boolean }> = {
  all: { label: "All", match: () => true },
  trending: { label: "Trending", match: (theme) => theme.tags.includes("Trending") },
  ats: { label: "Most ATS-safe", match: (theme) => theme.atsScore >= 93 },
  academic: { label: "Academic", match: (theme) => theme.sectionOrderType === "academic" },
};

export default function Home() {
  const templates = THEME_DATA;
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const visibleTemplates = useMemo(() => templates.filter(TEMPLATE_FILTERS[templateFilter].match), [templates, templateFilter]);

  const features = [
    {
      icon: <WandSparkles size={24} />,
      title: "AI that writes with you",
      description: "Draft summaries, sharpen bullet points and get suggestions you review before anything changes."
    },
    {
      icon: <CheckCircle2 size={24} />,
      title: "Built to pass ATS",
      description: "A live ATS score, keyword checks against the job ad, and parser-safe single-column layouts."
    },
    {
      icon: <FileText size={24} />,
      title: "See the real PDF as you type",
      description: "The preview is the exact PDF you'll download, typeset properly, not an approximation."
    },
    {
      icon: <PenLine size={24} />,
      title: "Cover letters that match",
      description: "Write a tailored cover letter for each job from your CV and the job description, in your tone."
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
            <ThemeToggle />
            <AccountMenu />
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
              Free CV builder with live PDF preview
            </div>
            <h1 className={styles.heroTitle}>
              A CV that gets past the filters and in front of people.
            </h1>
            <p className={styles.heroSubtitle}>
              Pick a modern, ATS-friendly template, fill in your experience with AI help,
              tailor it to each job and download a beautifully typeset PDF.
            </p>
            <ActionBar align="center">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="btn btn-primary btn-lg"
            >
              <PenLine size={20} />
              Create my CV
            </button>
            <Link
              href="/upload"
              className="btn btn-secondary btn-lg"
            >
              <Upload size={20} />
              Import my existing CV
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
              <span>New</span>
              <strong>Trending templates for {new Date().getFullYear()}</strong>
              <p>Modern Minimal, Executive Serif and Bold Accent: clean, current and still ATS-safe.</p>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className={styles.trustIndicators}>
            <div className={styles.trustItem}>
              <CheckCircle2 size={16} className={styles.trustIcon} />
              <span>Free to start</span>
            </div>
            <div className={styles.trustItem}>
              <CheckCircle2 size={16} className={styles.trustIcon} />
              <span>ATS-friendly layouts</span>
            </div>
            <div className={styles.trustItem}>
              <CheckCircle2 size={16} className={styles.trustIcon} />
              <span>No sign-up needed</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className={styles.features}>
          <SectionHeader
            eyebrow="Why ApplyForge"
            title="Everything you need for the application, in one place"
            description="Write your CV once, then tailor it and its cover letter for every role."
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
            title="Templates that look current and read cleanly"
            description="Every template is single-column with standard headings, so applicant tracking systems read it correctly."
          />

          <div className={styles.filterBar} role="tablist" aria-label="Filter templates">
            {(Object.keys(TEMPLATE_FILTERS) as TemplateFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={templateFilter === key}
                className={`${styles.filterChip} ${templateFilter === key ? styles.filterChipActive : ""}`}
                onClick={() => setTemplateFilter(key)}
              >
                {TEMPLATE_FILTERS[key].label}
              </button>
            ))}
          </div>

          <div className={styles.templateGrid}>
            {visibleTemplates.map((theme) => (
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
            eyebrow="How it works"
            title="From blank page to ready-to-send in three steps"
            description="Start from scratch or import the CV you already have."
          />
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Choose a template</h3>
              <p className={styles.stepDesc}>Pick a style for your field and seniority. You can switch at any time.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Write and tailor</h3>
              <p className={styles.stepDesc}>Fill in your experience, then paste a job ad to see missing keywords and tailor bullets.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Download and apply</h3>
              <p className={styles.stepDesc}>Export a polished PDF and a matching cover letter for the same role.</p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <h2 className={styles.ctaTitle}>Your next application starts here</h2>
          <p className={styles.ctaSubtitle}>Build your CV in minutes. Free, with no sign-up needed.</p>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="btn btn-primary btn-lg"
          >
            Create my CV
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/editor" className={styles.footerLink}>Editor</Link>
          <Link href="/upload" className={styles.footerLink}>Upload</Link>
          <Link href="/editor?section=cover_letter" className={styles.footerLink}>Cover Letter</Link>
        </div>
        <p>ApplyForge. CVs and cover letters that get read.</p>
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
