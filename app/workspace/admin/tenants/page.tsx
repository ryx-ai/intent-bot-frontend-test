"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface UserInfo {
  role?: string;
}

interface Tenant {
  id: number;
  slug: string;
  name: string;
  status: "active" | "suspended" | string;
  plan_id?: number | null;
  plan_name?: string | null;
  plan_slug?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
  plan_ends_at?: string | null;
  created_at: string;
}

interface PlanOption {
  id: number;
  slug: string;
  name: string;
  price_inr?: number;
}

interface TenantAdmin {
  id: number;
  email: string;
  tenant_id: number;
  role: string;
}

interface DeleteTenantResponse {
  status: "deleted";
  slug: string;
}

type TenantActionKind = "suspend" | "reactivate" | "delete";

interface PendingTenantAction {
  kind: TenantActionKind;
  tenant: Tenant;
}

const SLUG_RE = /^[a-z0-9_-]{1,64}$/;

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return "Network error. Check your connection.";
  if (err.status === 401) return "Please log in again.";
  if (err.status === 403) return "Only super admins can manage tenants.";
  if (err.status === 404) return "Tenant was not found.";
  if (err.status === 409) return "That tenant slug or admin email is already in use.";
  if (err.status === 422) return "Check the fields and try again.";
  if (err.status >= 500) return "Server error. Please try again later.";
  return fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const isSuspended = status === "suspended";
  const isExpired = status === "expired";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.25rem 0.6rem",
    borderRadius: 6,
    background: isSuspended
      ? "rgba(245, 158, 11, 0.12)"
      : isExpired
      ? "rgba(239, 68, 68, 0.12)"
      : "rgba(16, 185, 129, 0.12)",
    border: isSuspended
      ? "1px solid rgba(245, 158, 11, 0.3)"
      : isExpired
      ? "1px solid rgba(239, 68, 68, 0.3)"
      : "1px solid rgba(16, 185, 129, 0.3)",
    color: isSuspended ? "#f59e0b" : isExpired ? "#ef4444" : "#10b981",
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "capitalize",
  };
}

export default function TenantManagementPage() {
  const [role, setRole] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [availablePlans, setAvailablePlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<number | null>(null);
  const [tenantActionId, setTenantActionId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingTenantAction | null>(null);
  const [deleteConfirmationSlug, setDeleteConfirmationSlug] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | "">("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const validationError = useMemo(() => {
    const trimmedName = name.trim();
    const trimmedPassword = adminPassword.trim();

    if (!trimmedName || trimmedName.length > 200) {
      return "Company name must be 1 to 200 characters.";
    }
    if (!SLUG_RE.test(slug)) {
      return "Slug can use lowercase letters, numbers, underscores, and hyphens only.";
    }
    if (!adminEmail.includes("@")) {
      return "Enter a valid admin email.";
    }
    if (trimmedPassword.length < 8 || adminPassword.length > 200) {
      return "Admin password must be 8 to 200 characters.";
    }
    return "";
  }, [adminEmail, adminPassword, name, slug]);

  const loadTenants = useCallback(async () => {
    const data = await api.get<{ tenants: Tenant[] }>("/api/admin/tenants");
    setTenants(data.tenants || []);
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const plansData = await api.get<PlanOption[]>("/api/admin/plans");
      setAvailablePlans(plansData || []);
    } catch {
      // Optional plan fetch
    }
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
          await Promise.all([loadTenants(), loadPlans()]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "Failed to load tenant management."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [loadPlans, loadTenants]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setError("");
    setSuccess("");

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const tenant = await api.post<Tenant>("/api/admin/tenants", {
        slug,
        name: name.trim(),
        plan_id: selectedPlanId ? Number(selectedPlanId) : undefined,
      });

      const admin = await api.post<TenantAdmin>(
        `/api/admin/tenants/${tenant.id}/admins`,
        {
          email: adminEmail.trim(),
          password: adminPassword,
        }
      );

      setSuccess(
        `Created workspace "${tenant.name}" (${tenant.slug}) and provisioned admin ${admin.email}.`
      );
      setName("");
      setSlug("");
      setSelectedPlanId("");
      setAdminEmail("");
      setAdminPassword("");
      await loadTenants();
    } catch (err) {
      setFormError(errorMessage(err, "Tenant onboarding failed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePlanChange(tenantId: number, newPlanId: number | null) {
    setUpdatingPlanId(tenantId);
    setError("");
    setSuccess("");
    try {
      const updated = await api.patch<Tenant>(`/api/admin/tenants/${tenantId}`, {
        plan_id: newPlanId ?? 0,
      });
      setTenants((current) =>
        current.map((t) => (t.id === tenantId ? updated : t))
      );
      setSuccess(`Updated plan for tenant "${updated.name}".`);
    } catch (err) {
      setError(errorMessage(err, "Failed to update tenant plan."));
    } finally {
      setUpdatingPlanId(null);
    }
  }

  function openStatusConfirmation(tenant: Tenant) {
    const nextStatus = tenant.status === "active" ? "suspended" : "active";
    setDeleteConfirmationSlug("");
    setPendingAction({
      kind: nextStatus === "suspended" ? "suspend" : "reactivate",
      tenant,
    });
  }

  function openDeleteConfirmation(tenant: Tenant) {
    if (tenant.slug === "ryxai") {
      setError("The default platform tenant cannot be deleted from this UI.");
      setSuccess("");
      return;
    }

    setDeleteConfirmationSlug("");
    setPendingAction({ kind: "delete", tenant });
  }

  async function confirmTenantAction() {
    if (!pendingAction) return;

    const { kind, tenant } = pendingAction;
    const isDelete = kind === "delete";
    const nextStatus =
      kind === "suspend" ? "suspended" : kind === "reactivate" ? "active" : null;
    const actionLabel = isDelete ? "delete" : kind;

    setTenantActionId(tenant.id);
    setError("");
    setSuccess("");
    try {
      if (isDelete) {
        const deleted = await api.delete<DeleteTenantResponse>(
          `/api/admin/tenants/${tenant.id}`
        );
        setTenants((current) => current.filter((item) => item.id !== tenant.id));
        setSuccess(`Deleted workspace tenant "${deleted.slug}".`);
      } else if (nextStatus) {
        const updated = await api.patch<Tenant>(
          `/api/admin/tenants/${tenant.id}`,
          {
            status: nextStatus,
          }
        );
        setTenants((current) =>
          current.map((item) => (item.id === tenant.id ? updated : item))
        );
        setSuccess(
          `Workspace "${tenant.name}" is now ${nextStatus}. ${
            nextStatus === "suspended"
              ? "Tenant admins are temporarily blocked from logging in."
              : "Tenant admins can now log in."
          }`
        );
      }
      setPendingAction(null);
    } catch (err) {
      setError(errorMessage(err, `Failed to ${actionLabel} tenant.`));
    } finally {
      setTenantActionId(null);
    }
  }

  const pendingActionConfig = pendingAction
    ? getTenantActionConfig(pendingAction)
    : null;
  const actionInProgress =
    pendingAction !== null && tenantActionId === pendingAction.tenant.id;
  const confirmDisabled =
    actionInProgress ||
    (pendingAction?.kind === "delete" &&
      deleteConfirmationSlug.trim() !== pendingAction.tenant.slug);

  // Compute Statistics
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.status === "active").length;
  const suspendedTenants = tenants.filter((t) => t.status === "suspended").length;
  const paidOrAssignedPlans = tenants.filter((t) => t.plan_id).length;

  if (loading) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading workspace tenant management...</p>
      </div>
    );
  }

  if (role !== "super_admin") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
          Tenant Management
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
          Only super admins can access tenant management.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <header style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
          Tenant & Workspace Management
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Create isolated customer workspaces, manage subscription tiers, and provision admin accounts.
        </p>
      </header>

      {/* KPI Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Total Workspaces</span>
          <span style={statValueStyle}>{totalTenants}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Active Tenants</span>
          <span style={{ ...statValueStyle, color: "#10b981" }}>{activeTenants}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Suspended</span>
          <span style={{ ...statValueStyle, color: "#f59e0b" }}>{suspendedTenants}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Assigned Plans</span>
          <span style={{ ...statValueStyle, color: "#a78bfa" }}>{paidOrAssignedPlans}</span>
        </div>
      </div>

      {/* Top Global Alerts */}
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

      {/* Main Content Layout */}
      <section
        style={{
          display: "flex",
          gap: "1.5rem",
          alignItems: "flex-start",
        }}
      >
        {/* Left Form: Create Tenant */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: 350,
            flexShrink: 0,
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "1.5rem",
          }}
        >
          <h2 style={{ margin: "0 0 1.25rem 0", fontSize: "1rem", color: "#fff", fontWeight: 700 }}>
            Create Tenant
          </h2>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={formLabelStyle}>Company name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Acme Corp"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={formLabelStyle}>Tenant slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
              maxLength={64}
              pattern="[a-z0-9_-]{1,64}"
              placeholder="acme"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={formLabelStyle}>Initial Subscription Plan</span>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : "")}
              style={inputStyle}
            >
              <option value="">Default Trial Plan</option>
              {availablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={formLabelStyle}>Tenant admin email</span>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@acme.com"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1.25rem" }}>
            <span style={formLabelStyle}>Tenant admin password</span>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              minLength={8}
              maxLength={200}
              placeholder="At least 8 characters"
              required
              style={inputStyle}
            />
          </label>

          {formError && (
            <div style={{ marginBottom: "1rem", color: "var(--error)", fontSize: "0.85rem" }}>
              {formError}
            </div>
          )}

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
            {submitting ? "Creating workspace..." : "Create tenant and admin"}
          </button>
        </form>

        {/* Right Table: Tenants List */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
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
            <h2 style={{ margin: 0, fontSize: "1rem", color: "#fff", fontWeight: 700 }}>
              Tenants ({tenants.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                Promise.all([loadTenants(), loadPlans()]).catch((err) =>
                  setError(errorMessage(err, "Failed to refresh tenants."))
                );
              }}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.85rem",
              }}
            >
              Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: "18%" }}>Name</th>
                  <th style={{ ...thStyle, width: "13%" }}>Slug</th>
                  <th style={{ ...thStyle, width: "18%" }}>Plan</th>
                  <th style={{ ...thStyle, width: "16%" }}>Plan End Date</th>
                  <th style={{ ...thStyle, width: "10%" }}>Status</th>
                  <th style={{ ...thStyle, width: "13%" }}>Created</th>
                  <th style={{ ...thStyle, width: "12%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "2.5rem", color: "var(--text-muted)", textAlign: "center" }}>
                      No tenants onboarded yet.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => {
                    const hasPlan = Boolean(tenant.plan_name);
                    return (
                      <tr key={tenant.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: "#fff" }}>{tenant.name}</div>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent-light)" }}>
                          {tenant.slug}
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={tenant.plan_id ?? ""}
                            onChange={(e) =>
                              void handlePlanChange(
                                tenant.id,
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            disabled={updatingPlanId === tenant.id}
                            style={{
                              padding: "0.3rem 0.55rem",
                              borderRadius: 6,
                              border: hasPlan
                                ? "1px solid rgba(139, 92, 246, 0.4)"
                                : "1px solid var(--border)",
                              background: hasPlan
                                ? "rgba(139, 92, 246, 0.12)"
                                : "var(--bg-surface)",
                              color: hasPlan ? "#a78bfa" : "var(--text-muted)",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              cursor: updatingPlanId === tenant.id ? "not-allowed" : "pointer",
                              outline: "none",
                            }}
                          >
                            <option value="">No Plan</option>
                            {availablePlans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ ...tdStyle, fontSize: "0.82rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {tenant.plan_ends_at || tenant.trial_ends_at || tenant.subscription_ends_at
                            ? formatDate((tenant.plan_ends_at || tenant.trial_ends_at || tenant.subscription_ends_at)!)
                            : "—"}
                        </td>
                        <td style={tdStyle}>
                          <span style={statusBadgeStyle(tenant.status)}>
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: tenant.status === "suspended" ? "#f59e0b" : tenant.status === "expired" ? "#ef4444" : "#10b981",
                              }}
                            />
                            {tenant.status}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          {formatDate(tenant.created_at)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => openStatusConfirmation(tenant)}
                            disabled={tenantActionId === tenant.id}
                            style={{
                              ...actionButtonStyle,
                              color: tenant.status === "active" ? "var(--warning)" : "var(--success)",
                              borderColor:
                                tenant.status === "active"
                                  ? "rgba(245, 158, 11, 0.35)"
                                  : "rgba(16, 185, 129, 0.35)",
                            }}
                          >
                            {tenantActionId === tenant.id
                              ? "Working..."
                              : tenant.status === "active"
                              ? "Suspend"
                              : "Reactivate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteConfirmation(tenant)}
                            disabled={tenantActionId === tenant.id || tenant.slug === "ryxai"}
                            title={
                              tenant.slug === "ryxai"
                                ? "Default platform tenant cannot be deleted"
                                : "Hard delete tenant"
                            }
                            style={{
                              ...actionButtonStyle,
                              marginLeft: "0.4rem",
                              color: "var(--error)",
                              borderColor: "rgba(239, 68, 68, 0.35)",
                              opacity: tenantActionId === tenant.id || tenant.slug === "ryxai" ? 0.45 : 1,
                              cursor:
                                tenantActionId === tenant.id || tenant.slug === "ryxai"
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Confirmation Modal */}
      {pendingAction && pendingActionConfig && (
        <div
          role="presentation"
          style={modalOverlayStyle}
          onClick={() => {
            if (!actionInProgress) setPendingAction(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-action-title"
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
              <div
                aria-hidden="true"
                style={{
                  ...modalIconStyle,
                  color: pendingActionConfig.color,
                  borderColor: pendingActionConfig.borderColor,
                  background: pendingActionConfig.background,
                }}
              >
                {pendingActionConfig.icon}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: "0 0 0.35rem 0",
                    color: pendingActionConfig.color,
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0,
                  }}
                >
                  {pendingActionConfig.eyebrow}
                </p>
                <h2
                  id="tenant-action-title"
                  style={{ margin: 0, color: "#fff", fontSize: "1.15rem" }}
                >
                  {pendingActionConfig.title}
                </h2>
                <p
                  style={{
                    margin: "0.55rem 0 0 0",
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                  }}
                >
                  {pendingActionConfig.description}
                </p>
              </div>
            </div>

            <div style={tenantSummaryStyle}>
              <div>
                <span style={summaryLabelStyle}>Tenant</span>
                <strong style={summaryValueStyle}>{pendingAction.tenant.name}</strong>
              </div>
              <div>
                <span style={summaryLabelStyle}>Slug</span>
                <code style={summaryCodeStyle}>{pendingAction.tenant.slug}</code>
              </div>
              <div>
                <span style={summaryLabelStyle}>Current status</span>
                <span style={statusBadgeStyle(pendingAction.tenant.status)}>
                  {pendingAction.tenant.status}
                </span>
              </div>
            </div>

            <ul style={impactListStyle}>
              {pendingActionConfig.impact.map((item) => (
                <li key={item} style={impactItemStyle}>
                  {item}
                </li>
              ))}
            </ul>

            {pendingAction.kind === "delete" && (
              <label style={{ display: "block", marginTop: "1rem" }}>
                <span style={dangerLabelStyle}>
                  Type <code style={inlineCodeStyle}>{pendingAction.tenant.slug}</code> to
                  enable hard delete
                </span>
                <input
                  value={deleteConfirmationSlug}
                  onChange={(e) => setDeleteConfirmationSlug(e.target.value)}
                  placeholder={pendingAction.tenant.slug}
                  autoFocus
                  style={{
                    ...inputStyle,
                    marginTop: "0.55rem",
                    borderColor:
                      deleteConfirmationSlug &&
                      deleteConfirmationSlug.trim() !== pendingAction.tenant.slug
                        ? "rgba(239, 68, 68, 0.65)"
                        : "var(--border)",
                  }}
                />
              </label>
            )}

            <div style={modalActionRowStyle}>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={actionInProgress}
                style={{
                  ...secondaryButtonStyle,
                  opacity: actionInProgress ? 0.6 : 1,
                  cursor: actionInProgress ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmTenantAction()}
                disabled={confirmDisabled}
                style={{
                  ...primaryDangerButtonStyle,
                  background: pendingActionConfig.buttonBackground,
                  opacity: confirmDisabled ? 0.55 : 1,
                  cursor: confirmDisabled ? "not-allowed" : "pointer",
                }}
              >
                {actionInProgress ? "Working..." : pendingActionConfig.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTenantActionConfig(action: PendingTenantAction) {
  const { kind, tenant } = action;

  if (kind === "delete") {
    return {
      eyebrow: "Permanent delete",
      title: `Hard delete ${tenant.name}?`,
      description:
        "This removes the tenant record and connected tenant resources. This action cannot be undone.",
      confirmLabel: "Hard delete tenant",
      icon: "!",
      color: "var(--error)",
      borderColor: "rgba(239, 68, 68, 0.35)",
      background: "rgba(239, 68, 68, 0.12)",
      buttonBackground: "var(--error)",
      impact: [
        "Tenant admins lose access immediately.",
        "Tenant data and the tenant filesystem folder are removed.",
        "Recovery requires restoring from an external backup.",
      ],
    };
  }

  if (kind === "suspend") {
    return {
      eyebrow: "Access change",
      title: `Suspend ${tenant.name}?`,
      description:
        "Suspension blocks tenant access while preserving the workspace and data for later review or reactivation.",
      confirmLabel: "Suspend tenant",
      icon: "!",
      color: "var(--warning)",
      borderColor: "rgba(245, 158, 11, 0.38)",
      background: "rgba(245, 158, 11, 0.12)",
      buttonBackground: "var(--warning)",
      impact: [
        "Tenant admins cannot log in until reactivated.",
        "Tenant data stays in place.",
        "You can reactivate this tenant from the same table.",
      ],
    };
  }

  return {
    eyebrow: "Restore access",
    title: `Reactivate ${tenant.name}?`,
    description:
      "Reactivation restores normal tenant access for admins and allows the workspace to be used again.",
    confirmLabel: "Reactivate tenant",
    icon: "+",
    color: "var(--success)",
    borderColor: "rgba(16, 185, 129, 0.38)",
    background: "rgba(16, 185, 129, 0.12)",
    buttonBackground: "var(--success)",
    impact: [
      "Tenant admins can log in again.",
      "Existing tenant data remains available.",
      "The status badge will return to active.",
    ],
  };
}

const statCardStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "1.1rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  letterSpacing: "0.03em",
};

const statValueStyle: React.CSSProperties = {
  fontSize: "1.6rem",
  fontWeight: 800,
  color: "#fff",
};

const formLabelStyle: React.CSSProperties = {
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

const thStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-surface)",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: "0.78rem",
  padding: "0.85rem 1rem",
  textTransform: "uppercase",
  letterSpacing: 0,
};

const tdStyle: React.CSSProperties = {
  padding: "0.95rem 1rem",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
};

const actionButtonStyle: React.CSSProperties = {
  padding: "0.32rem 0.6rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "0.78rem",
  fontWeight: 700,
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
  width: "min(100%, 520px)",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
  padding: "1.25rem",
};

const modalIconStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  flex: "0 0 auto",
  borderRadius: 8,
  border: "1px solid",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
};

const tenantSummaryStyle: React.CSSProperties = {
  marginTop: "1rem",
  padding: "0.75rem 0.9rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "0.75rem",
};

const summaryLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#fff",
};

const summaryCodeStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "var(--accent-light)",
  fontFamily: "monospace",
};

const impactListStyle: React.CSSProperties = {
  margin: "1rem 0 0 0",
  paddingLeft: "1.2rem",
  color: "var(--text-secondary)",
  fontSize: "0.84rem",
};

const impactItemStyle: React.CSSProperties = {
  marginBottom: "0.35rem",
};

const dangerLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  color: "var(--text-secondary)",
};

const inlineCodeStyle: React.CSSProperties = {
  color: "var(--error)",
  fontFamily: "monospace",
};

const modalActionRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.75rem",
  marginTop: "1.25rem",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.6rem 1rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: "0.85rem",
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryDangerButtonStyle: React.CSSProperties = {
  padding: "0.6rem 1rem",
  borderRadius: 6,
  border: "none",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
  fontFamily: "inherit",
};
