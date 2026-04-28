"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

export default function TestingPage() {
  const [role, setRole] = useState("hybrid");
  const [calendarLink, setCalendarLink] = useState("");
  const [calTheme, setCalTheme] = useState("light");
  const [calHideDetails, setCalHideDetails] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // 1. Load config
  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{
          bot_role: string;
          calendar_link: string;
          cal_api_key: string;
          cal_event_type_id: string;
          system_prompt_text: string;
        }>("/api/config/bot");
        setRole(data.bot_role || "hybrid");
        if (data.calendar_link) {
          try {
            const url = new URL(data.calendar_link);
            setCalTheme(url.searchParams.get("theme") || "light");
            setCalHideDetails(url.searchParams.get("hideEventTypeDetails") === "true");
            url.searchParams.delete("theme");
            url.searchParams.delete("hideEventTypeDetails");
            url.searchParams.delete("embed");
            setCalendarLink(url.toString().replace(/\?$/, ""));
          } catch(e) {
            setCalendarLink(data.calendar_link);
          }
        } else {
          setCalendarLink("");
        }
        setPromptText(data.system_prompt_text || "");
      } catch (err) {
        console.error("Failed to load config", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // 2. Inject testing embed widget
  useEffect(() => {
    const existing = document.getElementById("ryx-embed-script");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = "ryx-embed-script";
    script.src = `http://127.0.0.1:8000/static/embed.js?t=${Date.now()}`;
    script.setAttribute("data-api", "http://127.0.0.1:8000");
    document.body.appendChild(script);

    return () => {
      const s = document.getElementById("ryx-embed-script");
      if (s) s.remove();
      const widget = document.getElementById("ryx-chat-container");
      if (widget) widget.remove();
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      let finalLink = calendarLink.trim();
      if (finalLink && !finalLink.startsWith("http")) {
        finalLink = "https://" + finalLink;
      }
      if (finalLink) {
        try {
          const urlObj = new URL(finalLink);
          urlObj.searchParams.set("theme", calTheme);
          urlObj.searchParams.set("hideEventTypeDetails", calHideDetails ? "true" : "false");
          urlObj.searchParams.set("embed", "true");
          finalLink = urlObj.toString();
        } catch(e) {}
      }

      await api.post("/api/config/bot", {
        bot_role: role,
        calendar_link: finalLink,
        system_prompt_text: promptText,
      });
      setToast("Configuration saved!");
      setTimeout(() => setToast(""), 3000);
    } catch {
      alert("Failed to save.");
    } finally {
      setSaving(false);
    }
  }



  if (loading) {
    return (
      <div style={{ padding: "5rem", textAlign: "center", color: "#64748b" }}>
        Loading configuration…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "2rem 2.5rem 3rem" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          ⚙️ Agent Configuration
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.88rem", marginTop: 4 }}>
          Customize the AI&apos;s role, booking links, and behaviours. Changes apply instantly on the next chat message.
        </p>
      </div>

      {/* ── Agent Role Profile ── */}
      <section
        style={{
          background: "#1c1f26",
          border: "1px solid #2b2f36",
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#64748b", marginBottom: "1rem" }}>
          Agent Role Profile
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
          {ROLES.map((r) => {
            const active = role === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                style={{
                  position: "relative",
                  cursor: "pointer",
                  borderRadius: 12,
                  padding: "1rem",
                  textAlign: "left",
                  background: active ? "rgba(107,76,255,0.15)" : "#15181e",
                  border: active ? "1.5px solid rgba(107,76,255,0.5)" : "1.5px solid #2b2f36",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                {active && (
                  <span style={{ position: "absolute", top: 10, right: 12, fontSize: "0.85rem", color: "#6b4cff" }}>✓</span>
                )}
                <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{r.icon}</div>
                <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{r.label}</p>
                <p style={{ fontSize: "0.72rem", lineHeight: 1.4, color: "#94a3b8" }}>{r.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Demo Booking Calendar ── */}
      <section
        style={{
          background: "#1c1f26",
          border: "1px solid #2b2f36",
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#64748b", marginBottom: "1rem" }}>
          Demo Booking Calendar
        </h2>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>
          📅 Booking Link
        </label>
        <input
          type="text"
          value={calendarLink}
          onChange={(e) => setCalendarLink(e.target.value)}
          placeholder="https://cal.com/ryx-ai-2yw4pu/demo"
          style={{
            width: "100%",
            background: "#15181e",
            border: "1px solid #2b2f36",
            borderRadius: 8,
            padding: "0.65rem 0.85rem",
            fontSize: "0.85rem",
            color: "#e2e8f0",
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box"
          }}
        />
        <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: 8, marginBottom: "1rem" }}>
          This is the public URL of your Cal.com event (No API keys required).
        </p>

        {/* Settings Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Theme */}
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>
              Embed Theme
            </label>
            <select
              value={calTheme}
              onChange={(e) => setCalTheme(e.target.value)}
              style={{
                width: "100%",
                background: "#15181e",
                border: "1px solid #2b2f36",
                borderRadius: 8,
                padding: "0.6rem",
                fontSize: "0.8rem",
                color: "#e2e8f0",
                outline: "none",
                fontFamily: "inherit"
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (Matches User OS)</option>
            </select>
          </div>

          {/* Hide Details */}
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>
              Hide Event Details
            </label>
            <div 
              style={{
                display: "flex", 
                alignItems: "center", 
                background: "#15181e",
                border: "1px solid #2b2f36",
                borderRadius: 8,
                padding: "0.6rem",
                cursor: "pointer"
              }}
              onClick={() => setCalHideDetails(!calHideDetails)}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, 
                border: calHideDetails ? "none" : "1.5px solid #64748b",
                background: calHideDetails ? "#6b4cff" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginRight: 10
              }}>
                {calHideDetails && <span style={{ color: "#fff", fontSize: "0.7rem" }}>✓</span>}
              </div>
              <span style={{ fontSize: "0.8rem", color: "#e2e8f0" }}>Hide left panel details</span>
            </div>
          </div>
        </div>



      </section>

      {/* ── Core System Prompt ── */}
      <section
        style={{
          background: "#1c1f26",
          border: "1px solid #2b2f36",
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>
          Core System Prompt
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.78rem", marginBottom: "1rem" }}>
          AI Instructions (Raw JSON array flattened to text)
        </p>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={18}
          style={{
            width: "100%",
            background: "#0d0f14",
            border: "1px solid #2b2f36",
            borderRadius: 10,
            padding: "1rem",
            fontSize: "0.8rem",
            lineHeight: 1.65,
            color: "#e2e8f0",
            resize: "vertical",
            outline: "none",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            boxSizing: "border-box"
          }}
        />
      </section>

      {/* ── Save button ── */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: "#6b4cff",
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
            background: "#32d583",
            color: "#0e291e",
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
