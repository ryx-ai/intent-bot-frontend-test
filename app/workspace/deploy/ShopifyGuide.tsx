"use client";

import { useState } from "react";

type Props = {
  copied: boolean;
  onCopy: () => void;
  onClose?: () => void;
};

const chip: React.CSSProperties = {
  display: "inline-block",
  background: "var(--bg-hover)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "1px 8px",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
};

function Path({ items }: { items: string[] }) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {items.map((t, i) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={chip}>{t}</span>
          {i < items.length - 1 && <span style={{ color: "var(--text-muted)" }}>→</span>}
        </span>
      ))}
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span
        style={{
          flex: "0 0 auto",
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontSize: "0.75rem",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>{children}</div>
      </div>
    </li>
  );
}

/** A small drawing of Shopify's theme editor, showing where to click. */
function EditorSketch() {
  const row = (label: string, opts: { active?: boolean; add?: boolean; indent?: boolean } = {}) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        marginLeft: opts.indent ? 12 : 0,
        borderRadius: 5,
        fontSize: 11,
        color: opts.add ? "var(--text-primary)" : opts.active ? "var(--text-primary)" : "var(--text-muted)",
        background: opts.active ? "var(--bg-card)" : "transparent",
        border: opts.active ? "1px dashed #94a3b8" : "1px solid transparent",
        fontWeight: opts.active || opts.add ? 700 : 500,
      }}
    >
      {label}
    </div>
  );
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        height: 190,
        background: "var(--bg)",
        maxWidth: 520,
      }}
    >
      <div style={{ width: "min(190px, 62%)", flex: "0 0 auto", borderRight: "1px solid var(--border)", padding: 8, background: "var(--bg-surface)" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", margin: "2px 8px 6px" }}>
          Home page
        </div>
        {row("Header")}
        {row("Template")}
        {row("Footer", { active: true })}
        {row("⊕ Add section", { add: true, indent: true })}
        <div
          style={{
            marginLeft: 24,
            marginTop: 4,
            padding: "5px 8px",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 5,
            background: "#0f172a",
            border: "1px solid #0f172a",
            color: "#fff",
            display: "inline-block",
          }}
        >
          Custom Liquid
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", padding: 14 }}>
        <div style={{ width: "60%", height: 8, background: "var(--bg-hover)", borderRadius: 4, marginBottom: 8 }} />
        <div style={{ width: "80%", height: 6, background: "var(--bg-hover)", borderRadius: 3, marginBottom: 6 }} />
        <div style={{ width: "70%", height: 6, background: "var(--bg-hover)", borderRadius: 3 }} />
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "#fff",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 2px #0f172a, 0 4px 14px rgba(15,23,42,.2)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        </div>
      </div>
    </div>
  );
}

export default function ShopifyGuide({ copied, onCopy, onClose }: Props) {
  const [showFallback, setShowFallback] = useState(false);
  const [showSketch, setShowSketch] = useState(false);
  // On the Deploy page the code is copied in the step above, so the guide is shorter.
  const compact = !onClose;
  const n = (i: number) => (compact ? i - 1 : i);

  return (
    <div>
      {onClose && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "1rem" }}>
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>Add your agent to Shopify</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
            About 2 minutes. No coding, and you can undo it any time.
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close Shopify guide"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            borderRadius: 8,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          Close
        </button>
      </div>
      )}

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: compact ? "0.85rem" : "1.1rem" }}>
        {!compact && (
        <Step n={1} title="Copy your code">
          <button
            onClick={onCopy}
            style={{
              background: copied ? "rgba(16, 185, 129, 0.1)" : "#0f172a",
              border: copied ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid #0f172a",
              color: copied ? "#059669" : "white",
              borderRadius: 10,
              padding: "7px 16px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied" : "Copy my code"}
          </button>
        </Step>
        )}

        <Step n={n(2)} title="Open your theme editor">
          In your Shopify admin, go to{" "}
          <Path items={["Online Store", "Themes", "Customize"]} />
        </Step>

        <Step n={n(3)} title="Add a Custom Liquid section to the footer">
          <div style={{ marginBottom: 10 }}>
            In the left menu, find <span style={chip}>Footer</span>, then click{" "}
            <Path items={["Add section", "Custom Liquid"]} />
          </div>
          {compact && !showSketch ? (
            <button
              type="button"
              onClick={() => setShowSketch(true)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              See where to click
            </button>
          ) : (
            <>
              <EditorSketch />
              <div style={{ marginTop: 8, fontSize: "0.76rem", color: "var(--text-muted)" }}>
                The footer is on every page, so the chat button will appear across your whole store.
              </div>
            </>
          )}
        </Step>

        <Step n={n(4)} title="Paste the code and save">
          Click into the <span style={chip}>Liquid code</span> box on the right, paste (Ctrl+V or ⌘V), then click{" "}
          <span style={chip}>Save</span> at the top right.
        </Step>

        {!compact && (
        <Step n={5} title="Check it works">
          Open your store in a new tab. The chat button should appear in the bottom-right corner. If your store
          still has a password page, log in past it first.
        </Step>
        )}
      </ol>

      <div style={{ marginTop: compact ? "0.9rem" : "1.25rem", borderTop: "1px solid var(--border)", paddingTop: compact ? "0.7rem" : "0.9rem" }}>
        <button
          onClick={() => setShowFallback((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: "var(--text-secondary)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showFallback ? "▾" : "▸"} Can&apos;t find &quot;Custom Liquid&quot;? (older themes)
        </button>
        {showFallback && (
          <ol style={{ margin: "0.7rem 0 0", paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
            <li>
              Go to <Path items={["Online Store", "Themes"]} />, click the <span style={chip}>…</span> button next to
              Customize, then <span style={chip}>Edit code</span>.
            </li>
            <li>
              Open <span style={chip}>layout/theme.liquid</span>.
            </li>
            <li>
              Find the line <code style={{ color: "var(--text-primary)", fontWeight: 600 }}>&lt;/body&gt;</code> near the bottom (Ctrl+F helps),
              paste your code on the line just above it, then click <span style={chip}>Save</span>.
            </li>
          </ol>
        )}
      </div>

      {!compact && (
      <div style={{ marginTop: "0.9rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
        To remove the agent later, delete the Custom Liquid section (or the pasted line) and save.
      </div>
      )}
    </div>
  );
}
