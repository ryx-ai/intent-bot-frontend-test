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

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<MetricConfig[]>("/api/metrics/config");
        setMetrics(data);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (copy[index] as any)[field] = value;
      return copy;
    });
  }

  function addMetric() {
    setMetrics((prev) => [
      ...prev,
      {
        id: "new_metric",
        name: "New Metric",
        description: "Criteria for the AI to track this...",
        display_on_dashboard: true,
        is_deletable: true,
      },
    ]);
  }

  function removeMetric(index: number) {
    if (!confirm("Delete this AI tracking metric?")) return;
    setMetrics((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveConfiguration() {
    try {
      await api.post("/api/metrics/config", metrics);
      showToast("Configuration Deployed Successfully!");
    } catch {
      alert("Failed to deploy changes.");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  if (loading) {
    return (
      <div style={{ padding: "5rem", textAlign: "center", color: "#64748b" }}>
        Loading configuration…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>
            Tracking & Schema Settings
          </h1>
          <p style={{ margin: 0, color: "#9aa0a6", fontSize: "0.9rem" }}>
            Define custom variables you want the AI brain to calculate, track,
            and inject into the dashboard.
          </p>
        </div>
        <button
          onClick={addMetric}
          style={{
            background: "#2b2f36",
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
          onMouseEnter={(e) => e.currentTarget.style.background = "#3b3e45"}
          onMouseLeave={(e) => e.currentTarget.style.background = "#2b2f36"}
        >
          + Add New Metric
        </button>
      </div>

      {/* Metric editors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {metrics.map((metric, index) => (
          <div
            key={index}
            style={{
              background: "#191c21",
              border: "1px solid #2b2f36",
              borderRadius: 8,
              padding: "1.5rem",
            }}
          >
            {/* Row: ID + Name */}
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 500, color: "#9aa0a6" }}>
                  Internal ID (no spaces)
                </label>
                <input
                  type="text"
                  value={metric.id}
                  readOnly={metric.is_deletable === false}
                  onChange={(e) => updateField(index, "id", e.target.value)}
                  style={{
                    background: "#121418",
                    border: "1px solid #2b2f36",
                    borderRadius: 4,
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.85rem",
                    color: "#fff",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    opacity: metric.is_deletable === false ? 0.6 : 1,
                    fontFamily: "inherit"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#6b4cff"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#2b2f36"}
                />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 500, color: "#9aa0a6" }}>
                  Dashboard Column Name
                </label>
                <input
                  type="text"
                  value={metric.name}
                  onChange={(e) => updateField(index, "name", e.target.value)}
                  style={{
                    background: "#121418",
                    border: "1px solid #2b2f36",
                    borderRadius: 4,
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.85rem",
                    color: "#fff",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: "inherit"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#6b4cff"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#2b2f36"}
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 500, color: "#9aa0a6" }}>
                AI Extraction Rules & Prompts
              </label>
              <input
                type="text"
                value={metric.description}
                onChange={(e) => updateField(index, "description", e.target.value)}
                placeholder="e.g., Output 'Yes' if user asks for pricing"
                style={{
                  background: "#121418",
                  border: "1px solid #2b2f36",
                  borderRadius: 4,
                  padding: "0.6rem 0.8rem",
                  fontSize: "0.85rem",
                  color: "#fff",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "inherit"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "#6b4cff"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#2b2f36"}
              />
            </div>

            {/* Checkbox + Delete */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={metric.display_on_dashboard}
                  onChange={(e) => updateField(index, "display_on_dashboard", e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "#6b4cff", cursor: "pointer" }}
                />
                Display as Table Column on Dashboard
              </label>

              {metric.is_deletable !== false ? (
                <button
                  onClick={() => removeMetric(index)}
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
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
                    e.currentTarget.style.background = "#ef4444";
                    e.currentTarget.style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                    e.currentTarget.style.color = "#ef4444";
                  }}
                >
                  Delete Metric
                </button>
              ) : (
                <span style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: 500 }}>
                  System Required Field
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2b2f36", paddingTop: "1.5rem", marginTop: "2rem" }}>
        <p style={{ margin: 0, maxWidth: 500, fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
          Changes here alter the underlying Python architecture and change how
          the AI identifies user behavior in real-time.
        </p>
        <button
          onClick={saveConfiguration}
          style={{
            background: "#6b4cff",
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
            background: "#32d583",
            color: "#0e291e",
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
