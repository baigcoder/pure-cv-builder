"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, FileUp, Search, UploadCloud } from "lucide-react";
import styles from "@/components/AccountPages.module.css";
import { Logo } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_COVER_LETTER_DRAFT, DEFAULT_CV_DATA, DEFAULT_DESIGN_SETTINGS } from "@/lib/cvBuilder";
import { draftTitle, markDraftImported, readLocalDraft, wasDraftImported } from "@/lib/localDraft";
import { resumesApi, toApiContent, type ResumeSummary } from "@/lib/resumesApi";
import type { ResumeContent } from "@/lib/resumesApi";
import { ResumeCard } from "@/components/dashboard/ResumeCard";

export default function DashboardPage() {
  const { enabled, loading: authLoading, user, getAccessToken } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<ResumeContent | null>(null);
  const autoImportTried = useRef(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "created" | "title">("updated");

  useEffect(() => {
    if (!authLoading && enabled && !user) router.replace("/login?next=/dashboard");
  }, [authLoading, enabled, router, user]);

  const importDraft = useCallback(
    async (draft: ResumeContent, { silent = false } = {}) => {
      if (!user) return;
      setBusyId("import");
      try {
        const created = await resumesApi.create(getAccessToken, {
          title: draftTitle(draft),
          source: "import",
          ...toApiContent(draft),
        });
        markDraftImported(user.id);
        setLocalDraft(null);
        showToast(silent ? "We saved your browser draft to your account." : "Draft imported.", "success");
        return created;
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Couldn't import the draft.", "error");
      } finally {
        setBusyId(null);
      }
    },
    [getAccessToken, showToast, user],
  );

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const data = await resumesApi.list(getAccessToken);
      setLimit(data.limit);

      const draft = wasDraftImported(user.id) ? null : readLocalDraft();
      // First visit with no saved CVs: bring the browser draft along automatically.
      if (draft && data.items.length === 0 && !autoImportTried.current) {
        autoImportTried.current = true;
        const created = await importDraft(draft, { silent: true });
        if (created) {
          setResumes([created]);
          return;
        }
      }
      setLocalDraft(draft);
      setResumes(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your CVs.");
      setResumes([]);
    }
  }, [getAccessToken, importDraft, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const createBlank = async () => {
    setBusyId("new");
    try {
      const created = await resumesApi.create(getAccessToken, {
        title: "Untitled CV",
        ...toApiContent({
          cvData: DEFAULT_CV_DATA,
          theme: "classic",
          designSettings: DEFAULT_DESIGN_SETTINGS,
          coverLetter: DEFAULT_COVER_LETTER_DRAFT,
        }),
      });
      router.push(`/editor?id=${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't create a CV.", "error");
      setBusyId(null);
    }
  };

  const duplicate = async (resume: ResumeSummary) => {
    setBusyId(resume.id);
    try {
      const copy = await resumesApi.duplicate(getAccessToken, resume.id);
      setResumes((current) => [copy, ...(current ?? [])]);
      showToast(`Created “${copy.title}”.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't duplicate the CV.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (resume: ResumeSummary) => {
    if (!window.confirm(`Delete “${resume.title}”? This removes it and its version history.`)) return;
    setBusyId(resume.id);
    try {
      await resumesApi.remove(getAccessToken, resume.id);
      setResumes((current) => (current ?? []).filter((item) => item.id !== resume.id));
      showToast("CV deleted.", "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't delete the CV.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const atLimit = (resumes?.length ?? 0) >= limit;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleResumes = (resumes ?? [])
    .filter((resume) =>
      !normalizedQuery ||
      [resume.title, resume.name, resume.headline, resume.theme].some((value) => (value ?? "").toLowerCase().includes(normalizedQuery)),
    )
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const field = sort === "created" ? "created_at" : "updated_at";
      return new Date(b[field]).getTime() - new Date(a[field]).getTime();
    });

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Logo width={28} height={28} />
          ApplyForge
        </Link>
        <div className={styles.topbarActions}>
          <ThemeToggle />
          <AccountMenu showDashboardLink={false} />
        </div>
      </header>

      {!enabled ? (
        <div className={styles.centerState}>
          <div>
            <p>Accounts aren&apos;t enabled on this deployment.</p>
            <Link href="/editor" className="btn btn-primary mt-2">
              Open the editor
            </Link>
          </div>
        </div>
      ) : !user ? (
        <div className={styles.centerState}>Loading your account...</div>
      ) : (
        <main className={styles.dashboard}>
          <div className={styles.dashHeader}>
            <div>
              <span className={styles.eyebrow}>Workspace</span>
              <h1>My CVs</h1>
              <p>
                {resumes === null
                  ? "Loading..."
                  : `${resumes.length} of ${limit} CVs · signed in as ${user.email ?? ""}`}
              </p>
            </div>
            <div className={styles.dashActions}>
              <Link href="/upload" className="btn btn-secondary">
                <FileUp size={16} />
                Import PDF
              </Link>
              <button type="button" className="btn btn-primary" onClick={createBlank} disabled={busyId !== null || atLimit}>
                <FilePlus2 size={16} />
                {busyId === "new" ? "Creating..." : "New CV"}
              </button>
            </div>
          </div>

          {localDraft && (
            <div className={styles.importBanner}>
              <div>
                <strong>You have a CV draft in this browser</strong>
                <span>
                  {draftTitle(localDraft)} · Save it to your account to keep it safe and get version history.
                </span>
              </div>
              <div className={styles.dashActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    markDraftImported(user.id);
                    setLocalDraft(null);
                  }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId !== null}
                  onClick={async () => {
                    const created = await importDraft(localDraft);
                    if (created) setResumes((current) => [created, ...(current ?? [])]);
                  }}
                >
                  <UploadCloud size={16} />
                  {busyId === "import" ? "Importing..." : "Import draft"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className={`${styles.message} ${styles.messageError}`} role="alert">
              {error}{" "}
              <button type="button" className={styles.linkButton} onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}

          {(resumes?.length ?? 0) > 1 && (
            <div className={styles.toolbar}>
              <label className={styles.searchBox}>
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search by title, name or template"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search CVs"
                />
              </label>
              <label className={styles.sortBox}>
                <span>Sort</span>
                <select className="form-input" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort CVs">
                  <option value="updated">Last edited</option>
                  <option value="created">Newest</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
            </div>
          )}

          <div className={styles.grid}>
            {resumes === null ? (
              [0, 1, 2].map((key) => <div key={key} className={`skeleton ${styles.skeletonCard}`} />)
            ) : (
              <>
                <button
                  type="button"
                  className={styles.newCard}
                  onClick={createBlank}
                  disabled={busyId !== null || atLimit}
                >
                  <FilePlus2 size={28} />
                  {atLimit ? `Limit of ${limit} CVs reached` : "Start a new CV"}
                  {resumes.length === 0 && <span className={styles.emptyNote}>Or import a PDF resume above.</span>}
                </button>
                {visibleResumes.map((resume) => (
                  <ResumeCard
                    key={resume.id}
                    resume={resume}
                    getAccessToken={getAccessToken}
                    disabled={busyId !== null}
                    canDuplicate={!atLimit}
                    onDuplicate={(item) => void duplicate(item)}
                    onDelete={(item) => void remove(item)}
                    onRenamed={(saved) =>
                      setResumes((current) => (current ?? []).map((item) => (item.id === saved.id ? { ...item, ...saved } : item)))
                    }
                    onError={(message) => showToast(message, "error")}
                  />
                ))}
                {resumes.length > 0 && visibleResumes.length === 0 && (
                  <p className={styles.noResults}>No CVs match “{query}”.</p>
                )}
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
