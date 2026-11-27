/**
 * Theme switching.
 *
 * All colours live in app/globals.css (light tokens on :root, matte-black
 * tokens under [data-theme="dark"]). This file only flips the attribute and
 * class. It must not write colour values inline: inline values override the
 * stylesheet and bring back old colours.
 */

// Tokens that older versions of this file wrote inline; cleared on every switch
// so a page that was open during an update doesn't keep stale colours.
const LEGACY_INLINE_TOKENS = [
  "--bg",
  "--bg-surface",
  "--bg-card",
  "--bg-sidebar",
  "--bg-hover",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--accent",
  "--accent-light",
  "--accent-dim",
  "--accent-glow",
  "--border",
  "--error",
  "--success",
  "--warning",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
];

export function applyTheme(theme: "dark" | "light") {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const isDark = theme === "dark";

  for (const key of LEGACY_INLINE_TOKENS) root.style.removeProperty(key);
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";

  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

export function subscribeTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function getThemeSnapshot() {
  if (typeof window === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function getServerThemeSnapshot() {
  return false;
}
