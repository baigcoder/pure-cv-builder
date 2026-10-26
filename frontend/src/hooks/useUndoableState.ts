"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

interface Options {
  /** Edits closer together than this merge into one undo step (typing a word). */
  groupWindowMs?: number;
  limit?: number;
}

/**
 * `useState` with undo/redo.
 *
 * `setState` records history; `reset` replaces the value and clears history
 * (use it when loading a draft or a saved CV so undo can't jump back to empty).
 */
export function useUndoableState<T>(initial: T, { groupWindowMs = 800, limit = 100 }: Options = {}) {
  const [history, setHistory] = useState<History<T>>({ past: [], present: initial, future: [] });
  const lastChangeAtRef = useRef(0);

  const setState = useCallback(
    (action: SetStateAction<T>) => {
      // Decide grouping here, not in the updater: React may run updaters twice.
      const now = Date.now();
      const withinWindow = now - lastChangeAtRef.current < groupWindowMs;
      lastChangeAtRef.current = now;

      setHistory((current) => {
        const next =
          typeof action === "function" ? (action as (previous: T) => T)(current.present) : action;
        if (Object.is(next, current.present)) return current;

        const grouped = withinWindow && current.past.length > 0;
        return {
          past: grouped ? current.past : [...current.past, current.present].slice(-limit),
          present: next,
          future: [],
        };
      });
    },
    [groupWindowMs, limit],
  );

  const reset = useCallback((action: SetStateAction<T>) => {
    lastChangeAtRef.current = 0;
    setHistory((current) => ({
      past: [],
      present: typeof action === "function" ? (action as (previous: T) => T)(current.present) : action,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    lastChangeAtRef.current = 0;
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastChangeAtRef.current = 0;
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const [next, ...rest] = current.future;
      return { past: [...current.past, current.present], present: next, future: rest };
    });
  }, []);

  return {
    state: history.present,
    setState,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

/** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, anywhere on the page. */
export function useUndoShortcuts(undo: () => void, redo: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y" && !event.metaKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, redo, undo]);
}
