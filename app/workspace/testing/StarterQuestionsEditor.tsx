"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Spinner } from "../_components/Loader";

const MAX = 4;
const MAX_LEN = 80;

/**
 * The first questions a visitor can tap when the chat opens. The owner writes
 * them or picks from suggestions drafted from their own website; nothing
 * reaches the website until the page is saved.
 */
export default function StarterQuestionsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lower = new Set(value.map((q) => q.trim().toLowerCase()));

  async function suggest() {
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ questions: string[] }>("/api/config/starter-questions/suggest");
      const fresh = (res.questions || []).filter((q) => !lower.has(q.trim().toLowerCase()));
      setIdeas(fresh);
      if (!fresh.length) setError("We couldn't find new questions in your website and files. Add some knowledge first, or write your own.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function update(i: number, text: string) {
    const next = [...value];
    next[i] = text.slice(0, MAX_LEN);
    onChange(next);
  }

  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  function add(text = "") {
    if (value.length >= MAX) return;
    onChange([...value, text]);
    if (text) setIdeas((list) => (list ? list.filter((q) => q !== text) : list));
  }

  const field: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: "0.6rem 0.75rem",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: "0.85rem",
    fontFamily: "inherit",
    outline: "none",
  };
  const quietBtn: React.CSSProperties = {
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    borderRadius: 10,
    padding: "0.5rem 0.85rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>First questions</div>
          <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--text-muted)", maxWidth: 460, lineHeight: 1.5 }}>
            Up to {MAX} questions visitors can tap when the chat opens. They appear on your website only after you save.
            {value.length === 0 && " Until then the chat shows general questions."}
          </p>
        </div>
        <button type="button" style={quietBtn} onClick={suggest} disabled={loading}>
          {loading ? (
            <Spinner size={14} stroke={2} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />
            </svg>
          )}
          {loading ? "Reading your website…" : "Suggest from my website"}
        </button>
      </div>

      {/* Approved list */}
      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        {value.map((q, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 22, textAlign: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>{i + 1}</span>
            <input
              value={q}
              onChange={(e) => update(i, e.target.value)}
              placeholder="e.g. What do you sell?"
              aria-label={`Question ${i + 1}`}
              style={field}
            />
            <button type="button" onClick={() => remove(i)} aria-label={`Remove question ${i + 1}`} style={{ ...quietBtn, padding: "0.5rem 0.6rem" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ))}
        {value.length < MAX && (
          <button type="button" onClick={() => add()} style={{ ...quietBtn, justifySelf: "start", borderStyle: "dashed" }}>
            + Add a question
          </button>
        )}
      </div>

      {/* Suggestions to approve */}
      {error && <p style={{ margin: "12px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>{error}</p>}
      {ideas && ideas.length > 0 && (
        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--text-muted)" }}>
            FROM YOUR WEBSITE · TAP TO ADD
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {ideas.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => add(q)}
                disabled={value.length >= MAX}
                style={{
                  ...quietBtn,
                  borderRadius: 999,
                  fontWeight: 500,
                  opacity: value.length >= MAX ? 0.5 : 1,
                  cursor: value.length >= MAX ? "default" : "pointer",
                }}
              >
                + {q}
              </button>
            ))}
          </div>
          {value.length >= MAX && (
            <p style={{ margin: "10px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Remove a question above to add another.</p>
          )}
        </div>
      )}
    </div>
  );
}
