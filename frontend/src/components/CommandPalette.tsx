"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import styles from "./CommandPalette.module.css";

export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  /** Shown on the right, e.g. "Ctrl Z". */
  shortcut?: string;
  /** Extra words that should match the search. */
  keywords?: string;
  run: () => void;
}

/** Render only while open: mounting fresh each time resets the search. */
interface CommandPaletteProps {
  onClose: () => void;
  commands: Command[];
}

/**
 * Score how well `query` matches `text` as an ordered subsequence. Higher is
 * better; null means no match. Rewards contiguous runs and word starts.
 */
function matchScore(query: string, text: string): number | null {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  let position = -1;
  let streak = 0;
  for (const char of query.toLowerCase()) {
    if (char === " ") continue;
    const next = haystack.indexOf(char, position + 1);
    if (next === -1) return null;
    streak = next === position + 1 ? streak + 1 : 0;
    const wordStart = next === 0 || /[\s:/-]/.test(haystack[next - 1]);
    score += 1 + streak * 2 + (wordStart ? 3 : 0);
    position = next;
  }
  return score - position * 0.01;
}

export function CommandPalette({ onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const scored = commands
      .map((command) => ({ command, score: matchScore(query, `${command.label} ${command.group} ${command.keywords ?? ""}`) }))
      .filter((item): item is { command: Command; score: number } => item.score !== null);
    if (query) scored.sort((a, b) => b.score - a.score);
    return scored.map((item) => item.command);
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  // Group headings only when browsing; search results stay ranked instead.
  const startsGroup = results.map((command, index) => !query && command.group !== results[index - 1]?.group);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={styles.searchRow}>
          <Search size={18} aria-hidden="true" />
          <input
            autoFocus
            className={styles.input}
            placeholder="Type a command or search sections and templates..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>
        <div className={styles.list} id="command-palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <div className={styles.empty}>No matching commands.</div>}
          {results.map((command, index) => {
            const showGroup = startsGroup[index];
            return (
              <div key={command.id}>
                {showGroup && <div className={styles.group}>{command.group}</div>}
                <div
                  id={`command-${command.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  className={`${styles.item} ${index === active ? styles.itemActive : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  <span className={styles.icon}>{command.icon}</span>
                  <span className={styles.label}>
                    {command.label}
                    {query && <small>{command.group}</small>}
                  </span>
                  {command.shortcut && <kbd className={styles.kbd}>{command.shortcut}</kbd>}
                  {index === active && <CornerDownLeft size={14} className={styles.enter} aria-hidden="true" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.footer}>
          <span><kbd className={styles.kbd}>↑</kbd><kbd className={styles.kbd}>↓</kbd> navigate</span>
          <span><kbd className={styles.kbd}>Enter</kbd> run</span>
          <span><kbd className={styles.kbd}>Ctrl</kbd><kbd className={styles.kbd}>K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}

/** Open/close the palette with Ctrl/Cmd+K. */
export function useCommandPaletteShortcut(setOpen: (update: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);
}
