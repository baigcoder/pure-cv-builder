import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Sparkles, TriangleAlert } from "lucide-react";
import styles from "./AppUI.module.css";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className={styles.sectionHeader}>
      {eyebrow && (
        <div className={styles.eyebrow}>
          <Sparkles size={14} />
          {eyebrow}
        </div>
      )}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}

export function ActionBar({ children, align = "left" }: { children: ReactNode; align?: "left" | "center" }) {
  return (
    <div className={`${styles.actionBar} ${align === "center" ? styles.actionBarCenter : ""}`}>
      {children}
    </div>
  );
}

interface StatusBannerProps {
  title: string;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
}

export function StatusBanner({ title, children, tone = "info" }: StatusBannerProps) {
  const icon = {
    info: <Info size={18} />,
    success: <CheckCircle2 size={18} />,
    warning: <TriangleAlert size={18} />,
    error: <AlertCircle size={18} />,
  }[tone];

  const toneClass = {
    info: styles.statusInfo,
    success: styles.statusSuccess,
    warning: styles.statusWarning,
    error: styles.statusError,
  }[tone];

  return (
    <div className={`${styles.statusBanner} ${toneClass}`}>
      {icon}
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.emptyState}>
      {icon}
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

interface TemplateCardProps {
  name: string;
  image: string;
  tags: string[];
  selected?: boolean;
  onClick?: () => void;
}

export function TemplateCard({ name, image, tags, selected = false, onClick }: TemplateCardProps) {
  return (
    <button
      type="button"
      className={`${styles.templateCard} ${selected ? styles.templateCardSelected : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className={styles.templateImageWrap}>
        <img src={image} alt={`${name} template preview`} className={styles.templateImage} />
      </span>
      <span className={styles.templateInfo}>
        <span className={styles.templateName}>{name}</span>
        <span className={styles.templateTags}>
          {tags.slice(0, 2).map((tag) => (
            <span key={tag} className={styles.templateTag}>{tag}</span>
          ))}
        </span>
      </span>
    </button>
  );
}

export function AIActionButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button type="button" className={styles.aiAction} disabled={disabled} onClick={onClick} title={title}>
      <Sparkles size={14} />
      {children}
    </button>
  );
}
