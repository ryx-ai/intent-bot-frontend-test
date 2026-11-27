"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Spinner } from "../_components/Loader";

const MAX = 4;
const MAX_LEN = 80;

const SparkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />
  </svg>
);

/**
 * The first questions a visitor can tap when the chat opens. Starts from what
 * the chat shows today (the defaults); the owner edits, improves with AI or
 * picks suggestions from their own website. Nothing reaches the website until
 * the page is saved.
 */
export default function StarterQuestionsEditor({
  value,
  defaults,
  onChange,
}: {
  value: string[];
  /** What the chat shows when the owner hasn't approved any questions. */
  defaults: string[];
  onChange: (next: string[]) => void;
}) {
  const usingDefaults = value.length === 0;
  const rows = usingDefaults ? defaults.slice(0, MAX) : value;

  const [draft, setDraft] = useState("");
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [improving, setImproving] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  // The first change to the defaults turns them into the owner's own list.
  const commit = (next: string[]) => onChange(next.map((q) => q.slice(0, MAX_LEN)));
  const base = () => [...rows];

  function update(i: number, text: string) {
    const next = base();
    next[i] = text;
    commit(next);
  }

  function remove(i: number) {
    const next = base().filter((_, j) => j !== i);
    // Removing every question would fall back to the defaults: keep at least an
    // explicit empty list only when the owner had their own list.
    commit(next);
  }

  function add(text: string) {
    const q = text.trim();
    if (!q || rows.length >= MAX) return;
    if (rows.some((r) => r.trim().toLowerCase() === q.toLowerCase())) return;
    commit([...base(), q]);
    setIdeas((list) => (list ? list.filter((x) => x !== text) : list));
  }

  async function improve(i: number) {
    const q = rows[i]?.trim();
    if (!q) return;
    setImproving(i);
    setError("");
    try {
      const res = await api.post<{ question: string; supported: boolean }>("/api/config/starter-questions/improve", { question: q });
      const better = (res.question || q).trim();
      update(i, better);
      setNotes((n) => {
        const copy = { ...n };
        if (res.supported) delete copy[better];
        else copy[better] = "Your website doesn't seem to answer this yet, so the assistant would send visitors to your team.";
        return copy;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't improve this question. Please try again.");
    } finally {
      setImproving(null);
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError("");
    try {
      const res = await api.post<{ questions: string[] }>("/api/config/starter-questions/suggest");
      const have = new Set(rows.map((q) => q.trim().toLowerCase()));
      const fresh = (res.questions || []).filter((q) => !have.has(q.trim().toLowerCase()));
      setIdeas(fresh);
      if (!fresh.length) setError("We couldn't find new questions in your website and files. Add some knowledge first, or write your own.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get suggestions. Please try again.");
    } finally {
      setSuggesting(false);
    }
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
    padding: "0.5rem 0.75rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };
  const full = rows.length >= MAX;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>First questions</div>
          <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--text-muted)", maxWidth: 470, lineHeight: 1.5 }}>
            Up to {MAX} questions visitors can tap when the chat opens. Changes appear on your website only after you save.
          </p>
        </div>
        <button type="button" style={quietBtn} onClick={suggest} disabled={suggesting}>
          {suggesting ? <Spinner size={14} stroke={2} /> : <SparkIcon />}
          {suggesting ? "Reading your website…" : "Suggest from my website"}
        </button>
      </div>

      {usingDefaults && rows.length > 0 && (
        <div style={{ marginTop: 14, fontSize: "0.74rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border)", fontWeight: 600 }}>Default</span>
          These show now. Edit, improve or replace them to make them yours.
        </div>
      )}

      {/* The questions */}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((q, i) => (
          <div key={i}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 20, textAlign: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>{i + 1}</span>
              <input
                value={q}
                onChange={(e) => update(i, e.target.value)}
                onBlur={() => {
                  if (!q.trim()) remove(i); // no empty questions
                }}
                aria-label={`Question ${i + 1}`}
                style={field}
              />
              <button
                type="button"
                onClick={() => improve(i)}
                disabled={improving !== null || !q.trim()}
                title="Rewrite this question with AI, using your website"
                style={quietBtn}
              >
                {improving === i ? <Spinner size={13} stroke={2} /> : <SparkIcon />}
                {improving === i ? "Improving…" : "Improve"}
              </button>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove question ${i + 1}`} style={{ ...quietBtn, padding: "0.5rem 0.6rem" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {notes[q.trim()] && (
              <p style={{ margin: "5px 0 0 28px", fontSize: "0.74rem", color: "var(--warning)" }}>{notes[q.trim()]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Add your own: only with text */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
          setDraft("");
        }}
        style={{ display: "flex", gap: 8, marginTop: 10, paddingLeft: 28 }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          placeholder={full ? `You have ${MAX} questions. Remove one to add another.` : "Write a question… e.g. Do you deliver to Kochi?"}
          disabled={full}
          aria-label="New question"
          style={{ ...field, opacity: full ? 0.6 : 1 }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || full}
          style={{
            ...quietBtn,
            background: draft.trim() && !full ? "var(--ink)" : "var(--bg-card)",
            color: draft.trim() && !full ? "#fff" : "var(--text-muted)",
            borderColor: draft.trim() && !full ? "var(--ink)" : "var(--border)",
            cursor: draft.trim() && !full ? "pointer" : "default",
          }}
        >
          Add
        </button>
      </form>

      {error && <p style={{ margin: "12px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>{error}</p>}

      {/* Suggestions to approve */}
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
                disabled={full}
                style={{ ...quietBtn, borderRadius: 999, fontWeight: 500, opacity: full ? 0.5 : 1, cursor: full ? "default" : "pointer" }}
              >
                + {q}
              </button>
            ))}
          </div>
          {full && <p style={{ margin: "10px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Remove a question above to add another.</p>}
        </div>
      )}
    </div>
  );
}
