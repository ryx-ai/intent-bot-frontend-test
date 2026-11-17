"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
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

    // Strip internal fields before sending to the backend.
    const payload: MetricConfig[] = metrics.map(
      ({ _uid, _originalId, ...rest }) => {
        void _uid;
        void _originalId;
        return rest;
      },
    );

    setSaving(true);
    try {
      await api.post("/api/metrics/config", payload);
      // After a successful save, the saved ids become the new "originals".
      setMetrics((prev) => prev.map((m) => ({ ...m, _originalId: m.id })));
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
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.1rem 1.25rem",
          transition: "border-color 0.15s ease",
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
              {metric.description.trim() ||
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: "0.78rem",
                fontWeight: 600,
                padding: "0.25rem 0.65rem",
                borderRadius: 6,
                background: metric.display_on_dashboard
                  ? "rgba(79, 70, 229, 0.08)"
                  : "var(--bg-hover)",
                color: metric.display_on_dashboard
                  ? "var(--accent)"
                  : "var(--text-muted)",
                border: `1px solid ${
                  metric.display_on_dashboard
                    ? "rgba(79, 70, 229, 0.2)"
                    : "var(--border)"
                }`,
                whiteSpace: "nowrap",
              }}
            >
              {metric.display_on_dashboard ? "In Analytics" : "Hidden"}
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
                borderRadius: 6,
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
                  (e.currentTarget.style.borderColor = "var(--accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--border)")
                }
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
              <label
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                What should the assistant look for?
              </label>
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
                  (e.currentTarget.style.borderColor = "var(--accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--border)")
                }
              />
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
                    accentColor: "var(--accent)",
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
              <div style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.4rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Internal ID (advanced)
                </label>
                <input
                  type="text"
                  value={metric.id}
                  readOnly={isBuiltIn}
                  onChange={(e) =>
                    updateMetricField(metric._uid, "id", e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.8rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: isBuiltIn
                      ? "var(--bg-hover)"
                      : "var(--bg-surface)",
                    color: isBuiltIn
                      ? "var(--text-muted)"
                      : "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    cursor: isBuiltIn ? "not-allowed" : "text",
                    opacity: isBuiltIn ? 0.75 : 1,
                  }}
                  onFocus={(e) => {
                    if (!isBuiltIn) {
                      e.currentTarget.style.borderColor = "var(--accent)";
                    }
                  }}
                  onBlur={(e) => {
                    if (!isBuiltIn) {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }
                  }}
                />
              </div>

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
        maxWidth: 1200,
        margin: "0 auto",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      <style>{`
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
          marginBottom: "2.5rem",
          gap: "1.5rem",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 0.4rem 0",
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            What your assistant tracks
          </h1>
          <p
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: "0.88rem",
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
            background: "rgba(79, 70, 229, 0.08)",
            color: "var(--accent)",
            border: "1px solid rgba(79, 70, 229, 0.2)",
            borderRadius: 8,
            padding: "0.65rem 1.15rem",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(79, 70, 229, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(79, 70, 229, 0.08)";
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

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {builtInMetrics.map(renderMetricRow)}
        </div>
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
              borderRadius: 12,
              color: "var(--text-muted)",
              fontSize: "0.88rem",
            }}
          >
            No custom metrics added yet. Click &ldquo;+ Add something to
            track&rdquo; to create one.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {userMetrics.map(renderMetricRow)}
          </div>
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
          paddingTop: "1.5rem",
          marginTop: "2.5rem",
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
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                color: "var(--accent)",
                fontSize: "0.88rem",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "var(--accent)",
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
            background: "var(--accent)",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "0.7rem 1.5rem",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: saving || !dirty ? "not-allowed" : "pointer",
            opacity: saving || !dirty ? 0.55 : 1,
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
            background: toast.isError ? "var(--error)" : "var(--success)",
            color: "#ffffff",
            borderRadius: 8,
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
