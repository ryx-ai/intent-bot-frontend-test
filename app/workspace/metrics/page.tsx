"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { unsavedChangesStore } from "@/lib/unsaved-changes";
import { ConfirmDialog } from "../_components/ConfirmDialog";

interface MetricConfig {
  id: string;
  name: string;
  description: string;
  display_on_dashboard: boolean;
  is_deletable?: boolean;
}

// Internal row carries a stable React key (`_uid`) and the id it was loaded
// with (`_originalId`). Neither is sent to the backend.
interface MetricRow extends MetricConfig {
  _uid: string;
  _originalId: string | null; // null = newly added in this session
}

function newUid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `uid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type MetricKind = "score" | "choice" | "text";

function metricKind(desc: string): MetricKind {
  const d = desc.toLowerCase().trim();
  if (/\b(integer|number|score)\b|\b1\s*-\s*100\b/.test(d)) return "score";
  // A short list of options, e.g. "sales, support, info, booking"
  const items = d.replace(/\.$/, "").split(",").map((x) => x.trim());
  if (items.length >= 2 && items.every((x) => x && x.split(/\s+/).length <= 3 && /^[a-z0-9_ -]+$/.test(x))) return "choice";
  if (/\bone of\b/.test(d)) return "choice";
  return "text";
}

const KIND_LABEL: Record<MetricKind, string> = { score: "Score 1-100", choice: "Choice", text: "Text" };

// First sentence of the instruction, with codes made readable.
function previewText(desc: string): string {
  const t = desc.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const first = t.split(/(?<=[.!?])\s/)[0] || t;
  return first.length > 140 ? first.slice(0, 137) + "…" : first;
}

function KindIcon({ kind }: { kind: MetricKind }) {
  return (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {kind === "score" ? (
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        ) : kind === "choice" ? (
          <>
            <circle cx="6" cy="7" r="2" />
            <circle cx="6" cy="17" r="2" />
            <path d="M11 7h9M11 17h9" />
          </>
        ) : (
          <path d="M4 6h16M4 12h16M4 18h10" />
        )}
      </svg>
    </span>
  );
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [metricToDelete, setMetricToDelete] = useState<MetricRow | null>(null);
  const [pendingRenames, setPendingRenames] = useState<MetricRow[]>([]);
  // AI wording suggestions per item, and the wording they were made from
  const [suggestions, setSuggestions] = useState<Record<string, { name: string; description: string }>>({});
  const [improvingUid, setImprovingUid] = useState<string | null>(null);
  const [improveError, setImproveError] = useState<Record<string, string>>({});
  const [improvedFrom, setImprovedFrom] = useState<Record<string, string>>({});

  async function improveWording(m: MetricRow, auto = false) {
    const source = `${m.name.trim()}|${m.description.trim()}`;
    if (auto && (improvedFrom[m._uid] === source || m.description.trim().length < 3)) return;
    setImprovingUid(m._uid);
    setImproveError((prev) => ({ ...prev, [m._uid]: "" }));
    try {
      const res = await api.post<{ name: string; description: string }>("/api/metrics/improve", {
        name: m.name,
        description: m.description,
      });
      setImprovedFrom((prev) => ({ ...prev, [m._uid]: source }));
      const same = res.name.trim() === m.name.trim() && res.description.trim() === m.description.trim();
      setSuggestions((prev) => {
        const next = { ...prev };
        if (same) delete next[m._uid];
        else next[m._uid] = res;
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Couldn't improve this right now.";
      if (!auto) setImproveError((prev) => ({ ...prev, [m._uid]: msg }));
    } finally {
      setImprovingUid(null);
    }
  }

  function applySuggestion(uid: string) {
    const sug = suggestions[uid];
    if (!sug) return;
    updateMetricField(uid, "name", sug.name);
    updateMetricField(uid, "description", sug.description);
    setImprovedFrom((prev) => ({ ...prev, [uid]: `${sug.name.trim()}|${sug.description.trim()}` }));
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }

  function keepMine(uid: string) {
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<MetricConfig[]>("/api/metrics/config");
        setMetrics(
          data.map((m) => ({ ...m, _uid: newUid(), _originalId: m.id })),
        );
      } catch (err) {
        console.error("Failed to load metrics config", err);
        showToast("Failed to load metrics configuration.", true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateMetricField(
    uid: string,
    field: keyof MetricConfig,
    value: string | boolean,
  ) {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m._uid !== uid) return m;
        let nextVal = value;
        if (field === "id" && typeof nextVal === "string") {
          nextVal = nextVal.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        }
        return { ...m, [field]: nextVal };
      }),
    );
    setDirty(true);
    setSavedSuccess(false);
  }

  // Warn on navigate away with unsaved changes
  useEffect(() => {
    unsavedChangesStore.setDirty(
      dirty,
      "You have unsaved changes to your business metrics. Navigating away will discard these changes. Are you sure you want to leave?"
    );
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unsavedChangesStore.setDirty(false);
    };
  }, [dirty]);

  function addMetric() {
    const uid = newUid();
    const newRow: MetricRow = {
      id: `metric_${uid.slice(0, 8)}`,
      name: "",
      description: "",
      display_on_dashboard: true,
      is_deletable: true,
      _uid: uid,
      _originalId: null,
    };
    setMetrics((prev) => [...prev, newRow]);
    setExpandedUid(uid);
    setDirty(true);
    setSavedSuccess(false);
  }

  function removeMetric(uid: string) {
    const metric = metrics.find((m) => m._uid === uid);
    if (!metric) return;
    setMetricToDelete(metric);
  }

  function confirmRemoveMetric() {
    if (!metricToDelete) return;
    setMetrics((prev) => prev.filter((m) => m._uid !== metricToDelete._uid));
    if (expandedUid === metricToDelete._uid) {
      setExpandedUid(null);
    }
    setDirty(true);
    setSavedSuccess(false);
    setMetricToDelete(null);
  }

  async function saveConfiguration(skipRenameWarning = false) {
    // Detect renames of existing metrics. Renaming an id is a delete+create
    // on the backend (the id is the primary key) — orphaning any analytics
    // history bound to the old id. Warn before letting the user proceed.
    const renamed = metrics.filter(
      (m) => m._originalId !== null && m._originalId !== m.id,
    );
    if (renamed.length > 0 && !skipRenameWarning) {
      setPendingRenames(renamed);
      return;
    }

    // A brand-new item left completely empty is simply not saved.
    const isBlankNew = (m: MetricRow) =>
      m._originalId === null && !m.name.trim() && !m.description.trim();
    const toSave = metrics.filter((m) => !isBlankNew(m));

    // Every saved item needs a name (it is the column title in Analytics).
    const unnamed = toSave.find((m) => !m.name.trim());
    if (unnamed) {
      setExpandedUid(unnamed._uid);
      showToast("Give this item a name before saving.", true);
      return;
    }

    // Strip internal fields before sending to the backend.
    const payload: MetricConfig[] = toSave.map(
      ({ _uid, _originalId, ...rest }) => {
        void _uid;
        void _originalId;
        return { ...rest, name: rest.name.trim() };
      },
    );

    setSaving(true);
    try {
      await api.post("/api/metrics/config", payload);
      // After a successful save, the saved ids become the new "originals".
      setMetrics((prev) =>
        prev.filter((m) => !isBlankNew(m)).map((m) => ({ ...m, _originalId: m.id })),
      );
      setDirty(false);
      setSavedSuccess(true);
    } catch (err) {
      console.error("Failed to save changes", err);
      showToast("Failed to save changes. Please try again.", true);
    } finally {
      setSaving(false);
    }
  }

  function handleKeepOldId() {
    setMetrics((prev) =>
      prev.map((m) =>
        m._originalId !== null && m._originalId !== m.id
          ? { ...m, id: m._originalId }
          : m,
      ),
    );
    setPendingRenames([]);
  }

  function handleChangeAndSave() {
    setPendingRenames([]);
    saveConfiguration(true);
  }

  if (loading) {
    return (
      <div
        style={{
          padding: "5rem",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        Loading...
      </div>
    );
  }

  const builtInMetrics = metrics.filter((m) => m.is_deletable === false);
  const userMetrics = metrics.filter((m) => m.is_deletable !== false);

  function renderMetricRow(metric: MetricRow) {
    const isExpanded = expandedUid === metric._uid;
    const isBuiltIn = metric.is_deletable === false;

    return (
      <div
        key={metric._uid}
        className={`mt-card${isExpanded ? " mt-open" : ""}`}
        style={{
          backgroundColor: "var(--bg-card)",
          border: `1px solid ${isExpanded ? "#cbd5e1" : "var(--border)"}`,
          borderRadius: 16,
          padding: "1rem 1.1rem",
          boxShadow: isExpanded ? "0 10px 28px rgba(15,23,42,.08)" : "0 1px 2px rgba(15,23,42,.04)",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        {/* Row header: Name, truncated instruction preview, status pill, and Edit/Close button */}
        <div
          className="metrics-row-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <KindIcon kind={metricKind(metric.description)} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {metric.name.trim() || (isExpanded ? "New item" : "Untitled metric")}
            </div>
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginTop: "0.2rem",
              }}
            >
              {(metric.description.trim() && previewText(metric.description)) ||
                (isExpanded
                  ? "e.g. Note what the assistant should look for..."
                  : "No instructions set")}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              flexShrink: 0,
            }}
          >
            <span
              className="mt-kind"
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "1px 7px",
                whiteSpace: "nowrap",
              }}
            >
              {KIND_LABEL[metricKind(metric.description)]}
            </span>
            <span
              title={metric.display_on_dashboard ? "Shown as a column in Chatbot Analytics" : "Not shown in Chatbot Analytics"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.74rem",
                fontWeight: 600,
                padding: "0.22rem 0.6rem",
                borderRadius: 999,
                background: "var(--bg-card)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: metric.display_on_dashboard ? "#10b981" : "#cbd5e1" }} />
              {metric.display_on_dashboard ? "Shown" : "Hidden"}
            </span>

            <button
              type="button"
              onClick={() =>
                setExpandedUid(isExpanded ? null : metric._uid)
              }
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: "0.4rem 0.85rem",
                fontSize: "0.82rem",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--bg-surface)")
              }
            >
              {isExpanded ? "Close" : "Edit"}
            </button>
          </div>
        </div>

        {/* Expanded Editor */}
        {isExpanded && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              paddingTop: "1.25rem",
              marginTop: "1.1rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            {/* Name */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={metric.name}
                onChange={(e) =>
                  updateMetricField(metric._uid, "name", e.target.value)
                }
                placeholder="e.g. Preferred visit day"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.88rem",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "#94a3b8")
                }
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  void improveWording(metric, true);
                }}
              />
              <p
                style={{
                  margin: "0.35rem 0 0 0",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                }}
              >
                Shown as a column title in Chatbot Analytics.
              </p>
            </div>

            {/* What should the assistant look for? */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "0.4rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  What should the assistant look for?
                </label>
                <button
                  type="button"
                  onClick={() => void improveWording(metric)}
                  disabled={improvingUid === metric._uid || (metric.name.trim() + metric.description.trim()).length < 3}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0.32rem 0.7rem",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    fontFamily: "inherit",
                    cursor: improvingUid === metric._uid ? "default" : "pointer",
                    opacity: (metric.name.trim() + metric.description.trim()).length < 3 ? 0.5 : 1,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
                  </svg>
                  {improvingUid === metric._uid ? "Improving…" : "Improve with AI"}
                </button>
              </div>
              <textarea
                rows={3}
                value={metric.description}
                onChange={(e) =>
                  updateMetricField(
                    metric._uid,
                    "description",
                    e.target.value,
                  )
                }
                placeholder="e.g. Note which day the visitor wants to come in. Leave empty if they don't say."
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.88rem",
                  lineHeight: 1.5,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  resize: "vertical",
                  minHeight: 80,
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "#94a3b8")
                }
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  void improveWording(metric, true);
                }}
              />
              {suggestions[metric._uid] && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.9rem 1rem",
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: "var(--bg-surface)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
                    </svg>
                    Clearer version
                  </div>
                  <div style={{ marginTop: 6, fontSize: "0.92rem", fontWeight: 650, color: "var(--text-primary)" }}>{suggestions[metric._uid].name}</div>
                  <div style={{ marginTop: 2, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{suggestions[metric._uid].description}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => applySuggestion(metric._uid)}
                      style={{ padding: "0.45rem 0.9rem", borderRadius: 9, border: "none", background: "#0f172a", color: "#fff", fontSize: "0.8rem", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={() => keepMine(metric._uid)}
                      style={{ padding: "0.45rem 0.9rem", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      Keep mine
                    </button>
                  </div>
                </div>
              )}
              {improveError[metric._uid] && (
                <p style={{ margin: "0.5rem 0 0", color: "var(--error)", fontSize: "0.8rem" }}>{improveError[metric._uid]}</p>
              )}
              <p
                style={{
                  margin: "0.35rem 0 0 0",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  lineHeight: 1.4,
                }}
              >
                Write it the way you would tell a new staff member. Example:
                &ldquo;Note the budget they mention. Over 15k a month is a strong lead.&rdquo;
              </p>
            </div>

            {/* Checkbox */}
            <div>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  fontSize: "0.88rem",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={metric.display_on_dashboard}
                  onChange={(e) =>
                    updateMetricField(
                      metric._uid,
                      "display_on_dashboard",
                      e.target.checked,
                    )
                  }
                  style={{
                    width: 17,
                    height: 17,
                    accentColor: "#0f172a",
                    cursor: "pointer",
                  }}
                />
                Show as a column in Chatbot Analytics.
              </label>
            </div>

            {/* Internal ID + Remove button */}
            <div
              className="metrics-editor-bottom"
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1 }} />

              {!isBuiltIn && (
                <button
                  type="button"
                  onClick={() => removeMetric(metric._uid)}
                  className="metrics-remove-btn"
                  style={{
                    padding: "0.55rem 1.1rem",
                    borderRadius: 6,
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    background: "transparent",
                    color: "var(--error)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(239, 68, 68, 0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="metrics-page-wrap"
      style={{
        width: "100%",
        maxWidth: 1320,
        margin: "0 auto",
        padding: "2rem 1.75rem",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .mt-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; align-items: start; }
        .mt-grid > .mt-open { grid-column: 1 / -1; }
        .mt-card:hover { border-color: #cbd5e1 !important; }
        @media (max-width: 1100px) { .mt-grid { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 640px) { .mt-kind { display: none; } }
        @media (max-width: 640px) {
          .metrics-page-wrap {
            padding: 1rem !important;
            padding-bottom: 6rem !important;
          }
          .metrics-header {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1rem !important;
          }
          .metrics-header-btn {
            width: 100% !important;
            text-align: center !important;
            justify-content: center !important;
          }
          .metrics-editor-bottom {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1rem !important;
          }
          .metrics-editor-bottom .metrics-remove-btn {
            align-self: flex-start !important;
          }
          .metrics-save-bar {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            background: var(--bg-surface) !important;
            border-top: 1px solid var(--border) !important;
            padding: 0.85rem 1rem !important;
            margin: 0 !important;
            box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.08) !important;
            z-index: 40 !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.6rem !important;
          }
          .metrics-save-btn {
            width: 100% !important;
            padding: 0.85rem 1rem !important;
          }
        }
      `}</style>

      {/* Header */}
      <div
        className="metrics-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
          gap: "1.5rem",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 0.35rem 0",
              fontSize: "1.75rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            What your assistant tracks
          </h1>
          <p
            style={{
              margin: 0,
              color: "var(--text-secondary)",
              fontSize: "0.95rem",
              lineHeight: 1.5,
            }}
          >
            After each chat, your assistant fills in these details. You see them
            in Chatbot Analytics.
          </p>
        </div>
        <button
          type="button"
          onClick={addMetric}
          className="metrics-header-btn"
          style={{
            background: "#0f172a",
            color: "#fff",
            border: "1px solid #0f172a",
            borderRadius: 10,
            padding: "0.65rem 1.15rem",
            boxShadow: "0 4px 12px rgba(15,23,42,.18)",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "none";
          }}
        >
          + Add something to track
        </button>
      </div>

      {/* Built in section */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ marginBottom: "0.85rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.6rem",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Built in
            </h2>
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              Always on. You can edit the name and the instruction.
            </span>
          </div>
        </div>

        <div className="mt-grid">{builtInMetrics.map(renderMetricRow)}</div>
      </section>

      {/* Added by you section */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ marginBottom: "0.85rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.6rem",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Added by you
            </h2>
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              {userMetrics.length}{" "}
              {userMetrics.length === 1 ? "item" : "items"}
            </span>
          </div>
        </div>

        {userMetrics.length === 0 ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              background: "var(--bg-card)",
              border: "1px dashed var(--border)",
              borderRadius: 16,
              color: "var(--text-muted)",
              fontSize: "0.88rem",
            }}
          >
            Nothing added yet. Click &ldquo;+ Add something to
            track&rdquo; to create one.
          </div>
        ) : (
          <div className="mt-grid">{userMetrics.map(renderMetricRow)}</div>
        )}
      </section>

      {/* Save bar */}
      <div
        className="metrics-save-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid var(--border)",
          paddingTop: "1.25rem",
          marginTop: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          {savedSuccess ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.9rem",
                borderRadius: 8,
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "var(--success)",
                fontSize: "0.88rem",
                fontWeight: 500,
              }}
            >
              <span style={{ fontWeight: 700 }}>✓</span> Saved. Your assistant
              will use this from the next chat.
            </div>
          ) : dirty ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.5rem 0.9rem",
                borderRadius: 8,
                background: "rgba(245, 158, 11, 0.07)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "#b45309",
                fontSize: "0.88rem",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#f59e0b",
                  display: "inline-block",
                }}
              />
              You have unsaved changes
            </div>
          ) : (
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              Changes are used from the next chat onwards.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => saveConfiguration()}
          disabled={saving || !dirty}
          className="metrics-save-btn"
          style={{
            background: saving || !dirty ? "var(--bg-hover)" : "#0f172a",
            color: saving || !dirty ? "var(--text-muted)" : "#ffffff",
            border: "none",
            borderRadius: 10,
            padding: "0.7rem 1.5rem",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: saving || !dirty ? "not-allowed" : "pointer",
            boxShadow: saving || !dirty ? "none" : "0 4px 12px rgba(15,23,42,.18)",
            transition: "opacity 0.2s ease, transform 0.1s ease",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            if (!saving && dirty) e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            if (!saving && dirty) e.currentTarget.style.opacity = "1";
          }}
        >
          {saving ? "Saving..." : "Save changes"}
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
            background: toast.isError ? "var(--error)" : "#0f172a",
            color: "#ffffff",
            borderRadius: 10,
            padding: "0.7rem 1.5rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!metricToDelete}
        eyebrow="Stop tracking"
        title={`Stop tracking "${metricToDelete?.name || "this metric"}"?`}
        description="Your assistant will stop noting this, and the column will be removed from Chatbot Analytics. This can't be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setMetricToDelete(null)}
        onConfirm={confirmRemoveMetric}
      />

      {/* Internal ID change confirmation dialog */}
      <ConfirmDialog
        open={pendingRenames.length > 0}
        eyebrow="Internal ID changed"
        title="Change the internal ID?"
        description={`${pendingRenames.map((m) => `${m._originalId} → ${m.id}`).join(", ")}. Past chats saved under the old ID won't show in this column any more.`}
        confirmLabel="Change and save"
        cancelLabel="Keep old ID"
        tone="neutral"
        onCancel={handleKeepOldId}
        onConfirm={handleChangeAndSave}
      />
    </div>
  );
}
