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
  if (err.status === 400 || err.status === 409) return err.detail || fallback;
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
          color: "#8A64E9",
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
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading billing & subscription details...</p>
      </div>
    );
  }

  const currentPlanSlug = subStatus?.plan?.slug || "trial";
  const isTrial = subStatus?.subscription_status === "trial";
  const isActive = subStatus?.is_active ?? true;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <header style={{ marginBottom: "2rem" }}>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
            Billing & Subscription
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
            Manage your workspace plan, view usage limits, and upgrade via Razorpay gateway.
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

        {/* Expired / Inactive Notice Banner */}
        {!isActive && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "1rem 1.25rem",
              borderRadius: 10,
              border: "1px solid rgba(239, 68, 68, 0.35)",
              background: "linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.04) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  flexShrink: 0,
                }}
              >
                ⚠️
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>
                  {isTrial ? "Your 3-Day Free Trial Has Expired" : "Subscription Inactive"}
                </div>
                <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.85rem", marginTop: "0.15rem" }}>
                  Website widget embedding is currently paused. Upgrade to a paid plan below to instantly reactivate your AI assistant.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Current Plan Summary Banner */}
        <section
          style={{
            backgroundColor: "var(--bg-card)",
            border: !isActive
              ? "1px solid rgba(239, 68, 68, 0.4)"
              : "1px solid var(--border)",
            background: !isActive
              ? "linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, var(--bg-card) 100%)"
              : "var(--bg-card)",
            borderRadius: 10,
            padding: "1.5rem",
            marginBottom: "2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1.5rem",
            boxShadow: !isActive ? "0 4px 20px rgba(239, 68, 68, 0.08)" : "none",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  letterSpacing: "0.05em",
                }}
              >
                Current Plan
              </span>
              <span
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: 6,
                  background: isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.18)",
                  color: isActive ? "#10b981" : "#f87171",
                  border: isActive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.35)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "capitalize",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                {!isActive ? "● Expired" : isTrial ? "● Trial Active" : "● Active"}
              </span>
            </div>
            <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.4rem", color: "#fff", fontWeight: 800 }}>
              {subStatus?.plan?.name || (isTrial ? "Free Trial Plan" : "Active Subscription")}
            </h2>
            <p style={{ margin: 0, color: !isActive ? "rgba(255, 255, 255, 0.65)" : "var(--text-secondary)", fontSize: "0.9rem" }}>
              {subStatus?.message || "Active workspace plan."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                Monthly Chat Limit
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                {formatLimit(subStatus?.plan?.max_monthly_messages ?? 100, "msgs")}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                KB File Limit
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                {formatLimit(subStatus?.plan?.max_kb_files ?? 3, "files")}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Cards Grid */}
        <h2 style={{ margin: "0 0 1.25rem 0", fontSize: "1.2rem", color: "#fff", fontWeight: 800 }}>
          Available Subscription Plans
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            alignItems: "stretch",
          }}
        >
          {plans.map((plan) => {
            const isCurrent = plan.slug === currentPlanSlug;
            const isProcessing = checkoutPlanSlug === plan.slug;
            const isCurrentExpired = isCurrent && !isActive;

            return (
              <div
                key={plan.id}
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: isCurrent
                    ? isCurrentExpired
                      ? "2px solid rgba(239, 68, 68, 0.5)"
                      : "2px solid var(--accent)"
                    : "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.75rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  boxShadow: isCurrent
                    ? isCurrentExpired
                      ? "0 8px 32px rgba(239, 68, 68, 0.12)"
                      : "0 8px 32px rgba(138, 100, 233, 0.15)"
                    : "none",
                }}
              >
                {isCurrent && (
                  <span
                    style={{
                      position: "absolute",
                      top: -12,
                      right: 20,
                      background: isCurrentExpired ? "#ef4444" : "var(--accent)",
                      color: "#fff",
                      padding: "0.25rem 0.75rem",
                      borderRadius: 12,
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      boxShadow: isCurrentExpired ? "0 2px 10px rgba(239, 68, 68, 0.4)" : "none",
                    }}
                  >
                    {isCurrentExpired ? "Expired Plan" : "Active Plan"}
                  </span>
                )}

                <div>
                  <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", color: "#fff", fontWeight: 700 }}>
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
                      {plan.description}
                    </p>
                  )}

                  <div style={{ marginBottom: "1.5rem" }}>
                    <span style={{ fontSize: "2rem", fontWeight: 800, color: "#fff" }}>
                      {formatPrice(plan.price_inr, plan.billing_cycle)}
                    </span>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", marginBottom: "1.5rem" }}>
                    <div style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700, marginBottom: "0.75rem" }}>
                      Included Features:
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                      <li style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: "var(--success)" }}>✓</span> {formatLimit(plan.max_monthly_messages, "monthly messages")}
                      </li>
                      <li style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: "var(--success)" }}>✓</span> {formatLimit(plan.max_kb_files, "KB document files")}
                      </li>
                      <li style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: plan.allow_widget_embed ? "var(--success)" : "var(--text-muted)" }}>
                          {plan.allow_widget_embed ? "✓" : "✕"}
                        </span>
                        Website Widget Embedding
                      </li>
                      {plan.features.map((feat) => (
                        <li key={feat} style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ color: "var(--success)" }}>✓</span> {feat}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpgradePlan(plan)}
                  disabled={isCurrent || isProcessing || plan.price_inr <= 0}
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: 8,
                    border: "none",
                    background: isCurrent
                      ? "rgba(255, 255, 255, 0.08)"
                      : "var(--accent)",
                    color: isCurrent ? "var(--text-muted)" : "#fff",
                    fontWeight: 700,
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                    cursor: isCurrent || isProcessing || plan.price_inr <= 0 ? "not-allowed" : "pointer",
                    opacity: isCurrent ? 0.7 : isProcessing ? 0.65 : 1,
                  }}
                >
                  {isCurrent
                    ? isCurrentExpired
                      ? "Trial Expired"
                      : "Current Active Plan"
                    : isProcessing
                    ? "Processing Order..."
                    : plan.price_inr <= 0
                    ? "Included in Trial"
                    : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
