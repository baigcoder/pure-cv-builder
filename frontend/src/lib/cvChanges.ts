import type { CVData, Entry } from "@/lib/cvBuilder";

/** One reviewable difference between the CV and a suggested version of it. */
export interface CVChange {
  id: string;
  /** Section heading shown in the review list, e.g. "Experience". */
  group: string;
  /** What changed, e.g. "Northwind: bullet 2". */
  label: string;
  /** Plain text before and after, for the diff. Empty `before` means an addition. */
  before: string;
  after: string;
  path: (string | number)[];
  value: unknown;
  /** Appends `value` to the array at `path` instead of replacing it. */
  append?: boolean;
}

const PROFILE_FIELDS: { key: keyof CVData; label: string }[] = [
  { key: "headline", label: "Headline" },
  { key: "summary", label: "Summary" },
];

const SECTIONS: { key: keyof CVData; label: string; title: (entry: Entry) => string }[] = [
  { key: "experience", label: "Experience", title: (e) => String(e.company || e.position || "Role") },
  { key: "projects", label: "Projects", title: (e) => String(e.name || "Project") },
  { key: "education", label: "Education", title: (e) => String(e.institution || e.area || "Education") },
  { key: "skills", label: "Skills", title: (e) => String(e.label || "Skills") },
  { key: "publications", label: "Publications", title: (e) => String(e.title || "Publication") },
  { key: "honors", label: "Awards", title: (e) => String(e.label || e.name || "Award") },
  { key: "talks", label: "Talks", title: (e) => String(e.name || e.title || "Talk") },
  { key: "patents", label: "Patents", title: (e) => String(e.title || e.name || "Patent") },
];

const FIELD_LABELS: Record<string, string> = {
  summary: "description",
  details: "skills",
  position: "job title",
  name: "name",
  label: "label",
  area: "field of study",
};

const text = (value: unknown) => (Array.isArray(value) ? value.join(", ") : String(value ?? "")).trim();
const entryText = (entry: Entry) =>
  Object.entries(entry)
    .filter(([key, value]) => key !== "id" && text(value))
    .map(([, value]) => text(value))
    .join(" · ");

/**
 * Field-level changes from `before` to `after`. Only edits and additions are
 * reported; anything the suggestion dropped is left alone, so applying a
 * change can never delete the user's content.
 */
export function diffCV(before: CVData, after: CVData): CVChange[] {
  const changes: CVChange[] = [];

  for (const { key, label } of PROFILE_FIELDS) {
    const was = text(before[key]);
    const now = text(after[key]);
    if (now && now !== was) changes.push({ id: String(key), group: "Profile", label, before: was, after: now, path: [key], value: after[key] });
  }

  for (const section of SECTIONS) {
    const oldEntries = (before[section.key] as Entry[]) || [];
    const newEntries = (after[section.key] as Entry[]) || [];
    newEntries.forEach((entry, index) => {
      const original = oldEntries[index];
      if (!original) {
        if (entryText(entry)) {
          changes.push({
            id: `${section.key}.${index}.new`,
            group: section.label,
            label: `New: ${section.title(entry)}`,
            before: "",
            after: entryText(entry),
            path: [section.key],
            value: entry,
            append: true,
          });
        }
        return;
      }
      const title = section.title(original);
      for (const [field, value] of Object.entries(entry)) {
        if (field === "id") continue;
        if (Array.isArray(value)) {
          const oldList = Array.isArray(original[field]) ? (original[field] as string[]) : [];
          value.forEach((item, itemIndex) => {
            const was = text(oldList[itemIndex]);
            const now = text(item);
            if (!now || now === was) return;
            changes.push({
              id: `${section.key}.${index}.${field}.${itemIndex}`,
              group: section.label,
              label: was ? `${title}: bullet ${itemIndex + 1}` : `${title}: new bullet`,
              before: was,
              after: now,
              path: [section.key, index, field, itemIndex],
              value: item,
            });
          });
        } else {
          const was = text(original[field]);
          const now = text(value);
          if (!now || now === was) continue;
          changes.push({
            id: `${section.key}.${index}.${field}`,
            group: section.label,
            label: field === "details" ? title : `${title}: ${FIELD_LABELS[field] || field}`,
            before: was,
            after: now,
            path: [section.key, index, field],
            value,
          });
        }
      }
    });
  }
  return changes;
}

const readPath = (root: unknown, path: (string | number)[]) =>
  path.reduce<unknown>((node, key) => (node == null ? undefined : (node as Record<string | number, unknown>)[key]), root);

/**
 * Apply the chosen changes to the CV as it is now. A change whose original
 * text was edited in the meantime is skipped rather than overwriting the edit.
 */
export function applyCVChanges(current: CVData, changes: CVChange[]): { data: CVData; skipped: number } {
  const data = structuredClone(current);
  let skipped = 0;
  // Edits first, appends last, so new entries don't shift indexes.
  const ordered = [...changes].sort((a, b) => Number(Boolean(a.append)) - Number(Boolean(b.append)));
  for (const change of ordered) {
    if (change.append) {
      const list = readPath(data, change.path);
      if (Array.isArray(list)) list.push(structuredClone(change.value));
      continue;
    }
    if (text(readPath(data, change.path)) !== change.before) {
      skipped += 1;
      continue;
    }
    const parent = readPath(data, change.path.slice(0, -1));
    if (parent && typeof parent === "object") {
      (parent as Record<string | number, unknown>)[change.path[change.path.length - 1]] = structuredClone(change.value);
    } else {
      skipped += 1;
    }
  }
  return { data, skipped };
}
