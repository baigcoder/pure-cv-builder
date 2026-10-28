"use client";
/* eslint-disable @next/next/no-img-element -- static template preview images, already sized */

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Minus } from "lucide-react";
import styles from "./page.module.css";
import { Wordmark } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_DATA, type ThemeMeta } from "@/lib/themes";

type TemplateFilter = "all" | "signature" | "modern" | "classic" | "academic";

const isSignature = (theme: ThemeMeta) => theme.tags.includes("Signature");
const isModern = (theme: ThemeMeta) => theme.tags.includes("Modern");

const TEMPLATE_FILTERS: Record<TemplateFilter, { label: string; match: (theme: ThemeMeta) => boolean }> = {
  all: { label: "All", match: () => true },
  signature: { label: "Folio originals", match: isSignature },
  modern: { label: "Modern", match: isModern },
  classic: { label: "Classic", match: (theme) => !isSignature(theme) && !isModern(theme) },
  academic: { label: "Academic", match: (theme) => theme.sectionOrderType === "academic" },
};

const ALSO = ["PDF and Word export", "LinkedIn import", "Share links with view counts", "Version history", "Cover letters in your CV's type", "Dark mode"];

export default function Home() {
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const templates = useMemo(() => THEME_DATA.filter(TEMPLATE_FILTERS[filter].match), [filter]);
  const [front, back] = [THEME_DATA.find((t) => t.id === "folio"), THEME_DATA.find((t) => t.id === "signal")];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="Folio home">
            <Wordmark size={22} />
          </Link>
          <nav className={styles.nav} aria-label="Main">
            <a href="#templates">Templates</a>
            <a href="#editor">The editor</a>
          </nav>
          <div className={styles.headerActions}>
            <ThemeToggle className="btn btn-ghost btn-icon" />
            <AccountMenu />
            <Link href="/editor" className="btn btn-primary">
              Start writing
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className="label">CV builder</p>
            <h1 className={styles.heroTitle}>
              The CV, typeset
              <br />
              <em>like it matters.</em>
            </h1>
            <p className={styles.heroLead}>
              Write your CV, tailor it to each job, and download it set in proper type. Free, and you don&apos;t need an
              account to start.
            </p>
            <div className={styles.heroActions}>
              <Link href="/editor" className="btn btn-primary btn-lg">
                Start writing <ArrowRight size={18} />
              </Link>
              <Link href="/upload" className={styles.textLink}>
                Import an existing CV <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>

          <div className={styles.heroArt} aria-hidden="true">
            {back && <img className={`${styles.sheet} ${styles.sheetBack}`} src={back.image} alt="" />}
            {front && <img className={`${styles.sheet} ${styles.sheetFront}`} src={front.image} alt="" />}
            <div className={`${styles.note} ${styles.noteTop}`}>
              <span className="label">Typeface</span>
              <strong>EB Garamond &amp; Source Sans</strong>
            </div>
            <div className={`${styles.note} ${styles.noteBottom}`}>
              <span className="label">Suggested edit</span>
              <p className={styles.noteEdit}>
                <del>Worked on</del> <ins>Rebuilt</ins> the billing service
              </p>
            </div>
          </div>
        </section>

        <section id="templates" className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className="label">Templates</p>
              <h2 className={styles.sectionTitle}>A shelf of well-made templates.</h2>
              <p className={styles.sectionLead}>
                All single-column with standard headings, so applicant tracking systems read them line by line.
              </p>
            </div>
            <div className={styles.filters} role="tablist" aria-label="Filter templates">
              {(Object.keys(TEMPLATE_FILTERS) as TemplateFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`${styles.filter} ${filter === key ? styles.filterActive : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {TEMPLATE_FILTERS[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.shelf}>
            {templates.map((theme) => (
              <Link key={theme.id} href={`/editor?theme=${theme.id}`} className={styles.book}>
                <span className={styles.bookPage}>
                  <img src={theme.image} alt={`${theme.name} template preview`} loading="lazy" />
                  <span className={styles.bookCta}>Use this template <ArrowRight size={14} /></span>
                </span>
                <span className={styles.bookMeta}>
                  <span className={styles.bookName}>{theme.name}</span>
                  <span className="label">{theme.defaults?.fontFamily ?? theme.bestFor.split(",")[0]}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section id="editor" className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className="label">Inside the editor</p>
              <h2 className={styles.sectionTitle}>Small tools that do real work.</h2>
            </div>
          </div>

          <div className={styles.tools}>
            <article className={`${styles.tool} ${styles.toolWide}`}>
              <div className={styles.toolDemo} aria-hidden="true">
                <div className={styles.demoModes}>
                  <span data-on="true">Improve</span>
                  <span>Add numbers</span>
                  <span>Shorten</span>
                </div>
                <p className={styles.demoBullet}>
                  <del>Worked on</del> <ins>Rebuilt</ins> the merchant dashboard in React<del>, which made pages faster</del>
                  <ins>, cutting load time from 4.1s to 1.3s</ins>
                </p>
              </div>
              <h3>Rewrite a bullet, keep your voice</h3>
              <p>Suggestions arrive as tracked changes. Accept the ones that sound like you; nothing changes until you do.</p>
            </article>

            <article className={styles.tool}>
              <div className={styles.toolDemo} aria-hidden="true">
                <div className={styles.demoChips}>
                  <span data-found="true"><Check size={11} strokeWidth={3} /> React</span>
                  <span data-found="true"><Check size={11} strokeWidth={3} /> TypeScript</span>
                  <span><Minus size={11} /> GraphQL</span>
                  <span><Minus size={11} /> Accessibility</span>
                </div>
                <p className={styles.demoCaption}>2 of 4 key terms from the job ad</p>
              </div>
              <h3>Match a job ad</h3>
              <p>Paste a link or the text to see which of its terms your CV covers and where to add the rest.</p>
            </article>

            <article className={styles.tool}>
              <div className={`${styles.toolDemo} ${styles.demoBoard}`} aria-hidden="true">
                {[["Applied", "Northwind"], ["Interview", "Brightlane"], ["Offer", ""]].map(([stage, company]) => (
                  <div key={stage} className={styles.demoColumn}>
                    <span className="label">{stage}</span>
                    {company && <span className={styles.demoCard}>{company}</span>}
                  </div>
                ))}
              </div>
              <h3>Track every application</h3>
              <p>Each job keeps its own tailored CV and cover letter, from saved to offer.</p>
            </article>
          </div>

          <p className={styles.also}>
            <span className="label">Also included</span>
            {ALSO.join(" · ")}
          </p>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.closingTitle}>
            Start with a template, <em>or bring your old CV.</em>
          </h2>
          <div className={styles.heroActions}>
            <Link href="/editor" className="btn btn-primary btn-lg">
              Start writing <ArrowRight size={18} />
            </Link>
            <Link href="/upload" className={styles.textLink}>
              Import a PDF or LinkedIn profile <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Wordmark size={20} />
            <p>CV and cover letter builder.</p>
          </div>
          <nav className={styles.footerLinks} aria-label="Footer">
            <Link href="/editor">Editor</Link>
            <Link href="/upload">Import a CV</Link>
            <Link href="/applications">Applications</Link>
            <Link href="/dashboard">My CVs</Link>
          </nav>
        </div>
        <p className={`label ${styles.footerSmall}`}>&copy; {new Date().getFullYear()} Folio. Typeset with Typst and RenderCV.</p>
      </footer>
    </div>
  );
}
