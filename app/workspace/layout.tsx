"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { applyTheme, subscribeTheme, getThemeSnapshot, getServerThemeSnapshot } from "@/lib/theme";

interface UserInfo {
  name: string;
  role?: string;
  tenant?: {
    id: number;
    slug: string;
    name: string;
    subscription_status?: string;
    is_subscription_active?: boolean;
  };
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
  { label: "SEO Health Auditor", href: "/workspace/seo" },
  { label: "Knowledge Lake", href: "/workspace/knowledge" },
  { label: "Visual Mapping", href: "/workspace/visual-mapping" },
  { label: "Deploy Agent", href: "/workspace/deploy" },
];

const SETTINGS_ITEMS = [
  { label: "Workspace Settings", href: "/workspace/settings" },
  { label: "AI Core Metrics", href: "/workspace/metrics" },
  { label: "Billing & Plans", href: "/workspace/billing" },
];

const SUPER_ADMIN_NAV_ITEMS = [
  { label: "Tenant Management", href: "/workspace/admin/tenants" },
  { label: "Package Management", href: "/workspace/admin/plans" },
];

const SUPER_ADMIN_SETTINGS_ITEMS: typeof SETTINGS_ITEMS = [];

function matchesNav(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [user, setUser] = useState<UserInfo | null>(null);
  const isDark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved === "dark" || (!saved && prefersDark) ? "dark" : "light";
    applyTheme(initial);
  }, []);

  useEffect(() => {
    api
      .get<UserInfo>("/api/auth/me")
      .then(setUser)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        console.error("Failed to load user info", err);
        setUser(null);
      });
  }, []);

  useEffect(() => {
    if (!user?.role) return;

    const isSuperAdmin = user.role === "super_admin";
    const isAdminRoute = pathname.startsWith("/workspace/admin");

    if (isSuperAdmin && !isAdminRoute) {
      router.replace("/workspace/admin/tenants");
    } else if (!isSuperAdmin && isAdminRoute) {
      router.replace("/workspace/dashboard");
    }
  }, [pathname, router, user?.role]);

  const isSuperAdmin = user?.role === "super_admin";
  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : NAV_ITEMS;
  const settingsItems = isSuperAdmin ? SUPER_ADMIN_SETTINGS_ITEMS : SETTINGS_ITEMS;

  return (
    <div
      style={{
        display: "flex",
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
          height: "100%",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
          padding: "1.25rem 1rem",
        }}
      >
        {/* Brand / Logo & Dark Mode Toggle */}
        <div
          style={{
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 0.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <Image
              src="/logo-only.png"
              alt="RYX AI"
              width={95}
              height={28}
              priority
              style={{ height: "auto" }}
            />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border)",
              color: isDark ? "#fbbf24" : "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.08)";
              e.currentTarget.style.transform = "scale(1.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {isDark ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
        </div>

        {/* Scrollable Navigation Area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: "0.25rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Workspace section */}
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: 600,
              letterSpacing: "0.05em",
              marginBottom: "0.5rem",
              padding: "0 0.5rem",
            }}
          >
            Workspace
          </div>
          <ul style={{ display: "flex", flexDirection: "column", gap: "0.25rem", listStyle: "none", padding: 0, margin: "0 0 1.25rem 0" }}>
            {navItems.map((item) => {
              const isActive = matchesNav(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    style={{
                      display: "block",
                      padding: "0.6rem 0.85rem",
                      borderRadius: 8,
                      fontSize: "0.875rem",
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      background: isActive ? "var(--accent-light)" : "transparent",
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

          {settingsItems.length > 0 && (
            <>
              {/* Settings section */}
              <div
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  marginBottom: "0.5rem",
                  padding: "0 0.5rem",
                }}
              >
                Settings
              </div>
              <ul style={{ display: "flex", flexDirection: "column", gap: "0.25rem", listStyle: "none", padding: 0, margin: 0 }}>
                {settingsItems.map((item) => {
                  const isActive = matchesNav(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        style={{
                          display: "block",
                          padding: "0.6rem 0.85rem",
                          borderRadius: 8,
                          fontSize: "0.875rem",
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? "var(--accent)" : "var(--text-secondary)",
                          background: isActive ? "var(--accent-light)" : "transparent",
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
            </>
          )}
        </div>

        {/* Footer: User + Logout */}
        <div
          style={{
            flexShrink: 0,
            marginTop: "auto",
            paddingTop: "0.85rem",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.5rem",
              borderRadius: 8,
              background: "rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#ffffff",
                flexShrink: 0,
              }}
            >
              {user ? getInitials(user.name) : "—"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.name ?? "Loading..."}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                {user?.role ? user.role.replace("_", " ") : "Member"}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              width: "100%",
              padding: "0.55rem 0.85rem",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: 500,
              fontFamily: "'Inter', sans-serif",
              cursor: "pointer",
              textAlign: "left" as const,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--error)";
              e.currentTarget.style.borderColor = "var(--error)";
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
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
        {user?.tenant && user.tenant.is_subscription_active === false && !isSuperAdmin && (
          <div
            style={{
              background: "linear-gradient(90deg, #991b1b 0%, #dc2626 100%)",
              color: "var(--text-primary)",
              padding: "0.85rem 1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              boxShadow: "0 4px 12px rgba(220, 38, 38, 0.25)",
              fontSize: "0.9rem",
              fontWeight: 500,
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontSize: "1.2rem" }}>🚨</span>
              <span>
                <strong>Subscription Expired:</strong> Your 3-day trial/subscription has ended. Your embedded chatbot is currently locked (402 Payment Required).
              </span>
            </div>
            <Link
              href="/workspace/billing"
              style={{
                background: "#ffffff",
                color: "#991b1b",
                padding: "0.45rem 1rem",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.85rem",
                textDecoration: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              Upgrade Plan →
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
