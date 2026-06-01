"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Design tokens as JS constants — bypasses CSS variable resolution issues with Tailwind v4
const C = {
  bg: "#0b0d17",
  bgSurface: "#13162a",
  bgCard: "#191c30",
  bgHover: "#1e2238",
  border: "#2c3058",
  accent: "#6b4cff",
  accentDim: "rgba(107, 76, 255, 0.2)",
  textPrimary: "#e8eaf5",
  textSecondary: "#8890b8",
  textMuted: "#555a7a",
  error: "#ef4444",
  success: "#10b981",
};

const ROLES = [
  {
    key: "hybrid",
    icon: "💬",
    label: "Hybrid",
    desc: "Sales + Support. Balances helpfulness with conversion goals.",
  },
  {
    key: "sales",
    icon: "📊",
    label: "Sales",
    desc: "Aggressive qualification and booking. Every message pushes the funnel.",
  },
  {
    key: "support",
    icon: "🛟",
    label: "Support",
    desc: "Resolves questions without aggressive selling. Soft CTAs only.",
  },
  {
    key: "booking",
    icon: "📅",
    label: "Demo Booking",
    desc: "Focuses only on collecting Name, Email & Time for a demo.",
  },
];

// Empty input → booking disabled. Otherwise must be a parseable http(s) URL.
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
  const [calTheme, setCalTheme] = useState("light");
  const [calHideDetails, setCalHideDetails] = useState(false);
  const [calCredentials, setCalCredentials] = useState<CalCredential[]>([]);
  const [calCredLoading, setCalCredLoading] = useState(true);
  const [calCredName, setCalCredName] = useState("");
  const [calCredApiKey, setCalCredApiKey] = useState("");
  const [calCredEventTypeId, setCalCredEventTypeId] = useState("");
  const [calCredSubmitting, setCalCredSubmitting] = useState(false);
  const [calCredActionId, setCalCredActionId] = useState<number | null>(null);
  const [calCredMessage, setCalCredMessage] = useState("");
  const [calCredError, setCalCredError] = useState("");
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [calError, setCalError] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  // Bumped after every successful save so the live test widget reloads with
  // the new server-side config — otherwise the user is testing stale state.
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
        const [data, me, creds] = await Promise.all([
          api.get<{
            bot_role: string;
            calendar_link: string;
            theme_color: string;
            system_prompt_text: string;
          }>("/api/config/bot"),
          api.get<{ tenant?: { slug: string } }>("/api/auth/me"),
          api.get<CalCredential[]>("/api/config/cal/list"),
        ]);
        setCalCredentials(creds || []);
        setTenantSlug(me.tenant?.slug || "");
        setRole(data.bot_role || "hybrid");
        setThemeColor(data.theme_color || "#8A64E9");
        if (data.calendar_link) {
          try {
            const url = new URL(data.calendar_link);

            setCalTheme(url.searchParams.get("theme") || "light");
            setCalHideDetails(
              url.searchParams.get("hideEventTypeDetails") === "true",
            );
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

    setWidgetState("loading");
    const existing = document.getElementById("ryx-embed-script");
    if (existing) existing.remove();

    // Watch <head> only while embed.js is loading. Anything it injects gets
    // recorded so we can clean up just *those* nodes on unmount — vs the old
    // approach of wiping every newly-added style/link, which would also
    // delete unrelated styles (Next.js HMR, other components mounting in
    // between, etc.).
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

    script.onload = () => {
      setWidgetState("ready");
      // Stop observing once the script has loaded — embed.js does its style
      // injection during load, so anything added after load is from elsewhere
      // (Next.js HMR, other components) and isn't ours to remove.
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

  // Warn before navigating away with unsaved edits. Browsers ignore the
  // string we return — they just show their own generic confirm dialog.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
        urlObj.searchParams.set("theme", calTheme);
        urlObj.searchParams.set(
          "hideEventTypeDetails",
          calHideDetails ? "true" : "false",
        );
        urlObj.searchParams.set("embed", "true");
        finalLink = urlObj.toString();
      }
      await api.post("/api/config/bot", {
        bot_role: role,
        calendar_link: finalLink,
        theme_color: themeColor,
        system_prompt_text: promptText,
      });
      setToast("Configuration saved!");
      setTimeout(() => setToast(""), 3000);
      setDirty(false);
      // Force the embed widget to reload so the user can test the new config
      // immediately, instead of staring at a stale instance.
      setWidgetKey((k) => k + 1);
    } catch {
      setToast("Failed to save.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function addCalCredential() {
    const name = calCredName.trim();
    const calApiKey = calCredApiKey.trim();
    const eventTypeId = calCredEventTypeId.trim();

    if (!name || !calApiKey || !eventTypeId) {
      showCalCredentialMessage(
        "Account name, API key, and event type ID are required.",
        true,
      );
      return;
    }

    setCalCredSubmitting(true);
    try {
      const res = await api.post<{ success?: boolean; id?: number; error?: string }>(
        "/api/config/verify-cal",
        {
          name,
          cal_api_key: calApiKey,
          cal_event_type_id: eventTypeId,
        },
      );
      if (res?.success === false) {
        throw new Error(res.error || "Cal.com verification failed.");
      }
      setCalCredName("");
      setCalCredApiKey("");
      setCalCredEventTypeId("");
      showCalCredentialMessage("Cal.com credential verified and added.");
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
    if (!window.confirm("Remove this Cal.com credential?")) return;

    setCalCredActionId(id);
    try {
      await api.delete(`/api/config/cal/remove/${id}`);
      showCalCredentialMessage("Cal.com credential removed.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to remove Cal.com credential", err);
      showCalCredentialMessage("Failed to remove credential.", true);
    } finally {
      setCalCredActionId(null);
    }
  }

  async function disconnectCal() {
    if (!window.confirm("Disconnect Cal.com for this tenant?")) return;

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

  if (loading) {
    return (
      <div style={{ padding: "5rem", textAlign: "center", color: C.textMuted }}>
        Loading configuration…
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "2rem 2.5rem 3rem",
        backgroundColor: C.bg,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          ⚙️ Agent Configuration
        </h1>
        <p style={{ color: C.textMuted, fontSize: "0.88rem", marginTop: 4 }}>
          Customize the AI&apos;s role, booking links, and behaviours. Save to
          reload the test widget with the new config.
        </p>
        {/* Test widget status — surfaces silent embed.js failures (backend
            unreachable, CORS, etc.) that would otherwise leave the page
            looking healthy with no chat bubble in sight. */}
        <div
          style={{
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.75rem",
            color:
              widgetState === "ready"
                ? C.success
                : widgetState === "error"
                  ? C.error
                  : C.textMuted,
          }}
          aria-live="polite"
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                widgetState === "ready"
                  ? C.success
                  : widgetState === "error"
                    ? C.error
                    : C.textMuted,
            }}
          />
          {widgetState === "ready"
            ? "Test widget loaded — try it from the chat bubble"
            : widgetState === "error"
              ? "Test widget failed to load — check the backend"
              : "Loading test widget…"}
        </div>
      </div>

      {/* Agent Role Profile */}
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: C.textMuted,
            marginBottom: "1rem",
          }}
        >
          Agent Role Profile
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.75rem",
          }}
        >
          {ROLES.map((r) => {
            const active = role === r.key;
            return (
              <button
                key={r.key}
                onClick={() => {
                  setRole(r.key);
                  setDirty(true);
                }}
                style={{
                  position: "relative",
                  cursor: "pointer",
                  borderRadius: 12,
                  padding: "1rem",
                  textAlign: "left",
                  backgroundColor: active ? C.accentDim : C.bgSurface,
                  border: active
                    ? `1.5px solid rgba(107,76,255,0.5)`
                    : `1.5px solid ${C.border}`,
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                  color: C.textPrimary,
                }}
              >
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 12,
                      fontSize: "0.85rem",
                      color: C.accent,
                    }}
                  >
                    ✓
                  </span>
                )}
                <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>
                  {r.icon}
                </div>
                <p
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: C.textPrimary,
                    marginBottom: 4,
                  }}
                >
                  {r.label}
                </p>
                <p
                  style={{
                    fontSize: "0.72rem",
                    lineHeight: 1.4,
                    color: C.textSecondary,
                  }}
                >
                  {r.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Chatbot Theme Color */}
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: C.textMuted,
            marginBottom: "1rem",
          }}
        >
          Chatbot Theme
        </h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div
            style={{
              position: "relative",
              width: 50,
              height: 40,
              borderRadius: 8,
              overflow: "hidden",
              border: `1px solid ${C.border}`,
              cursor: "pointer",
            }}
          >
            <input
              type="color"
              value={themeColor}
              onChange={(e) => {
                setThemeColor(e.target.value);
                setDirty(true);
              }}
              style={{
                position: "absolute",
                top: "-5px",
                left: "-5px",
                width: "60px",
                height: "50px",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
            />
          </div>
          <input
            type="text"
            value={themeColor}
            onChange={(e) => {
              setThemeColor(e.target.value);
              setDirty(true);
            }}
            placeholder="#8A64E9"
            style={{
              flex: 1,
              backgroundColor: C.bgSurface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "0.65rem 0.85rem",
              fontSize: "0.85rem",
              color: C.textPrimary,
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
        <p style={{ color: C.textMuted, fontSize: "0.75rem", marginTop: 8, lineHeight: 1.4 }}>
          Select the primary color for your chatbot widget. It will be used for buttons, links, and avatar accents.
        </p>
      </section>

      {/* Demo Booking Calendar */}
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: C.textMuted,
            marginBottom: "1rem",
          }}
        >
          Demo Booking Calendar
        </h2>
        <label
          style={{
            display: "block",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: C.textPrimary,
            marginBottom: 8,
          }}
        >
          📅 Booking Link
        </label>
        <input
          type="text"
          value={calendarLink}
          onChange={(e) => {
            setCalendarLink(e.target.value);
            setDirty(true);
            if (calError) setCalError("");
          }}
          placeholder="https://cal.com/ryx-ai-2yw4pu/demo"
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
              marginTop: 8,
              marginBottom: "1rem",
            }}
          >
            {calError}
          </p>
        ) : (
          <p
            style={{
              color: C.textMuted,
              fontSize: "0.75rem",
              marginTop: 8,
              marginBottom: "1rem",
            }}
          >
            This is the public URL of your Cal.com event (No API keys required).
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: C.textPrimary,
                marginBottom: 6,
              }}
            >
              Embed Theme
            </label>
            <select
              value={calTheme}
              onChange={(e) => {
                setCalTheme(e.target.value);
                setDirty(true);
              }}
              style={{
                width: "100%",
                backgroundColor: C.bgSurface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "0.6rem",
                fontSize: "0.8rem",
                color: C.textPrimary,
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (Matches User OS)</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: C.textPrimary,
                marginBottom: 6,
              }}
            >
              Hide Event Details
            </label>
            <div
              role="checkbox"
              aria-checked={calHideDetails}
              tabIndex={0}
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: C.bgSurface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "0.6rem",
                cursor: "pointer",
                outline: "none",
              }}
              onClick={() => {
                setCalHideDetails(!calHideDetails);
                setDirty(true);
              }}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setCalHideDetails((v) => !v);
                  setDirty(true);
                }
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: calHideDetails
                    ? "none"
                    : `1.5px solid ${C.textMuted}`,
                  backgroundColor: calHideDetails ? C.accent : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 10,
                }}
              >
                {calHideDetails && (
                  <span style={{ color: "#fff", fontSize: "0.7rem" }}>✓</span>
                )}
              </div>
              <span style={{ fontSize: "0.8rem", color: C.textPrimary }}>
                Hide left panel details
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: `1px solid ${C.border}`,
            marginTop: "1.5rem",
            paddingTop: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  color: C.textPrimary,
                  marginBottom: 4,
                }}
              >
                Cal.com API Credentials
              </h3>
              <p
                style={{
                  color: C.textMuted,
                  fontSize: "0.75rem",
                  lineHeight: 1.45,
                }}
              >
                Used for backend availability checks and booking creation. Tenant
                scoping comes from the logged-in admin session.
              </p>
            </div>
            {calCredentials.length > 0 && (
              <button
                onClick={disconnectCal}
                disabled={calCredActionId === -1}
                style={{
                  backgroundColor: "transparent",
                  color: C.error,
                  border: `1px solid ${C.error}`,
                  borderRadius: 8,
                  padding: "0.55rem 0.8rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: calCredActionId === -1 ? "default" : "pointer",
                  opacity: calCredActionId === -1 ? 0.55 : 1,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {calCredActionId === -1 ? "Disconnecting..." : "Disconnect"}
              </button>
            )}
          </div>

          {(calCredMessage || calCredError) && (
            <div
              style={{
                border: `1px solid ${calCredError ? C.error : C.success}`,
                backgroundColor: calCredError
                  ? "rgba(239, 68, 68, 0.12)"
                  : "rgba(16, 185, 129, 0.12)",
                color: calCredError ? C.error : C.success,
                borderRadius: 8,
                padding: "0.65rem 0.8rem",
                fontSize: "0.78rem",
                marginBottom: "1rem",
              }}
            >
              {calCredError || calCredMessage}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: C.textPrimary,
                  marginBottom: 6,
                }}
              >
                Account Name
              </label>
              <input
                type="text"
                value={calCredName}
                onChange={(e) => setCalCredName(e.target.value)}
                placeholder="Primary Booking"
                style={{
                  width: "100%",
                  backgroundColor: C.bgSurface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
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
                  fontWeight: 700,
                  color: C.textPrimary,
                  marginBottom: 6,
                }}
              >
                Cal.com API Key
              </label>
              <input
                type="password"
                value={calCredApiKey}
                onChange={(e) => setCalCredApiKey(e.target.value)}
                placeholder="cal_live_xxxxxxxxxxxxx"
                style={{
                  width: "100%",
                  backgroundColor: C.bgSurface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
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
                  fontWeight: 700,
                  color: C.textPrimary,
                  marginBottom: 6,
                }}
              >
                Event Type ID
              </label>
              <input
                type="text"
                value={calCredEventTypeId}
                onChange={(e) => setCalCredEventTypeId(e.target.value)}
                placeholder="1234567"
                style={{
                  width: "100%",
                  backgroundColor: C.bgSurface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.8rem",
                  color: C.textPrimary,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={addCalCredential}
              disabled={calCredSubmitting}
              style={{
                backgroundColor: C.accent,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "0.6rem 1rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: calCredSubmitting ? "default" : "pointer",
                opacity: calCredSubmitting ? 0.55 : 1,
                fontFamily: "inherit",
              }}
            >
              {calCredSubmitting ? "Verifying..." : "Verify & Add Credential"}
            </button>
          </div>

          <div style={{ marginTop: "1.25rem" }}>
            <h4
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: C.textMuted,
                letterSpacing: "1px",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
              }}
            >
              Connected Credentials
            </h4>
            {calCredLoading ? (
              <p style={{ color: C.textMuted, fontSize: "0.78rem" }}>
                Loading Cal.com credentials...
              </p>
            ) : calCredentials.length === 0 ? (
              <div
                style={{
                  border: `1px dashed ${C.border}`,
                  borderRadius: 8,
                  padding: "0.9rem",
                  color: C.textMuted,
                  fontSize: "0.78rem",
                  backgroundColor: C.bgSurface,
                }}
              >
                No Cal.com API credentials connected for this tenant.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {calCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: "0.75rem",
                      alignItems: "center",
                      backgroundColor: C.bgSurface,
                      border: `1px solid ${cred.is_active ? C.accent : C.border}`,
                      borderRadius: 8,
                      padding: "0.8rem",
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
                            fontSize: "0.82rem",
                            fontWeight: 800,
                          }}
                        >
                          {cred.name}
                        </span>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "0.18rem 0.5rem",
                            backgroundColor: cred.is_active
                              ? "rgba(16, 185, 129, 0.14)"
                              : "rgba(136, 144, 184, 0.12)",
                            color: cred.is_active ? C.success : C.textMuted,
                            fontSize: "0.68rem",
                            fontWeight: 800,
                          }}
                        >
                          {cred.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p style={{ color: C.textMuted, fontSize: "0.7rem" }}>
                        Added{" "}
                        {cred.created_at
                          ? new Date(cred.created_at).toLocaleDateString()
                          : "recently"}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: C.textMuted, fontSize: "0.68rem" }}>
                        API Key
                      </p>
                      <p style={{ color: C.textPrimary, fontSize: "0.78rem" }}>
                        {cred.api_key}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: C.textMuted, fontSize: "0.68rem" }}>
                        Event Type
                      </p>
                      <p style={{ color: C.textPrimary, fontSize: "0.78rem" }}>
                        {cred.event_type_id}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {!cred.is_active && (
                        <button
                          onClick={() => activateCalCredential(cred.id)}
                          disabled={calCredActionId === cred.id}
                          style={{
                            backgroundColor: "transparent",
                            color: C.success,
                            border: `1px solid ${C.success}`,
                            borderRadius: 8,
                            padding: "0.45rem 0.7rem",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            cursor:
                              calCredActionId === cred.id ? "default" : "pointer",
                            opacity: calCredActionId === cred.id ? 0.55 : 1,
                            fontFamily: "inherit",
                          }}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => removeCalCredential(cred.id)}
                        disabled={calCredActionId === cred.id}
                        style={{
                          backgroundColor: "transparent",
                          color: C.error,
                          border: `1px solid ${C.error}`,
                          borderRadius: 8,
                          padding: "0.45rem 0.7rem",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          cursor:
                            calCredActionId === cred.id ? "default" : "pointer",
                          opacity: calCredActionId === cred.id ? 0.55 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Core System Prompt */}
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: C.textMuted,
            marginBottom: 4,
          }}
        >
          Core System Prompt
        </h2>
        <p
          style={{
            color: C.textSecondary,
            fontSize: "0.78rem",
            marginBottom: "1rem",
          }}
        >
          AI Instructions (Raw JSON array flattened to text)
        </p>
        <textarea
          value={promptText}
          onChange={(e) => {
            setPromptText(e.target.value);
            setDirty(true);
          }}
          rows={18}
          style={{
            width: "100%",
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: "1rem",
            fontSize: "0.8rem",
            lineHeight: 1.65,
            color: C.textPrimary,
            resize: "vertical",
            outline: "none",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            boxSizing: "border-box",
          }}
        />
      </section>

      {/* Save button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            backgroundColor: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "0.65rem 1.8rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            opacity: saving ? 0.5 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 50,
            backgroundColor: toast.toLowerCase().includes("fail")
              ? C.error
              : C.success,
            color: "#fff",
            borderRadius: 8,
            padding: "0.7rem 1.5rem",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
