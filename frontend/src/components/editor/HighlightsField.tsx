"use client";

import { GripVertical, Plus, Sparkles, X } from "lucide-react";
import styles from "./EditorParts.module.css";
import { SortableList } from "./SortableList";
import type { AIHelper } from "./types";

interface HighlightsFieldProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  multiline?: boolean;
  placeholder?: string;
  /** Enables a per-bullet AI polish button. */
  ai?: AIHelper & { type: string; context: string };
}

/** An editable, reorderable list of bullet points. */
export function HighlightsField({ label, values, onChange, addLabel, multiline, placeholder, ai }: HighlightsFieldProps) {
  // Bullets are plain controlled strings, so their position is a sufficient key.
  const items = values.map((value, index) => ({ key: String(index), value }));

  const update = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <SortableList
        items={items}
        getId={(item) => item.key}
        onReorder={(next) => onChange(next.map((item) => item.value))}
        renderItem={(item, index, handle) => (
          <div className={styles.row}>
            <button type="button" className={styles.handle} aria-label={`Drag bullet ${index + 1}`} {...handle}>
              <GripVertical size={14} />
            </button>
            {multiline ? (
              <textarea
                className="form-textarea"
                rows={2}
                value={item.value}
                placeholder={placeholder}
                aria-label={`${label} ${index + 1}`}
                onChange={(event) => update(index, event.target.value)}
              />
            ) : (
              <input
                className="form-input"
                value={item.value}
                placeholder={placeholder}
                aria-label={`${label} ${index + 1}`}
                onChange={(event) => update(index, event.target.value)}
              />
            )}
            {ai && (
              <button
                type="button"
                className={styles.iconBtn}
                data-tone="accent"
                title="AI polish"
                aria-label={`Polish bullet ${index + 1} with AI`}
                disabled={ai.busy || !item.value.trim()}
                onClick={async () => {
                  const suggestion = await ai.suggest(item.value, ai.type, ai.context);
                  if (suggestion) update(index, suggestion);
                }}
              >
                <Sparkles size={15} />
              </button>
            )}
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
              aria-label={`Remove bullet ${index + 1}`}
              onClick={() => onChange(values.filter((_, idx) => idx !== index))}
            >
              <X size={15} />
            </button>
          </div>
        )}
      />
      <button type="button" className={styles.addRow} onClick={() => onChange([...values, ""])}>
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}
