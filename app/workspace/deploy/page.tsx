"use client";

import { useState, useEffect } from "react";

const PLATFORMS = [
  { icon: "🔷", name: "WordPress" },
  { icon: "🟧", name: "Shopify" },
  { icon: "🌐", name: "Wix" },
  { icon: "⬛", name: "Webflow" },
  { icon: "📄", name: "Raw HTML" },
  { icon: "⚛️", name: "React/Next" },
];

const INFO_PILLS = [
  { icon: "🔒", title: "Secure", desc: "All chat data encrypted in transit" },
  { icon: "⚡", title: "Zero dependencies", desc: "No npm, no build step" },
  { icon: "📱", title: "Mobile ready", desc: "Responsive on all screen sizes" },
  { icon: "🎨", title: "No style conflicts", desc: "Isolated CSS namespace" },
];

// Hostnames that should never be used in a published embed snippet.
// Broader than just "localhost"/"127.0.0.1" — also catches IPv6 loopback,
// 0.0.0.0, mDNS .local addresses, and RFC1918 LAN ranges that customers
// can't reach from outside the dev's network.
function isDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    ) return true;
    // RFC1918 / link-local IPv4
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;
    return false;
  } catch {
    return true; // unparseable origin → treat as not-shippable
  }
}

type HealthState = "checking" | "ok" | "down";

export default function DeployPage() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [health, setHealth] = useState<HealthState>("checking");

  // Production builds set NEXT_PUBLIC_API_URL. The localhost fallback only
  // kicks in during dev — the dev banner above flags that case to the user.
  const backendOrigin = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const isLocalhost = isDevOrigin(backendOrigin);
  const snippet = `<script src="${backendOrigin}/static/embed.js" data-api="${backendOrigin}"><\/script>`;

  // Real health check — confirms the backend the snippet points at is
  // actually reachable. Otherwise the green "Live & Running" pill would
  // lie even when the server is down.
  useEffect(() => {
    let cancelled = false;
    setHealth("checking");
    fetch(`${backendOrigin}/health`, { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        setHealth(res.ok ? "ok" : "down");
      })
      .catch(() => {
        if (!cancelled) setHealth("down");
      });
    return () => {
      cancelled = true;
    };
  }, [backendOrigin]);

  async function copySnippet() {
    setCopyError("");
    // navigator.clipboard is undefined in non-secure contexts and old
    // browsers — fall back to a hidden textarea + execCommand so the
    // button still works for users without HTTPS.
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
        const ta = document.createElement("textarea");
        ta.value = snippet;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand returned false");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError("Copy failed — select the text manually");
      setTimeout(() => setCopyError(""), 4000);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 2rem" }}>
      {/* Localhost warning */}
      {isLocalhost && (
        <div style={{
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: 10,
          padding: "0.75rem 1rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "0.85rem",
          color: "var(--warning)",
        }}>
          ⚠️ <strong>Dev Mode:</strong>&nbsp;Snippet points to localhost. Set <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>NEXT_PUBLIC_API_URL</code> on Vercel before deploying.
        </div>
      )}
      {/* Hero */}
      <div style={{ marginBottom: "2.5rem" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-glow)",
            color: "var(--accent-light)",
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: "0.72rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: "1rem"
          }}
        >
          ⚡ Live Deployment
        </span>
        <h1
          style={{
            margin: "0 0 0.5rem 0",
            fontSize: "2rem",
            fontWeight: 800,
            background: "linear-gradient(135deg, #fff 40%, var(--accent-light))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Deploy Your Agent
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            maxWidth: 580,
          }}
        >
          Embed the RYX AI chatbot on any website in under 60 seconds — no
          developer needed. Just copy the snippet and paste it before your{" "}
          <code style={{ color: "var(--accent-light)", fontFamily: "monospace" }}>&lt;/body&gt;</code> tag.
        </p>
      </div>

      {/* Live Status Banner — color and label reflect the real /health probe. */}
      {(() => {
        const palette =
          health === "ok"
            ? { bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.25)", dot: "#10b981", dotShadow: "rgba(16, 185, 129, 0.6)", text: "#10b981", label: "Agent is Live & Running" }
            : health === "down"
              ? { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", dot: "#ef4444", dotShadow: "rgba(239, 68, 68, 0.6)", text: "#fca5a5", label: "Agent is Unreachable" }
              : { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.25)", dot: "#f59e0b", dotShadow: "rgba(245, 158, 11, 0.5)", text: "#fbbf24", label: "Checking agent status…" };
        return (
          <div
            style={{
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              borderRadius: 10,
              padding: "1rem 1.25rem",
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: "2rem"
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: palette.dot,
                boxShadow: `0 0 8px ${palette.dotShadow}`,
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
              }}
            />
            <div>
              <p style={{ margin: "0 0 2px 0", fontSize: "0.85rem", fontWeight: 600, color: palette.text }}>
                {palette.label}
              </p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {health === "down" ? "Cannot reach: " : "Active at: "}{backendOrigin}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "2rem" }}>
        {/* Step 1: Preview */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem",
            position: "relative",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent-glow)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              width: 28,
              height: 28,
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-glow)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--accent-light)",
            }}
          >
            1
          </div>
          <div style={{ paddingLeft: "2.5rem" }}>
            <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Preview on a customer&apos;s site
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              This is what the AI Agent looks like after it&apos;s embedded. The
              purple button appears fixed to the bottom-right corner of any
              webpage.
            </p>

            {/* Mock site preview */}
            <div
              style={{
                backgroundColor: "var(--bg)",
                borderRadius: 10,
                height: 260,
                position: "relative",
                overflow: "hidden",
                border: "1px solid var(--border)"
              }}
            >
              {/* Mock navbar */}
              <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 80, height: 8, background: "var(--border)", borderRadius: 4 }} />
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ width: 40, height: 6, background: "var(--border)", borderRadius: 3 }} />
                  ))}
                </div>
              </div>
              {/* Mock body */}
              <div style={{ padding: 20 }}>
                <div style={{ width: 200, height: 10, backgroundColor: "var(--bg-card)", borderRadius: 4, marginBottom: 8 }} />
                <div style={{ width: 300, height: 7, backgroundColor: "var(--bg-hover)", borderRadius: 3, marginBottom: 6 }} />
                <div style={{ width: 240, height: 7, backgroundColor: "var(--bg-hover)", borderRadius: 3, marginBottom: 6 }} />
              </div>

              {/* Chat bubble */}
              <div
                style={{
                  position: "absolute",
                  bottom: 68,
                  right: 14,
                  backgroundColor: "var(--bg-hover)",
                  borderRadius: "12px 12px 2px 12px",
                  padding: "10px 14px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  width: 200,
                  lineHeight: 1.4,
                  border: "1px solid var(--border)"
                }}
              >
                👋 Hello! I&apos;m the RYX AI Assistant. How can I help you?
              </div>
              {/* Bot button */}
              <div
                style={{
                  position: "absolute",
                  bottom: 16,
                  right: 16,
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  boxShadow: "0 6px 20px rgba(107, 76, 255, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 18,
                  cursor: "pointer"
                }}
              >
                ✦
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Code snippet */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem",
            position: "relative",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent-glow)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              width: 28,
              height: 28,
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-glow)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--accent-light)",
            }}
          >
            2
          </div>
          <div style={{ paddingLeft: "2.5rem" }}>
            <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Copy the embed snippet
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Paste this single line just before the closing{" "}
              <code style={{ color: "var(--accent-light)", fontFamily: "monospace" }}>&lt;/body&gt;</code> tag on
              every page you want the agent to appear.
            </p>
            <div
              style={{
                background: "#0d1020",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderBottom: "1px solid var(--border)",
                  padding: "10px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  HTML
                </span>
                <button
                  onClick={copySnippet}
                  style={{
                    background: copied ? "rgba(16, 185, 129, 0.15)" : "var(--accent-dim)",
                    border: `1px solid ${copied ? "rgba(16, 185, 129, 0.4)" : "var(--accent-glow)"}`,
                    color: copied ? "#10b981" : "var(--accent-light)",
                    borderRadius: 6,
                    padding: "4px 12px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    fontFamily: "'Inter', sans-serif"
                  }}
                  onMouseEnter={(e) => {
                    if (!copied) {
                      e.currentTarget.style.background = "rgba(107, 76, 255, 0.25)";
                      e.currentTarget.style.borderColor = "var(--accent)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!copied) {
                      e.currentTarget.style.background = "var(--accent-dim)";
                      e.currentTarget.style.borderColor = "var(--accent-glow)";
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy Snippet"}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "18px 20px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.82rem",
                  lineHeight: 1.7,
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  overflowX: "auto"
                }}
              >
                <code>
                  <span style={{ color: "#f9a8d4" }}>&lt;script</span>{" "}
                  <span style={{ color: "#93c5fd" }}>src</span>=
                  <span style={{ color: "#86efac" }}>
                    &quot;{backendOrigin}/static/embed.js&quot;
                  </span>
                  {"\n        "}
                  <span style={{ color: "#93c5fd" }}>data-api</span>=
                  <span style={{ color: "#86efac" }}>
                    &quot;{backendOrigin}&quot;
                  </span>
                  <span style={{ color: "#f9a8d4" }}>&gt;&lt;/script&gt;</span>
                </code>
              </pre>
            </div>
            {copyError && (
              <p style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.78rem", color: "var(--error)" }}>
                {copyError}
              </p>
            )}
          </div>
        </div>

        {/* Step 3: Platforms */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem",
            position: "relative",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent-glow)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              width: 28,
              height: 28,
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-glow)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--accent-light)",
            }}
          >
            3
          </div>
          <div style={{ paddingLeft: "2.5rem" }}>
            <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Works on any platform
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Paste it in your website builder&apos;s &quot;Custom Code&quot; or
              &quot;Footer Scripts&quot; section.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
              {PLATFORMS.map((p) => (
                <div
                  key={p.name}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "0.875rem 1rem",
                    textAlign: "center",
                    transition: "all 0.2s",
                    cursor: "default"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-glow)";
                    e.currentTarget.style.background = "rgba(107, 76, 255, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--bg-surface)";
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>{p.icon}</div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {p.name}
                  </div>
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: "0.3rem",
                      fontSize: "0.65rem",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10b981",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontWeight: 600
                    }}
                  >
                    ✓ Supported
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Info pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {INFO_PILLS.map((pill) => (
          <div
            key={pill.title}
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            {pill.icon} <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{pill.title}</strong> — {pill.desc}
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}} />
    </div>
  );
}
