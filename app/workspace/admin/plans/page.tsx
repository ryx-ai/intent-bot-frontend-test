"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface UserInfo {
  role?: string;
}

export interface Plan {
  id: number;
  slug: string;
  name: string;
  description?: string;
  price_inr: number;
  billing_cycle: "trial" | "monthly" | "yearly" | string;
  trial_days: number;
  is_active: boolean;
  is_default_trial: boolean;
  max_kb_files: number;
  max_monthly_messages: number;
  allow_widget_embed: boolean;
  features: string[];
  created_at?: string;
  updated_at?: string;
}

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return "Network error. Check your connection.";
  if (err.status === 401) return "Please log in again.";
  if (err.status === 403) return "Only super admins can manage subscription plans.";
  if (err.status === 404) return "Plan not found.";
  if (err.status === 400 || err.status === 409) return err.detail || "Invalid data or plan slug already exists.";
  if (err.status === 422) return "Check the fields and try again.";
  if (err.status >= 500) return "Server error. Please try again later.";
  return fallback;
}

function formatPrice(priceInr: number, billingCycle: string) {
  if (priceInr === 0) return "Free";
  const cycleSuffix = billingCycle === "yearly" ? "/yr" : billingCycle === "monthly" ? "/mo" : "";
  return `₹${priceInr.toLocaleString()}${cycleSuffix}`;
}

function formatLimit(val: number, unit: string) {
  if (val === -1) return `Unlimited ${unit}`;
  return `${val.toLocaleString()} ${unit}`;
}

export default function SuperAdminPlansPage() {
  const [role, setRole] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form State (for creation)
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceInr, setPriceInr] = useState<number>(0);
  const [billingCycle, setBillingCycle] = useState<string>("monthly");
  const [trialDays, setTrialDays] = useState<number>(0);
  const [maxKbFiles, setMaxKbFiles] = useState<number>(3);
  const [maxMonthlyMessages, setMaxMonthlyMessages] = useState<number>(100);
  const [isDefaultTrial, setIsDefaultTrial] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [allowWidgetEmbed, setAllowWidgetEmbed] = useState<boolean>(true);
  const [featuresInput, setFeaturesInput] = useState("");

  // Editing state modal
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriceInr, setEditPriceInr] = useState<number>(0);
  const [editBillingCycle, setEditBillingCycle] = useState<string>("monthly");
  const [editTrialDays, setEditTrialDays] = useState<number>(0);
  const [editMaxKbFiles, setEditMaxKbFiles] = useState<number>(3);
  const [editMaxMonthlyMessages, setEditMaxMonthlyMessages] = useState<number>(100);
  const [editIsDefaultTrial, setEditIsDefaultTrial] = useState<boolean>(false);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editAllowWidgetEmbed, setEditAllowWidgetEmbed] = useState<boolean>(true);
  const [editFeaturesInput, setEditFeaturesInput] = useState("");

  const loadPlans = useCallback(async () => {
    const data = await api.get<Plan[]>("/api/admin/plans");
    setPlans(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const me = await api.get<UserInfo>("/api/auth/me");
        if (cancelled) return;
        setRole(me.role || null);

        if (me.role === "super_admin") {
          await loadPlans();
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "Failed to load subscription plans."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [loadPlans]);

  const validationError = useMemo(() => {
    if (!slug.trim()) return "Slug is required.";
    if (!name.trim()) return "Plan name is required.";
    if (priceInr < 0) return "Price cannot be negative.";
    if (trialDays < 0) return "Trial days cannot be negative.";
    return "";
  }, [slug, name, priceInr, trialDays]);

  async function handleCreatePlan(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const parsedFeatures = featuresInput
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      const newPlan = await api.post<Plan>("/api/admin/plans", {
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        price_inr: Number(priceInr),
        billing_cycle: billingCycle,
        trial_days: Number(trialDays),
        is_active: isActive,
        is_default_trial: isDefaultTrial,
        max_kb_files: Number(maxKbFiles),
        max_monthly_messages: Number(maxMonthlyMessages),
        allow_widget_embed: allowWidgetEmbed,
        features: parsedFeatures,
      });

      setSuccess(`Package "${newPlan.name}" (${newPlan.slug}) created successfully.`);
      setSlug("");
      setName("");
      setDescription("");
      setPriceInr(0);
      setBillingCycle("monthly");
      setTrialDays(0);
      setMaxKbFiles(3);
      setMaxMonthlyMessages(100);
      setIsDefaultTrial(false);
      setIsActive(true);
      setAllowWidgetEmbed(true);
      setFeaturesInput("");
      await loadPlans();
    } catch (err) {
      setError(errorMessage(err, "Failed to create package plan."));
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(plan: Plan) {
    setEditingPlan(plan);
    setEditName(plan.name);
    setEditDescription(plan.description || "");
    setEditPriceInr(plan.price_inr);
    setEditBillingCycle(plan.billing_cycle);
    setEditTrialDays(plan.trial_days);
    setEditMaxKbFiles(plan.max_kb_files);
    setEditMaxMonthlyMessages(plan.max_monthly_messages);
    setEditIsDefaultTrial(plan.is_default_trial);
    setEditIsActive(plan.is_active);
    setEditAllowWidgetEmbed(plan.allow_widget_embed);
    setEditFeaturesInput((plan.features || []).join(", "));
  }

  async function handleUpdatePlan(e: FormEvent) {
    e.preventDefault();
    if (!editingPlan) return;
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const parsedFeatures = editFeaturesInput
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      const updated = await api.put<Plan>(`/api/admin/plans/${editingPlan.id}`, {
        name: editName.trim(),
        description: editDescription.trim(),
        price_inr: Number(editPriceInr),
        billing_cycle: editBillingCycle,
        trial_days: Number(editTrialDays),
        is_active: editIsActive,
        is_default_trial: editIsDefaultTrial,
        max_kb_files: Number(editMaxKbFiles),
        max_monthly_messages: Number(editMaxMonthlyMessages),
        allow_widget_embed: editAllowWidgetEmbed,
        features: parsedFeatures,
      });

      setSuccess(`Package "${updated.name}" updated successfully.`);
      setEditingPlan(null);
      await loadPlans();
    } catch (err) {
      setError(errorMessage(err, "Failed to update package plan."));
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePlanActive(plan: Plan) {
    setError("");
    setSuccess("");
    try {
      const nextStatus = !plan.is_active;
      if (nextStatus) {
        await api.put<Plan>(`/api/admin/plans/${plan.id}`, { is_active: true });
        setSuccess(`Activated package "${plan.name}".`);
      } else {
        await api.delete(`/api/admin/plans/${plan.id}`);
        setSuccess(`Deactivated package "${plan.name}".`);
      }
      await loadPlans();
    } catch (err) {
      setError(errorMessage(err, "Failed to update package status."));
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading subscription packages...</p>
      </div>
    );
  }

  if (role !== "super_admin") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
          Package Management
        </h1>
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            borderRadius: 8,
            border: "1px solid rgba(239, 68, 68, 0.35)",
            background: "rgba(239, 68, 68, 0.08)",
            color: "var(--error)",
          }}
        >
          Only super admins can access subscription package management.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
          Package & Subscription Management
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Configure subscription tiers, pricing, feature flags, and usage limits across the platform.
        </p>
      </header>

      {error && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.9rem 1.1rem",
            borderRadius: 8,
            border: "1px solid rgba(239, 68, 68, 0.35)",
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--error)",
            fontSize: "0.88rem",
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.9rem 1.1rem",
            borderRadius: 8,
            border: "1px solid rgba(16, 185, 129, 0.35)",
            background: "rgba(16, 185, 129, 0.1)",
            color: "var(--success)",
            fontSize: "0.88rem",
          }}
        >
          {success}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 420px) 1fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Create Plan Form */}
        <form
          onSubmit={handleCreatePlan}
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "1.5rem",
          }}
        >
          <h2 style={{ margin: "0 0 1.25rem 0", fontSize: "1rem", color: "#fff" }}>
            Create New Package
          </h2>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={labelStyle}>Plan Slug (ID)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="e.g. pro, enterprise"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={labelStyle}>Package Display Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pro Tier"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={labelStyle}>Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of target audience or benefits"
              style={inputStyle}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <label>
              <span style={labelStyle}>Price (INR ₹)</span>
              <input
                type="number"
                min={0}
                value={priceInr}
                onChange={(e) => setPriceInr(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Billing Cycle</span>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                style={inputStyle}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="trial">Trial</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <label>
              <span style={labelStyle}>Max Monthly Msgs (-1 = Unlimited)</span>
              <input
                type="number"
                value={maxMonthlyMessages}
                onChange={(e) => setMaxMonthlyMessages(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Max KB Files (-1 = Unlimited)</span>
              <input
                type="number"
                value={maxKbFiles}
                onChange={(e) => setMaxKbFiles(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={labelStyle}>Trial Days</span>
            <input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={labelStyle}>Features (Comma-separated)</span>
            <input
              value={featuresInput}
              onChange={(e) => setFeaturesInput(e.target.value)}
              placeholder="Analytics, Priority Support, Custom CSS"
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.25rem" }}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={isDefaultTrial}
                onChange={(e) => setIsDefaultTrial(e.target.checked)}
              />
              <span>Set as Default Signup Trial Plan</span>
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={allowWidgetEmbed}
                onChange={(e) => setAllowWidgetEmbed(e.target.checked)}
              />
              <span>Allow Chatbot Widget Embedding</span>
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Active & Selectable</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "0.8rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.65 : 1,
            }}
          >
            {submitting ? "Creating..." : "Create Package Plan"}
          </button>
        </form>

        {/* Existing Plans Table / Cards */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem", color: "#fff" }}>Existing Packages ({plans.length})</h2>
            <button
              type="button"
              onClick={() => loadPlans().catch((err) => setError(errorMessage(err, "Failed to refresh plans.")))}
              style={secondaryBtnStyle}
            >
              Refresh
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr>
                <th style={thStyle}>Plan Name & Slug</th>
                <th style={thStyle}>Price</th>
                <th style={thStyle}>Limits</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "2rem", color: "var(--text-muted)", textAlign: "center" }}>
                    No subscription packages created yet.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: "#fff" }}>{plan.name}</div>
                      <code style={{ fontSize: "0.78rem", color: "var(--accent-light)" }}>{plan.slug}</code>
                      {plan.is_default_trial && (
                        <span
                          style={{
                            marginLeft: 8,
                            padding: "0.15rem 0.45rem",
                            borderRadius: 4,
                            background: "rgba(139, 92, 246, 0.2)",
                            color: "#a78bfa",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                          }}
                        >
                          Default Trial
                        </span>
                      )}
                      {plan.description && (
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                          {plan.description}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: "#fff" }}>
                        {formatPrice(plan.price_inr, plan.billing_cycle)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                        {plan.billing_cycle} {plan.trial_days > 0 ? `(${plan.trial_days}d trial)` : ""}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>
                        {formatLimit(plan.max_monthly_messages, "msgs")}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {formatLimit(plan.max_kb_files, "files")}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.5rem",
                          borderRadius: 4,
                          background: plan.is_active
                            ? "rgba(16, 185, 129, 0.12)"
                            : "rgba(239, 68, 68, 0.12)",
                          color: plan.is_active ? "var(--success)" : "var(--error)",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        {plan.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => openEditModal(plan)}
                        style={actionButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePlanActive(plan)}
                        style={{
                          ...actionButtonStyle,
                          marginLeft: "0.5rem",
                          color: plan.is_active ? "var(--warning)" : "var(--success)",
                          borderColor: plan.is_active
                            ? "rgba(245, 158, 11, 0.35)"
                            : "rgba(16, 185, 129, 0.35)",
                        }}
                      >
                        {plan.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Modal */}
      {editingPlan && (
        <div
          role="presentation"
          style={modalOverlayStyle}
          onClick={() => setEditingPlan(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: "1.15rem" }}>
                Edit Package: <code style={{ color: "var(--accent-light)" }}>{editingPlan.slug}</code>
              </h2>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePlan}>
              <label style={{ display: "block", marginBottom: "0.85rem" }}>
                <span style={labelStyle}>Display Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem" }}>
                <span style={labelStyle}>Description</span>
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.85rem" }}>
                <label>
                  <span style={labelStyle}>Price (INR ₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={editPriceInr}
                    onChange={(e) => setEditPriceInr(Number(e.target.value))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Billing Cycle</span>
                  <select
                    value={editBillingCycle}
                    onChange={(e) => setEditBillingCycle(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="trial">Trial</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.85rem" }}>
                <label>
                  <span style={labelStyle}>Max Monthly Msgs (-1 = Unlimited)</span>
                  <input
                    type="number"
                    value={editMaxMonthlyMessages}
                    onChange={(e) => setEditMaxMonthlyMessages(Number(e.target.value))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Max KB Files (-1 = Unlimited)</span>
                  <input
                    type="number"
                    value={editMaxKbFiles}
                    onChange={(e) => setEditMaxKbFiles(Number(e.target.value))}
                    style={inputStyle}
                  />
                </label>
              </div>

              <label style={{ display: "block", marginBottom: "0.85rem" }}>
                <span style={labelStyle}>Trial Days</span>
                <input
                  type="number"
                  min={0}
                  value={editTrialDays}
                  onChange={(e) => setEditTrialDays(Number(e.target.value))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem" }}>
                <span style={labelStyle}>Features (Comma-separated)</span>
                <input
                  value={editFeaturesInput}
                  onChange={(e) => setEditFeaturesInput(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={editIsDefaultTrial}
                    onChange={(e) => setEditIsDefaultTrial(e.target.checked)}
                  />
                  <span>Set as Default Signup Trial Plan</span>
                </label>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={editAllowWidgetEmbed}
                    onChange={(e) => setEditAllowWidgetEmbed(e.target.checked)}
                  />
                  <span>Allow Chatbot Widget Embedding</span>
                </label>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                  />
                  <span>Active & Selectable</span>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  style={secondaryBtnStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "0.65rem 1.25rem",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: "0.8rem",
  color: "var(--text-secondary)",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--border)",
  padding: "0.75rem 0.85rem",
  fontSize: "0.9rem",
  color: "#fff",
  background: "var(--bg-surface)",
  outline: "none",
  fontFamily: "inherit",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.85rem",
  color: "var(--text-primary)",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-surface)",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: "0.78rem",
  padding: "0.85rem 1rem",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "0.95rem 1rem",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  verticalAlign: "top",
};

const actionButtonStyle: React.CSSProperties = {
  padding: "0.35rem 0.65rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "var(--accent-light)",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "0.45rem 0.75rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "0.85rem",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  background: "rgba(5, 7, 15, 0.75)",
  backdropFilter: "blur(8px)",
};

const modalStyle: React.CSSProperties = {
  width: "min(100%, 540px)",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
  padding: "1.5rem",
  maxHeight: "90vh",
  overflowY: "auto",
};
