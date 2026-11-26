"use client";

import { useState } from "react";
import ColourPopover from "./ColourPopover";

/** The stored value meaning "use the website's own colour" (the widget detects it). */
export const MATCH_WEBSITE_COLOR = "#8A64E9";

const PRESETS = [
  { hex: "#111827", name: "Black" },
  { hex: "#1C22D8", name: "Royal blue" },
  { hex: "#2563EB", name: "Blue" },
  { hex: "#0EA5E9", name: "Sky" },
  { hex: "#0D9488", name: "Teal" },
  { hex: "#16A34A", name: "Green" },
  { hex: "#D97706", name: "Amber" },
  { hex: "#DC2626", name: "Red" },
  { hex: "#DB2777", name: "Pink" },
  { hex: "#7C3AED", name: "Violet" },
];

const C = {
  border: "var(--border)",
  surface: "var(--bg-surface)",
  card: "var(--bg-card)",
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  text: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  muted: "var(--text-muted)",
  error: "var(--error)",
};

function isHex(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

function ChatIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

/** Chat colour: match the website automatically, or choose a colour. */
export default function ChatColourPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const auto = value.toLowerCase() === MATCH_WEBSITE_COLOR.toLowerCase();
  const [draft, setDraft] = useState(auto ? "" : value.toUpperCase());
  const [lastCustom, setLastCustom] = useState(auto ? PRESETS[1].hex : value);
  const [openCustom, setOpenCustom] = useState(false);
  const previewColor = auto ? "#6B7280" : value;

  function pick(hex: string) {
    setLastCustom(hex);
    setDraft(hex.toUpperCase());
    onChange(hex);
  }

  const optionCard = (selected: boolean): React.CSSProperties => ({
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: "14px 16px",
    borderRadius: 14,
    border: `1.5px solid ${selected ? "var(--text-primary)" : C.border}`,
    background: "var(--bg-card)",
    boxShadow: selected ? "0 1px 3px rgba(15, 23, 42, 0.10)" : "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    color: C.text,
    width: "100%",
    transition: "border-color .15s ease, background .15s ease",
  });

  const radio = (selected: boolean): React.CSSProperties => ({
    flex: "none",
    marginTop: 2,
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: `2px solid ${selected ? "var(--text-primary)" : C.muted}`,
    boxShadow: selected ? "inset 0 0 0 3px var(--bg-card), inset 0 0 0 9px var(--text-primary)" : "none",
  });

  return (
    <div>
      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: C.text }}>Chat colour</div>
      <p style={{ margin: "4px 0 12px", fontSize: "0.75rem", color: C.muted }}>How the chat looks on your website.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <button type="button" style={optionCard(auto)} onClick={() => onChange(MATCH_WEBSITE_COLOR)} aria-pressed={auto}>
          <span style={radio(auto)} />
          <span>
            <span style={{ display: "block", fontWeight: 700, fontSize: "0.86rem" }}>✨ Match my website</span>
            <span style={{ display: "block", marginTop: 3, fontSize: "0.75rem", color: C.textSecondary, lineHeight: 1.45 }}>
              Uses your website&apos;s own colour and fonts automatically. Recommended.
            </span>
          </span>
        </button>
        <button type="button" style={optionCard(!auto)} onClick={() => auto && pick(lastCustom)} aria-pressed={!auto}>
          <span style={radio(!auto)} />
          <span>
            <span style={{ display: "block", fontWeight: 700, fontSize: "0.86rem" }}>🎨 Choose a colour</span>
            <span style={{ display: "block", marginTop: 3, fontSize: "0.75rem", color: C.textSecondary, lineHeight: 1.45 }}>
              Use your exact brand colour everywhere.
            </span>
          </span>
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, alignItems: "stretch" }}>
        {!auto && (
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {PRESETS.map((p) => {
                const on = value.toLowerCase() === p.hex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    type="button"
                    title={p.name}
                    aria-label={p.name}
                    aria-pressed={on}
                    onClick={() => pick(p.hex)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: p.hex,
                      border: "2px solid var(--bg-card)",
                      boxShadow: on ? `0 0 0 2px ${p.hex}` : "0 0 0 1px var(--border)",
                      cursor: "pointer",
                      padding: 0,
                      transform: on ? "scale(1.08)" : "none",
                      transition: "transform .12s ease, box-shadow .12s ease",
                    }}
                  />
                );
              })}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  title="Custom colour"
                  aria-label="Custom colour"
                  aria-expanded={openCustom}
                  onClick={() => setOpenCustom((o) => !o)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    padding: 0,
                    background: "conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
                    border: "2px solid var(--bg-card)",
                    boxShadow: openCustom ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--border)",
                    cursor: "pointer",
                  }}
                />
                {openCustom && (
                  <ColourPopover value={isHex(value) ? value : "#1C22D8"} onChange={pick} onClose={() => setOpenCustom(false)} />
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <span
                style={{ width: 22, height: 22, borderRadius: 6, background: isHex(draft) ? draft : value, border: `1px solid ${C.border}`, flex: "none" }}
              />
              <input
                value={draft}
                onChange={(e) => {
                  let v = e.target.value.trim().toUpperCase();
                  if (v && !v.startsWith("#")) v = "#" + v;
                  setDraft(v.slice(0, 7));
                  if (isHex(v)) pick(v);
                }}
                placeholder="#1C22D8"
                aria-label="Colour code"
                style={{
                  width: 110,
                  padding: "0.45rem 0.6rem",
                  borderRadius: 8,
                  border: `1px solid ${draft && !isHex(draft) ? C.error : C.border}`,
                  background: C.surface,
                  color: C.text,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: "0.82rem",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "0.72rem", color: C.muted }}>Your brand colour code</span>
            </div>
          </div>
        )}

        {/* Live preview of the chat button and greeting */}
        <div
          style={{
            flex: auto ? "1 1 100%" : "0 0 230px",
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            background: "linear-gradient(160deg, #f6f7fb, #eef0f6)",
            padding: "14px 14px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            position: "relative",
          }}
        >
          <span style={{ position: "absolute", left: 12, top: 10, fontSize: "0.65rem", fontWeight: 700, letterSpacing: ".1em", color: "#6b7280" }}>
            PREVIEW
          </span>
          <div
            style={{
              marginTop: 16,
              background: "#fff",
              color: "#111827",
              borderRadius: "16px 16px 4px 16px",
              padding: "9px 12px",
              fontSize: "0.75rem",
              lineHeight: 1.4,
              boxShadow: "0 8px 20px rgba(17,24,39,.12)",
              maxWidth: 190,
            }}
          >
            👋 Hi! Have a question? I&apos;m here to help.
          </div>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 0 5px ${previewColor}22, 0 8px 18px rgba(17,24,39,.16)`,
            }}
          >
            <ChatIcon color={previewColor} />
          </div>
          {auto && (
            <span style={{ alignSelf: "flex-start", fontSize: "0.72rem", color: "#6b7280" }}>
              On your website, grey becomes your website&apos;s colour.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
