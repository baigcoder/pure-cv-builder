"use client";
/* eslint-disable @next/next/no-img-element -- page images are data URLs from the API */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import styles from "./shared.module.css";
import { Wordmark } from "@/components/Brand";
import { fetchPublicCV, publicCVPdfUrl, type PublicCV } from "@/lib/resumesApi";

export default function SharedCVPage() {
  const { slug } = useParams<{ slug: string }>();
  const [cv, setCv] = useState<PublicCV | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicCV(slug)
      .then((data) => {
        if (!active) return;
        setCv(data);
        document.title = `${data.name || "CV"} | Folio`;
      })
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.who}>
          {cv ? (
            <>
              <h1 className={styles.name}>{cv.name || "CV"}</h1>
              {cv.headline && <p className={styles.headline}>{cv.headline}</p>}
            </>
          ) : (
            !error && <span className={`skeleton ${styles.nameSkeleton}`} aria-hidden="true" />
          )}
        </div>
        {cv && (
          <a className="btn btn-primary" href={publicCVPdfUrl(slug)}>
            <Download size={16} /> Download PDF
          </a>
        )}
      </header>

      <main className={styles.desk}>
        {error ? (
          <div className={styles.message}>
            <h2>This link isn&apos;t active</h2>
            <p>{error}</p>
          </div>
        ) : cv ? (
          <div className={styles.pages}>
            {cv.pages.map((page, index) => (
              <img key={index} src={page} alt={`${cv.name || "CV"}, page ${index + 1}`} className={styles.sheet} />
            ))}
            {cv.page_count > cv.pages.length && (
              <p className={styles.more}>Download the PDF to see all {cv.page_count} pages.</p>
            )}
          </div>
        ) : (
          <div className={styles.pages}>
            <div className={`skeleton ${styles.sheet} ${styles.sheetSkeleton}`} aria-label="Loading CV" />
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <Link href="/" aria-label="Folio home">
          <Wordmark size={18} />
        </Link>
        <Link href="/editor" className={styles.cta}>
          Make your own CV <ArrowRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
