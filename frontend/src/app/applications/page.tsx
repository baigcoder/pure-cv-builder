"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Link2, Plus, Trash2, Wand2, X } from "lucide-react";
import styles from "./applications.module.css";
import { Wordmark } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { Button, Field } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { fetchJobFromUrl } from "@/lib/editorApi";
import {
  applicationsApi,
  resumesApi,
  type Application,
  type ApplicationStatus,
  type ResumeSummary,
} from "@/lib/resumesApi";

const COLUMNS: { status: ApplicationStatus; label: string }[] = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Closed" },
];

const EMPTY_FORM = { company: "", role: "", job_url: "", location: "", job_description: "" };

const shortDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

export default function ApplicationsPage() {
  const { enabled, loading: authLoading, user, getAccessToken } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [items, setItems] = useState<Application[] | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tailorFor, setTailorFor] = useState<string | null>(null);
  const [baseResume, setBaseResume] = useState("");

  useEffect(() => {
    if (!authLoading && enabled && !user) router.replace("/login?next=/applications");
  }, [authLoading, enabled, router, user]);

  const load = useCallback(async () => {
    try {
      const [applications, cvs] = await Promise.all([applicationsApi.list(getAccessToken), resumesApi.list(getAccessToken)]);
      setItems(applications.items);
      setResumes(cvs.items);
      setBaseResume((current) => current || cvs.items[0]?.id || "");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't load your applications.", "error");
      setItems([]);
    }
  }, [getAccessToken, showToast]);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  const byStatus = useMemo(() => {
    const groups = new Map<ApplicationStatus, Application[]>(COLUMNS.map((column) => [column.status, []]));
    (items ?? []).forEach((item) => groups.get(item.status)?.push(item));
    return groups;
  }, [items]);

  const replace = (next: Application) => setItems((current) => (current ?? []).map((item) => (item.id === next.id ? next : item)));

  const fetchDetails = async () => {
    if (!form.job_url.trim()) return;
    setFetching(true);
    try {
      const job = await fetchJobFromUrl(API_URL, form.job_url.trim());
      setForm((current) => ({
        ...current,
        company: current.company || job.company,
        role: current.role || job.title,
        location: current.location || job.location,
        job_description: job.description,
      }));
      showToast("Job details filled in. Check them before saving.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't read that job link.", "error");
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (!form.company.trim() || !form.role.trim()) {
      showToast("Add the company and the job title.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await applicationsApi.create(getAccessToken, { ...form, status: "saved" });
      setItems((current) => [created, ...(current ?? [])]);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't add the application.", "error");
    } finally {
      setSaving(false);
    }
  };

  const update = async (id: string, patch: Parameters<typeof applicationsApi.update>[2]) => {
    try {
      replace(await applicationsApi.update(getAccessToken, id, patch));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't update the application.", "error");
    }
  };

  const remove = async (application: Application) => {
    if (!window.confirm(`Remove ${application.role} at ${application.company}?`)) return;
    try {
      await applicationsApi.remove(getAccessToken, application.id);
      setItems((current) => (current ?? []).filter((item) => item.id !== application.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't delete the application.", "error");
    }
  };

  const tailor = async (application: Application) => {
    if (!baseResume) return;
    try {
      const result = await applicationsApi.tailor(getAccessToken, application.id, baseResume);
      router.push(`/editor?id=${result.resume_id}&section=job_match`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't create a tailored CV.", "error");
    }
  };

  const active = (items ?? []).filter((item) => item.status !== "saved" && item.status !== "rejected").length;
  const interviews = byStatus.get("interview")?.length ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" aria-label="Folio home">
          <Wordmark size={22} />
        </Link>
        <nav className={styles.tabs} aria-label="Workspace">
          <Link href="/dashboard">My CVs</Link>
          <Link href="/applications" aria-current="page">Applications</Link>
        </nav>
        <div className={styles.topbarActions}>
          <ThemeToggle className="btn btn-ghost btn-icon" />
          <AccountMenu showDashboardLink={false} />
        </div>
      </header>

      {!enabled ? (
        <p className={styles.center}>Accounts aren&apos;t enabled on this deployment.</p>
      ) : !user ? (
        <p className={styles.center}>Loading your account...</p>
      ) : (
        <main className={styles.main}>
          <div className={styles.head}>
            <div>
              <p className="label">Job search</p>
              <h1>Applications</h1>
              <p className={styles.sub}>
                {items === null
                  ? "Loading..."
                  : `${items.length} tracked · ${active} in progress · ${interviews} ${interviews === 1 ? "interview" : "interviews"}`}
              </p>
            </div>
            <Button variant="primary" icon={formOpen ? <X size={16} /> : <Plus size={16} />} onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? "Close" : "Add a job"}
            </Button>
          </div>

          {formOpen && (
            <section className={styles.form} aria-label="Add a job">
              <Field label="Job link" optional hint="Paste a link and we'll fill in the rest from the posting.">
                <div className={styles.linkRow}>
                  <input
                    className="form-input"
                    placeholder="https://jobs.example.com/senior-engineer"
                    value={form.job_url}
                    onChange={(event) => setForm({ ...form, job_url: event.target.value })}
                  />
                  <Button variant="secondary" icon={<Link2 size={15} />} loading={fetching} disabled={!form.job_url.trim()} onClick={fetchDetails}>
                    Fetch details
                  </Button>
                </div>
              </Field>
              <div className={styles.formGrid}>
                <Field label="Company" required>
                  <input className="form-input" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
                </Field>
                <Field label="Job title" required>
                  <input className="form-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
                </Field>
                <Field label="Location" optional>
                  <input className="form-input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
                </Field>
              </div>
              <Field label="Job description" optional hint="Used to tailor your CV and cover letter.">
                <textarea
                  className="form-textarea"
                  rows={5}
                  value={form.job_description}
                  onChange={(event) => setForm({ ...form, job_description: event.target.value })}
                />
              </Field>
              <div className={styles.formActions}>
                <Button variant="ghost" onClick={() => { setForm(EMPTY_FORM); setFormOpen(false); }}>Cancel</Button>
                <Button variant="primary" loading={saving} onClick={save}>Save job</Button>
              </div>
            </section>
          )}

          {items !== null && items.length === 0 && !formOpen ? (
            <div className={styles.empty}>
              <h2>Nothing tracked yet</h2>
              <p>Add the jobs you&apos;re interested in. Folio keeps a tailored CV and cover letter with each one.</p>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Add your first job</Button>
            </div>
          ) : (
            <div className={styles.board}>
              {COLUMNS.map((column) => {
                const cards = byStatus.get(column.status) ?? [];
                return (
                  <section key={column.status} className={styles.column} aria-label={column.label}>
                    <h2 className={styles.columnTitle}>
                      <span>{column.label}</span>
                      <span className={styles.count}>{cards.length}</span>
                    </h2>
                    <ul className={styles.cards}>
                      {cards.map((application) => {
                        const open = openId === application.id;
                        return (
                          <li key={application.id} className={styles.card} data-open={open ? "true" : "false"}>
                            <button type="button" className={styles.cardMain} onClick={() => setOpenId(open ? null : application.id)} aria-expanded={open}>
                              <span className={styles.role}>{application.role}</span>
                              <span className={styles.company}>
                                {application.company}
                                {application.location ? ` · ${application.location}` : ""}
                              </span>
                              {application.applied_at && <span className="label">Applied {shortDate(application.applied_at)}</span>}
                            </button>

                            {application.resume_id ? (
                              <Link href={`/editor?id=${application.resume_id}`} className={styles.cvChip}>
                                <FileText size={13} /> {application.resume_title || "Tailored CV"}
                              </Link>
                            ) : tailorFor === application.id ? (
                              <div className={styles.tailor}>
                                <select className="form-input" value={baseResume} onChange={(event) => setBaseResume(event.target.value)} aria-label="CV to copy">
                                  {resumes.map((resume) => (
                                    <option key={resume.id} value={resume.id}>{resume.title}</option>
                                  ))}
                                </select>
                                <Button size="sm" variant="primary" disabled={!baseResume} onClick={() => tailor(application)}>Create</Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles.tailorBtn}
                                onClick={() => setTailorFor(application.id)}
                                disabled={resumes.length === 0}
                                title={resumes.length ? "Copy one of your CVs for this job" : "Save a CV first"}
                              >
                                <Wand2 size={13} /> Tailor a CV
                              </button>
                            )}

                            {open && (
                              <div className={styles.details}>
                                <Field label="Stage">
                                  <select
                                    className="form-input"
                                    value={application.status}
                                    onChange={(event) => update(application.id, { status: event.target.value as ApplicationStatus })}
                                  >
                                    {COLUMNS.map((option) => (
                                      <option key={option.status} value={option.status}>{option.label}</option>
                                    ))}
                                  </select>
                                </Field>
                                <Field label="Notes" optional>
                                  <textarea
                                    className="form-textarea"
                                    rows={3}
                                    defaultValue={application.notes}
                                    placeholder="Recruiter name, interview dates, follow-ups..."
                                    onBlur={(event) => event.target.value !== application.notes && update(application.id, { notes: event.target.value })}
                                  />
                                </Field>
                                <div className={styles.detailActions}>
                                  {application.job_url && (
                                    <a href={application.job_url} target="_blank" rel="noreferrer" className={styles.textLink}>
                                      Job posting <ExternalLink size={12} />
                                    </a>
                                  )}
                                  <button type="button" className={styles.delete} onClick={() => remove(application)}>
                                    <Trash2 size={14} /> Remove
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
