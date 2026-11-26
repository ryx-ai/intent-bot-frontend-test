"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
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

interface SubscriptionStatus {
  subscription_status: "trial" | "active" | "expired" | "canceled" | string;
  is_active: boolean;
  plan: Plan | null;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  days_remaining: number;
  message: string;
}

interface CreateOrderResponse {
  order_id: string;
  amount_inr: number;
  amount_paisa: number;
  currency: string;
  key_id: string;
  plan_slug: string;
  plan_name: string;
}

interface VerifyPaymentResponse {
  success: boolean;
  status: string;
  message: string;
  plan_name?: string;
  subscription_ends_at?: string;
}

interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayErrorResponse {
  error?: {
    description?: string;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: RazorpayErrorResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return "Network error. Check your connection.";
  if (err.status === 401) return "Please log in again.";
  if (err.status === 400 || err.status === 409 || err.status === 503) return err.detail || fallback;
  if (err.status >= 500) return "Server error. Please try again later.";
  return fallback;
}

function formatPrice(priceInr: number, billingCycle: string) {
  if (priceInr === 0) return "Free";
  const cycleSuffix = billingCycle === "yearly" ? "/yr" : billingCycle === "monthly" ? "/mo" : "";
  return `₹${priceInr.toLocaleString()}${cycleSuffix}`;
}

// Plain names for the feature codes stored with each plan. Codes already shown
// as a limit above (files, website chat) are left out so nothing repeats.
const FEATURE_LABELS: Record<string, string | null> = {
  kb_upload: null,
  embed_widget: null,
  agent_config: "Set up how your assistant behaves",
  custom_branding: "Your own colours and branding",
  cal_booking: "Calendar booking in the chat",
  analytics_export: "Download chats and reports",
  priority_support: "Priority support",
};
function featureLabel(code: string): string | null {
  if (code in FEATURE_LABELS) return FEATURE_LABELS[code];
  const t = code.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

function formatLimit(val: number, unit: string) {
  if (val === -1) return `Unlimited ${unit}`;
  return `${val.toLocaleString()} ${unit}`;
}

export default function BillingPage() {
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPlanSlug, setCheckoutPlanSlug] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [statusRes, plansRes] = await Promise.all([
        api.get<SubscriptionStatus>("/api/payments/subscription-status"),
        api.get<Plan[]>("/api/payments/plans"),
      ]);
      setSubStatus(statusRes);
      setPlans(plansRes || []);
    } catch (err) {
      setError(errorMessage(err, "Failed to load billing details."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        await loadData();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function handleUpgradePlan(targetPlan: Plan) {
    if (targetPlan.price_inr <= 0) {
      setError("Cannot initiate payment for a free plan.");
      return;
    }

    setError("");
    setSuccess("");
    setCheckoutPlanSlug(targetPlan.slug);

    try {
      // 1. Create Razorpay order via backend
      const order = await api.post<CreateOrderResponse>("/api/payments/create-order", {
        plan_slug: targetPlan.slug,
      });

      // 2. Trigger Razorpay Checkout modal
      if (typeof window === "undefined" || !window.Razorpay) {
        throw new Error("Razorpay SDK not loaded yet. Please refresh and try again.");
      }

      const options = {
        key: order.key_id,
        amount: order.amount_paisa,
        currency: order.currency,
        name: "RYX AI",
        description: `Subscription Upgrade to ${order.plan_name}`,
        order_id: order.order_id,
        handler: async function (response: RazorpaySuccessResponse) {
          try {
            setLoading(true);
            const verifyRes = await api.post<VerifyPaymentResponse>(
              "/api/payments/verify-payment",
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }
            );

            setSuccess(verifyRes.message || "Payment successful! Subscription updated.");
            await loadData();
          } catch (vErr) {
            setError(errorMessage(vErr, "Payment verification failed."));
          } finally {
            setLoading(false);
            setCheckoutPlanSlug(null);
          }
        },
        prefill: {},
        theme: {
          color: "#0f172a",
        },
        modal: {
          ondismiss: function () {
            setCheckoutPlanSlug(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (resp: RazorpayErrorResponse) {
        setError(resp.error?.description || "Payment failed. Please try again.");
        setCheckoutPlanSlug(null);
      });
      rzp.open();
    } catch (err) {
      setError(errorMessage(err, "Failed to initiate payment order."));
      setCheckoutPlanSlug(null);
    }
  }

  if (loading && !subStatus) {
    return (
      <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto", padding: "2rem", boxSizing: "border-box" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading billing & subscription details...</p>
      </div>
    );
  }

  const currentPlanSlug = subStatus?.plan?.slug || "trial";
  const isTrial = subStatus?.subscription_status === "trial";
  const isActive = subStatus?.is_active ?? true;

  const daysLeft = subStatus?.days_remaining ?? 0;
  const statusDot = !isActive ? "#ef4444" : isTrial ? "#f59e0b" : "#10b981";
  const statusText = !isActive
    ? isTrial ? "Trial ended" : "Plan ended"
    : isTrial
      ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in your trial`
      : subStatus?.subscription_ends_at
        ? `Active · renews ${new Date(subStatus.subscription_ends_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
        : "Active";
  const card: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.035)",
  };
  const check = (on = true) => (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: on ? "rgba(16,185,129,.12)" : "var(--bg-surface)",
        color: on ? "#059669" : "var(--text-muted)",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {on ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
      </svg>
    </span>
  );

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto", padding: "2rem 1.75rem", boxSizing: "border-box" }}>
        <style>{`
          .bl-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; align-items: stretch; }
          .bl-plan { transition: transform .18s ease, box-shadow .18s ease; }
          .bl-plan:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(15,23,42,.10) !important; }
          .bl-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(15,23,42,.22) !important; }
          .bl-current { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap; }
          .bl-limits { display: flex; gap: 1rem; }
          @media (max-width: 640px) { .bl-limits { width: 100%; } .bl-limits > div { flex: 1; } }
        `}</style>

        <header style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Plans &amp; billing
          </h1>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Pick the plan that fits your business. Payments are handled securely by Razorpay.
          </p>
        </header>

        {error && (
          <div style={{ marginBottom: "1.25rem", padding: "0.8rem 1rem", borderRadius: 12, border: "1px solid rgba(239, 68, 68, 0.25)", background: "rgba(239, 68, 68, 0.06)", color: "var(--error)", fontSize: "0.86rem" }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginBottom: "1.25rem", padding: "0.8rem 1rem", borderRadius: 12, border: "1px solid rgba(16, 185, 129, 0.3)", background: "rgba(16, 185, 129, 0.06)", color: "#047857", fontSize: "0.86rem" }}>
            {success}
          </div>
        )}

        {!isActive && (
          <div style={{ marginBottom: "1.25rem", padding: "0.9rem 1.1rem", borderRadius: 14, border: "1px solid rgba(239, 68, 68, 0.25)", background: "rgba(239, 68, 68, 0.05)", fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
            <strong>{isTrial ? "Your free trial has ended." : "Your plan has ended."}</strong> The chat on your website is paused. Choose a plan below to turn it back on straight away.
          </div>
        )}

        {/* Current plan */}
        <section className="bl-current" style={{ ...card, padding: "1.35rem 1.5rem", marginBottom: "2rem" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Your plan</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", marginTop: 4 }}>
              {subStatus?.plan?.name || (isTrial ? "Free trial" : "Your plan")}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: "0.84rem", color: "var(--text-secondary)" }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: statusDot, boxShadow: `0 0 0 3px ${statusDot}26` }} />
              {statusText}
            </div>
          </div>
          <div className="bl-limits">
            {[
              { k: "Chat messages", v: formatLimit(subStatus?.plan?.max_monthly_messages ?? 100, "/ month") },
              { k: "Files", v: formatLimit(subStatus?.plan?.max_kb_files ?? 3, "") },
            ].map((x) => (
              <div key={x.k} style={{ padding: "0.75rem 1rem", border: "1px solid var(--border)", borderRadius: 12, minWidth: 140 }}>
                <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{x.k}</div>
                <div style={{ fontSize: "1.05rem", fontWeight: 650, color: "var(--text-primary)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{x.v.trim()}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Plans */}
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.05rem", fontWeight: 650, color: "var(--text-primary)" }}>All plans</h2>
        <div className="bl-plans">
          {plans.map((plan) => {
            const isCurrent = plan.slug === currentPlanSlug;
            const isProcessing = checkoutPlanSlug === plan.slug;
            const isCurrentExpired = isCurrent && !isActive;
            const disabled = (isCurrent && !isCurrentExpired) || isProcessing || plan.price_inr <= 0;
            const features = plan.features.map(featureLabel).filter((f): f is string => Boolean(f));
            const priceMain = plan.price_inr === 0 ? "Free" : `₹${plan.price_inr.toLocaleString()}`;
            const priceUnit = plan.price_inr === 0 ? "" : plan.billing_cycle === "yearly" ? "/ year" : plan.billing_cycle === "monthly" ? "/ month" : "";

            return (
              <div
                key={plan.id}
                className="bl-plan"
                style={{
                  ...card,
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  border: isCurrent ? `1.5px solid ${isCurrentExpired ? "rgba(239,68,68,.5)" : "#0f172a"}` : card.border,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 650, color: "var(--text-primary)" }}>{plan.name}</h3>
                  {isCurrent && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: isCurrentExpired ? "rgba(239,68,68,.08)" : "#0f172a",
                        color: isCurrentExpired ? "#dc2626" : "#fff",
                        border: isCurrentExpired ? "1px solid rgba(239,68,68,.3)" : "none",
                      }}
                    >
                      {isCurrentExpired ? "Ended" : "Your plan"}
                    </span>
                  )}
                </div>
                {plan.description && (
                  <p style={{ margin: "0.4rem 0 0", color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: 1.5, minHeight: "2.5em" }}>{plan.description}</p>
                )}

                <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "1.1rem 0 1.1rem" }}>
                  <span style={{ fontSize: "2.1rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>{priceMain}</span>
                  {priceUnit && <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>{priceUnit}</span>}
                </div>

                <ul style={{ listStyle: "none", padding: "1.1rem 0 0", margin: "0 0 1.4rem", borderTop: "1px solid var(--border)", display: "grid", gap: "0.65rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.86rem", color: "var(--text-primary)" }}>
                    {check()} {formatLimit(plan.max_monthly_messages, "chat messages a month")}
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.86rem", color: "var(--text-primary)" }}>
                    {check()} {plan.max_kb_files === -1 ? "Unlimited files" : `${plan.max_kb_files.toLocaleString()} files your assistant learns from`}
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.86rem", color: plan.allow_widget_embed ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {check(plan.allow_widget_embed)} Chat on your website
                  </li>
                  {features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.86rem", color: "var(--text-primary)" }}>
                      {check()} {f}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="bl-btn"
                  onClick={() => handleUpgradePlan(plan)}
                  disabled={disabled}
                  style={{
                    marginTop: "auto",
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: 11,
                    border: "none",
                    background: disabled && !isProcessing ? "var(--bg-hover)" : "#0f172a",
                    color: disabled && !isProcessing ? "var(--text-muted)" : "#fff",
                    fontWeight: 600,
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: isProcessing ? 0.75 : 1,
                    boxShadow: disabled ? "none" : "0 4px 12px rgba(15,23,42,.18)",
                    transition: "transform .15s ease, box-shadow .15s ease",
                  }}
                >
                  {isCurrent
                    ? isCurrentExpired
                      ? plan.price_inr > 0
                        ? `Renew ${plan.name}`
                        : "Trial ended"
                      : "Your current plan"
                    : isProcessing
                      ? "Opening payment…"
                      : plan.price_inr <= 0
                        ? "Included in your trial"
                        : `Choose ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <p style={{ margin: "1.25rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Secure payment by Razorpay. Prices in Indian rupees.
        </p>
      </div>
    </>
  );
}
