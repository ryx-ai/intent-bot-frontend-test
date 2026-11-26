"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "../_components/ConfirmDialog";

interface MappingEntry {
  path: string;
  description: string;
  source: string;
}

interface MappingData {
  [keyword: string]: MappingEntry;
}

function formatTopicLabel(key: string): string {
  if (!key) return "";
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function VisualMappingPage() {
  const [mappings, setMappings] = useState<MappingData>({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const [toast, setToast] = useState("");
  const [deleteKeyword, setDeleteKeyword] = useState<string | null>(null);
  const [deletingKeyword, setDeletingKeyword] = useState("");
  // Picture opened in the large view
  const [viewKey, setViewKey] = useState<string | null>(null);
  useEffect(() => {
    if (!viewKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewKey]);

  const fetchMappings = useCallback(async () => {
    try {
      const data = await api.get<MappingData>("/api/visual-mapping");
      setMappings(data);
    } catch (err) {
      console.error("Failed to load visual mappings", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const data = await api.get<MappingData>("/api/visual-mapping");
        if (!ignore) {
          setMappings(data);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to load visual mappings", err);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, []);

  const keys = useMemo(() => Object.keys(mappings), [mappings]);

  // Group mappings by source
  const groups = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const key of keys) {
      const src = mappings[key]?.source || "Knowledge upload";
      if (!map[src]) {
        map[src] = [];
      }
      map[src].push(key);
    }
    return Object.entries(map).map(([source, groupKeys]) => ({
      source,
      keys: groupKeys,
    }));
  }, [mappings, keys]);

  // ── Rename ──
  function startEdit(key: string) {
    setEditingKey(key);
    setEditValue(key.replace(/_+/g, " "));
    setEditError("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
    setEditError("");
  }

  async function finishEdit(oldKey: string) {
    if (!editingKey) return; // guard against double-fire
    const newKey = editValue
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    if (!newKey || newKey === oldKey) {
      setEditingKey(null);
      setEditError("");
      return;
    }

    if (keys.includes(newKey)) {
      setEditError(`"${newKey}" already exists`);
      return;
    }

    // Close the editor before awaiting so follow-up events can't re-trigger
    setEditingKey(null);
    setEditError("");

    try {
      await api.patch("/api/visual-mapping/rename", {
        old_key: oldKey,
        new_key: newKey,
      });
      fetchMappings();
      setToast("Renamed");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 409
          ? "Rename failed: duplicate key"
          : "Rename failed";
      setToast(msg);
      setTimeout(() => setToast(""), 3000);
    }
  }

  // ── Delete ──
  async function handleDelete(keyword: string) {
    setDeleteKeyword(keyword);
  }

  async function confirmDelete() {
    if (!deleteKeyword) return;
    const keyword = deleteKeyword;
    setDeletingKeyword(keyword);

    try {
      await api.delete(`/api/visual-mapping/${encodeURIComponent(keyword)}`);
      fetchMappings();
      setToast("Mapping deleted");
    } catch {
      setToast("Delete failed");
    } finally {
      setDeletingKeyword("");
      setDeleteKeyword(null);
    }
    setTimeout(() => setToast(""), 3000);
  }

  // Resolve image URL — use the Next.js proxy so it works in all environments
  function resolveImageUrl(path: string) {
    if (!path) return path;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return path;
    return `/static/${path}`;
  }

  return (
    <div
      className="visual-mapping-container"
      style={{
        width: "100%",
        maxWidth: 1400,
        margin: "0 auto",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .vm-empty { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); background: var(--bg-card); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.04); }
        .vm-empty-preview { display: flex; align-items: center; justify-content: center; padding: 2.25rem; background: var(--bg-surface); border-left: 1px solid var(--border); }
        .vm-btn-dark { display: inline-flex; align-items: center; gap: .5rem; padding: .65rem 1.2rem; border-radius: 10px; background: #0f172a; color: #fff; font-size: .88rem; font-weight: 600; text-decoration: none; box-shadow: 0 4px 12px rgba(15,23,42,.18); transition: transform .15s, box-shadow .15s; }
        .vm-btn-dark:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(15,23,42,.22); }
        @media (max-width: 900px) {
          .vm-empty { grid-template-columns: minmax(0, 1fr); }
          .vm-empty-preview { border-left: none; border-top: 1px solid var(--border); }
        }
        @media (max-width: 520px) { .vm-empty > div:first-child { padding: 1.75rem 1.25rem !important; } }
        @keyframes vm-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .vm-spinner {
          animation: vm-spin 1s linear infinite;
        }
        .visual-mapping-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 1.25rem;
        }
        .vm-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .vm-card:hover { transform: translateY(-3px); border-color: #cbd5e1 !important; box-shadow: 0 16px 34px rgba(15,23,42,.10) !important; }
        .vm-thumb { cursor: zoom-in; }
        .vm-thumb img { transition: transform .3s ease; }
        .vm-thumb:hover img { transform: scale(1.03); }
        .vm-thumb-view { position: absolute; right: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: rgba(15,23,42,.82); color: #fff; font-size: .72rem; font-weight: 600; opacity: 0; transform: translateY(3px); transition: opacity .18s, transform .18s; }
        .vm-thumb:hover .vm-thumb-view { opacity: 1; transform: none; }
        .vm-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all .15s; flex-shrink: 0; }
        .vm-icon-btn:hover:not(:disabled) { border-color: #cbd5e1; color: var(--text-primary); }
        .vm-icon-btn.danger:hover:not(:disabled) { color: var(--error); border-color: rgba(239,68,68,.35); background: rgba(239,68,68,.06); }
        .vm-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
        @media (max-width: 1100px) {
          .visual-mapping-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1.25rem;
          }
        }
        @media (max-width: 680px) {
          .visual-mapping-container {
            padding: 1.25rem 1rem !important;
          }
          .visual-mapping-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          .vm-refresh-text {
            display: none !important;
          }
          .vm-refresh-btn {
            padding: 0.55rem !important;
            width: 38px !important;
            height: 38px !important;
            justify-content: center !important;
          }
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          marginBottom: "2.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1.25rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "1.6rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Pictures your assistant can show
          </h1>
          <p
            style={{
              margin: "0.45rem 0 0 0",
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
              lineHeight: 1.5,
              maxWidth: 720,
            }}
          >
            Taken from your presentations. Shown in the chat when a customer asks about the topic.
          </p>
        </div>

        {/* Single Refresh button */}
        <button
          type="button"
          className="vm-refresh-btn"
          onClick={() => {
            setLoading(true);
            fetchMappings();
          }}
          disabled={loading}
          aria-label="Refresh"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0.55rem 1.1rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text-primary)",
            fontSize: "0.85rem",
            fontWeight: 500,
            boxShadow: "0 1px 2px rgba(15,23,42,.05)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "border-color 0.15s, background-color 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.backgroundColor = "var(--bg-card)";
            }
          }}
        >
          <svg
            style={{
              width: 15,
              height: 15,
              flexShrink: 0,
            }}
            className={loading ? "vm-spinner" : ""}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span className="vm-refresh-text">
            {loading ? "Refreshing..." : "Refresh"}
          </span>
        </button>
      </header>

      {/* Content */}
      {loading ? (
        <div style={{ padding: "5rem 2rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading pictures...
        </div>
      ) : keys.length === 0 ? (
        /* Empty State */
        <div className="vm-empty">
          <div style={{ padding: "2.5rem 2.5rem 2.25rem", display: "flex", flexDirection: "column" }}>
            <span
              aria-hidden
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(145deg,#1e293b,#0f172a)",
                color: "#fff",
                boxShadow: "0 8px 20px rgba(15,23,42,.18)",
                marginBottom: "1.25rem",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </span>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.4rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              No pictures yet
            </h3>
            <p style={{ margin: "0 0 1.5rem", color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.6, maxWidth: 440 }}>
              Your assistant can show slides from your presentations right in the chat, when a customer asks about that topic.
            </p>

            <ol style={{ listStyle: "none", margin: "0 0 1.75rem", padding: 0, display: "grid", gap: "0.85rem" }}>
              {[
                ["Upload a presentation", "Add a PDF on the Knowledge page."],
                ["We pick out the pictures", "Each slide is matched to its topic automatically."],
                ["Customers see them in the chat", "Shown when someone asks about that topic."],
              ].map(([title, desc], i) => (
                <li key={title} style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      background: "var(--bg-card)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
                    <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>{desc}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div>
              <Link href="/workspace/knowledge" className="vm-btn-dark">
                Upload a presentation
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Preview: what a customer sees */}
          <div className="vm-empty-preview" aria-hidden>
            <div style={{ width: "100%", maxWidth: 360 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
                What customers see
              </div>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  boxShadow: "0 18px 40px rgba(15,23,42,.10)",
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ justifySelf: "end", background: "#0f172a", color: "#fff", fontSize: "0.8rem", padding: "8px 12px", borderRadius: "14px 14px 4px 14px" }}>
                  How does your pricing work?
                </div>
                <div style={{ justifySelf: "start", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "0.8rem", padding: "8px 12px", borderRadius: "14px 14px 14px 4px", maxWidth: "85%" }}>
                  Here are our plans 👇
                </div>
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg,#e2e8f0,#f8fafc)", padding: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, alignContent: "center" }}>
                    {[0.55, 0.8, 0.65].map((h, i) => (
                      <div key={i} style={{ background: "#fff", borderRadius: 8, padding: 8, boxShadow: "0 2px 6px rgba(15,23,42,.06)" }}>
                        <div style={{ height: 6, width: "60%", borderRadius: 4, background: "#cbd5e1" }} />
                        <div style={{ height: 14, width: "45%", borderRadius: 4, background: "#0f172a", marginTop: 8, opacity: h }} />
                        <div style={{ height: 4, width: "80%", borderRadius: 4, background: "#e2e8f0", marginTop: 8 }} />
                        <div style={{ height: 4, width: "70%", borderRadius: 4, background: "#e2e8f0", marginTop: 4 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "8px 10px", fontSize: "0.72rem", color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
                    Slide 4 · Pricing
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Grouped cards */
        <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
          {groups.map(({ source, keys: groupKeys }) => {
            const count = groupKeys.length;
            const countText = `${count} ${count === 1 ? "picture" : "pictures"}`;
            const sourceDisplay = source.startsWith("From ") ? source : `From ${source}`;

            return (
              <section key={source}>
                {/* Group Heading */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.05rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{sourceDisplay}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.88rem", fontWeight: 400 }}>
                      · {countText}
                    </span>
                  </h2>
                </div>

                {/* Clean responsive grid within group */}
                <div className="visual-mapping-grid">
                  {groupKeys.map((keyword) => {
                    const data = mappings[keyword];
                    const isEditing = editingKey === keyword;

                    return (
                      <div
                        key={keyword}
                        className="vm-card"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          borderRadius: 18,
                          padding: 8,
                          boxShadow: "0 1px 2px rgba(15,23,42,.04)",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* Image preview at top */}
                        <div
                          className="vm-thumb"
                          role="button"
                          tabIndex={0}
                          aria-label={`View ${formatTopicLabel(keyword)}`}
                          onClick={() => setViewKey(keyword)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setViewKey(keyword);
                            }
                          }}
                          style={{
                            position: "relative",
                            width: "100%",
                            aspectRatio: "4/3",
                            borderRadius: 12,
                            background: "linear-gradient(180deg,#f8fafc,#eef2f6)",
                            overflow: "hidden",
                            padding: 12,
                            boxSizing: "border-box",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveImageUrl(data.path)}
                            alt={formatTopicLabel(keyword)}
                            loading="lazy"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: "block",
                              borderRadius: 4,
                              filter: "drop-shadow(0 6px 14px rgba(15,23,42,.14))",
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGI1NTYzIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiLz48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSIvPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiLz48L3N2Zz4=";
                            }}
                          />
                          <span className="vm-thumb-view" aria-hidden>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                            View
                          </span>
                        </div>

                        {/* Card body */}
                        <div
                          style={{
                            padding: "0.9rem 0.6rem 0.4rem",
                            display: "flex",
                            flexDirection: "column",
                            flex: 1,
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: "0 0 0.35rem 0",
                                fontSize: "0.66rem",
                                color: "var(--text-muted)",
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              Shown when asked about
                            </p>

                            {isEditing ? (
                              <div>
                                <label
                                  htmlFor={`topic-${keyword}`}
                                  style={{
                                    display: "block",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    color: "var(--text-secondary)",
                                    marginBottom: "0.35rem",
                                  }}
                                >
                                  Topic
                                </label>
                                <input
                                  id={`topic-${keyword}`}
                                  type="text"
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => {
                                    setEditValue(e.target.value);
                                    if (editError) setEditError("");
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void finishEdit(keyword);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelEdit();
                                    }
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "0.45rem 0.65rem",
                                    borderRadius: 6,
                                    border: editError
                                      ? "1px solid var(--error)"
                                      : "1px solid var(--text-primary)",
                                    background: "var(--bg-surface)",
                                    color: "var(--text-primary)",
                                    fontSize: "0.88rem",
                                    outline: "none",
                                    boxSizing: "border-box",
                                  }}
                                />
                                {editError && (
                                  <div
                                    style={{
                                      color: "var(--error)",
                                      fontSize: "0.75rem",
                                      marginTop: "0.25rem",
                                    }}
                                  >
                                    {editError}
                                  </div>
                                )}
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    marginTop: "0.6rem",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => void finishEdit(keyword)}
                                    style={{
                                      padding: "0.4rem 0.85rem",
                                      borderRadius: 6,
                                      border: "none",
                                      background: "#0f172a",
                                      color: "#ffffff",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      minHeight: "32px",
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    style={{
                                      padding: "0.4rem 0.85rem",
                                      borderRadius: 6,
                                      border: "1px solid var(--border)",
                                      background: "transparent",
                                      color: "var(--text-secondary)",
                                      fontSize: "0.8rem",
                                      fontWeight: 500,
                                      cursor: "pointer",
                                      minHeight: "32px",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "0.75rem",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.98rem",
                                    fontWeight: 650,
                                    color: "var(--text-primary)",
                                    lineHeight: 1.3,
                                    overflowWrap: "anywhere",
                                  }}
                                >
                                  {formatTopicLabel(keyword)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startEdit(keyword)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "0.35rem 0.75rem",
                                    borderRadius: 6,
                                    border: "1px solid var(--border)",
                                    background: "var(--bg-surface)",
                                    color: "var(--text-secondary)",
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    flexShrink: 0,
                                    minHeight: "32px",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor =
                                      "#cbd5e1";
                                    e.currentTarget.style.color =
                                      "var(--text-primary)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor =
                                      "var(--border)";
                                    e.currentTarget.style.color =
                                      "var(--text-secondary)";
                                  }}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2.2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                  </svg>
                                  Edit
                                </button>
                              </div>
                            )}

                            <p
                              title={data.description || undefined}
                              style={{
                                margin: "0.5rem 0 0 0",
                                fontSize: "0.8rem",
                                color: "var(--text-muted)",
                                lineHeight: 1.5,
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {data.description || "Auto-generated visual asset"}
                            </p>
                          </div>

                          {/* Bottom Remove action */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              marginTop: "0.6rem",
                              paddingTop: 0,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleDelete(keyword)}
                              disabled={isEditing}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                background: "transparent",
                                border: "none",
                                color: "var(--text-muted)",
                                fontSize: "0.82rem",
                                fontWeight: 500,
                                cursor: isEditing ? "not-allowed" : "pointer",
                                opacity: isEditing ? 0.35 : 1,
                                padding: "0.45rem 0.65rem",
                                borderRadius: 6,
                                minHeight: "34px",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!isEditing) {
                                  e.currentTarget.style.color = "var(--error)";
                                  e.currentTarget.style.backgroundColor =
                                    "rgba(239, 68, 68, 0.08)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isEditing) {
                                  e.currentTarget.style.color = "var(--text-muted)";
                                  e.currentTarget.style.backgroundColor =
                                    "transparent";
                                }
                              }}
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      {/* Large view of one picture */}
      {viewKey && mappings[viewKey] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={formatTopicLabel(viewKey)}
          onClick={() => setViewKey(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(15,23,42,.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-card)",
              borderRadius: 18,
              overflow: "hidden",
              maxWidth: "min(1100px, 100%)",
              maxHeight: "calc(100vh - 48px)",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0.9rem 1.1rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.66rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Shown when asked about</div>
                <div style={{ fontSize: "1rem", fontWeight: 650, color: "var(--text-primary)" }}>{formatTopicLabel(viewKey)}</div>
              </div>
              <button type="button" className="vm-icon-btn" aria-label="Close" onClick={() => setViewKey(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div style={{ background: "#f1f5f9", padding: 16, overflow: "auto", display: "flex", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(mappings[viewKey].path)}
                alt={formatTopicLabel(viewKey)}
                style={{ maxWidth: "100%", maxHeight: "calc(100vh - 220px)", objectFit: "contain", borderRadius: 6, boxShadow: "0 8px 24px rgba(15,23,42,.18)", background: "#fff" }}
              />
            </div>
            {mappings[viewKey].description && (
              <p style={{ margin: 0, padding: "0.85rem 1.1rem 1rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.55, maxWidth: 900 }}>
                {mappings[viewKey].description}
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteKeyword !== null}
        tone="danger"
        eyebrow="Delete visual mapping"
        title="Delete this mapping?"
        description="This removes the picture and its topic mapping."
        confirmLabel="Delete mapping"
        busy={deletingKeyword !== ""}
        onCancel={() => setDeleteKeyword(null)}
        onConfirm={() => void confirmDelete()}
      >
        {deleteKeyword && (
          <div style={dialogSummaryStyle}>
            <div>
              <span style={dialogLabelStyle}>Topic</span>
              <strong style={dialogValueStyle}>
                {formatTopicLabel(deleteKeyword)}
              </strong>
            </div>
            <div>
              <span style={dialogLabelStyle}>Source</span>
              <span style={dialogMutedValueStyle}>
                {mappings[deleteKeyword]?.source || "Knowledge upload"}
              </span>
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 50,
            background:
              toast.includes("failed") || toast.includes("Failed")
                ? "var(--error)"
                : "var(--success)",
            color: "#ffffff",
            borderRadius: 8,
            padding: "0.7rem 1.5rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

const dialogSummaryStyle: React.CSSProperties = {
  padding: "0.9rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.85rem",
};

const dialogLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.35rem",
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const dialogValueStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  fontWeight: 600,
  overflowWrap: "anywhere",
};

const dialogMutedValueStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  overflowWrap: "anywhere",
};
