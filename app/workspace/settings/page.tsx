'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface UserInfo {
  email: string;
  name: string;
  picture?: string;
  auth_provider?: string;
  role?: string;
  tenant?: {
    id: number;
    slug: string;
    name: string;
  };
}

interface UpdateTenantResponse {
  status: string;
  tenant: {
    id: number;
    slug: string;
    name: string;
  };
}

const SLUG_RE = /^[a-z0-9_-]{2,50}$/;

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return 'Network error. Check your connection.';
  if (err.status === 401) return 'Please log in again.';
  if (err.status === 409) return 'That tenant slug is already in use. Please choose another.';
  if (err.status === 400) return err.detail || fallback;
  if (err.status >= 500) return 'Server error. Please try again later.';
  return fallback;
}

export default function WorkspaceSettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const loadUserData = useCallback(async () => {
    try {
      const data = await api.get<UserInfo>('/api/auth/me');
      setUser(data);
      if (data.tenant) {
        setCompanyName(data.tenant.name || '');
        setTenantSlug(data.tenant.slug || '');
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to load workspace settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const slugValidationError = useMemo(() => {
    if (!tenantSlug) return 'Tenant slug cannot be empty.';
    if (!SLUG_RE.test(tenantSlug)) {
      return 'Slug must be 2-50 characters using lowercase letters, numbers, hyphens, and underscores only.';
    }
    return '';
  }, [tenantSlug]);

  const isFormChanged = useMemo(() => {
    if (!user?.tenant) return false;
    return (
      companyName.trim() !== user.tenant.name ||
      tenantSlug.trim().toLowerCase() !== user.tenant.slug
    );
  }, [companyName, tenantSlug, user?.tenant]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = companyName.trim();
    const trimmedSlug = tenantSlug.trim().toLowerCase();

    if (!trimmedName) {
      setError('Company name cannot be empty.');
      return;
    }

    if (slugValidationError) {
      setError(slugValidationError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.patch<UpdateTenantResponse>('/api/auth/tenant', {
        name: trimmedName,
        slug: trimmedSlug,
      });

      setSuccess('Workspace settings updated successfully!');
      if (res.tenant) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                tenant: {
                  ...prev.tenant!,
                  name: res.tenant.name,
                  slug: res.tenant.slug,
                },
              }
            : null
        );
        setCompanyName(res.tenant.name);
        setTenantSlug(res.tenant.slug);
      }
      await loadUserData();
    } catch (err) {
      setError(errorMessage(err, 'Failed to update workspace settings.'));
    } finally {
      setSubmitting(false);
    }
  }

  const embedScriptCode = useMemo(() => {
    const slug = tenantSlug || user?.tenant?.slug || 'your-tenant-slug';
    const apiHost = typeof window !== 'undefined' ? window.location.origin : 'https://api-test.ryxai.in';
    return `<script\n  src="${apiHost}/static/embed.js"\n  data-api="${apiHost}"\n  data-tenant="${slug}"\n></script>`;
  }, [tenantSlug, user?.tenant?.slug]);

  function copyEmbedScript() {
    navigator.clipboard.writeText(embedScriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading workspace settings...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
            Workspace Settings
          </h1>
          {user?.auth_provider && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: 20,
                background: user.auth_provider === 'google' ? 'rgba(66, 133, 244, 0.15)' : 'rgba(167, 139, 250, 0.15)',
                border: user.auth_provider === 'google' ? '1px solid rgba(66, 133, 244, 0.35)' : '1px solid rgba(167, 139, 250, 0.35)',
                color: user.auth_provider === 'google' ? '#60a5fa' : '#a78bfa',
                textTransform: 'capitalize',
              }}
            >
              {user.auth_provider === 'google' ? 'Google Account' : 'Email Account'}
            </span>
          )}
        </div>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Manage your organization name, tenant slug identifier, and integration credentials.
        </p>
      </header>

      {error && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '0.9rem 1.1rem',
            borderRadius: 8,
            border: '1px solid rgba(239, 68, 68, 0.35)',
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--error)',
            fontSize: '0.88rem',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '0.9rem 1.1rem',
            borderRadius: 8,
            border: '1px solid rgba(16, 185, 129, 0.35)',
            background: 'rgba(16, 185, 129, 0.1)',
            color: 'var(--success)',
            fontSize: '0.88rem',
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.75rem' }}>
        <section
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '1.75rem',
          }}
        >
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#fff', fontWeight: 700 }}>
            Workspace Profile & Tenant Info
          </h2>
          <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Customize your company name and tenant slug used to identify your organization.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="companyNameInput"
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#fff',
                }}
              >
                Company Name / Workspace Name
              </label>
              <input
                id="companyNameInput"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                maxLength={200}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 0.9rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                This is your organization display name shown across the workspace dashboard.
              </span>
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label
                htmlFor="tenantSlugInput"
                style={{
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#fff',
                }}
              >
                Tenant Slug Identifier
              </label>
              <input
                id="tenantSlugInput"
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value.toLowerCase().trim())}
                placeholder="e.g. acme-corp"
                maxLength={50}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 0.9rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
              <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Unique slug used for API scoping and widget embeds. Only lowercase letters, numbers, hyphens, and underscores allowed.
              </span>
            </div>

            <div
              style={{
                marginBottom: '1.75rem',
                padding: '1rem',
                borderRadius: 8,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Account Email
                </span>
                <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{user?.email}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Role
                </span>
                <span style={{ fontSize: '0.9rem', color: '#a78bfa', fontWeight: 600, textTransform: 'capitalize' }}>
                  {user?.role || 'Admin'}
                </span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Tenant ID
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--accent-light)', fontFamily: 'monospace' }}>
                  #{user?.tenant?.id}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !isFormChanged || Boolean(slugValidationError)}
              style={{
                padding: '0.8rem 1.6rem',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                cursor: submitting || !isFormChanged || Boolean(slugValidationError) ? 'not-allowed' : 'pointer',
                opacity: submitting || !isFormChanged || Boolean(slugValidationError) ? 0.55 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {submitting ? 'Saving changes...' : 'Save Workspace Changes'}
            </button>
          </form>
        </section>

        <section
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '1.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#fff', fontWeight: 700 }}>
                Embed Code Snippet
              </h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Use this updated snippet on your website to embed your AI agent under tenant slug <code>{tenantSlug || '...'}</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={copyEmbedScript}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: copied ? '#10b981' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          <pre
            style={{
              padding: '1rem',
              borderRadius: 8,
              background: '#080c14',
              border: '1px solid var(--border)',
              color: '#60a5fa',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              overflowX: 'auto',
              margin: 0,
            }}
          >
            {embedScriptCode}
          </pre>
        </section>
      </div>
    </div>
  );
}
