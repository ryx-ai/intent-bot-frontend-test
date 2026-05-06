"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

interface UserInfo {
  name: string;
  role?: string;
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const initials = trimmed
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return initials || "?";
}

const NAV_ITEMS = [
  { label: "Testing Platform", href: "/workspace/testing" },
  { label: "Chatbot Analytics", href: "/workspace/dashboard" },
  { label: "Knowledge Lake", href: "/workspace/knowledge" },
  { label: "Visual Mapping", href: "/workspace/visual-mapping" },
  { label: "Deploy Agent", href: "/workspace/deploy" },
];

const SETTINGS_ITEMS = [
  { label: "AI Core Metrics", href: "/workspace/metrics" },
];

// `pathname === href` would never highlight nested routes like
// `/workspace/knowledge/anything`. Treat any descendant URL as active.
function matchesNav(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    api
      .get<UserInfo>("/api/auth/me")
      .then(setUser)
      .catch((err) => {
        // 401 already triggers a redirect inside api.ts. Other failures
        // (transient 5xx, network blip, CORS) shouldn't punt the user back
        // to login — that destroys in-progress edits on every backend hiccup.
        if (err instanceof ApiError && err.status === 401) {
          // api.ts has already set window.location.href; nothing to do.
          return;
        }
        console.error("Failed to load user info", err);
        setUser(null);
      });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        // 100vw includes the vertical-scrollbar gutter on Windows browsers,
        // producing a phantom horizontal scrollbar across every workspace
        // page. 100% confines the layout to the actual content area.
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
        backgroundColor: "var(--bg)",
        color: "var(--text-primary)",
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 250,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
          padding: "1.5rem 1rem",
        }}
      >
        {/* Brand / Logo */}
        <div style={{ marginBottom: "2.5rem", padding: "0 0.5rem" }}>
          <Image
            src="/logo1.png"
            alt="RYX AI"
            width={130}
            height={40}
            style={{ width: 130, height: "auto" }}
            priority
          />
        </div>

        {/* Workspace section */}
        <div
          style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginBottom: "0.75rem",
            padding: "0 0.5rem",
          }}
        >
          Workspace
        </div>
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.25rem", listStyle: "none", padding: 0, margin: "0 0 1.5rem 0" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = matchesNav(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "0.75rem 1rem",
                    borderRadius: 6,
                    fontSize: "0.9rem",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent)" : "var(--text-secondary)",
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Settings section */}
        <div
          style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginBottom: "0.75rem",
            padding: "0 0.5rem",
          }}
        >
          Settings
        </div>
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.25rem", listStyle: "none", padding: 0, margin: 0 }}>
          {SETTINGS_ITEMS.map((item) => {
            const isActive = matchesNav(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "0.75rem 1rem",
                    borderRadius: 6,
                    fontSize: "0.9rem",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent)" : "var(--text-secondary)",
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Footer: User + Logout */}
        <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.5rem", marginBottom: "0.25rem" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {user ? getInitials(user.name) : "—"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.name ?? "Loading..."}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{user?.role ?? "Member"}</div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              width: "100%",
              padding: "0.65rem 1rem",
              borderRadius: 6,
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
              fontWeight: 500,
              fontFamily: "'Inter', sans-serif",
              cursor: "pointer",
              textAlign: "left" as const,
              transition: "all 0.2s ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        style={{
          flexGrow: 1,
          height: "100%",
          overflowY: "auto",
          backgroundColor: "var(--bg)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
