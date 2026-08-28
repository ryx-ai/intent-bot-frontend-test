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

interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface TenantStats {
  total_workspaces: number;
  active_tenants: number;
  suspended: number;
  assigned_plans: number;
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
  const [tableLoading, setTableLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<number | null>(null);
  const [tenantActionId, setTenantActionId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingTenantAction | null>(null);
  const [deleteConfirmationSlug, setDeleteConfirmationSlug] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");

  // Pagination & Filter States
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [stats, setStats] = useState<TenantStats>({
    total_workspaces: 0,
    active_tenants: 0,
    suspended: 0,
    assigned_plans: 0,
  });
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    page_size: 10,
    total_items: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });

  // Form State
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

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get<TenantStats>("/api/admin/tenants/stats");
      setStats(data);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadTenants = useCallback(
    async (
      targetPage = page,
      targetPageSize = pageSize,
      targetSearch = searchQuery,
      targetStatus = statusFilter
    ) => {
      setTableLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          page_size: String(targetPageSize),
          sort_by: "created_at",
          sort_order: "desc",
        });
        if (targetSearch.trim()) params.append("search", targetSearch.trim());
        if (targetStatus) params.append("status", targetStatus);

        const data = await api.get<{
          items?: Tenant[];
          tenants?: Tenant[];
          pagination?: PaginationMeta;
        }>(`/api/admin/tenants?${params.toString()}`);

        setTenants(data.items || data.tenants || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } catch (err) {
        setError(errorMessage(err, "Failed to load tenants."));
      } finally {
        setTableLoading(false);
      }
    },
    [page, pageSize, searchQuery, statusFilter]
  );

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
          await Promise.all([loadTenants(1, 10, "", ""), loadStats(), loadPlans()]);
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
  }, [loadPlans, loadStats, loadTenants]);

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
      await Promise.all([loadTenants(1, pageSize, searchQuery, statusFilter), loadStats()]);
      setPage(1);
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
      await loadStats();
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
        setSuccess(`Deleted workspace tenant "${deleted.slug}".`);
        await Promise.all([loadTenants(page, pageSize, searchQuery, statusFilter), loadStats()]);
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
        await loadStats();
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
          <span style={statValueStyle}>{stats.total_workspaces}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Active Tenants</span>
          <span style={{ ...statValueStyle, color: "#10b981" }}>{stats.active_tenants}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Suspended</span>
          <span style={{ ...statValueStyle, color: "#f59e0b" }}>{stats.suspended}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Assigned Plans</span>
          <span style={{ ...statValueStyle, color: "#a78bfa" }}>{stats.assigned_plans}</span>
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
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top Bar: Title & Refresh */}
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
              Tenants ({pagination.total_items})
            </h2>
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                Promise.all([
                  loadTenants(page, pageSize, searchQuery, statusFilter),
                  loadStats(),
                  loadPlans(),
                ]).catch((err) =>
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

          {/* Search & Filter Bar */}
          <div
            style={{
              padding: "0.75rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              backgroundColor: "rgba(255, 255, 255, 0.01)",
            }}
          >
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="text"
                placeholder="Search by company name or slug..."
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  setPage(1);
                  loadTenants(1, pageSize, val, statusFilter);
                }}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.75rem",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "#fff",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                setStatusFilter(val);
                setPage(1);
                loadTenants(1, pageSize, searchQuery, val);
              }}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                fontSize: "0.85rem",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", flex: 1, opacity: tableLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
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
                      {searchQuery || statusFilter ? "No tenants match your filters." : "No tenants onboarded yet."}
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

          {/* Table Footer Pagination */}
          <div
            style={{
              padding: "0.85rem 1.25rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "rgba(255, 255, 255, 0.01)",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            {/* Left: Summary & Page Size */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Showing{" "}
                {pagination.total_items === 0
                  ? 0
                  : (pagination.page - 1) * pagination.page_size + 1}
                –{Math.min(pagination.page * pagination.page_size, pagination.total_items)} of{" "}
                {pagination.total_items} tenants
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value);
                  setPageSize(newSize);
                  setPage(1);
                  loadTenants(1, newSize, searchQuery, statusFilter);
                }}
                style={{
                  padding: "0.25rem 0.5rem",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  fontSize: "0.8rem",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            {/* Right: Page Navigation */}
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <button
                type="button"
                disabled={!pagination.has_prev || tableLoading}
                onClick={() => {
                  const prev = Math.max(1, page - 1);
                  setPage(prev);
                  loadTenants(prev, pageSize, searchQuery, statusFilter);
                }}
                style={{
                  padding: "0.35rem 0.7rem",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: pagination.has_prev ? "var(--text-secondary)" : "var(--text-muted)",
                  cursor: pagination.has_prev && !tableLoading ? "pointer" : "not-allowed",
                  fontSize: "0.82rem",
                  opacity: pagination.has_prev ? 1 : 0.45,
                }}
              >
                Prev
              </button>

              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", padding: "0 0.4rem" }}>
                Page {pagination.page} of {pagination.total_pages || 1}
              </span>

              <button
                type="button"
                disabled={!pagination.has_next || tableLoading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  loadTenants(next, pageSize, searchQuery, statusFilter);
                }}
                style={{
                  padding: "0.35rem 0.7rem",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: pagination.has_next ? "var(--text-secondary)" : "var(--text-muted)",
                  cursor: pagination.has_next && !tableLoading ? "pointer" : "not-allowed",
                  fontSize: "0.82rem",
                  opacity: pagination.has_next ? 1 : 0.45,
                }}
              >
                Next
              </button>
            </div>
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
              {pendingActionConfig.impacts.map((impact) => (
                <li key={impact} style={impactItemStyle}>
                  {impact}
                </li>
              ))}
            </ul>

            {pendingAction.kind === "delete" && (
              <label style={{ display: "block", marginTop: "1rem" }}>
                <span style={dangerLabelStyle}>
                  Type <code style={inlineCodeStyle}>{pendingAction.tenant.slug}</code> to confirm:
                </span>
                <input
                  value={deleteConfirmationSlug}
                  onChange={(e) => setDeleteConfirmationSlug(e.target.value)}
                  placeholder={pendingAction.tenant.slug}
                  disabled={actionInProgress}
                  style={{
                    ...inputStyle,
                    borderColor: "rgba(239, 68, 68, 0.4)",
                    marginTop: "0.45rem",
                  }}
                />
              </label>
            )}

            <div style={modalActionRowStyle}>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={actionInProgress}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTenantAction}
                disabled={
                  actionInProgress ||
                  (pendingAction.kind === "delete" &&
                    deleteConfirmationSlug.trim() !== pendingAction.tenant.slug)
                }
                style={{
                  ...primaryDangerButtonStyle,
                  background: pendingActionConfig.primaryButtonBackground,
                  opacity:
                    actionInProgress ||
                    (pendingAction.kind === "delete" &&
                      deleteConfirmationSlug.trim() !== pendingAction.tenant.slug)
                      ? 0.5
                      : 1,
                  cursor:
                    actionInProgress ||
                    (pendingAction.kind === "delete" &&
                      deleteConfirmationSlug.trim() !== pendingAction.tenant.slug)
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {actionInProgress
                  ? "Working..."
                  : pendingActionConfig.confirmButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTenantActionConfig(action: PendingTenantAction) {
  if (action.kind === "delete") {
    return {
      eyebrow: "Danger zone",
      title: `Delete workspace "${action.tenant.name}"?`,
      description:
        "This permanently removes the tenant, all associated workspace data, and all tenant admins.",
      icon: "✕",
      color: "var(--error)",
      borderColor: "rgba(239, 68, 68, 0.35)",
      background: "rgba(239, 68, 68, 0.12)",
      primaryButtonBackground: "var(--error)",
      confirmButtonLabel: "Permanently delete tenant",
      impacts: [
        "All customer accounts and visual mappings will be removed.",
        "The tenant data directory on disk will be deleted.",
        "This action cannot be undone.",
      ],
    };
  }

  if (action.kind === "suspend") {
    return {
      eyebrow: "Tenant state",
      title: `Suspend workspace "${action.tenant.name}"?`,
      description:
        "Suspending a tenant prevents all tenant administrators and bot users from signing in or executing requests.",
      icon: "⏸",
      color: "var(--warning)",
      borderColor: "rgba(245, 158, 11, 0.35)",
      background: "rgba(245, 158, 11, 0.12)",
      primaryButtonBackground: "var(--warning)",
      confirmButtonLabel: "Suspend tenant",
      impacts: [
        "Tenant users cannot log into the dashboard.",
        "Existing workspace configurations remain intact.",
        "You can reactivate this workspace at any time.",
      ],
    };
  }

  return {
    eyebrow: "Tenant state",
    title: `Reactivate workspace "${action.tenant.name}"?`,
    description: "Reactivating the tenant will restore access for administrators and users.",
    icon: "▶",
    color: "var(--success)",
    borderColor: "rgba(16, 185, 129, 0.35)",
    background: "rgba(16, 185, 129, 0.12)",
    primaryButtonBackground: "var(--success)",
    confirmButtonLabel: "Reactivate tenant",
    impacts: [
      "Tenant admins will be able to log in immediately.",
      "Visual mappings and knowledge will be available.",
    ],
  };
}

const statCardStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "1.2rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const statValueStyle: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "#fff",
};

const formLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  color: "var(--text-secondary)",
  marginBottom: "0.4rem",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "#fff",
  fontFamily: "inherit",
  fontSize: "0.88rem",
  outline: "none",
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  fontSize: "0.75rem",
  color: "var(--text-muted)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "0.9rem 1rem",
  fontSize: "0.88rem",
};

const actionButtonStyle: React.CSSProperties = {
  padding: "0.35rem 0.7rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  fontSize: "0.78rem",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "1.5rem",
  boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
};

const modalIconStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  border: "1px solid",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.1rem",
  fontWeight: 700,
  flexShrink: 0,
};

const tenantSummaryStyle: React.CSSProperties = {
  margin: "1.25rem 0",
  padding: "0.85rem 1rem",
  borderRadius: 8,
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
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
