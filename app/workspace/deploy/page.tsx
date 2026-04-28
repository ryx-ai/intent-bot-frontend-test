"use client";

import { useEffect, useState } from "react";

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

export default function DeployPage() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Use the FastAPI backend origin for embed script
    setOrigin(window.location.origin);
  }, []);

  const embedSrc = origin
    ? `${origin}/api/../static/embed.js`
    : "";
  // In production, this would be the actual Railway URL.
  // For now we point to the FastAPI backend directly.
  const backendOrigin = "http://127.0.0.1:8000";
  const snippet = `<script src="${backendOrigin}/static/embed.js" data-api="${backendOrigin}"><\/script>`;

  function copySnippet() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 2rem" }}>
      {/* Hero */}
      <div style={{ marginBottom: "2.5rem" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(107, 76, 255, 0.15)",
            border: "1px solid rgba(107, 76, 255, 0.3)",
            color: "#a78bfa",
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
            background: "linear-gradient(135deg, #fff 40%, #a78bfa)",
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
            color: "#64748b",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            maxWidth: 580,
          }}
        >
          Embed the RYX AI chatbot on any website in under 60 seconds — no
          developer needed. Just copy the snippet and paste it before your{" "}
          <code style={{ color: "#a78bfa", fontFamily: "monospace" }}>&lt;/body&gt;</code> tag.
        </p>
      </div>

      {/* Live Status Banner */}
      <div
        style={{
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
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
            background: "#10b981",
            boxShadow: "0 0 8px rgba(16, 185, 129, 0.6)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
          }}
        />
        <div>
          <p style={{ margin: "0 0 2px 0", fontSize: "0.85rem", fontWeight: 600, color: "#10b981" }}>
            Agent is Live & Running
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
            Active at: {backendOrigin || "Detecting…"}
          </p>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "2rem" }}>
        {/* Step 1: Preview */}
        <div
          style={{
            background: "#191c21",
            border: "1px solid #2b2f36",
            borderRadius: 14,
            padding: "1.5rem",
            position: "relative",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.3)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2b2f36"}
        >
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              width: 28,
              height: 28,
              background: "rgba(107, 76, 255, 0.15)",
              border: "1px solid rgba(107, 76, 255, 0.3)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#a78bfa",
            }}
          >
            1
          </div>
          <div style={{ paddingLeft: "2.5rem" }}>
            <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#e6e8eb" }}>
              Preview on a customer&apos;s site
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", color: "#9aa0a6", lineHeight: 1.6 }}>
              This is what the AI Agent looks like after it&apos;s embedded. The
              purple button appears fixed to the bottom-right corner of any
              webpage.
            </p>

            {/* Mock site preview */}
            <div
              style={{
                background: "#0f1115",
                borderRadius: 10,
                height: 260,
                position: "relative",
                overflow: "hidden",
                border: "1px solid #2b2f36"
              }}
            >
              {/* Mock navbar */}
              <div style={{ background: "#15181e", borderBottom: "1px solid #2b2f36", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 80, height: 8, background: "#2b2f36", borderRadius: 4 }} />
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ width: 40, height: 6, background: "#2b2f36", borderRadius: 3 }} />
                  ))}
                </div>
              </div>
              {/* Mock body */}
              <div style={{ padding: 20 }}>
                <div style={{ width: 200, height: 10, background: "#1c1f26", borderRadius: 4, marginBottom: 8 }} />
                <div style={{ width: 300, height: 7, background: "#191c21", borderRadius: 3, marginBottom: 6 }} />
                <div style={{ width: 240, height: 7, background: "#191c21", borderRadius: 3, marginBottom: 6 }} />
              </div>

              {/* Chat bubble */}
              <div
                style={{
                  position: "absolute",
                  bottom: 68,
                  right: 14,
                  background: "#191c21",
                  borderRadius: "12px 12px 2px 12px",
                  padding: "10px 14px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  fontSize: 12,
                  color: "#e6e8eb",
                  width: 200,
                  lineHeight: 1.4,
                  border: "1px solid #2b2f36"
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
                  background: "#6b4cff",
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
            background: "#191c21",
            border: "1px solid #2b2f36",
            borderRadius: 14,
            padding: "1.5rem",
            position: "relative",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.3)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2b2f36"}
        >
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              width: 28,
              height: 28,
              background: "rgba(107, 76, 255, 0.15)",
              border: "1px solid rgba(107, 76, 255, 0.3)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#a78bfa",
            }}
          >
            2
          </div>
          <div style={{ paddingLeft: "2.5rem" }}>
            <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#e6e8eb" }}>
              Copy the embed snippet
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", color: "#9aa0a6", lineHeight: 1.6 }}>
              Paste this single line just before the closing{" "}
              <code style={{ color: "#a78bfa", fontFamily: "monospace" }}>&lt;/body&gt;</code> tag on
              every page you want the agent to appear.
            </p>
            <div
              style={{
                background: "#0a0c10",
                border: "1px solid #2b2f36",
                borderRadius: 10,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  background: "#15181e",
                  borderBottom: "1px solid #2b2f36",
                  padding: "10px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748b" }}>
                  HTML
                </span>
                <button
                  onClick={copySnippet}
                  style={{
                    background: copied ? "rgba(16, 185, 129, 0.15)" : "rgba(107, 76, 255, 0.15)",
                    border: `1px solid ${copied ? "rgba(16, 185, 129, 0.4)" : "rgba(107, 76, 255, 0.3)"}`,
                    color: copied ? "#10b981" : "#a78bfa",
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
                      e.currentTarget.style.borderColor = "#6b4cff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!copied) {
                      e.currentTarget.style.background = "rgba(107, 76, 255, 0.15)";
                      e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.3)";
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
                  color: "#e2e8f0",
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
          </div>
        </div>

        {/* Step 3: Platforms */}
        <div
          style={{
            background: "#191c21",
            border: "1px solid #2b2f36",
            borderRadius: 14,
            padding: "1.5rem",
            position: "relative",
            transition: "border-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.3)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2b2f36"}
        >
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              width: 28,
              height: 28,
              background: "rgba(107, 76, 255, 0.15)",
              border: "1px solid rgba(107, 76, 255, 0.3)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#a78bfa",
            }}
          >
            3
          </div>
          <div style={{ paddingLeft: "2.5rem" }}>
            <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#e6e8eb" }}>
              Works on any platform
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", color: "#9aa0a6", lineHeight: 1.6 }}>
              Paste it in your website builder&apos;s &quot;Custom Code&quot; or
              &quot;Footer Scripts&quot; section.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
              {PLATFORMS.map((p) => (
                <div
                  key={p.name}
                  style={{
                    background: "#15181e",
                    border: "1px solid #2b2f36",
                    borderRadius: 10,
                    padding: "0.875rem 1rem",
                    textAlign: "center",
                    transition: "all 0.2s",
                    cursor: "default"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.3)";
                    e.currentTarget.style.background = "rgba(107, 76, 255, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#2b2f36";
                    e.currentTarget.style.background = "#15181e";
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>{p.icon}</div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#e6e8eb" }}>
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
              background: "#15181e",
              border: "1px solid #2b2f36",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: "0.78rem",
              color: "#9aa0a6",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            {pill.icon} <strong style={{ color: "#e6e8eb", fontWeight: 600 }}>{pill.title}</strong> — {pill.desc}
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
