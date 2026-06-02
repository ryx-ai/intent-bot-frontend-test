"use client";

import { useEffect, useState } from "react";
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

export default function VisualMappingPage() {
  const [mappings, setMappings] = useState<MappingData>({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const [toast, setToast] = useState("");
  const [deleteKeyword, setDeleteKeyword] = useState<string | null>(null);
  const [deletingKeyword, setDeletingKeyword] = useState("");

  async function fetchMappings() {
    try {
      const data = await api.get<MappingData>("/api/visual-mapping");
      setMappings(data);
    } catch (err) {
      console.error("Failed to load visual mappings", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMappings();
  }, []);

  const keys = Object.keys(mappings);

  // ── Rename ──
  function startEdit(key: string) {
    setEditingKey(key);
    setEditValue(key);
    setEditError("");
  }

  async function finishEdit(oldKey: string) {
    if (!editingKey) return; // guard against double-fire (Enter + blur)
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

    // Close the editor *before* awaiting so a follow-up blur or Enter event
    // can't trigger a second rename of the same row.
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
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
            AI Visual Intelligence Map
          </h1>
          <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.88rem" }}>
            This gallery represents the AI&apos;s internal visual decision logic. When a user conversation triggers one of these unique keywords, the engine automatically serves the associated image layout.
            <strong style={{ color: "#d8b4fe" }}> Click any keyword badge to rename it.</strong>
          </p>
          
          {/* Count badge */}
          {keys.length > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "#6b7280", marginTop: "0.5rem", fontWeight: 500 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
              {keys.length} visual mapping{keys.length !== 1 ? "s" : ""} active
            </div>
          )}
        </div>
        
        <button
          onClick={() => {
            setLoading(true);
            fetchMappings();
          }}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0.65rem 1.25rem",
            background: "linear-gradient(135deg, var(--accent-dim) 0%, rgba(107, 76, 255, 0.08) 100%)",
            border: "1px solid rgba(107, 76, 255, 0.35)",
            borderRadius: 10,
            color: "#c4b5fd",
            fontSize: "0.85rem",
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "all 0.25s ease",
            whiteSpace: "nowrap",
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(107, 76, 255, 0.28) 0%, var(--accent-dim) 100%)";
            e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.65)";
            e.currentTarget.style.color = "#e9d5ff";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(107, 76, 255, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, var(--accent-dim) 0%, rgba(107, 76, 255, 0.08) 100%)";
            e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.35)";
            e.currentTarget.style.color = "#c4b5fd";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <svg style={{ width: 15, height: 15 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {loading ? "Refreshing..." : "Refresh Matrix"}
        </button>
      </header>

      {/* Gallery grid */}
      {loading ? (
        <div style={{ padding: "5rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading visual intelligence matrix...
        </div>
      ) : keys.length === 0 ? (
        <div style={{ backgroundColor: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 12, padding: "4rem 2rem", textAlign: "center" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>
            No Visual Mappings Found
          </h3>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Upload a presentation PDF in the Knowledge Lake to generate AI
            visual mappings.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
          {keys.map((keyword) => {
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
                  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                  position: "relative",
                  transition: "all 0.3s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.boxShadow = "0 8px 15px rgba(107, 76, 255, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
                }}
              >
                {/* Delete button — hidden while this row is being renamed so
                    the mid-edit click can't race with the rename PATCH. */}
                {!isEditing && (
                <button
                  onClick={() => handleDelete(keyword)}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    zIndex: 10,
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.7)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "var(--error)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    opacity: 0.8,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "0.8"}
                  title="Delete this mapping"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                )}

                {/* Image */}
                <div style={{ width: "100%", aspectRatio: "16/9", backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImageUrl(data.path)}
                    alt={keyword}
                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s ease" }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGI1NTYzIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiLz48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSIvPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiLz48L3N2Zz4=";
                    }}
                  />
                </div>

                {/* Details */}
                <div style={{ padding: "1.5rem" }}>
                  {/* Keyword badge */}
                  {isEditing ? (
                    <div style={{ marginBottom: "0.75rem", position: "relative" }}>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => finishEdit(keyword)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === "Escape") setEditingKey(null);
                        }}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(107, 76, 255, 0.5)",
                          color: "#d8b4fe",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          fontFamily: "'Inter', sans-serif",
                          borderRadius: 20,
                          padding: "0.3rem 0.8rem",
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box"
                        }}
                      />
                      {editError && (
                        <div style={{ position: "absolute", marginTop: 4, backgroundColor: "var(--bg-surface)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#fca5a5", fontSize: "0.72rem", padding: "4px 10px", borderRadius: 6, whiteSpace: "nowrap", zIndex: 10 }}>
                          {editError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(keyword)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(107, 76, 255, 0.2)",
                        color: "#d8b4fe",
                        padding: "0.4rem 0.85rem",
                        borderRadius: 20,
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        marginBottom: "0.75rem",
                        border: "1px solid var(--accent-glow)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(107, 76, 255, 0.35)";
                        e.currentTarget.style.borderColor = "rgba(107, 76, 255, 0.6)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(107, 76, 255, 0.2)";
                        e.currentTarget.style.borderColor = "var(--accent-glow)";
                      }}
                    >
                      {keyword}
                      <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>✏️</span>
                    </button>
                  )}

                  <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {data.description || "Auto-generated visual asset"}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    📄 {data.source || "Knowledge Lake Upload"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={deleteKeyword !== null}
        tone="danger"
        eyebrow="Delete visual mapping"
        title="Delete this mapping?"
        description="This removes the keyword mapping and its associated image file from the visual intelligence matrix."
        confirmLabel="Delete mapping"
        busy={deletingKeyword !== ""}
        onCancel={() => setDeleteKeyword(null)}
        onConfirm={() => void confirmDelete()}
      >
        {deleteKeyword && (
          <div style={dialogSummaryStyle}>
            <div>
              <span style={dialogLabelStyle}>Keyword</span>
              <strong style={dialogValueStyle}>{deleteKeyword}</strong>
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

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 50,
          background: toast.includes("failed") || toast.includes("Failed") ? "var(--error)" : "var(--success)",
          color: "#fff", borderRadius: 8, padding: "0.7rem 1.5rem",
          fontSize: "0.85rem", fontWeight: 600,
        }}>
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
  color: "var(--accent-light)",
  fontFamily: "monospace",
  fontSize: "0.9rem",
  overflowWrap: "anywhere",
};

const dialogMutedValueStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  overflowWrap: "anywhere",
};
