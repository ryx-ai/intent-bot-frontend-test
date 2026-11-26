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

interface SubStatus {
  subscription_status: string;
  is_active: boolean;
  plan?: { name?: string } | null;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
  days_remaining: number;
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
  const [sub, setSub] = useState<SubStatus | null>(null);
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const loadUserData = useCallback(async () => {
    try {
      const data = await api.get<UserInfo>('/api/auth/me');
      api.get<SubStatus>('/api/payments/subscription-status').then(setSub).catch(() => {});
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
    void (async () => {
      await loadUserData();
    })();
  }, [loadUserData]);

  const slugValidationError = useMemo(() => {
    if (!tenantSlug) return 'Tenant slug cannot be empty.';
    if (!SLUG_RE.test(tenantSlug)) {
      return 'Slug must be 2-50 characters using lowercase letters, numbers, hyphens, and underscores only.';
    }
    return '';
  }, [tenantSlug]);

  const isFormChanged = Boolean(
    user?.tenant &&
      (companyName.trim() !== user.tenant.name ||
        tenantSlug.trim().toLowerCase() !== user.tenant.slug)
  );

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

  if (loading) {
    return (
      <div style={{ width: "100%", maxWidth: 1360, margin: "0 auto", padding: "2rem", boxSizing: "border-box" }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading workspace settings...</p>
      </div>
    );
  }

  async function sendPasswordReset() {
    if (!user?.email) return;
    setResetState('sending');
    try {
      await api.post('/api/auth/forgot-password', { email: user.email });
      setResetState('sent');
    } catch {
      setResetState('error');
    }
  }

  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const planName = sub?.plan?.name || (sub?.subscription_status === 'trial' ? 'Free trial' : 'No plan');
  const planState = !sub
    ? { dot: '#cbd5e1', text: 'Loading…' }
    : !sub.is_active
      ? { dot: '#ef4444', text: sub.subscription_status === 'trial' ? 'Trial ended' : 'Plan ended' }
      : sub.subscription_status === 'trial'
        ? { dot: '#f59e0b', text: `${sub.days_remaining} ${sub.days_remaining === 1 ? 'day' : 'days'} left in your trial` }
        : { dot: '#10b981', text: sub.subscription_ends_at ? `Active · renews ${fmtDate(sub.subscription_ends_at)}` : 'Active' };

  const canSave = !submitting && isFormChanged && !slugValidationError;
  const displayName = (companyName || user?.tenant?.name || '').replace(/['’]s workspace$/i, '').trim();
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'W';

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.035)',
  };
  const label: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' };
  const hint: React.CSSProperties = { display: 'block', marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 };
  const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.72rem 0.9rem',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(15,23,42,.04)',
  };

  return (
    <div style={{ width: "100%", maxWidth: 1360, margin: "0 auto", padding: "2rem", boxSizing: "border-box" }}>
      <style>{`
        .ws-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; align-items: stretch; }
        .ws-top { display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; flex-wrap: wrap; }
        .ws-plan { display: flex; align-items: center; gap: 1.25rem; padding-left: 1.25rem; border-left: 1px solid var(--border); }
        @media (max-width: 640px) { .ws-plan { border-left: none; padding-left: 0; width: 100%; justify-content: space-between; } .ws-plan-text { text-align: left !important; } }
        .ws-grid > * { min-width: 0; display: flex; flex-direction: column; }
        .ws-input:focus { border-color: #94a3b8 !important; box-shadow: 0 0 0 3px rgba(15,23,42,.06) !important; }
        @media (max-width: 860px) { .ws-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Workspace settings
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Your business name and account details.
        </p>
      </header>

      {error && (
        <div style={{ marginBottom: '1.25rem', padding: '0.8rem 1rem', borderRadius: 12, border: '1px solid rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.06)', color: 'var(--error)', fontSize: '0.86rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: '1.25rem', padding: '0.8rem 1rem', borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.06)', color: '#047857', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Saved. Your workspace is up to date.
        </div>
      )}

      {/* Account + plan */}
      <section className="ws-top" style={{ ...card, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(145deg,#1e293b,#0f172a)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1.05rem',
              boxShadow: '0 8px 20px rgba(15,23,42,.18)',
            }}
          >
            {initials}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName || 'Your workspace'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
        </div>

        <div className="ws-plan">
          <div style={{ textAlign: 'right' }} className="ws-plan-text">
            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Your plan</div>
            <div style={{ fontSize: '1rem', fontWeight: 650, color: 'var(--text-primary)', marginTop: 2 }}>{planName}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 2, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: planState.dot, boxShadow: `0 0 0 3px ${planState.dot}26` }} />
              {planState.text}
            </div>
          </div>
          <a
            href="/workspace/billing"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.6rem 1.1rem',
              borderRadius: 10,
              background: '#0f172a',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(15,23,42,.18)',
            }}
          >
            {sub && (!sub.is_active || sub.subscription_status === 'trial') ? 'See plans' : 'Manage plan'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>
      </section>

      <div className="ws-grid">
        {/* Edit form */}
        <section style={{ ...card, padding: '1.5rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 650, color: 'var(--text-primary)' }}>Business details</h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              How your business appears to you and your visitors.
            </p>

            <label htmlFor="companyNameInput" style={label}>Business name</label>
            <input
              id="companyNameInput"
              className="ws-input"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              maxLength={200}
              required
              style={input}
            />
            <span style={hint}>Shown across your dashboard and in your assistant&apos;s greeting.</span>

            <div style={{ minHeight: '1.5rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              {isFormChanged && !submitting && <span style={{ marginRight: 'auto', fontSize: '0.8rem', fontWeight: 600, color: '#b45309' }}>Unsaved changes</span>}
              <button
                type="submit"
                disabled={!canSave}
                style={{
                  padding: '0.65rem 1.3rem',
                  borderRadius: 10,
                  border: 'none',
                  background: canSave ? '#0f172a' : 'var(--bg-hover)',
                  color: canSave ? '#fff' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  fontFamily: 'inherit',
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  boxShadow: canSave ? '0 4px 12px rgba(15,23,42,.18)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {submitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        {/* Password & sign-in */}
          <section style={{ ...card, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 650, color: 'var(--text-primary)' }}>Password &amp; sign-in</h2>
          <p style={{ margin: '0 0 1.1rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>Keep your account safe.</p>
          <div style={{ padding: '0.9rem 1rem', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span aria-hidden style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user?.auth_provider === 'google' ? 'Signed in with Google' : 'Password'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {user?.auth_provider === 'google'
                    ? 'Your Google account handles your password.'
                    : resetState === 'sent'
                      ? `We sent a reset link to ${user?.email}. Check your inbox.`
                      : resetState === 'error'
                        ? "Couldn't send the email. Please try again in a few minutes."
                        : "We'll email you a secure link to set a new password."}
                </div>
              </div>
            </div>
          </div>
          <div style={{ minHeight: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)', minHeight: 44 }}>
            {user?.auth_provider !== 'google' && (
              <button
                type="button"
                onClick={sendPasswordReset}
                disabled={resetState === 'sending' || resetState === 'sent'}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: resetState === 'sent' ? '#047857' : 'var(--text-primary)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: resetState === 'sending' || resetState === 'sent' ? 'default' : 'pointer',
                  boxShadow: '0 1px 2px rgba(15,23,42,.05)',
                  whiteSpace: 'nowrap',
                }}
              >
                {resetState === 'sending' ? 'Sending…' : resetState === 'sent' ? '✓ Email sent' : 'Change password'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
