"use client";

import { useState } from "react";
import { GripVertical, Plus, Sparkles, X } from "lucide-react";
import editorStyles from "@/app/editor/editor.module.css";
import styles from "./EditorParts.module.css";
import { EntryCard } from "./EntryCard";
import { HighlightsField } from "./HighlightsField";
import { SortableList } from "./SortableList";
import type { AIHelper, EntrySectionProps } from "./types";
import { Button, Field, SectionHeading } from "@/components/ui";
import { Entry, RepeatableSection, getEmptyEntry, getString, getStringList } from "@/lib/cvBuilder";

/**
 * Entry list state for one section. An empty section shows a single blank
 * entry that becomes real on first edit; it keeps the same id so the input
 * being typed into doesn't remount.
 */
function useEntryList(section: RepeatableSection, entries: Entry[], onChange: (next: Entry[]) => void) {
  const [placeholder] = useState(() => getEmptyEntry(section));
  const items = entries.length > 0 ? entries : [placeholder];

  return {
    items,
    update: (index: number, patch: Partial<Entry>) => {
      const next = [...items];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    remove: (index: number) => onChange(entries.filter((_, idx) => idx !== index)),
    add: () => onChange([...items, getEmptyEntry(section)]),
    reorder: (next: Entry[]) => onChange(next),
  };
}

const getId = (entry: Entry) => getString(entry.id);
function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
  type = "text",
}: {
  label: string;
  value: string | string[] | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  type?: string;
}) {
  return (
    <Field label={label} required={required} hint={hint}>
      <input type={type} className="form-input" placeholder={placeholder} value={getString(value)} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function AddEntryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.addEntry} onClick={onClick}>
      <Plus size={16} /> {label}
    </button>
  );
}

const joinParts = (...parts: Array<string | string[] | undefined>) =>
  parts.map((part) => getString(part).trim()).filter(Boolean).join(" · ");

export function ExperienceSection({ entries, onChange, ai }: EntrySectionProps) {
  const list = useEntryList("experience", entries, onChange);
  return (
    <div className="animate-fade">
      <SectionHeading eyebrow="Experience" title="Work experience" description="Most recent role first. Lead each bullet with an action and a result." />
      <SortableList
        items={list.items}
        getId={getId}
        onReorder={list.reorder}
        renderItem={(exp, i, handle, isDragging, isSorting) => (
          <EntryCard
            title={getString(exp.position).trim() || `Role ${i + 1}`}
            subtitle={joinParts(exp.company, exp.start_date && `${getString(exp.start_date)} – ${getString(exp.end_date) || "present"}`)}
            handle={handle}
            isDragging={isDragging}
            isSorting={isSorting}
            onRemove={() => list.remove(i)}
            removeLabel={`Remove role ${i + 1}`}
          >
            <TextField label="Company" required placeholder="e.g. Google" value={exp.company} onChange={(company) => list.update(i, { company })} />
            <TextField label="Position" required placeholder="e.g. Senior Software Engineer" value={exp.position} onChange={(position) => list.update(i, { position })} />
            <div className={editorStyles.twoColumnGrid}>
              <TextField label="Start Date" placeholder="e.g. Jan 2020" value={exp.start_date} onChange={(start_date) => list.update(i, { start_date })} />
              <TextField label="End Date" placeholder="e.g. Present" value={exp.end_date} onChange={(end_date) => list.update(i, { end_date })} />
            </div>
            <TextField label="Location" placeholder="e.g. San Francisco, CA" value={exp.location} onChange={(location) => list.update(i, { location })} />
            <TextField label="Summary (optional)" placeholder="One-line summary of your role" value={exp.summary} onChange={(summary) => list.update(i, { summary })} />
            <HighlightsField
              label="Key Highlights"
              addLabel="Add achievement"
              multiline
              placeholder="Led X, which improved Y by Z%"
              values={getStringList(exp.highlights)}
              onChange={(highlights) => list.update(i, { highlights })}
              ai={{ ...ai, type: "bullet", context: `${getString(exp.position)} at ${getString(exp.company)}` }}
            />
          </EntryCard>
        )}
      />
      <AddEntryButton label="Add experience" onClick={list.add} />
    </div>
  );
}

export function EducationSection({ entries, onChange, ai }: EntrySectionProps) {
  const list = useEntryList("education", entries, onChange);
  return (
    <div className="animate-fade">
      <SectionHeading eyebrow="Education" title="Education" description="Degrees, schools and notable results such as GPA or honours." />
      <SortableList
        items={list.items}
        getId={getId}
        onReorder={list.reorder}
        renderItem={(edu, i, handle, isDragging, isSorting) => (
          <EntryCard
            title={getString(edu.institution).trim() || `Education ${i + 1}`}
            subtitle={joinParts(edu.degree, edu.area)}
            handle={handle}
            isDragging={isDragging}
            isSorting={isSorting}
            onRemove={() => list.remove(i)}
            removeLabel={`Remove education ${i + 1}`}
          >
            <TextField label="Institution" required placeholder="e.g. MIT" value={edu.institution} onChange={(institution) => list.update(i, { institution })} />
            <div className={editorStyles.twoColumnGrid}>
              <TextField label="Degree" placeholder="e.g. BS, MS, PhD" value={edu.degree} onChange={(degree) => list.update(i, { degree })} />
              <TextField label="Field of Study" required placeholder="e.g. Computer Science" value={edu.area} onChange={(area) => list.update(i, { area })} />
            </div>
            <div className={editorStyles.threeColumnGrid}>
              <TextField label="Start Date" placeholder="Sep 2018" value={edu.start_date} onChange={(start_date) => list.update(i, { start_date })} />
              <TextField label="End Date" placeholder="May 2022" value={edu.end_date} onChange={(end_date) => list.update(i, { end_date })} />
              <TextField label="Location" placeholder="City, Country" value={edu.location} onChange={(location) => list.update(i, { location })} />
            </div>
            <TextField label="Summary (optional)" placeholder="Brief description of your studies" value={edu.summary} onChange={(summary) => list.update(i, { summary })} />
            <HighlightsField
              label="Highlights (GPA, Honors, etc.)"
              addLabel="Add highlight"
              values={getStringList(edu.highlights)}
              onChange={(highlights) => list.update(i, { highlights })}
              ai={{ ...ai, type: "education", context: `${getString(edu.degree)} in ${getString(edu.area)}` }}
            />
          </EntryCard>
        )}
      />
      <AddEntryButton label="Add education" onClick={list.add} />
    </div>
  );
}

export function ProjectsSection({ entries, onChange, ai }: EntrySectionProps) {
  const list = useEntryList("projects", entries, onChange);
  return (
    <div className="animate-fade">
      <SectionHeading eyebrow="Projects" title="Projects" description="Work you built or led. A live link helps reviewers see it." />
      <SortableList
        items={list.items}
        getId={getId}
        onReorder={list.reorder}
        renderItem={(proj, i, handle, isDragging, isSorting) => (
          <EntryCard
            title={getString(proj.name).trim() || `Project ${i + 1}`}
            subtitle={joinParts(proj.summary)}
            handle={handle}
            isDragging={isDragging}
            isSorting={isSorting}
            onRemove={() => list.remove(i)}
            removeLabel={`Remove project ${i + 1}`}
          >
            <TextField label="Project Name" required placeholder="e.g. Open Source CLI Tool" value={proj.name} onChange={(name) => list.update(i, { name })} />
            <div className={editorStyles.threeColumnGrid}>
              <TextField label="Start Date" placeholder="e.g. 2023-01" value={proj.start_date} onChange={(start_date) => list.update(i, { start_date })} />
              <TextField label="End Date" placeholder="e.g. present" value={proj.end_date} onChange={(end_date) => list.update(i, { end_date })} />
              <TextField label="Location" placeholder="(optional)" value={proj.location} onChange={(location) => list.update(i, { location })} />
            </div>
            <TextField label="Live Demo Link" type="url" placeholder="https://your-demo.app" value={proj.url} onChange={(url) => list.update(i, { url })} />
            <div className="form-group">
              <label className="form-label">Summary</label>
              <div className={styles.row}>
                <input
                  className="form-input"
                  placeholder="One-line description"
                  value={getString(proj.summary)}
                  onChange={(event) => list.update(i, { summary: event.target.value })}
                />
                <AIPolishButton
                  ai={ai}
                  text={getString(proj.summary)}
                  label="Polish project summary with AI"
                  onSuggest={(summary) => list.update(i, { summary })}
                  type="project_summary"
                  context={getString(proj.name)}
                />
              </div>
            </div>
            <HighlightsField
              label="Highlights"
              addLabel="Add highlight"
              values={getStringList(proj.highlights)}
              onChange={(highlights) => list.update(i, { highlights })}
              ai={{ ...ai, type: "project_highlight", context: getString(proj.name) }}
            />
          </EntryCard>
        )}
      />
      <AddEntryButton label="Add project" onClick={list.add} />
    </div>
  );
}

export function PublicationsSection({ entries, onChange }: EntrySectionProps) {
  const list = useEntryList("publications", entries, onChange);
  return (
    <div className="animate-fade">
      <SectionHeading eyebrow="Publications" title="Publications" description="Papers and articles, with your name marked in the author list." />
      <SortableList
        items={list.items}
        getId={getId}
        onReorder={list.reorder}
        renderItem={(pub, i, handle, isDragging, isSorting) => (
          <EntryCard
            title={getString(pub.title).trim() || `Publication ${i + 1}`}
            subtitle={joinParts(pub.journal, pub.date)}
            handle={handle}
            isDragging={isDragging}
            isSorting={isSorting}
            onRemove={() => list.remove(i)}
            removeLabel={`Remove publication ${i + 1}`}
          >
            <TextField label="Title" required placeholder="Paper/Article Title" value={pub.title} onChange={(title) => list.update(i, { title })} />
            <TextField
              label="Authors (comma-separated, use *name* for yourself)"
              required
              placeholder="*John Doe*, Jane Smith, Bob Jones"
              value={pub.authors}
              onChange={(authors) => list.update(i, { authors })}
            />
            <div className={editorStyles.twoColumnGrid}>
              <TextField label="Journal/Conference" placeholder="e.g. NeurIPS 2023" value={pub.journal} onChange={(journal) => list.update(i, { journal })} />
              <TextField label="Date" placeholder="e.g. 2023-07" value={pub.date} onChange={(date) => list.update(i, { date })} />
            </div>
            <div className={editorStyles.twoColumnGrid}>
              <TextField label="DOI (optional)" placeholder="10.1234/example" value={pub.doi} onChange={(doi) => list.update(i, { doi })} />
              <TextField label="URL (optional)" placeholder="https://..." value={pub.url} onChange={(url) => list.update(i, { url })} />
            </div>
          </EntryCard>
        )}
      />
      <AddEntryButton label="Add publication" onClick={list.add} />
    </div>
  );
}

export function SkillsSection({ entries, onChange, ai, headline }: EntrySectionProps & { headline: string }) {
  const list = useEntryList("skills", entries, onChange);
  return (
    <div className="animate-fade">
      <SectionHeading eyebrow="Skills" title="Skills" description="Group related skills by category so recruiters can scan them quickly." />
      <SortableList
        items={list.items}
        getId={getId}
        onReorder={list.reorder}
        renderItem={(skill, i, handle) => (
          <div className={styles.row}>
            <button type="button" className={styles.handle} aria-label={`Drag skill group ${i + 1}`} {...handle}>
              <GripVertical size={14} />
            </button>
            <input
              className={`form-input ${styles.skillCategory}`}
              placeholder="Category *"
              aria-label={`Skill category ${i + 1}`}
              value={getString(skill.label)}
              onChange={(event) => list.update(i, { label: event.target.value })}
            />
            <input
              className="form-input"
              placeholder="e.g. Python, JavaScript, React"
              aria-label={`Skills in group ${i + 1}`}
              value={getString(skill.details)}
              onChange={(event) => list.update(i, { details: event.target.value })}
            />
            <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} aria-label={`Remove skill group ${i + 1}`} onClick={() => list.remove(i)}>
              <X size={15} />
            </button>
          </div>
        )}
      />
      <div className={styles.toolbar}>
        <AddEntryButton label="Add skill category" onClick={list.add} />
        <Button
          variant="secondary"
          icon={<Sparkles size={15} />}
          loading={ai.busy}
          disabled={!headline}
          title={headline ? "Suggest skills for your headline" : "Add a headline first"}
          onClick={async () => {
            const current = entries.map((entry) => getString(entry.details)).join(", ");
            const suggestion = await ai.suggest(current, "skills", headline || "Professional");
            if (suggestion) onChange([...entries, { ...getEmptyEntry("skills"), label: "Suggested", details: suggestion }]);
          }}
        >
          Suggest skills
        </Button>
      </div>
    </div>
  );
}

const SIMPLE_SECTIONS = {
  honors: { eyebrow: "Awards", title: "Awards and certifications", description: "One line each: what, who awarded it, and when.", field: "bullet", placeholder: "e.g. AWS Certified, Forbes 30 Under 30", add: "Add award or certification", numbering: "none" },
  patents: { eyebrow: "Patents", title: "Patents", description: "Title and patent number, numbered automatically.", field: "number", placeholder: "e.g. Patent Title (US Patent XX,XXX,XXX)", add: "Add patent", numbering: "ascending" },
  talks: { eyebrow: "Talks", title: "Invited talks", description: "Talk title, event and year, most recent first.", field: "reversed_number", placeholder: "e.g. Talk Title — Conference Name (Year)", add: "Add talk", numbering: "descending" },
} as const;

/** One-line lists: honors (bullets), patents (numbered), talks (reverse-numbered). */
export function SimpleListSection({ section, entries, onChange }: Omit<EntrySectionProps, "ai"> & { section: keyof typeof SIMPLE_SECTIONS }) {
  const config = SIMPLE_SECTIONS[section];
  const list = useEntryList(section, entries, onChange);
  const count = list.items.length;
  return (
    <div className="animate-fade">
      <SectionHeading eyebrow={config.eyebrow} title={config.title} description={config.description} />
      <SortableList
        items={list.items}
        getId={getId}
        onReorder={list.reorder}
        renderItem={(entry, i, handle) => (
          <div className={styles.row}>
            <button type="button" className={styles.handle} aria-label={`Drag item ${i + 1}`} {...handle}>
              <GripVertical size={14} />
            </button>
            {config.numbering !== "none" && (
              <span className={styles.rowIndex}>{config.numbering === "ascending" ? i + 1 : count - i}.</span>
            )}
            <input
              className="form-input"
              placeholder={config.placeholder}
              aria-label={`${config.add.replace(/^Add /, "")} ${i + 1}`}
              value={getString(entry[config.field])}
              onChange={(event) => list.update(i, { [config.field]: event.target.value })}
            />
            <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} aria-label={`Remove item ${i + 1}`} onClick={() => list.remove(i)}>
              <X size={15} />
            </button>
          </div>
        )}
      />
      <AddEntryButton label={config.add} onClick={list.add} />
    </div>
  );
}

function AIPolishButton({
  ai,
  text,
  label,
  onSuggest,
  type,
  context,
}: {
  ai: AIHelper;
  text: string;
  label: string;
  onSuggest: (value: string) => void;
  type: string;
  context: string;
}) {
  return (
    <button
      type="button"
      className={styles.iconBtn}
      data-tone="accent"
      title="AI polish"
      aria-label={label}
      disabled={ai.busy || !text.trim()}
      onClick={async () => {
        const suggestion = await ai.suggest(text, type, context);
        if (suggestion) onSuggest(suggestion);
      }}
    >
      <Sparkles size={15} />
    </button>
  );
}
