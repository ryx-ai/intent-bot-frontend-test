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
      const src = mappings[key]?.source || "Knowledge Lake Upload";
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
        @keyframes vm-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .vm-spinner {
          animation: vm-spin 1s linear infinite;
        }
        .visual-mapping-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.5rem;
        }
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
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "border-color 0.15s, background-color 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
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
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "4rem 2rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              backgroundColor: "var(--accent-dim)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1.25rem",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <h3
            style={{
              margin: "0 0 0.5rem 0",
              fontSize: "1.2rem",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            No pictures yet
          </h3>
          <p
            style={{
              margin: "0 0 1.5rem 0",
              color: "var(--text-secondary)",
              fontSize: "0.92rem",
              lineHeight: 1.55,
              maxWidth: 460,
            }}
          >
            Upload a presentation (PDF) in Knowledge Lake. We&apos;ll pick out its pictures so your assistant can show them when customers ask.
          </p>
          <Link
            href="/workspace/knowledge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.65rem 1.35rem",
              borderRadius: 8,
              backgroundColor: "var(--accent)",
              color: "#ffffff",
              fontSize: "0.88rem",
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Go to Knowledge Lake
          </Link>
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
                        style={{
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          overflow: "hidden",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* Image preview at top */}
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "16/9",
                            backgroundColor: "var(--bg-surface)",
                            borderBottom: "1px solid var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveImageUrl(data.path)}
                            alt={formatTopicLabel(keyword)}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGI1NTYzIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiLz48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSIvPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiLz48L3N2Zz4=";
                            }}
                          />
                        </div>

                        {/* Card body */}
                        <div
                          style={{
                            padding: "1.25rem 1.25rem 1rem 1.25rem",
                            display: "flex",
                            flexDirection: "column",
                            flex: 1,
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: "0 0 0.4rem 0",
                                fontSize: "0.78rem",
                                color: "var(--text-muted)",
                                fontWeight: 500,
                                letterSpacing: "0.01em",
                              }}
                            >
                              Shows when customers ask about
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
                                      : "1px solid var(--accent)",
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
                                      background: "var(--accent)",
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
                                    fontSize: "1.05rem",
                                    fontWeight: 600,
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
                                      "var(--accent)";
                                    e.currentTarget.style.color =
                                      "var(--accent)";
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
                              style={{
                                margin: "0.75rem 0 0 0",
                                fontSize: "0.85rem",
                                color: "var(--text-secondary)",
                                lineHeight: 1.55,
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
                              marginTop: "1.25rem",
                              paddingTop: "0.25rem",
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
                                color: "var(--error)",
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                cursor: isEditing ? "not-allowed" : "pointer",
                                opacity: isEditing ? 0.35 : 0.9,
                                padding: "0.45rem 0.65rem",
                                borderRadius: 6,
                                minHeight: "34px",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!isEditing) {
                                  e.currentTarget.style.opacity = "1";
                                  e.currentTarget.style.backgroundColor =
                                    "rgba(239, 68, 68, 0.08)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isEditing) {
                                  e.currentTarget.style.opacity = "0.9";
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
                {mappings[deleteKeyword]?.source || "Knowledge Lake Upload"}
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
  color: "var(--accent)",
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
