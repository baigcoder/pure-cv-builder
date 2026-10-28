"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./ui.module.css";

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  /** Square, icon-only button; pass an aria-label. */
  iconOnly?: boolean;
  fullWidth?: boolean;
}

export const buttonClass = ({
  variant = "secondary",
  size = "md",
  iconOnly,
  fullWidth,
  className,
}: Pick<ButtonProps, "variant" | "size" | "iconOnly" | "fullWidth" | "className">) =>
  cx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, iconOnly && "btn-icon", fullWidth && "btn-full", className);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, loading = false, iconOnly, fullWidth, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, iconOnly, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------- Field */

interface FieldProps {
  label: ReactNode;
  /** A single input/textarea/select; it receives the generated id and ARIA wiring. */
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  /** Shown on the right of the label, e.g. a character counter or an action. */
  aside?: ReactNode;
  className?: string;
}

/** Label + control + hint/error, with ids and aria-describedby connected. */
export function Field({ label, children, hint, error, required, optional, aside, className }: FieldProps) {
  const id = useId();
  const controlId = (isValidElement(children) && (children.props.id as string)) || `${id}-control`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const existingClass = (children.props.className as string | undefined) ?? "";

  const control = cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
    className: cx(existingClass, error && "form-input-error"),
  });

  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.labelRow}>
        <label className="form-label" htmlFor={controlId}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
          {optional && <span className={styles.optional}>optional</span>}
        </label>
        {aside}
      </div>
      {control}
      {error ? (
        <span id={`${id}-error`} className="form-error" role="alert">{error}</span>
      ) : (
        hint && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>
      )}
    </div>
  );
}

/** "42/80" style counter that warns near the limit and flags overflow. */
export function CharCounter({ length, recommended, max }: { length: number; recommended: number; max?: number }) {
  const over = max !== undefined ? length > max : length > recommended * 1.25;
  const warn = !over && length > recommended;
  return (
    <span className={cx(styles.counter, warn && styles.counterWarn, over && styles.counterOver)} aria-live="polite">
      {length}/{recommended}
    </span>
  );
}

/* -------------------------------------------------------------------- Card */

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  as?: "section" | "div" | "article" | "aside";
}

export function Card({ title, description, eyebrow, actions, padded = true, as: Tag = "section", className, children, ...rest }: CardProps) {
  const hasHeader = title || description || eyebrow || actions;
  return (
    <Tag className={cx(styles.card, padded && styles.cardPadded, className)} {...rest}>
      {hasHeader && (
        <header className={styles.cardHeader}>
          <div>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            {title && <h2 className={styles.cardTitle}>{title}</h2>}
            {description && <p className={styles.cardDescription}>{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </Tag>
  );
}

/* --------------------------------------------------------- SectionHeading */

export function SectionHeading({ eyebrow, title, description }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className={styles.sectionHeading}>
      {/* A label that only repeats the title adds nothing. */}
      {eyebrow && String(eyebrow).toLowerCase() !== String(title).toLowerCase() && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "solid";

export function Badge({ tone = "neutral", className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={cx(styles.badge, tone !== "neutral" && styles[`badge_${tone}`], className)} {...rest}>
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- Kbd */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

export { styles as uiStyles };
