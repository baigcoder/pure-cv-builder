"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, GripVertical, Trash2 } from "lucide-react";
import styles from "./EditorParts.module.css";
import type { DragHandleProps } from "./SortableList";

interface EntryCardProps {
  title: string;
  subtitle?: string;
  handle: DragHandleProps;
  isDragging: boolean;
  /** While any card in the list is dragged, all cards show only their header. */
  isSorting?: boolean;
  onRemove: () => void;
  removeLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsible, draggable card for one CV entry (a role, degree, project...). */
export function EntryCard({
  title,
  subtitle,
  handle,
  isDragging,
  isSorting = false,
  onRemove,
  removeLabel,
  defaultOpen = true,
  children,
}: EntryCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`${styles.card} ${open && !isSorting ? styles.cardOpen : ""} ${isDragging ? styles.cardDragging : ""}`}>
      <div className={styles.cardHeader}>
        <button type="button" className={styles.handle} aria-label={`Drag to reorder ${title}`} {...handle}>
          <GripVertical size={16} />
        </button>
        <button type="button" className={styles.cardTitle} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronDown size={16} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
        </button>
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onRemove} aria-label={removeLabel}>
          <Trash2 size={15} />
        </button>
      </div>
      {open && !isSorting && <div className={styles.cardBody}>{children}</div>}
    </div>
  );
}
