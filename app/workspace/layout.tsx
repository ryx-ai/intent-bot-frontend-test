"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import {
  applyTheme,
  subscribeTheme,
  getThemeSnapshot,
  getServerThemeSnapshot,
} from "@/lib/theme";
import { ConfirmDialog } from "./_components/ConfirmDialog";
import { unsavedChangesStore } from "@/lib/unsaved-changes";

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

type NavItem = { label: string; href: string; icon: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Set up",
    items: [
      { label: "Assistant", href: "/workspace/testing", icon: "assistant" },
      { label: "Knowledge", href: "/workspace/knowledge", icon: "knowledge" },
      { label: "Pictures", href: "/workspace/visual-mapping", icon: "pictures" },
      { label: "Add to website", href: "/workspace/deploy", icon: "install" },
    ],
  },
  {
    title: "Results",
    items: [
      { label: "Conversations", href: "/workspace/dashboard", icon: "chats" },
      { label: "Tracking", href: "/workspace/metrics", icon: "tracking" },
      { label: "Website health", href: "/workspace/seo", icon: "health" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/workspace/settings", icon: "settings" },
      { label: "Plans", href: "/workspace/billing", icon: "plans" },
    ],
  },
];

const SUPER_ADMIN_GROUPS: NavGroup[] = [
  {
    title: "Platform",
    items: [
      { label: "Tenants", href: "/workspace/admin/tenants", icon: "users" },
      { label: "Packages", href: "/workspace/admin/plans", icon: "plans" },
      { label: "Core prompt", href: "/workspace/admin/core-prompt", icon: "prompt" },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    assistant: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />,
    knowledge: (
      <>
        <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
        <path d="M4 21V5" />
      </>
    ),
    pictures: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </>
    ),
    install: <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />,
    chats: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    tracking: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    health: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
    plans: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 20a6 6 0 0 0-4-5.6" />
      </>
    ),
    prompt: <path d="M4 6h16M4 12h10M4 18h7" />,
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      {paths[name] ?? paths.settings}
    </svg>
  );
}

function matchesNav(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [plan, setPlan] = useState<{ status: string; active: boolean; days: number; name: string } | null>(null);

  const isDark = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const isDirty = useSyncExternalStore(
    unsavedChangesStore.subscribe,
    unsavedChangesStore.getSnapshot,
    unsavedChangesStore.getServerSnapshot,
  );
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Close mobile menu on pathname change without setState inside useEffect
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  }

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (isDirty && pathname !== href) {
      e.preventDefault();
      setPendingHref(href);
      setIsLoggingOut(false);
      setShowConfirmModal(true);
      return;
    }
    setMobileMenuOpen(false);
  };

  const handleLogoutClick = () => {
    if (isDirty) {
      setIsLoggingOut(true);
      setPendingHref(null);
      setShowConfirmModal(true);
      return;
    }
    logout();
  };

  const handleConfirmLeave = () => {
    unsavedChangesStore.setDirty(false);
    setShowConfirmModal(false);
    if (isLoggingOut) {
      logout();
    } else if (pendingHref) {
      setMobileMenuOpen(false);
      router.push(pendingHref);
      setPendingHref(null);
    }
  };

  const handleCancelLeave = () => {
    setShowConfirmModal(false);
    setPendingHref(null);
    setIsLoggingOut(false);
  };

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const initial =
      saved === "dark" || (!saved && prefersDark) ? "dark" : "light";
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

  // Plan line under the name (not for platform admins)
  useEffect(() => {
    if (!user || user.role === "super_admin") return;
    api
      .get<{ subscription_status: string; is_active: boolean; days_remaining: number; plan?: { name?: string } | null }>(
        "/api/payments/subscription-status",
      )
      .then((r) =>
        setPlan({ status: r.subscription_status, active: r.is_active, days: r.days_remaining, name: r.plan?.name || "" }),
      )
      .catch(() => {});
  }, [user]);

  // Close the account menu on Escape
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!user?.role) return;

    const isSuperAdmin = user.role === "super_admin";
    const isAdminRoute = pathname.startsWith("/workspace/admin");

    if (isSuperAdmin && !isAdminRoute) {
      router.replace("/workspace/admin/tenants");
    } else if (!isSuperAdmin && isAdminRoute) {
      router.replace("/workspace/testing");
    }
  }, [pathname, router, user?.role]);

  const isSuperAdmin = user?.role === "super_admin";
  const groups = isSuperAdmin ? SUPER_ADMIN_GROUPS : NAV_GROUPS;
  const displayName = (user?.tenant?.name || user?.name || "").replace(/['\u2019]s workspace$/i, "").trim();
  const planLine = isSuperAdmin
    ? "Platform admin"
    : !plan
      ? ""
      : !plan.active
        ? plan.status === "trial" ? "Trial ended" : "Plan ended"
        : plan.status === "trial"
          ? `Free trial · ${plan.days} ${plan.days === 1 ? "day" : "days"} left`
          : plan.name || "Active plan";
  const planDot = !plan || isSuperAdmin ? "#cbd5e1" : !plan.active ? "#ef4444" : plan.status === "trial" ? "#f59e0b" : "#10b981";

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
      <style>{`
        .ws-nav { display: flex; align-items: center; gap: 11px; padding: 0.55rem 0.75rem; border-radius: 10px; font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); text-decoration: none; transition: background .15s ease, color .15s ease; }
        .ws-nav svg { color: var(--text-muted); transition: color .15s ease; }
        .ws-nav:hover { background: var(--bg-surface); color: var(--text-primary); }
        .ws-nav:hover svg { color: var(--text-primary); }
        .ws-nav-on, .ws-nav-on:hover { background: #0f172a; color: #fff; font-weight: 600; box-shadow: 0 6px 16px rgba(15,23,42,.18); }
        .ws-nav-on svg, .ws-nav-on:hover svg { color: #fff; }
        [data-theme="dark"] .ws-nav-on, [data-theme="dark"] .ws-nav-on:hover { background: #f2f2f2; color: #0a0a0a; box-shadow: none; }
        [data-theme="dark"] .ws-nav-on svg { color: #0a0a0a; }
        .ws-me { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; margin-top: 8px; border-radius: 14px; border: 1px solid transparent; background: var(--bg-surface); cursor: pointer; font-family: inherit; transition: border-color .15s ease, background .15s ease; }
        .ws-me:hover, .ws-me[aria-expanded="true"] { border-color: var(--border); background: var(--bg-card); }
        .ws-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 9px; background: transparent; color: var(--text-secondary); font: inherit; font-size: 0.85rem; text-decoration: none; cursor: pointer; text-align: left; }
        .ws-menu-item:hover { background: var(--bg-surface); color: var(--text-primary); }
        .ws-menu-out { color: #dc2626; }
        [data-theme="dark"] .ws-av { background: #f2f2f2 !important; color: #0a0a0a !important; }
        .ws-menu-out:hover { color: #dc2626; background: rgba(239,68,68,.06); }
        @media (max-width: 767px) {
          .workspace-sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 280px !important;
            z-index: 100 !important;
            padding: 10px !important;
            transform: translateX(-100%);
            transition: transform 0.25s ease-in-out !important;
          }
          .workspace-sidebar.open {
            transform: translateX(0) !important;
          }
          .mobile-header-bar {
            display: flex !important;
          }
        }
        @media (min-width: 768px) {
          .workspace-sidebar {
            transform: none !important;
          }
          .mobile-header-bar {
            display: none !important;
          }
        }
      `}</style>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 90,
          }}
        />
      )}

      {/* ── Sidebar: a floating card ── */}
      <div
        className={`workspace-sidebar ${mobileMenuOpen ? "open" : ""}`}
        style={{
          width: 264,
          height: "100%",
          flexShrink: 0,
          padding: "14px 0 14px 14px",
          boxSizing: "border-box",
          display: "flex",
        }}
      >
        <aside
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 10px 30px rgba(15,23,42,.07)",
            padding: "16px 10px 10px",
            position: "relative",
          }}
        >
          {/* Logo */}
          <div style={{ padding: "2px 10px 10px" }}>
            <Link
              href={isSuperAdmin ? "/workspace/admin/tenants" : "/workspace/testing"}
              onClick={(e) => handleNavClick(e, isSuperAdmin ? "/workspace/admin/tenants" : "/workspace/testing")}
              style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
            >
              <Image
                src={isDark ? "/ferry/svg/ferry-horizontal-white.svg" : "/ferry/svg/ferry-horizontal-black.svg"}
                alt="Ferry by RYX AI"
                width={140}
                height={30}
                priority
                style={{ width: "auto", height: 26, maxWidth: 150, objectFit: "contain" }}
              />
            </Link>
          </div>

          {/* Navigation */}
          <nav style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
            {groups.map((g) => (
              <div key={g.title} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: "0.66rem",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    padding: "10px 12px 6px",
                  }}
                >
                  {g.title}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                  {g.items.map((item) => {
                    const isActive = matchesNav(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={(e) => handleNavClick(e, item.href)}
                          className={`ws-nav${isActive ? " ws-nav-on" : ""}`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <NavIcon name={item.icon} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Account */}
          {accountMenuOpen && (
            <>
              <div onClick={() => setAccountMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div
                role="menu"
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: 70,
                  zIndex: 61,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  boxShadow: "0 18px 40px rgba(15,23,42,.16)",
                  padding: 6,
                }}
              >
                {!isSuperAdmin && (
                  <>
                    <Link href="/workspace/settings" onClick={(e) => { setAccountMenuOpen(false); handleNavClick(e, "/workspace/settings"); }} className="ws-menu-item" role="menuitem">
                      <NavIcon name="settings" /> Settings
                    </Link>
                    <Link href="/workspace/billing" onClick={(e) => { setAccountMenuOpen(false); handleNavClick(e, "/workspace/billing"); }} className="ws-menu-item" role="menuitem">
                      <NavIcon name="plans" /> Plans &amp; billing
                    </Link>
                  </>
                )}
                <button type="button" onClick={toggleTheme} className="ws-menu-item" role="menuitem">
                  {isDark ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
                  )}
                  {isDark ? "Light mode" : "Dark mode"}
                </button>
                <div style={{ height: 1, background: "var(--border)", margin: "5px 4px" }} />
                <button type="button" onClick={() => { setAccountMenuOpen(false); handleLogoutClick(); }} className="ws-menu-item ws-menu-out" role="menuitem">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  Log out
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setAccountMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            className="ws-me"
          >
            <span
              aria-hidden
              className="ws-av"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                flexShrink: 0,
                background: "#0f172a",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.78rem",
                fontWeight: 700,
              }}
            >
              {displayName ? getInitials(displayName) : "—"}
            </span>
            <span style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {displayName || "Loading…"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                {planLine && <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: planDot, flexShrink: 0 }} />}
                {planLine}
              </span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0, transition: "transform .2s", transform: accountMenuOpen ? "rotate(180deg)" : "none" }}>
              <path d="M7 15l5-5 5 5" />
            </svg>
          </button>
        </aside>
      </div>

      {/* ── Main Content ── */}
      <main
        style={{
          flex: "1 1 0%",
          minWidth: 0,
          width: "100%",
          height: "100%",
          overflowY: "auto",
          backgroundColor: "var(--bg)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Mobile Header with Menu Button */}
        <div
          className="mobile-header-bar"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--bg-sidebar)",
            position: "sticky",
            top: 0,
            zIndex: 40,
          }}
        >
          <Link
            href={isSuperAdmin ? "/workspace/admin/tenants" : "/workspace/testing"}
            onClick={(e) =>
              handleNavClick(
                e,
                isSuperAdmin ? "/workspace/admin/tenants" : "/workspace/testing"
              )
            }
            style={{ display: "flex", alignItems: "center", textDecoration: "none" }}
          >
            <Image
              src={
                isDark
                  ? "/ferry/svg/ferry-horizontal-white.svg"
                  : "/ferry/svg/ferry-horizontal-black.svg"
              }
              alt="Ferry by RYX AI"
              width={110}
              height={24}
              priority
              style={{
                width: "auto",
                height: 24,
                maxWidth: 130,
                objectFit: "contain",
              }}
            />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "0.35rem 0.6rem",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ☰
          </button>
        </div>

        {user?.tenant &&
          user.tenant.is_subscription_active === false &&
          !isSuperAdmin && (
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
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
              >
                <span style={{ fontSize: "1.2rem" }}>🚨</span>
                <span>
                  <strong>Subscription Expired:</strong> Your 3-day
                  trial/subscription has ended. Your embedded chatbot is
                  currently locked (402 Payment Required).
                </span>
              </div>
              <Link
                href="/workspace/billing"
                onClick={(e) => handleNavClick(e, "/workspace/billing")}
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
        <div
          style={{
            flex: 1,
            width: "100%",
            display: "block",
          }}
        >
          {children}
        </div>
      </main>

      <ConfirmDialog
        open={showConfirmModal}
        tone="warning"
        eyebrow="Unsaved Changes"
        title="Discard unsaved edits?"
        description={unsavedChangesStore.getMessage()}
        confirmLabel="Discard & Leave"
        cancelLabel="Stay on Page"
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
      />
    </div>
  );
}
