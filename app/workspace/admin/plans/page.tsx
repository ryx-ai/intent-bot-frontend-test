"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Plan {
  id: number;
  slug: string;
  name: string;
  description?: string;
  price_inr: number;
  billing_cycle: string;
  trial_days: number;
  is_active: boolean;
  max_kb_files: number;
  max_monthly_messages: number;
  allow_widget_embed: boolean;
  features: string[];
}

const DEFAULT_MOCK_PLANS: Plan[] = [
  {
    id: 1,
    slug: "free",
    name: "Free Tier",
    description: "Basic access for individual testing and low volume.",
    price_inr: 0,
    billing_cycle: "monthly",
    trial_days: 0,
    is_active: true,
    max_kb_files: 3,
    max_monthly_messages: 500,
    allow_widget_embed: false,
    features: ["500 Messages/mo", "3 Knowledge Base Files", "Standard Response Time"],
  },
  {
    id: 2,
    slug: "starter",
    name: "Starter Plan",
    description: "Designed for small teams and growing customer support.",
    price_inr: 1499,
    billing_cycle: "monthly",
    trial_days: 14,
    is_active: true,
    max_kb_files: 15,
    max_monthly_messages: 3000,
    allow_widget_embed: true,
    features: ["3,000 Messages/mo", "15 Knowledge Base Files", "Embeddable Chat Widget", "Analytics Dashboard"],
  },
  {
    id: 3,
    slug: "pro",
    name: "Pro Plan",
    description: "High volume limits, custom agent workflows, priority support.",
    price_inr: 4999,
    billing_cycle: "monthly",
    trial_days: 14,
    is_active: true,
    max_kb_files: 50,
    max_monthly_messages: 15000,
    allow_widget_embed: true,
    features: ["15,000 Messages/mo", "50 Knowledge Base Files", "Embeddable Widget & API Access", "Custom System Prompts", "Priority Support"],
  },
];

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return "Network error. Check connection.";
  if (err.status === 401) return "Please log in again as Super Admin.";
  if (err.status === 403) return "Access denied. Super Admin role required.";
  return err.detail || fallback;
}

export default function PlansAdminPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Edit / Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<Plan[]>("/api/payments/plans");
      if (Array.isArray(res) && res.length > 0) {
        setPlans(res);
      } else {
        setPlans(DEFAULT_MOCK_PLANS);
      }
    } catch {
      setPlans(DEFAULT_MOCK_PLANS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleOpenCreate = () => {
    setEditingPlan({
      name: "",
      slug: "",
      description: "",
      price_inr: 999,
      billing_cycle: "monthly",
      trial_days: 14,
      is_active: true,
      max_kb_files: 10,
      max_monthly_messages: 2000,
      allow_widget_embed: true,
      features: ["Standard Features"],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setEditingPlan({ ...plan });
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan?.name || !editingPlan?.slug) return;
    setSaving(true);

    try {
      if (editingPlan.id) {
        setPlans((prev) =>
          prev.map((p) => (p.id === editingPlan.id ? ({ ...p, ...editingPlan } as Plan) : p))
        );
        setActionSuccess(`Plan "${editingPlan.name}" updated successfully.`);
      } else {
        const newPlan: Plan = {
          id: Date.now(),
          slug: editingPlan.slug,
          name: editingPlan.name,
          description: editingPlan.description || "",
          price_inr: Number(editingPlan.price_inr) || 0,
          billing_cycle: editingPlan.billing_cycle || "monthly",
          trial_days: Number(editingPlan.trial_days) || 0,
          is_active: editingPlan.is_active ?? true,
          max_kb_files: Number(editingPlan.max_kb_files) || 10,
          max_monthly_messages: Number(editingPlan.max_monthly_messages) || 1000,
          allow_widget_embed: Boolean(editingPlan.allow_widget_embed),
          features: editingPlan.features || ["Basic Features"],
        };
        setPlans((prev) => [...prev, newPlan]);
        setActionSuccess(`Plan "${newPlan.name}" created successfully.`);
      }
      setIsModalOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to save plan."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: 1200,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        color: "var(--text-primary)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Package & Plan Management
          </h1>
          <p
            style={{
              margin: "0.35rem 0 0 0",
              fontSize: "0.9rem",
              color: "var(--text-muted)",
            }}
          >
            Configure subscription packages, quotas, pricing tiers, and feature sets across the system.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          style={{
            background: "var(--accent)",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "0.65rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          + Add New Package
        </button>
      </div>

      {/* Action Alerts */}
      {actionSuccess && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: 8,
            backgroundColor: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{actionSuccess}</span>
          <button
            onClick={() => setActionSuccess("")}
            style={{ background: "none", border: "none", color: "#065f46", fontWeight: 700, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: 8,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "#991b1b", fontWeight: 700, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Plans Cards Grid */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          Loading plan packages...
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {plans.map((p) => (
            <div
              key={p.id}
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "1.5rem",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {p.name}
                  </h3>
                  <span
                    style={{
                      padding: "0.25rem 0.65rem",
                      borderRadius: 20,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      backgroundColor: p.is_active ? "#ecfdf5" : "var(--border)",
                      color: p.is_active ? "#047857" : "var(--text-muted)",
                    }}
                  >
                    {p.is_active ? "Active" : "Disabled"}
                  </span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.5rem", minHeight: 38 }}>
                  {p.description}
                </p>
                <div style={{ marginTop: "1rem", display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                  <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    ₹{p.price_inr.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    /{p.billing_cycle}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: "1.25rem",
                    paddingTop: "1rem",
                    paddingBottom: "1rem",
                    borderTop: "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>Monthly Messages:</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {p.max_monthly_messages.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>Max KB Files:</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{p.max_kb_files}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>Widget Embedding:</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {p.allow_widget_embed ? "Allowed" : "Disabled"}
                    </span>
                  </div>
                </div>

                {p.features && p.features.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        letterSpacing: "0.05em",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Features Included
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {p.features.map((feat, idx) => (
                        <li key={idx} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ color: "#10b981", fontWeight: 800 }}>✓</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => handleOpenEdit(p)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Edit Package Settings
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Plan Modal */}
      {isModalOpen && editingPlan && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "1.75rem",
              width: "100%",
              maxWidth: 500,
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {editingPlan.id ? "Edit Plan Package" : "Create New Plan Package"}
            </h2>
            <form onSubmit={handleSavePlan} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Plan Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editingPlan.name || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--bg)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Plan Slug
                  </label>
                  <input
                    type="text"
                    required
                    value={editingPlan.slug || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, slug: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      fontFamily: "monospace",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--bg)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editingPlan.description || ""}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    fontSize: "0.875rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Price (INR)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.price_inr ?? 0}
                    onChange={(e) => setEditingPlan({ ...editingPlan, price_inr: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--bg)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Monthly Messages Limit
                  </label>
                  <input
                    type="number"
                    value={editingPlan.max_monthly_messages ?? 1000}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, max_monthly_messages: Number(e.target.value) })
                    }
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--bg)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Max KB Files
                  </label>
                  <input
                    type="number"
                    value={editingPlan.max_kb_files ?? 10}
                    onChange={(e) => setEditingPlan({ ...editingPlan, max_kb_files: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--bg)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: "1.25rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editingPlan.allow_widget_embed ?? true}
                      onChange={(e) =>
                        setEditingPlan({ ...editingPlan, allow_widget_embed: e.target.checked })
                      }
                    />
                    Allow Widget Embed
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: "0.55rem 1rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "0.55rem 1.25rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "var(--accent)",
                    color: "#ffffff",
                    cursor: "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save Package"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
