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
  created_at: string;
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
  return date.toLocaleString();
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const isSuspended = status === "suspended";
  return {
    display: "inline-block",
    padding: "0.2rem 0.5rem",
    borderRadius: 4,
    background: isSuspended
      ? "rgba(245, 158, 11, 0.12)"
      : "rgba(16, 185, 129, 0.12)",
    color: isSuspended ? "var(--warning)" : "var(--success)",
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "capitalize",
  };
}

export default function TenantManagementPage() {
  const [role, setRole] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tenantActionId, setTenantActionId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
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
      return "Admin password must be 8 to 200 characters and not blank.";
    }
    return "";
  }, [adminEmail, adminPassword, name, slug]);

  const loadTenants = useCallback(async () => {
    const data = await api.get<{ tenants: Tenant[] }>("/api/admin/tenants");
    setTenants(data.tenants || []);
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
          await loadTenants();
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
  }, [loadTenants]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const tenant = await api.post<Tenant>("/api/admin/tenants", {
        slug,
        name: name.trim(),
      });

      const admin = await api.post<TenantAdmin>(
        `/api/admin/tenants/${tenant.id}/admins`,
        {
          email: adminEmail.trim(),
          password: adminPassword,
        }
      );

      setSuccess(
        `Created ${tenant.name} and admin ${admin.email}. The admin can now log in normally.`
      );
      setName("");
      setSlug("");
      setAdminEmail("");
      setAdminPassword("");
      await loadTenants();
    } catch (err) {
      setError(errorMessage(err, "Tenant onboarding failed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(tenant: Tenant) {
    const nextStatus = tenant.status === "active" ? "suspended" : "active";
    const actionLabel = nextStatus === "suspended" ? "suspend" : "reactivate";
    const ok = window.confirm(
      `Are you sure you want to ${actionLabel} ${tenant.name}?`
    );
    if (!ok) return;

    setTenantActionId(tenant.id);
    setError("");
    setSuccess("");
    try {
      const updated = await api.patch<Tenant>(`/api/admin/tenants/${tenant.id}`, {
        status: nextStatus,
      });
      setTenants((current) =>
        current.map((item) => (item.id === tenant.id ? updated : item))
      );
      setSuccess(
        `${tenant.name} is now ${nextStatus}. ${
          nextStatus === "suspended"
            ? "Tenant admins cannot log in until reactivated."
            : "Tenant admins can log in again."
        }`
      );
    } catch (err) {
      setError(errorMessage(err, `Failed to ${actionLabel} tenant.`));
    } finally {
      setTenantActionId(null);
    }
  }

  async function handleDeleteTenant(tenant: Tenant) {
    const blockedSlug = tenant.slug === "ryxai";
    if (blockedSlug) {
      setError("The default platform tenant cannot be deleted from this UI.");
      setSuccess("");
      return;
    }

    const ok = window.confirm(
      `Hard delete ${tenant.name}?\n\nThis removes the tenant, its admins, tenant data, and filesystem folder. This cannot be undone.`
    );
    if (!ok) return;

    setTenantActionId(tenant.id);
    setError("");
    setSuccess("");
    try {
      const deleted = await api.delete<DeleteTenantResponse>(
        `/api/admin/tenants/${tenant.id}`
      );
      setTenants((current) => current.filter((item) => item.id !== tenant.id));
      setSuccess(`Deleted tenant ${deleted.slug}.`);
    } catch (err) {
      setError(errorMessage(err, "Failed to delete tenant."));
    } finally {
      setTenantActionId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading tenant management...</p>
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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
          Tenant Management
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Create isolated customer workspaces and seed their first admin account.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 440px) 1fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "1.5rem",
          }}
        >
          <h2 style={{ margin: "0 0 1.25rem 0", fontSize: "1rem", color: "#fff" }}>
            Create Tenant
          </h2>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={{ display: "block", marginBottom: 8, fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Company name
            </span>
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
            <span style={{ display: "block", marginBottom: 8, fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Tenant slug
            </span>
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
            <span style={{ display: "block", marginBottom: 8, fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Tenant admin email
            </span>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@acme.com"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={{ display: "block", marginBottom: 8, fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Tenant admin password
            </span>
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

          {error && (
            <div style={{ marginBottom: "1rem", color: "var(--error)", fontSize: "0.85rem" }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ marginBottom: "1rem", color: "var(--success)", fontSize: "0.85rem" }}>
              {success}
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
            {submitting ? "Creating..." : "Create tenant and admin"}
          </button>
        </form>

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
            <h2 style={{ margin: 0, fontSize: "1rem", color: "#fff" }}>Tenants</h2>
            <button
              type="button"
              onClick={() => loadTenants().catch((err) => setError(errorMessage(err, "Failed to refresh tenants.")))}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Refresh
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Slug</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "2rem", color: "var(--text-muted)", textAlign: "center" }}>
                    No tenants yet.
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>{tenant.name}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent-light)" }}>
                      {tenant.slug}
                    </td>
                    <td style={tdStyle}>
                      <span style={statusBadgeStyle(tenant.status)}>
                        {tenant.status}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatDate(tenant.created_at)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(tenant)}
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
                        onClick={() => handleDeleteTenant(tenant)}
                        disabled={tenantActionId === tenant.id || tenant.slug === "ryxai"}
                        title={
                          tenant.slug === "ryxai"
                            ? "Default platform tenant cannot be deleted here"
                            : "Hard delete tenant"
                        }
                        style={{
                          ...actionButtonStyle,
                          marginLeft: "0.5rem",
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--border)",
  padding: "0.8rem 0.9rem",
  fontSize: "0.92rem",
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
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "0.95rem 1rem",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
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
};
