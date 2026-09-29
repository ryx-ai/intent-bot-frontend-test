"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  owner_email?: string;
  plan_name?: string;
  subscription_status?: "active" | "trial" | "expired" | "suspended" | string;
  created_at?: string;
  max_kb_files?: number;
  max_monthly_messages?: number;
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
  total: number;
  active: number;
  trial: number;
  expired: number;
}

interface StatsResponse {
  total?: number;
  total_workspaces?: number;
  active?: number;
  active_tenants?: number;
  trial?: number;
  expired?: number;
  suspended?: number;
}

interface TenantsResponse {
  tenants?: Tenant[];
  items?: Tenant[];
  pagination?: PaginationMeta;
}

function getPagePills(current: number, total: number): (number | string)[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, "...", total];
  if (current >= total - 2) return [1, "...", total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return "Network error. Check connection.";
  if (err.status === 401) return "Please log in again as Super Admin.";
  if (err.status === 403) return "Access denied. Super Admin role required.";
  return err.detail || fallback;
}

export default function TenantsAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Server-side Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    page_size: 10,
    total_items: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });

  // KPI Metrics (Server-backed so totals never break with pagination)
  const [stats, setStats] = useState<TenantStats>({ total: 0, active: 0, trial: 0, expired: 0 });

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newPlan, setNewPlan] = useState("Starter Plan");
  const [creating, setCreating] = useState(false);
  const [actionSuccess, setActionSuccess] = useState("");

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteTenant = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/admin/tenants/${deleteTarget.id}`);
      setActionSuccess(`Tenant "${deleteTarget.name}" deleted successfully.`);
      setDeleteTarget(null);
      await loadStats();
      await loadTenants();
    } catch (err) {
      setError(errorMessage(err, "Failed to delete tenant."));
    } finally {
      setDeleting(false);
    }
  };

  // Debounce search by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load KPI Stats
  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<StatsResponse>("/api/admin/tenants/stats");
      if (res) {
        setStats({
          total: res.total ?? res.total_workspaces ?? 0,
          active: res.active ?? res.active_tenants ?? 0,
          trial: res.trial ?? 0,
          expired: res.expired ?? res.suspended ?? 0,
        });
      }
    } catch {
      // Retain existing
    }
  }, []);

  // Load Paginated Tenants from Backend
  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());
      if (filterStatus !== "all") params.append("status", filterStatus);

      const res = await api.get<TenantsResponse | Tenant[]>(`/api/admin/tenants?${params.toString()}`);
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.tenants)
        ? res.tenants
        : Array.isArray(res?.items)
        ? res.items
        : [];
      setTenants(list);

      if (!Array.isArray(res) && res?.pagination) {
        setPagination(res.pagination);
      } else {
        setPagination({
          page,
          page_size: pageSize,
          total_items: list.length,
          total_pages: Math.max(1, Math.ceil(list.length / pageSize)),
          has_next: false,
          has_prev: page > 1,
        });
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to load tenants."));
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, filterStatus]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName || !newTenantSlug) return;
    setCreating(true);
    setError("");

    try {
      await api.post<Tenant>("/api/admin/tenants", {
        name: newTenantName,
        slug: newTenantSlug,
        owner_email: newOwnerEmail,
        plan_name: newPlan,
      });

      await loadStats();
      await loadTenants();
      setActionSuccess(`Tenant "${newTenantName}" created successfully!`);
      setIsCreateOpen(false);
      setNewTenantName("");
      setNewTenantSlug("");
      setNewOwnerEmail("");
    } catch (err) {
      setError(errorMessage(err, "Failed to create tenant."));
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (id: number, currentStatus?: string) => {
    const nextStatus = currentStatus === "suspended" ? "active" : "suspended";
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, subscription_status: nextStatus } : t))
    );
    try {
      await api.patch(`/api/admin/tenants/${id}`, {
        status: nextStatus,
        subscription_status: nextStatus,
      });
      await loadStats();
    } catch {
      await loadTenants();
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
            Tenant Management
          </h1>
          <p
            style={{
              margin: "0.35rem 0 0 0",
              fontSize: "0.9rem",
              color: "var(--text-muted)",
            }}
          >
            Super Admin dashboard for controlling client organizations, system access, and tenant status.
          </p>
        </div>
        {/* <button
          onClick={() => setIsCreateOpen(true)}
          style={{
            background: "var(--accent)",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "0.65rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span>+ Create New Tenant</span>
        </button> */}
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

      {/* Metrics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
            Total Tenants
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "0.25rem" }}>
            {stats.total}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#10b981", letterSpacing: "0.05em" }}>
            Active Subscriptions
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#10b981", marginTop: "0.25rem" }}>
            {stats.active}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#d97706", letterSpacing: "0.05em" }}>
            In Trial
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#d97706", marginTop: "0.25rem" }}>
            {stats.trial}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#ef4444", letterSpacing: "0.05em" }}>
            Expired / Suspended
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#ef4444", marginTop: "0.25rem" }}>
            {stats.expired}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          backgroundColor: "var(--bg-card)",
          padding: "0.75rem 1rem",
          borderRadius: 12,
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search tenant name, slug, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "0.6rem 0.85rem",
              fontSize: "0.875rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {["all", "active", "trial", "expired", "suspended"].map((status) => {
            const isActive = filterStatus === status;
            return (
              <button
                key={status}
                onClick={() => {
                  setFilterStatus(status);
                  setPage(1);
                }}
                style={{
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  borderRadius: 6,
                  textTransform: "capitalize",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: isActive ? "var(--accent)" : "var(--border)",
                  color: isActive ? "#ffffff" : "var(--text-secondary)",
                  transition: "all 0.2s",
                }}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tenants Table */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            Loading tenants...
          </div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            No tenants found matching your filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--bg-sidebar)",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Organization</th>
                  <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Slug</th>
                  <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Owner Contact</th>
                  <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Plan Tier</th>
                  <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s",
                    }}
                  >
                    <td style={{ padding: "1rem 1.25rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {t.name}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {t.slug}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", color: "var(--text-secondary)" }}>
                      {t.owner_email || "N/A"}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", fontWeight: 500, color: "var(--text-primary)" }}>
                      {t.plan_name || "Starter Plan"}
                    </td>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.65rem",
                          borderRadius: 20,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          textTransform: "capitalize",
                          backgroundColor:
                            t.subscription_status === "active"
                              ? "#ecfdf5"
                              : t.subscription_status === "trial"
                              ? "#fffbeb"
                              : "#fef2f2",
                          color:
                            t.subscription_status === "active"
                              ? "#047857"
                              : t.subscription_status === "trial"
                              ? "#b45309"
                              : "#b91c1c",
                        }}
                      >
                        {t.subscription_status || "active"}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => toggleStatus(t.id, t.subscription_status)}
                          style={{
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          {t.subscription_status === "suspended" ? "Unsuspend" : "Suspend"}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          style={{
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            borderRadius: 6,
                            border: "1px solid #ef4444",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            color: "#ef4444",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {!loading && pagination.total_items > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              padding: "0.85rem 1.25rem",
              borderTop: "1px solid var(--border)",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            <div>
              Showing{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {Math.min((page - 1) * pageSize + 1, pagination.total_items)}
              </span>{" "}
              to{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {Math.min(page * pageSize, pagination.total_items)}
              </span>{" "}
              of{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {pagination.total_items}
              </span>{" "}
              organizations
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              {/* Per Page Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {[5, 10, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    backgroundColor: page <= 1 ? "transparent" : "var(--bg)",
                    color: page <= 1 ? "var(--text-muted)" : "var(--text-primary)",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    opacity: page <= 1 ? 0.4 : 1,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  Prev
                </button>

                {getPagePills(page, pagination.total_pages).map((p, idx) =>
                  typeof p === "number" ? (
                    <button
                      key={idx}
                      onClick={() => setPage(p)}
                      style={{
                        minWidth: 32,
                        height: 30,
                        borderRadius: 6,
                        border: "none",
                        backgroundColor: p === page ? "var(--accent)" : "transparent",
                        color: p === page ? "#ffffff" : "var(--text-primary)",
                        fontWeight: p === page ? 700 : 500,
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={idx} style={{ padding: "0 0.3rem", color: "var(--text-muted)" }}>
                      ...
                    </span>
                  )
                )}

                <button
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    backgroundColor: page >= pagination.total_pages ? "transparent" : "var(--bg)",
                    color: page >= pagination.total_pages ? "var(--text-muted)" : "var(--text-primary)",
                    cursor: page >= pagination.total_pages ? "not-allowed" : "pointer",
                    opacity: page >= pagination.total_pages ? 0.4 : 1,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
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
              maxWidth: 460,
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Create New Tenant
              </h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Acme Corp"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Slug (Workspace ID) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="acme"
                  value={newTenantSlug}
                  onChange={(e) => setNewTenantSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Owner / Admin Contact Email
                </label>
                <input
                  type="email"
                  placeholder="admin@acme.com"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Initial Subscription Plan
                </label>
                <select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                >
                  <option value="Starter Plan">Starter Plan (Trial)</option>
                  <option value="Pro Plan">Pro Plan</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "var(--accent)",
                    color: "#ffffff",
                    fontWeight: 600,
                    cursor: creating ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  {creating ? "Creating..." : "Save Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
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
              maxWidth: 440,
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ef4444",
                    fontSize: "1.1rem",
                  }}
                >
                  ⚠️
                </div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Delete Tenant
                </h2>
              </div>
              <button
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Are you sure you want to permanently delete tenant{" "}
              <strong style={{ color: "var(--text-primary)" }}>{deleteTarget.name}</strong> (
              <code style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{deleteTarget.slug}</code>)?
              This action cannot be undone and will delete all associated data.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteTenant}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                }}
              >
                {deleting ? "Deleting..." : "Delete Tenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
