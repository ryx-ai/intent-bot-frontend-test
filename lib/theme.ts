export const DARK_THEME_VARS: Record<string, string> = {
  "--bg": "#0b0f19",
  "--bg-surface": "#111827",
  "--bg-card": "#151d30",
  "--bg-sidebar": "#0f172a",
  "--bg-hover": "#1e293b",
  "--text-primary": "#f8fafc",
  "--text-secondary": "#94a3b8",
  "--text-muted": "#64748b",
  "--accent": "#6366f1",
  "--accent-light": "rgba(99, 102, 241, 0.18)",
  "--accent-dim": "rgba(99, 102, 241, 0.12)",
  "--accent-glow": "rgba(99, 102, 241, 0.25)",
  "--border": "#1e293b",
  "--error": "#f87171",
  "--success": "#34d399",
  "--warning": "#fbbf24",
  "--shadow-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.3)",
  "--shadow-md": "0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)",
  "--shadow-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4)",
};

export const LIGHT_THEME_VARS: Record<string, string> = {
  "--bg": "#f8fafc",
  "--bg-surface": "#ffffff",
  "--bg-card": "#ffffff",
  "--bg-sidebar": "#f1f5f9",
  "--bg-hover": "#e2e8f0",
  "--text-primary": "#0f172a",
  "--text-secondary": "#475569",
  "--text-muted": "#64748b",
  "--accent": "#4f46e5",
  "--accent-light": "#d8dbe7",
  "--accent-dim": "rgba(79, 70, 229, 0.08)",
  "--accent-glow": "rgba(79, 70, 229, 0.15)",
  "--border": "#e2e8f0",
  "--error": "#ef4444",
  "--success": "#10b981",
  "--warning": "#d97706",
  "--shadow-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  "--shadow-md": "0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
  "--shadow-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)",
};

export function applyTheme(theme: "dark" | "light") {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const isDark = theme === "dark";

  if (isDark) {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
    for (const [key, value] of Object.entries(DARK_THEME_VARS)) {
      root.style.setProperty(key, value);
    }
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    for (const [key, value] of Object.entries(LIGHT_THEME_VARS)) {
      root.style.setProperty(key, value);
    }
  }

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
