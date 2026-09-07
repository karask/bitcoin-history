"use client";

import { useSyncExternalStore } from "react";

// The three store functions are exported so tests/hydration.test.mjs can verify the
// hydration contract directly, without needing to mount React.

const QUERY = "(prefers-reduced-motion: reduce)";

/** Subscribe to changes in the visitor's reduced-motion setting. */
export function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The visitor's current setting, read fresh each time React asks. */
export function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** The server cannot know a client media query, so it always reports "no preference". */
export function getServerSnapshot(): boolean {
  return false;
}

/**
 * Hydration-safe replacement for motion's `useReducedMotion`.
 *
 * That hook reads the media query synchronously into `useState` during the first render,
 * so a visitor with reduced motion enabled hydrates with `true` while the server rendered
 * `false` — React then reports a hydration mismatch and throws the tree away. It also
 * never updates after mount.
 *
 * `useSyncExternalStore` fixes both: the server snapshot is used for SSR *and* for the
 * hydration render, so the first client render always matches the HTML, and React
 * re-renders immediately afterwards with the real value. Changing the OS setting mid-visit
 * now updates the ride instead of requiring a reload.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
