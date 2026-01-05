"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";
import { Logo } from "@/components/Brand";

export default function Home() {
  const templates = [
    {
      id: "classic",
      name: "Classic Professional",
      image: "/theme-classic.png",
      description: "Traditional professional layout with refined typography.",
      tags: ["ATS-Friendly", "Formal"]
    },
    {
      id: "moderncv",
      name: "Modern Minimal",
      image: "/theme-moderncv.png",
      description: "Modern two-column design for a clean, structural feel.",
      tags: ["Modern", "Creative"]
    },
    {
      id: "sb2nov",
      name: "Academic Focus",
      image: "/theme-sb2nov.png",
      description: "Clean academic style optimized for length and detail.",
      tags: ["Academic", "Detailed"]
    },
    {
      id: "engineeringresumes",
      name: "Technical Precision",
      image: "/theme-engineeringresumes.png",
      description: "Engineering & tech focused layout with clear hierarchy.",
      tags: ["Tech-Focused", "Clean"]
    },
  ];

  const features = [
    {
      icon: "✨",
      title: "AI-Powered Writing",
      description: "Smart suggestions for headlines, summaries, and bullet points"
    },
    {
      icon: "📊",
      title: "ATS Optimizer",
      description: "Real-time score calculator with actionable improvement tips"
    },
    {
      icon: "⚡",
      title: "Live Preview",
      description: "See your CV update instantly as you type"
    },
    {
      icon: "🎨",
      title: "Custom Design",
      description: "Personalize colors, fonts, and layouts to match your style"
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
            <span style={{ letterSpacing: '0.1em', fontWeight: 800 }}>PURE</span>
          </div>
          <div className={styles.headerActions}>
            <Link href="/editor" className="btn btn-primary">
              Launch Editor
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroTag}>
            <span className={styles.tagIcon}>🚀</span>
            Free Forever • No Sign-up Required
          </div>
          <h1 className={styles.heroTitle}>
            The purest way to build your <span>CV</span>.
          </h1>
          <p className={styles.heroSubtitle}>
            A minimalist workspace for high-performing professionals. No fluff, just
            precision-engineered templates that get you hired.
          </p>
          <div className={styles.ctaGroup}>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="btn btn-primary btn-lg"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem 2.5rem',
                fontSize: '1.1rem'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Start Building Now
            </button>
          </div>

          {/* Trust Indicators */}
          <div className={styles.trustIndicators}>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>✓</span>
              <span>LaTeX-Quality PDFs</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>✓</span>
              <span>ATS Optimized</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>✓</span>
              <span>100% Free</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className={styles.features}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Why Professionals Choose PURE</h2>
            <p className={styles.sectionDesc}>
              Everything you need to create a standout CV, nothing you don't.
            </p>
          </div>
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
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Curated Templates</h2>
            <p className={styles.sectionDesc}>
              A selection of world-class designs, optimized for ATS and
              human readability.
            </p>
          </div>

          <div className={styles.templateGrid}>
            {templates.map((theme) => (
              <div
                key={theme.id}
                className={styles.templateCard}
                onClick={() => { setSelectedTemplate(theme); setShowTemplateModal(true); }}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.templatePreview}>
                  <img src={theme.image} alt={theme.name} className={styles.templateImg} />
                </div>
                <div className={styles.templateInfo}>
                  <div className={styles.templateName}>{theme.name}</div>
                  <div className={styles.templateTags}>
                    {theme.tags.map(tag => (
                      <span key={tag} className={styles.templateTag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works Section */}
        <section className={styles.howItWorks}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Build Your CV in 3 Steps</h2>
            <p className={styles.sectionDesc}>
              From blank page to polished PDF in minutes.
            </p>
          </div>
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Choose a Template</h3>
              <p className={styles.stepDesc}>Pick from 5 professionally designed themes tailored for different careers.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Fill Your Details</h3>
              <p className={styles.stepDesc}>Add your experience, education, and skills with AI-powered suggestions.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Download & Apply</h3>
              <p className={styles.stepDesc}>Export your pixel-perfect PDF and start applying to your dream jobs.</p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <h2 className={styles.ctaTitle}>Ready to Land Your Dream Job?</h2>
          <p className={styles.ctaSubtitle}>Join thousands of professionals who trust PURE for their CV.</p>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="btn btn-primary btn-lg"
            style={{
              padding: '1rem 3rem',
              fontSize: '1.1rem'
            }}
          >
            Create Your CV Now — It's Free
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/editor" className={styles.footerLink}>Editor</Link>
          <a href="#" className={styles.footerLink}>Terms</a>
          <a href="#" className={styles.footerLink}>Privacy</a>
        </div>
        <p>© 2025 PURE. Built for the modern professional.</p>
      </footer>

      {/* Template Selection Modal (triggered by Start Drafting) */}
      {showTemplateModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); }}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: selectedTemplate ? '600px' : '800px' }}
          >
            {/* If no template selected, show grid */}
            {!selectedTemplate ? (
              <>
                <div className={styles.modalHeader}>
                  <div className={styles.modalTitleArea}>
                    <h2>Choose a Template</h2>
                    <p className={styles.modalSubtitle}>Click to preview, then start editing</p>
                  </div>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setShowTemplateModal(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.modalBody} style={{ padding: '1.5rem' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '1rem'
                  }}>
                    {templates.map((theme) => (
                      <div
                        key={theme.id}
                        onClick={() => setSelectedTemplate(theme)}
                        style={{
                          display: 'block',
                          border: '2px solid var(--border)',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#6366F1';
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 8px 20px rgba(99, 102, 241, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ aspectRatio: '0.75', overflow: 'hidden', background: '#f8f9fa' }}>
                          <img
                            src={theme.image}
                            alt={theme.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <div style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{theme.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                            {theme.tags[0]}
                          </div>
                        </div>
                      </div>
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
                  >
                    ←
                  </button>
                </div>

                <div className={styles.modalBody}>
                  <div className={styles.tagContainer}>
                    {selectedTemplate.tags.map(tag => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
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
                    ← Back
                  </button>
                  <Link
                    href={`/editor?theme=${selectedTemplate.id}`}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Start Editing
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
