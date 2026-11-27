"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  owner_email?: string;
  plan_id?: number | null;
  plan_name?: string;
  status?: string;
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
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Suspend Modal State
  const [suspendTarget, setSuspendTarget] = useState<Tenant | null>(null);
  const [suspending, setSuspending] = useState(false);

  const handleDeleteTenant = async () => {
    if (!deleteTarget || deleteSlugInput.trim() !== deleteTarget.slug) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/admin/tenants/${deleteTarget.id}`);
      setActionSuccess(`Tenant "${deleteTarget.name}" deleted successfully.`);
      setDeleteTarget(null);
      setDeleteSlugInput("");
      await loadStats();
      await loadTenants();
    } catch (err) {
      setError(errorMessage(err, "Failed to delete tenant."));
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!suspendTarget) return;
    setSuspending(true);
    setError("");
    const isSuspended =
      suspendTarget.status === "suspended" ||
      suspendTarget.subscription_status === "suspended";
    const nextStatus = isSuspended ? "active" : "suspended";

    setTenants((prev) =>
      prev.map((t) =>
        t.id === suspendTarget.id
          ? {
              ...t,
              status: nextStatus,
              subscription_status: isSuspended ? "active" : "suspended",
            }
          : t
      )
    );

    try {
      await api.patch(`/api/admin/tenants/${suspendTarget.id}`, {
        status: nextStatus,
        subscription_status: nextStatus,
      });
      setActionSuccess(
        `Tenant "${suspendTarget.name}" ${
          isSuspended ? "unsuspended" : "suspended"
        } successfully.`
      );
      setSuspendTarget(null);
      await loadStats();
      await loadTenants();
    } catch (err) {
      setError(errorMessage(err, `Failed to ${isSuspended ? "unsuspend" : "suspend"} tenant.`));
      await loadTenants();
    } finally {
      setSuspending(false);
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

  // Fit the list to the screen: as many rows as fit, the rest via Next/Prev.
  useEffect(() => {
    const fit = () => {
      const ROW = 57; // compact row height
      const CHROME = 470; // header + cards + toolbar + table head + pagination + padding
      const rows = Math.max(3, Math.min(20, Math.floor((window.innerHeight - CHROME) / ROW)));
      setPageSize((prev) => {
        if (prev !== rows) setPage(1);
        return rows;
      });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

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


  return (
    <div
      style={{
        width: "100%",
        padding: "1.5rem 2rem",
        boxSizing: "border-box",
        maxWidth: 1400,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.1rem",
        color: "var(--text-primary)",
      }}
    >
      <style>{`
        .tn-row { transition: background .15s; }
        .tn-row:hover { background: var(--bg-surface); }
        .tn-row:hover .tn-act { opacity: 1; }

        .tn-btn { font-family: inherit; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
        .tn-ghost:hover { background: var(--bg-hover); }
        .tn-danger:hover { background: color-mix(in srgb, #ef4444 10%, transparent); border-color: color-mix(in srgb, #ef4444 45%, transparent); }
        .tn-stat { transition: border-color .15s, box-shadow .15s, transform .15s; }
        .tn-stat:hover { transform: translateY(-1px); box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 22px rgba(15,23,42,.06); }
        .tn-search:focus-within { border-color: var(--text-muted); }
        @media (max-width: 760px) { .tn-hide-sm { display: none; } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.025em" }}>
            Tenants
          </h1>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
            Every customer workspace on the platform, with its plan and status.
          </p>
        </div>
      </div>

      {/* Action Alerts */}
      {(actionSuccess || error) && (
        <div
          style={{
            padding: "0.8rem 1rem",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 1px 2px rgba(15,23,42,.04)",
          }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: error ? "#ef4444" : "#10b981" }} />
          <span style={{ flex: 1 }}>{error || actionSuccess}</span>
          <button
            className="tn-btn tn-ghost"
            onClick={() => (error ? setError("") : setActionSuccess(""))}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", color: "var(--text-muted)", borderRadius: 6, padding: "2px 6px", fontSize: "0.9rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Cards (click to filter) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.9rem" }}>
        {[
          { key: "all", label: "All tenants", value: stats.total, dot: "var(--ink)", hint: "Total workspaces" },
          { key: "active", label: "Paying", value: stats.active, dot: "#10b981", hint: "Active subscriptions" },
          { key: "trial", label: "In trial", value: stats.trial, dot: "#f59e0b", hint: "Free trial running" },
          { key: "expired", label: "Expired or suspended", value: stats.expired, dot: "#ef4444", hint: "Need attention" },
        ].map((c) => {
          const on = filterStatus === c.key;
          const pct = stats.total > 0 && c.key !== "all" ? Math.round((c.value / stats.total) * 100) : null;
          return (
            <button
              key={c.key}
              className="tn-btn tn-stat"
              onClick={() => {
                setFilterStatus(c.key);
                setPage(1);
              }}
              style={{
                textAlign: "left",
                background: "var(--bg-card)",
                border: on ? "1px solid var(--text-primary)" : "1px solid var(--border)",
                borderRadius: 16,
                padding: "0.85rem 1.1rem",
                boxShadow: "0 1px 2px rgba(15,23,42,.04)",
                color: "var(--text-primary)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: c.key === "all" ? "var(--text-primary)" : c.dot }} />
                {c.label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: "0.55rem" }}>
                <span style={{ fontSize: "1.9rem", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{c.value}</span>
                {pct !== null && <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{pct}%</span>}
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>{c.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Table card with toolbar */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.04)",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            padding: "0.9rem 1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <label
            className="tn-search"
            style={{
              flex: 1,
              minWidth: 200,
              maxWidth: 420,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 0.8rem",
              height: 38,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              transition: "border-color .15s",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, slug or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: "0.86rem", fontFamily: "inherit" }}
            />
            {search && (
              <button className="tn-btn" onClick={() => setSearch("")} aria-label="Clear search" style={{ border: "none", background: "none", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                ✕
              </button>
            )}
          </label>

          <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--bg-surface)", border: "1px solid var(--border)", maxWidth: "100%", overflowX: "auto" }}>
            {["all", "active", "trial", "expired", "suspended"].map((status) => {
              const isActive = filterStatus === status;
              return (
                <button
                  key={status}
                  className="tn-btn"
                  onClick={() => {
                    setFilterStatus(status);
                    setPage(1);
                  }}
                  style={{
                    padding: "0.35rem 0.8rem",
                    fontSize: "0.8rem",
                    fontWeight: isActive ? 650 : 500,
                    borderRadius: 7,
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                    border: "none",
                    backgroundColor: isActive ? "var(--bg-card)" : "transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: isActive ? "0 1px 2px rgba(15,23,42,.08), 0 0 0 1px var(--border)" : "none",
                  }}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 44, borderRadius: 10, background: "var(--bg-surface)", opacity: 1 - i * 0.25 }} />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: "3.5rem 1rem", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, margin: "0 auto 0.8rem", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </div>
            <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>No tenants found</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>Try another search or filter.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>Tenant</th>
                  <th className="tn-hide-sm" style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>Owner</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>Plan</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>Status</th>
                  <th className="tn-hide-sm" style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>Joined</th>
                  <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600, textAlign: "right" }}>
                    <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const isSuspended = t.status === "suspended" || t.subscription_status === "suspended";
                  const statusKey = isSuspended
                    ? "suspended"
                    : t.subscription_status === "expired" || t.status === "expired"
                    ? "expired"
                    : t.subscription_status === "active"
                    ? "active"
                    : "trial";
                  const tone =
                    statusKey === "active"
                      ? { dot: "#10b981", text: "color-mix(in srgb, #10b981 70%, var(--text-primary))", label: "Active" }
                      : statusKey === "trial"
                      ? { dot: "#f59e0b", text: "color-mix(in srgb, #d97706 75%, var(--text-primary))", label: "Trial" }
                      : statusKey === "suspended"
                      ? { dot: "#64748b", text: "var(--text-secondary)", label: "Suspended" }
                      : { dot: "#ef4444", text: "color-mix(in srgb, #ef4444 75%, var(--text-primary))", label: "Expired" };
                  const initials =
                    (t.name || t.slug || "?")
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join("") || "?";
                  const joined = t.created_at
                    ? new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "—";

                  return (
                    <tr key={t.id} className="tn-row" style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.55rem 1.25rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <span
                            aria-hidden
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 10,
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {initials}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {t.name}
                            </div>
                            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                              {t.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="tn-hide-sm" style={{ padding: "0.55rem 1.25rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        {t.owner_email || <span style={{ color: "var(--text-muted)" }}>No owner</span>}
                      </td>
                      <td style={{ padding: "0.55rem 1.25rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.18rem 0.6rem",
                            borderRadius: 7,
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(t.plan_name || (statusKey === "trial" ? "Trial Plan" : "Free Plan")).replace(/\s*Plan$/i, "")}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 1.25rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "0.2rem 0.6rem 0.2rem 0.5rem",
                            borderRadius: 999,
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            color: tone.text,
                            background: `color-mix(in srgb, ${tone.dot} 11%, transparent)`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: tone.dot }} />
                          {tone.label}
                        </span>
                      </td>
                      <td className="tn-hide-sm" style={{ padding: "0.55rem 1.25rem", color: "var(--text-muted)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                        {joined}
                      </td>
                      <td style={{ padding: "0.55rem 1.25rem", textAlign: "right" }}>
                        <div className="tn-act" style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          <button
                            className="tn-btn tn-ghost"
                            onClick={() => setSuspendTarget(t)}
                            style={{
                              padding: "0.38rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--bg-card)",
                              color: "var(--text-primary)",
                            }}
                          >
                            {statusKey === "suspended" ? "Unsuspend" : "Suspend"}
                          </button>
                          <button
                            className="tn-btn tn-danger"
                            onClick={() => {
                              setDeleteTarget(t);
                              setDeleteSlugInput("");
                            }}
                            aria-label={`Delete ${t.name}`}
                            title="Delete tenant"
                            style={{
                              width: 32,
                              height: 31,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--bg-card)",
                              color: "#dc2626",
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.total_items > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              padding: "0.8rem 1.25rem",
              borderTop: "1px solid var(--border)",
              fontSize: "0.82rem",
              color: "var(--text-muted)",
            }}
          >
            <div>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {Math.min((page - 1) * pageSize + 1, pagination.total_items)}–{Math.min(page * pageSize, pagination.total_items)}
              </span>{" "}
              of <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{pagination.total_items}</span> tenants
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  className="tn-btn tn-ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    opacity: page <= 1 ? 0.35 : 1,
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  ‹
                </button>
                {getPagePills(page, pagination.total_pages).map((p, idx) =>
                  typeof p === "number" ? (
                    <button
                      key={idx}
                      className="tn-btn"
                      onClick={() => setPage(p)}
                      style={{
                        minWidth: 30,
                        height: 30,
                        borderRadius: 8,
                        border: "none",
                        backgroundColor: p === page ? "var(--text-primary)" : "transparent",
                        color: p === page ? "var(--bg-card)" : "var(--text-secondary)",
                        fontWeight: p === page ? 650 : 500,
                        fontSize: "0.8rem",
                      }}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={idx} style={{ padding: "0 0.25rem" }}>
                      …
                    </span>
                  )
                )}
                <button
                  className="tn-btn tn-ghost"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  aria-label="Next page"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    opacity: page >= pagination.total_pages ? 0.35 : 1,
                    cursor: page >= pagination.total_pages ? "not-allowed" : "pointer",
                  }}
                >
                  ›
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
            backgroundColor: "var(--scrim)",
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
            backgroundColor: "var(--scrim)",
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

            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                To confirm deletion, type <span style={{ color: "#ef4444", fontWeight: 700, fontFamily: "monospace" }}>{deleteTarget.slug}</span> below:
              </label>
              <input
                type="text"
                autoFocus
                placeholder={deleteTarget.slug}
                value={deleteSlugInput}
                onChange={(e) => setDeleteSlugInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: "0.875rem",
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
            </div>

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
                disabled={deleting || deleteSlugInput.trim() !== deleteTarget.slug}
                onClick={handleDeleteTenant}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: deleting || deleteSlugInput.trim() !== deleteTarget.slug ? "not-allowed" : "pointer",
                  opacity: deleting || deleteSlugInput.trim() !== deleteTarget.slug ? 0.45 : 1,
                  fontSize: "0.85rem",
                  transition: "opacity 0.15s ease",
                }}
              >
                {deleting ? "Deleting..." : "Delete Tenant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend / Unsuspend Confirmation Modal */}
      {suspendTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            backgroundColor: "var(--scrim)",
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
                    backgroundColor:
                      suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended"
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(234, 88, 12, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color:
                      suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended"
                        ? "#10b981"
                        : "#ea580c",
                    fontSize: "1.1rem",
                  }}
                >
                  {suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended" ? "▶" : "⏸"}
                </div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  {suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended"
                    ? "Unsuspend Tenant"
                    : "Suspend Tenant"}
                </h2>
              </div>
              <button
                disabled={suspending}
                onClick={() => setSuspendTarget(null)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended" ? (
                <>
                  Are you sure you want to unsuspend tenant{" "}
                  <strong style={{ color: "var(--text-primary)" }}>{suspendTarget.name}</strong> (
                  <code style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{suspendTarget.slug}</code>)?
                  This will restore workspace access and reactivate their chatbot.
                </>
              ) : (
                <>
                  Are you sure you want to suspend tenant{" "}
                  <strong style={{ color: "var(--text-primary)" }}>{suspendTarget.name}</strong> (
                  <code style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{suspendTarget.slug}</code>)?
                  This will freeze workspace access and pause their live AI widget.
                </>
              )}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                disabled={suspending}
                onClick={() => setSuspendTarget(null)}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  cursor: suspending ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={suspending}
                onClick={handleConfirmSuspend}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor:
                    suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended"
                      ? "var(--accent)"
                      : "#ea580c",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: suspending ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                }}
              >
                {suspending
                  ? "Updating..."
                  : suspendTarget.status === "suspended" || suspendTarget.subscription_status === "suspended"
                  ? "Unsuspend Tenant"
                  : "Suspend Tenant"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
