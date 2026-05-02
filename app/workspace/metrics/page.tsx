"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `uid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<MetricConfig[]>("/api/metrics/config");
        setMetrics(
          data.map((m) => ({ ...m, _uid: newUid(), _originalId: m.id }))
        );
      } catch (err) {
        console.error("Failed to load metrics config", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateField(index: number, field: keyof MetricConfig, value: string | boolean) {
    setMetrics((prev) => {
      const copy = [...prev];
      if (field === "id" && typeof value === "string") {
        value = value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      }
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setDirty(true);
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
    setMetrics((prev) => [
      ...prev,
      {
        id: `new_metric_${uid.slice(0, 8)}`,
        name: "New Metric",
        description: "Criteria for the AI to track this...",
        display_on_dashboard: true,
        is_deletable: true,
        _uid: uid,
        _originalId: null,
      },
    ]);
    setDirty(true);
    showToast("New metric added — click 'Deploy System Overhaul' to save.");
  }

  function removeMetric(uid: string) {
    if (!confirm("Delete this AI tracking metric? Remember to click 'Deploy System Overhaul' to save.")) return;
    setMetrics((prev) => prev.filter((m) => m._uid !== uid));
    setDirty(true);
  }

  async function saveConfiguration() {
    // Detect renames of existing metrics. Renaming an id is a delete+create
    // on the backend (the id is the primary key) — orphaning any analytics
    // history bound to the old id. Warn before letting the user proceed.
    const renamed = metrics.filter(
      (m) => m._originalId !== null && m._originalId !== m.id
    );
    if (renamed.length > 0) {
      const lines = renamed.map((m) => `  • ${m._originalId} → ${m.id}`).join("\n");
      const ok = confirm(
        `You renamed ${renamed.length} metric ID${renamed.length === 1 ? "" : "s"}:\n\n${lines}\n\n` +
          `On save, the old metric${renamed.length === 1 ? "" : "s"} will be DELETED and ` +
          `recreated with the new ID. Past analytics tied to the old ID will be orphaned. Proceed?`
      );
      if (!ok) return;
    }

    // Strip internal fields before sending to the backend.
    const payload: MetricConfig[] = metrics.map(({ _uid, _originalId, ...rest }) => {
      void _uid; void _originalId;
      return rest;
    });

    try {
      await api.post("/api/metrics/config", payload);
      // After a successful save, the saved ids become the new "originals".
      setMetrics((prev) => prev.map((m) => ({ ...m, _originalId: m.id })));
      setDirty(false);
      showToast("Configuration Deployed Successfully!");
    } catch {
      showToast("Failed to deploy changes.");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  if (loading) {
    return (
      <div style={{ padding: "5rem", textAlign: "center", color: "var(--text-muted)" }}>
        Loading configuration…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
            Tracking & Schema Settings
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
            Define custom variables you want the AI brain to calculate, track,
            and inject into the dashboard.
          </p>
        </div>
        <button
          onClick={addMetric}
          style={{
            background: "var(--border)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0.6rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.2s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#2e3150"}
          onMouseLeave={(e) => e.currentTarget.style.background = "var(--border)"}
        >
          + Add New Metric
        </button>
      </div>

      {/* Metric editors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {metrics.map((metric, index) => (
          <div
            key={metric._uid}
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "1.5rem",
            }}
          >
            {/* Row: ID + Name */}
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Internal ID (no spaces)
                </label>
                <input
                  type="text"
                  value={metric.id}
                  readOnly={metric.is_deletable === false}
                  onChange={(e) => updateField(index, "id", e.target.value)}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.85rem",
                    color: "#fff",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    opacity: metric.is_deletable === false ? 0.6 : 1,
                    fontFamily: "inherit"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Dashboard Column Name
                </label>
                <input
                  type="text"
                  value={metric.name}
                  onChange={(e) => updateField(index, "name", e.target.value)}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.85rem",
                    color: "#fff",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: "inherit"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                AI Extraction Rules & Prompts
              </label>
              <input
                type="text"
                value={metric.description}
                onChange={(e) => updateField(index, "description", e.target.value)}
                placeholder="e.g., Output 'Yes' if user asks for pricing"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "0.6rem 0.8rem",
                  fontSize: "0.85rem",
                  color: "#fff",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "inherit"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Checkbox + Delete */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={metric.display_on_dashboard}
                  onChange={(e) => updateField(index, "display_on_dashboard", e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }}
                />
                Display as Table Column on Dashboard
              </label>

              {metric.is_deletable !== false ? (
                <button
                  onClick={() => removeMetric(metric._uid)}
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "var(--error)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 4,
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontFamily: "inherit"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--error)";
                    e.currentTarget.style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                    e.currentTarget.style.color = "var(--error)";
                  }}
                >
                  Delete Metric
                </button>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 500 }}>
                  System Required Field
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "1.5rem", marginTop: "2rem" }}>
        <p style={{ margin: 0, maxWidth: 500, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Changes here alter the underlying Python architecture and change how
          the AI identifies user behavior in real-time.
        </p>
        <button
          onClick={saveConfiguration}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0.75rem 1.5rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.2s",
            fontFamily: "inherit"
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
        >
          Deploy System Overhaul
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
            background: toast.toLowerCase().includes("fail") ? "var(--error)" : "var(--success)",
            color: "#fff",
            borderRadius: 8,
            padding: "0.7rem 1.5rem",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
