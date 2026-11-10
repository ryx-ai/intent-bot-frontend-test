"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ConfirmDialog } from "../_components/ConfirmDialog";

interface Plan {
  id: number;
  slug: string;
  name: string;
  price_inr: number;
}

interface SubscriptionStatus {
  subscription_status: "trial" | "active" | "expired" | "canceled" | string;
  is_active: boolean;
  plan: Plan | null;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  days_remaining: number;
  message: string;
}

// Design tokens mapped to CSS variables
const C = {
  bg: "var(--bg)",
  bgSurface: "var(--bg-surface)",
  bgCard: "var(--bg-card)",
  bgHover: "var(--bg-hover)",
  border: "var(--border)",
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  error: "var(--error)",
  success: "var(--success)",
  warning: "#f59e0b",
};

const ROLES = [
  {
    key: "hybrid",
    label: "Sales + Support",
    desc: "Answers questions and gently guides people to buy or book.",
  },
  {
    key: "sales",
    label: "Sales",
    desc: "Aggressive qualification and booking. Every message pushes the funnel.",
  },
  {
    key: "support",
    label: "Support",
    desc: "Resolves questions without aggressive selling. Soft CTAs only.",
  },
  {
    key: "booking",
    label: "Demo booking",
    desc: "Focuses only on collecting Name, Email & Time for a demo.",
  },
];

// Empty input -> booking disabled. Otherwise must be a parseable http(s) URL.
function validateCalendarLink(
  raw: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: "" };
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, reason: "Use an http:// or https:// URL" };
    }
    if (!u.hostname || !u.hostname.includes(".")) {
      return {
        ok: false,
        reason: "Enter a complete URL (e.g. https://cal.com/you/demo)",
      };
    }
    return { ok: true, url: candidate };
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
}

type CalCredential = {
  id: number;
  name: string;
  api_key: string;
  event_type_id: string;
  is_active: boolean;
  created_at: string;
};

export default function TestingPage() {
  const [role, setRole] = useState("hybrid");
  const [themeColor, setThemeColor] = useState("#8A64E9");
  const [calendarLink, setCalendarLink] = useState("");
  const [calCredentials, setCalCredentials] = useState<CalCredential[]>([]);
  const [calCredLoading, setCalCredLoading] = useState(true);
  const [calCredName, setCalCredName] = useState("");
  const [calCredApiKey, setCalCredApiKey] = useState("");
  const [calCredEventTypeId, setCalCredEventTypeId] = useState("");
  const [calCredSubmitting, setCalCredSubmitting] = useState(false);
  const [calCredActionId, setCalCredActionId] = useState<number | null>(null);
  const [calCredMessage, setCalCredMessage] = useState("");
  const [calCredError, setCalCredError] = useState("");
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [calDialogType, setCalDialogType] = useState<
    "disconnect" | "remove" | null
  >(null);
  const [calDialogCredId, setCalDialogCredId] = useState<number | null>(null);

  // System Prompt State
  const [promptText, setPromptText] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptDirty, setPromptDirty] = useState(false);

  // Collapsible Sections
  const [showBookingOptions, setShowBookingOptions] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Mobile Drawer State
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [calError, setCalError] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");

  // Bumped after every successful save so the live test widget reloads with fresh config
  const [widgetKey, setWidgetKey] = useState(0);
  const [widgetState, setWidgetState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  function showCalCredentialMessage(message: string, isError = false) {
    if (isError) {
      setCalCredError(message);
      setCalCredMessage("");
      setTimeout(() => setCalCredError(""), 4000);
      return;
    }
    setCalCredMessage(message);
    setCalCredError("");
    setTimeout(() => setCalCredMessage(""), 3000);
  }

  async function loadCalCredentials() {
    setCalCredLoading(true);
    try {
      const creds = await api.get<CalCredential[]>("/api/config/cal/list");
      setCalCredentials(creds || []);
    } catch (err) {
      console.error("Failed to load Cal.com credentials", err);
      showCalCredentialMessage("Failed to load Cal.com credentials.", true);
    } finally {
      setCalCredLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [dataRes, meRes, credsRes, statusRes] = await Promise.allSettled([
          api.get<{
            bot_role: string;
            calendar_link: string;
            theme_color: string;
            system_prompt_text: string;
          }>("/api/config/bot"),
          api.get<{ tenant?: { slug: string } }>("/api/auth/me"),
          api.get<CalCredential[]>("/api/config/cal/list"),
          api.get<SubscriptionStatus>("/api/payments/subscription-status"),
        ]);

        if (statusRes.status === "fulfilled") {
          setSubStatus(statusRes.value);
        }
        if (credsRes.status === "fulfilled") {
          setCalCredentials(credsRes.value || []);
        }
        if (meRes.status === "fulfilled") {
          setTenantSlug(meRes.value.tenant?.slug || "");
        }
        if (dataRes.status === "fulfilled") {
          const data = dataRes.value;
          setRole(data.bot_role || "hybrid");
          setThemeColor(data.theme_color || "#8A64E9");
          if (data.calendar_link) {
            try {
              const url = new URL(data.calendar_link);
              url.searchParams.delete("theme");
              url.searchParams.delete("hideEventTypeDetails");
              url.searchParams.delete("embed");
              setCalendarLink(url.toString().replace(/\?$/, ""));
            } catch {
              setCalendarLink(data.calendar_link);
            }
          } else {
            setCalendarLink("");
          }
          setPromptText(data.system_prompt_text || "");
        }
      } catch (err) {
        console.error("Failed to load config", err);
      } finally {
        setCalCredLoading(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (loading) return;

    const existing = document.getElementById("ryx-embed-script");
    if (existing) existing.remove();
    document.getElementById("ryx-chat-container")?.remove();

    const injected: Element[] = [];
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (
            n instanceof HTMLStyleElement ||
            (n instanceof HTMLLinkElement && n.rel === "stylesheet")
          ) {
            injected.push(n);
          }
        });
      }
    });
    observer.observe(document.head, { childList: true });

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const script = document.createElement("script");
    script.id = "ryx-embed-script";
    script.src = `${apiBase}/static/embed.js?t=${Date.now()}`;
    script.setAttribute("data-api", apiBase);
    if (tenantSlug) {
      script.setAttribute("data-tenant", tenantSlug);
    }
    script.setAttribute("data-preview", "true");
    script.setAttribute("data-container", "#dock-panel");

    script.onload = () => {
      setWidgetState("ready");
      observer.disconnect();
    };
    script.onerror = () => {
      setWidgetState("error");
      observer.disconnect();
    };
    document.body.appendChild(script);

    return () => {
      observer.disconnect();
      document.getElementById("ryx-embed-script")?.remove();
      document.getElementById("ryx-chat-container")?.remove();
      injected.forEach((el) => el.remove());
    };
  }, [widgetKey, loading, tenantSlug]);

  // Warn before navigating away with unsaved edits
  useEffect(() => {
    if (!dirty && !promptDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, promptDirty]);

  // Normal Configuration Save: Sends ONLY bot_role, theme_color, and calendar_link.
  // Never includes system_prompt_text to protect tenant custom instructions.
  async function save() {
    const validated = validateCalendarLink(calendarLink);
    if (!validated.ok) {
      setCalError(validated.reason);
      setToast("Fix the calendar URL before saving");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setCalError("");

    setSaving(true);
    try {
      let finalLink = validated.url;
      if (finalLink) {
        const urlObj = new URL(finalLink);
        urlObj.searchParams.set("theme", "auto");
        urlObj.searchParams.set("hideEventTypeDetails", "false");
        urlObj.searchParams.set("embed", "true");
        finalLink = urlObj.toString();
      }
      await api.post("/api/config/bot", {
        bot_role: role,
        calendar_link: finalLink,
        theme_color: themeColor,
      });
      setToast("Configuration saved!");
      setTimeout(() => setToast(""), 3000);
      setDirty(false);
      setWidgetState("loading");
      setWidgetKey((k) => k + 1);
    } catch {
      setToast("Failed to save.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  // Explicit System Prompt Save: Isolated save for prompt only
  async function saveSystemPrompt() {
    setSavingPrompt(true);
    try {
      await api.post("/api/config/bot", {
        system_prompt_text: promptText,
      });
      setToast("System prompt saved successfully!");
      setTimeout(() => setToast(""), 3000);
      setPromptDirty(false);
      setWidgetState("loading");
      setWidgetKey((k) => k + 1);
    } catch {
      setToast("Failed to save system prompt.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function generateSystemPrompt() {
    setGeneratingPrompt(true);
    try {
      const res = await api.post<{
        system_prompt: string;
        sources_detected?: Record<string, boolean>;
      }>("/api/config/generate-system-prompt", {});

      if (res && typeof res.system_prompt === "string") {
        setPromptText(res.system_prompt);
        setPromptDirty(true);
        setToast(
          "System prompt generated! Click 'Save System Prompt' to apply.",
        );
        setTimeout(() => setToast(""), 4500);
      } else {
        setToast("Failed to generate system prompt.");
        setTimeout(() => setToast(""), 4000);
      }
    } catch (err: unknown) {
      let msg = "Failed to generate system prompt.";
      if (err instanceof Error) {
        msg = err.message;
      } else if (
        err &&
        typeof err === "object" &&
        "detail" in err &&
        typeof (err as { detail: unknown }).detail === "string"
      ) {
        msg = (err as { detail: string }).detail;
      }
      setToast(msg);
      setTimeout(() => setToast(""), 4500);
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function addCalCredential() {
    const calApiKey = calCredApiKey.trim();
    const eventTypeId = calCredEventTypeId.trim();
    const name = calCredName.trim() || "Primary Booking";

    if (!calApiKey || !eventTypeId) {
      showCalCredentialMessage(
        "API key and event type ID are required.",
        true,
      );
      return;
    }

    setCalCredSubmitting(true);
    try {
      const res = await api.post<{
        success?: boolean;
        id?: number;
        error?: string;
      }>("/api/config/verify-cal", {
        name,
        cal_api_key: calApiKey,
        cal_event_type_id: eventTypeId,
      });
      if (res?.success === false) {
        throw new Error(res.error || "Cal.com verification failed.");
      }
      setCalCredName("");
      setCalCredApiKey("");
      setCalCredEventTypeId("");
      showCalCredentialMessage("Cal.com connected successfully.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to add Cal.com credential", err);
      showCalCredentialMessage(
        "Verification failed. Check API key and event type ID.",
        true,
      );
    } finally {
      setCalCredSubmitting(false);
    }
  }

  async function activateCalCredential(id: number) {
    setCalCredActionId(id);
    try {
      await api.post(`/api/config/cal/activate/${id}`);
      showCalCredentialMessage("Active Cal.com credential updated.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to activate Cal.com credential", err);
      showCalCredentialMessage("Failed to activate credential.", true);
    } finally {
      setCalCredActionId(null);
    }
  }

  async function removeCalCredential(id: number) {
    setCalDialogType("remove");
    setCalDialogCredId(id);
    setCalDialogOpen(true);
  }

  async function confirmRemoveCalCredential() {
    if (!calDialogCredId) return;
    setCalDialogOpen(false);

    setCalCredActionId(calDialogCredId);
    try {
      await api.delete(`/api/config/cal/remove/${calDialogCredId}`);
      showCalCredentialMessage("Cal.com credential removed.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to remove Cal.com credential", err);
      showCalCredentialMessage("Failed to remove credential.", true);
    } finally {
      setCalCredActionId(null);
      setCalDialogCredId(null);
    }
  }

  async function disconnectCal() {
    setCalDialogType("disconnect");
    setCalDialogOpen(true);
  }

  async function confirmDisconnectCal() {
    setCalDialogOpen(false);

    setCalCredActionId(-1);
    try {
      await api.post("/api/config/cal/disconnect");
      showCalCredentialMessage("Cal.com disconnected for this tenant.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to disconnect Cal.com", err);
      showCalCredentialMessage("Failed to disconnect Cal.com.", true);
    } finally {
      setCalCredActionId(null);
    }
  }

  const selectedRole = ROLES.find((r) => r.key === role) || ROLES[0];
  const activeCred =
    calCredentials.find((c) => c.is_active) ||
    (calCredentials.length > 0 ? calCredentials[0] : null);

  if (loading) {
    return (
      <div
        style={{
          padding: "5rem",
          textAlign: "center",
          color: C.textMuted,
          fontSize: "0.95rem",
        }}
      >
        Loading assistant settings…
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1400,
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "1.75rem 1.5rem 5rem 1.5rem",
        backgroundColor: C.bg,
        minHeight: "100vh",
      }}
    >
      {/* Expired / Inactive Notice Banner */}
      {subStatus && !subStatus.is_active && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1.1rem 1.35rem",
            borderRadius: 12,
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background:
              "linear-gradient(90deg, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0.04) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            boxShadow: "0 4px 20px rgba(239, 68, 68, 0.08)",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
                flexShrink: 0,
              }}
            >
              ⚠️
            </div>
            <div>
              <div
                style={{
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                }}
              >
                {subStatus.subscription_status === "trial"
                  ? "3-Day Free Trial Expired — Live Widget Paused"
                  : "Subscription Inactive — Live Widget Paused"}
              </div>
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.82rem",
                  marginTop: "0.2rem",
                }}
              >
                Your custom bot theme and configurations are saved, but live
                customer widget embedding is paused. Upgrade to reactivate
                public widget deployment.
              </div>
            </div>
          </div>
          <Link
            href="/workspace/billing"
            style={{
              padding: "0.55rem 1.1rem",
              background: "#ef4444",
              color: "#ffffff",
              borderRadius: 8,
              fontSize: "0.82rem",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 2px 10px rgba(239, 68, 68, 0.4)",
            }}
          >
            Upgrade Plan Now →
          </Link>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div
        className="agent-setup-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        {/* Left Column: Configuration Forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Header Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                fontSize: "1.6rem",
                fontWeight: 700,
                color: C.textPrimary,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Set up your assistant
            </h1>

            {/* Desktop Top Save Controls */}
            <div
              className="desktop-save-controls"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              {dirty && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: C.warning,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: C.warning,
                    }}
                  />
                  Unsaved changes
                </span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{
                  backgroundColor: C.accent,
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "0.55rem 1.25rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          {/* Card 1: Role Selection & Chat Colour */}
          <section
            style={{
              backgroundColor: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            {/* Assistant Role */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: C.textPrimary,
                  marginBottom: "0.85rem",
                }}
              >
                What should your assistant do?
              </label>

              {/* 4 Compact Role Tabs */}
              <div
                className="role-tabs-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "0.5rem",
                }}
              >
                {ROLES.map((r) => {
                  const active = role === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setRole(r.key);
                        setDirty(true);
                      }}
                      style={{
                        cursor: "pointer",
                        borderRadius: 8,
                        padding: "0.65rem 0.5rem",
                        textAlign: "center",
                        backgroundColor: active ? C.accentDim : C.bgSurface,
                        border: active
                          ? `1.5px solid ${C.accent}`
                          : `1px solid ${C.border}`,
                        color: active ? C.accent : C.textPrimary,
                        fontSize: "0.82rem",
                        fontWeight: active ? 700 : 500,
                        transition: "all 0.15s ease",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Role Description */}
              <p
                style={{
                  fontSize: "0.8rem",
                  color: C.textSecondary,
                  marginTop: "0.75rem",
                  marginBottom: 0,
                  lineHeight: 1.45,
                }}
              >
                {selectedRole.desc}
              </p>
            </div>

            {/* Divider */}
            <div style={{ height: 1, backgroundColor: C.border }} />

            {/* Chat Colour Picker */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: C.textPrimary,
                  marginBottom: "0.35rem",
                }}
              >
                Chat colour
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  marginTop: "0.5rem",
                }}
              >
                {/* Clickable Colour Swatch */}
                <label
                  style={{
                    position: "relative",
                    width: 44,
                    height: 38,
                    borderRadius: 8,
                    backgroundColor: themeColor,
                    border: `1px solid ${C.border}`,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                  title="Click to pick colour"
                >
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => {
                      setThemeColor(e.target.value);
                      setDirty(true);
                    }}
                    style={{
                      opacity: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer",
                      position: "absolute",
                      inset: 0,
                    }}
                  />
                </label>
                <div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: C.textPrimary,
                    }}
                  >
                    {themeColor.toUpperCase()}
                  </span>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: C.textMuted,
                      margin: "2px 0 0 0",
                    }}
                  >
                    Click the box to pick or type your brand colour
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Booking Link & More Options */}
          <section
            style={{
              backgroundColor: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: C.textPrimary,
                  marginBottom: "0.35rem",
                }}
              >
                Booking link <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={calendarLink}
                onChange={(e) => {
                  setCalendarLink(e.target.value);
                  setDirty(true);
                  if (calError) setCalError("");
                }}
                placeholder="https://cal.com/your-business/demo"
                style={{
                  width: "100%",
                  backgroundColor: C.bgSurface,
                  border: `1px solid ${calError ? C.error : C.border}`,
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.85rem",
                  color: C.textPrimary,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              {calError ? (
                <p
                  style={{
                    color: C.error,
                    fontSize: "0.75rem",
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  {calError}
                </p>
              ) : (
                <p
                  style={{
                    color: C.textMuted,
                    fontSize: "0.75rem",
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  Your Cal.com booking page. The assistant shares it when someone wants to book.
                </p>
              )}
            </div>

            {/* Collapsible: More booking options */}
            <div>
              <button
                type="button"
                onClick={() => setShowBookingOptions((prev) => !prev)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: C.accent,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "inherit",
                }}
              >
                {showBookingOptions ? "Hide booking options ▴" : "More booking options ▾"}
              </button>

              {showBookingOptions && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1.1rem",
                    borderRadius: 10,
                    backgroundColor: C.bgSurface,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <h3
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: C.textPrimary,
                      margin: "0 0 4px 0",
                    }}
                  >
                    Book automatically
                  </h3>
                  <p
                    style={{
                      color: C.textMuted,
                      fontSize: "0.75rem",
                      lineHeight: 1.45,
                      margin: "0 0 1rem 0",
                    }}
                  >
                    Let the assistant check your free times and make the booking itself. Needs a Cal.com API key.
                  </p>

                  {/* Feedback Message */}
                  {(calCredMessage || calCredError) && (
                    <div
                      style={{
                        border: `1px solid ${calCredError ? C.error : C.success}`,
                        backgroundColor: calCredError
                          ? "rgba(239, 68, 68, 0.12)"
                          : "rgba(16, 185, 129, 0.12)",
                        color: calCredError ? C.error : C.success,
                        borderRadius: 8,
                        padding: "0.55rem 0.75rem",
                        fontSize: "0.78rem",
                        marginBottom: "0.85rem",
                      }}
                    >
                      {calCredError || calCredMessage}
                    </div>
                  )}

                  {/* Connected Status Card */}
                  {calCredLoading ? (
                    <div style={{ color: C.textMuted, fontSize: "0.78rem", padding: "0.5rem 0" }}>
                      Loading Cal.com credentials…
                    </div>
                  ) : activeCred ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                        padding: "0.85rem 1rem",
                        borderRadius: 8,
                        backgroundColor: C.bgCard,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              color: C.textPrimary,
                              fontSize: "0.85rem",
                              fontWeight: 700,
                            }}
                          >
                            {activeCred.name || "Primary Booking"}
                          </span>
                          <span
                            style={{
                              borderRadius: 999,
                              padding: "0.15rem 0.5rem",
                              backgroundColor: "rgba(16, 185, 129, 0.14)",
                              color: C.success,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                            }}
                          >
                            Connected
                          </span>
                        </div>
                        <p
                          style={{
                            color: C.textMuted,
                            fontSize: "0.72rem",
                            margin: 0,
                          }}
                        >
                          Key ending {activeCred.api_key.slice(-4)} · Event {activeCred.event_type_id}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={disconnectCal}
                        disabled={calCredActionId === -1}
                        style={{
                          backgroundColor: "transparent",
                          color: C.error,
                          border: `1px solid ${C.error}`,
                          borderRadius: 6,
                          padding: "0.45rem 0.85rem",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: calCredActionId === -1 ? "default" : "pointer",
                          opacity: calCredActionId === -1 ? 0.55 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        {calCredActionId === -1 ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </div>
                  ) : (
                    /* Connect Form (When not connected) */
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.65rem",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: C.textPrimary,
                              marginBottom: 4,
                            }}
                          >
                            Cal.com API key
                          </label>
                          <input
                            type="password"
                            value={calCredApiKey}
                            onChange={(e) => setCalCredApiKey(e.target.value)}
                            placeholder="cal_live_…"
                            style={{
                              width: "100%",
                              backgroundColor: C.bgCard,
                              border: `1px solid ${C.border}`,
                              borderRadius: 6,
                              padding: "0.55rem 0.75rem",
                              fontSize: "0.8rem",
                              color: C.textPrimary,
                              outline: "none",
                              fontFamily: "inherit",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: C.textPrimary,
                              marginBottom: 4,
                            }}
                          >
                            Event type ID
                          </label>
                          <input
                            type="text"
                            value={calCredEventTypeId}
                            onChange={(e) => setCalCredEventTypeId(e.target.value)}
                            placeholder="1234567"
                            style={{
                              width: "100%",
                              backgroundColor: C.bgCard,
                              border: `1px solid ${C.border}`,
                              borderRadius: 6,
                              padding: "0.55rem 0.75rem",
                              fontSize: "0.8rem",
                              color: C.textPrimary,
                              outline: "none",
                              fontFamily: "inherit",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={addCalCredential}
                          disabled={calCredSubmitting}
                          style={{
                            backgroundColor: C.accent,
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 6,
                            padding: "0.55rem 1.1rem",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: calCredSubmitting ? "default" : "pointer",
                            opacity: calCredSubmitting ? 0.6 : 1,
                            fontFamily: "inherit",
                          }}
                        >
                          {calCredSubmitting ? "Connecting…" : "Connect"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Credential List (Multi-credential management) */}
                  {calCredentials.length > 1 && (
                    <div style={{ marginTop: "1rem", borderTop: `1px solid ${C.border}`, paddingTop: "0.85rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: C.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        All Connected Credentials
                      </span>
                      <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                        {calCredentials.map((cred) => (
                          <div
                            key={cred.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.5rem 0.75rem",
                              borderRadius: 6,
                              backgroundColor: C.bgCard,
                              border: `1px solid ${cred.is_active ? C.accent : C.border}`,
                              fontSize: "0.75rem",
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 600, color: C.textPrimary }}>
                                {cred.name}
                              </span>
                              <span style={{ color: C.textMuted, marginLeft: 8 }}>
                                ID: {cred.event_type_id}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              {!cred.is_active && (
                                <button
                                  type="button"
                                  onClick={() => activateCalCredential(cred.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: C.success,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  Activate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeCalCredential(cred.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: C.error,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  fontSize: "0.72rem",
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collapsible: Advanced Settings (System Prompt) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedSettings((prev) => !prev)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: C.textSecondary,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "inherit",
                }}
              >
                {showAdvancedSettings ? "Hide advanced settings ▴" : "Advanced Settings ▾"}
              </button>

              {showAdvancedSettings && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1.1rem",
                    borderRadius: 10,
                    backgroundColor: C.bgSurface,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          color: C.textPrimary,
                          margin: "0 0 2px 0",
                        }}
                      >
                        Core System Prompt
                      </h3>
                      <p
                        style={{
                          color: C.textMuted,
                          fontSize: "0.75rem",
                          margin: 0,
                        }}
                      >
                        AI instructions assembled for your agent. You can inspect, generate, or customize them here.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={generateSystemPrompt}
                      disabled={generatingPrompt || saving || savingPrompt}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        backgroundColor: "rgba(138, 100, 233, 0.12)",
                        color: C.accent,
                        border: `1px solid ${C.accent}`,
                        borderRadius: 6,
                        padding: "0.45rem 0.85rem",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor:
                          generatingPrompt || saving || savingPrompt
                            ? "not-allowed"
                            : "pointer",
                        opacity: generatingPrompt || saving || savingPrompt ? 0.6 : 1,
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {generatingPrompt ? "Generating…" : "✨ Generate System Prompt"}
                    </button>
                  </div>

                  <textarea
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value);
                      setPromptDirty(true);
                    }}
                    rows={12}
                    style={{
                      width: "100%",
                      backgroundColor: C.bgCard,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "0.85rem",
                      fontSize: "0.78rem",
                      lineHeight: 1.6,
                      color: C.textPrimary,
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      boxSizing: "border-box",
                    }}
                  />

                  {/* Isolated System Prompt Save Action */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginTop: "0.85rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: C.textMuted,
                      }}
                    >
                      Prompt changes require explicit saving and reload assistant directives.
                    </span>

                    <button
                      type="button"
                      onClick={saveSystemPrompt}
                      disabled={savingPrompt || generatingPrompt}
                      style={{
                        backgroundColor: promptDirty ? C.accent : "transparent",
                        color: promptDirty ? "#ffffff" : C.textSecondary,
                        border: `1px solid ${promptDirty ? C.accent : C.border}`,
                        borderRadius: 6,
                        padding: "0.45rem 1rem",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: savingPrompt ? "default" : "pointer",
                        opacity: savingPrompt ? 0.6 : 1,
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {savingPrompt ? "Saving Prompt…" : "Save System Prompt"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Docked Test Chat Preview (Desktop) */}
        <div
          className="desktop-test-chat-col"
          style={{
            position: "sticky",
            top: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          {/* Test Chat Card Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 4px",
            }}
          >
            <span
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: C.textPrimary,
              }}
            >
              Test chat
            </span>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.75rem",
                fontWeight: 500,
                color:
                  widgetState === "ready"
                    ? C.success
                    : widgetState === "error"
                      ? C.error
                      : C.warning,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor:
                    widgetState === "ready"
                      ? C.success
                      : widgetState === "error"
                        ? C.error
                        : C.warning,
                }}
              />
              {widgetState === "ready"
                ? "Ready · updates when you save"
                : widgetState === "error"
                  ? "Widget load failed"
                  : "Loading test assistant…"}
            </div>
          </div>

          {/* Dock Target Container */}
          <div
            id="dock-panel"
            style={{
              width: "100%",
              height: "calc(100vh - 120px)",
              minHeight: 560,
              maxHeight: 760,
              borderRadius: 16,
              border: `1px solid ${C.border}`,
              backgroundColor: "#FFFFFF",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            }}
          >
            {widgetState === "loading" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.textMuted,
                  fontSize: "0.85rem",
                  zIndex: 0,
                }}
              >
                Loading test chat…
              </div>
            )}
            {widgetState === "error" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.error,
                  fontSize: "0.85rem",
                  padding: "1rem",
                  textAlign: "center",
                  zIndex: 0,
                }}
              >
                <span>Failed to load test assistant.</span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: C.textMuted,
                    marginTop: 4,
                  }}
                >
                  Verify backend server connectivity.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Action Bar */}
      <div
        className="mobile-bottom-bar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0.75rem 1rem",
          backgroundColor: C.bgCard,
          borderTop: `1px solid ${C.border}`,
          display: "none",
          alignItems: "center",
          gap: "0.75rem",
          zIndex: 40,
          boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileChatOpen(true)}
          style={{
            flex: 1,
            backgroundColor: C.bgSurface,
            color: C.textPrimary,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "0.65rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Test chat
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            backgroundColor: C.accent,
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "0.65rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Mobile Fullscreen Test Chat Modal */}
      {mobileChatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: C.bg,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Mobile Modal Header */}
          <div
            style={{
              padding: "0.85rem 1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`,
              backgroundColor: C.bgCard,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  color: C.textPrimary,
                }}
              >
                Test chat
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: widgetState === "ready" ? C.success : C.warning,
                }}
              >
                ● {widgetState === "ready" ? "Ready" : "Loading…"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setMobileChatOpen(false)}
              aria-label="Close test chat"
              style={{
                background: "none",
                border: "none",
                fontSize: "1.25rem",
                color: C.textMuted,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Modal Content */}
          <div
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* The mobile view lets user preview chat */}
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                id="mobile-dock-panel"
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 70,
            backgroundColor:
              toast.toLowerCase().includes("fail") ||
              toast.toLowerCase().includes("error") ||
              toast.toLowerCase().includes("fix")
                ? C.error
                : C.success,
            color: "#ffffff",
            borderRadius: 8,
            padding: "0.65rem 1.25rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Cal.com Confirmation Dialogs */}
      <ConfirmDialog
        open={calDialogOpen && calDialogType === "remove"}
        eyebrow="Remove Credential"
        title="Remove Cal.com Credential?"
        description="This credential will be permanently removed. You can add it again later if needed."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => {
          setCalDialogOpen(false);
          setCalDialogType(null);
          setCalDialogCredId(null);
        }}
        onConfirm={confirmRemoveCalCredential}
      />
      <ConfirmDialog
        open={calDialogOpen && calDialogType === "disconnect"}
        eyebrow="Disconnect Service"
        title="Disconnect Cal.com?"
        description="All Cal.com credentials will be removed from this tenant. You can reconnect and re-add credentials later."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => {
          setCalDialogOpen(false);
          setCalDialogType(null);
        }}
        onConfirm={confirmDisconnectCal}
      />

      {/* Responsive Media Query Styles */}
      <style jsx>{`
        #dock-panel,
        #mobile-dock-panel {
          border-radius: 16px;
          overflow: hidden;
          background-color: #ffffff;
        }
        @media (max-width: 900px) {
          .desktop-save-controls {
            display: none !important;
          }
          .desktop-test-chat-col {
            display: none !important;
          }
          .mobile-bottom-bar {
            display: flex !important;
          }
          .agent-setup-grid {
            grid-template-columns: 1fr !important;
          }
          .role-tabs-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
