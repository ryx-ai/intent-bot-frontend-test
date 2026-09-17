"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface CategoryInfo {
  name: string;
  score: number;
  weight: number;
}

interface AuditItem {
  id: string;
  category: string;
  title: string;
  status: "passed" | "warning" | "error";
  score: number;
  max_score: number;
  score_text: string;
  description: string;
  fix_recommendation: string;
}

interface SeoAnalysisResult {
  url: string;
  overall_score: number;
  status_code: number;
  categories: {
    meta: CategoryInfo;
    structure: CategoryInfo;
    media: CategoryInfo;
    social: CategoryInfo;
  };
  summary: {
    total_audits: number;
    passed: number;
    warnings: number;
    errors: number;
  };
  audits: AuditItem[];
}

interface AppPerformanceData {
  target_website_url: string | null;
  seo_analysis: SeoAnalysisResult | null;
  traffic: {
    total_sessions: number;
    total_messages: number;
    avg_messages_per_session: number;
  };
  retention: {
    engaged_sessions: number;
    single_msg_sessions: number;
    engaged_ratio_percent: number;
    bounce_rate_percent: number;
    retention_score: number;
  };
  chatbot_usage: {
    total_conversations: number;
    total_leads_captured: number;
    converted_leads_count: number;
    lead_conversion_rate_percent: number;
    avg_lead_score: number;
    conversion_funnel: {
      just_chat: number;
      lead_captured: number;
      booked_demo: number;
      unknown?: number;
    };
  };
}

export default function AppPerformanceSeoHub() {
  const [data, setData] = useState<AppPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetUrl, setTargetUrl] = useState("");
  const [updatingUrl, setUpdatingUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<"seo" | "retention" | "usage">("seo");
  const [auditFilter, setAuditFilter] = useState<"all" | "error" | "warning" | "passed">("all");
  const [msg, setMsg] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await api.get<AppPerformanceData>("/api/analytics/app-performance");
      setData(res);
      if (res.target_website_url) {
        setTargetUrl(res.target_website_url);
      }
    } catch (err: any) {
      console.error("Failed to load app performance matrix", err);
      setMsg("Failed to load performance metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveTargetUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUrl.trim()) return;

    setUpdatingUrl(true);
    setMsg("");
    try {
      await api.post("/api/config/bot", {
        targetWebsiteUrl: targetUrl.trim(),
      });
      setMsg("Website domain saved! Re-calculating App SEO score...");
      await loadData();
    } catch (err: any) {
      console.error("Failed to save target URL", err);
      setMsg("Failed to update target website URL.");
    } finally {
      setUpdatingUrl(false);
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#10B981";
    if (score >= 50) return "#F59E0B";
    return "#EF4444";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent SEO Health";
    if (score >= 50) return "Fair — Optimization Recommended";
    return "Critical — Technical Fixes Needed";
  };

  if (loading) {
    return (
      <div style={{ padding: "5rem", textAlign: "center", color: "var(--text-muted)" }}>
        Loading App Performance, SEO & Matrix Analytics...
      </div>
    );
  }

  const seo = data?.seo_analysis;
  const traffic = data?.traffic;
  const retention = data?.retention;
  const usage = data?.chatbot_usage;

  const filteredAudits = seo
    ? seo.audits.filter((item) => {
        if (auditFilter === "all") return true;
        return item.status === auditFilter;
      })
    : [];

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "2.5rem 2rem" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            margin: "0 0 0.4rem 0",
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "var(--text-primary)",
          }}
        >
          App SEO, Traffic & User Retention Matrix
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            lineHeight: 1.5,
          }}
        >
          Monitor your website's internal SEO health score, visitor traffic depth,
          user retention index, and chatbot lead conversion performance.
        </p>
      </div>

      {/* ── Domain Configuration & Quick Refresh Bar ── */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.25rem 1.5rem",
          marginBottom: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <form
          onSubmit={handleSaveTargetUrl}
          style={{ display: "flex", gap: "0.75rem", alignItems: "center", flex: 1, minWidth: 320 }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            Target Website Domain:
          </span>
          <input
            type="text"
            placeholder="e.g. https://yourdomain.com"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            style={{
              flex: 1,
              padding: "0.55rem 0.85rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: "0.88rem",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            disabled={updatingUrl}
            style={{
              padding: "0.55rem 1.25rem",
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--accent)",
              color: "var(--bg)",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: updatingUrl ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {updatingUrl ? "Saving..." : "Save & Audit"}
          </button>
        </form>

        <button
          onClick={() => loadData()}
          style={{
            padding: "0.55rem 1rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ↻ Refresh Matrix
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "var(--success)",
            fontSize: "0.85rem",
          }}
        >
          {msg}
        </div>
      )}

      {/* ── 4 Top KPI Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        {/* Card 1: App SEO Score */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            App SEO Health
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: seo ? getScoreColor(seo.overall_score) : "var(--text-muted)" }}>
              {seo ? seo.overall_score : "--"}
            </span>
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>/ 100</span>
          </div>
          <span style={{ fontSize: "0.78rem", color: seo ? getScoreColor(seo.overall_score) : "var(--text-muted)", fontWeight: 600 }}>
            {seo ? getScoreLabel(seo.overall_score) : "Set website URL to audit"}
          </span>
        </div>

        {/* Card 2: Traffic Volume */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Site Traffic & Sessions
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent)" }}>
              {traffic?.total_sessions || 0}
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>sessions</span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {traffic?.total_messages || 0} total messages ({traffic?.avg_messages_per_session || 0} msgs/session)
          </span>
        </div>

        {/* Card 3: User Retention Index */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            User Retention Rate
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "#10B981" }}>
              {retention?.engaged_ratio_percent || 0}%
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {retention?.engaged_sessions || 0} engaged sessions (3+ interactions)
          </span>
        </div>

        {/* Card 4: Chatbot Lead Conversion */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Lead Conversion Rate
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "#8A64E9" }}>
              {usage?.lead_conversion_rate_percent || 0}%
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Avg Lead Score: {usage?.avg_lead_score || "--"}/100
          </span>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.75rem",
        }}
      >
        {[
          { id: "seo", label: "🌐 App Technical SEO Score" },
          { id: "retention", label: "📈 Site Traffic & Retention Matrix" },
          { id: "usage", label: "🤖 Chatbot Usage & Lead Funnel" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "8px 8px 0 0",
              border: "1px solid transparent",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "1px solid transparent",
              backgroundColor: activeTab === tab.id ? "var(--bg-card)" : "transparent",
              color: activeTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: "0.9rem",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: APP SEO TECHNICAL HEALTH ── */}
      {activeTab === "seo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {!seo ? (
            <div
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "3rem",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              <h3>No Target Website Configured</h3>
              <p style={{ fontSize: "0.88rem", maxWidth: 500, margin: "0.5rem auto 1.5rem auto" }}>
                Enter your website URL above (e.g. <code>https://yourdomain.com</code>) to calculate your app's technical SEO score and fix recommendations.
              </p>
            </div>
          ) : (
            <>
              {/* Category Matrix Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
                {Object.entries(seo.categories).map(([key, cat]) => (
                  <div
                    key={key}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "1.25rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>{cat.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Weight: {cat.weight}%</span>
                    </div>

                    <div style={{ fontSize: "1.6rem", fontWeight: 800, color: getScoreColor(cat.score), marginBottom: "0.5rem" }}>
                      {cat.score}<span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-muted)" }}>/100</span>
                    </div>

                    <div style={{ width: "100%", height: 6, backgroundColor: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${cat.score}%`, height: "100%", backgroundColor: getScoreColor(cat.score) }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Audit Details */}
              <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Technical SEO Audits & Actionable Fixes ({seo.url})
                  </h3>

                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {[
                      { id: "all", label: `All (${seo.audits.length})` },
                      { id: "error", label: `Critical (${seo.summary.errors})` },
                      { id: "warning", label: `Warnings (${seo.summary.warnings})` },
                      { id: "passed", label: `Passed (${seo.summary.passed})` },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setAuditFilter(t.id as any)}
                        style={{
                          padding: "0.35rem 0.75rem",
                          borderRadius: 6,
                          fontSize: "0.8rem",
                          fontWeight: auditFilter === t.id ? 600 : 500,
                          border: "none",
                          backgroundColor: auditFilter === t.id ? "var(--accent)" : "var(--bg-surface)",
                          color: auditFilter === t.id ? "var(--bg)" : "var(--text-secondary)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {filteredAudits.map((item) => (
                    <div key={item.id} style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontSize: "1.2rem" }}>
                            {item.status === "passed" && "✅"}
                            {item.status === "warning" && "⚠️"}
                            {item.status === "error" && "❌"}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                              {item.title} <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>({item.category})</span>
                            </div>
                            <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0.25rem 0.5rem", borderRadius: 4, backgroundColor: item.status === "passed" ? "#ECFDF5" : item.status === "warning" ? "#FFFBEE" : "#FEF2F2", color: item.status === "passed" ? "#059669" : item.status === "warning" ? "#D97706" : "#DC2626" }}>
                          {item.score_text}
                        </span>
                      </div>

                      {item.fix_recommendation && (
                        <div style={{ marginTop: "0.85rem", padding: "0.75rem 1rem", borderRadius: 6, backgroundColor: "var(--bg-card)", borderLeft: `3px solid ${getScoreColor(item.score)}`, fontSize: "0.83rem", color: "var(--text-primary)" }}>
                          <strong>Recommended Fix:</strong> {item.fix_recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: TRAFFIC & USER RETENTION MATRIX ── */}
      {activeTab === "retention" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              User Engagement Depth & Retention Index
            </h3>
            <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Measures how deeply visitors interact with your website chatbot across multi-message sessions vs single-turn drop-offs.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
              <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Engaged Session Rate (&gt;=3 Msgs)
                </div>

                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#10B981", margin: "0.4rem 0" }}>
                  {retention?.engaged_ratio_percent || 0}%
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {retention?.engaged_sessions || 0} out of {traffic?.total_sessions || 0} sessions
                </div>
              </div>

              <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Bounce Rate (Single-Msg Sessions)
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#F59E0B", margin: "0.4rem 0" }}>
                  {retention?.bounce_rate_percent || 0}%
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {retention?.single_msg_sessions || 0} single-turn drop-offs
                </div>
              </div>

              <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Overall Retention Score
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent)", margin: "0.4rem 0" }}>
                  {retention?.retention_score || 0}<span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>/100</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Calculated from engagement depth ratio
                </div>
              </div>
            </div>

            {/* Visual Retention Bar */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                <span>Engagement Distribution</span>
                <span>{retention?.engaged_ratio_percent || 0}% Engaged</span>
              </div>
              <div style={{ width: "100%", height: 12, backgroundColor: "#F59E0B", borderRadius: 6, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${retention?.engaged_ratio_percent || 0}%`, height: "100%", backgroundColor: "#10B981" }} />
              </div>
              <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
                  Engaged Sessions (3+ msgs)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
                  Short / Bounce Sessions
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: CHATBOT USAGE & LEAD FUNNEL ── */}
      {activeTab === "usage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Chatbot Usage & Conversion Funnel
            </h3>
            <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Track visitor conversion from casual browsing into captured leads and booked demo meetings.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem", marginBottom: "2rem" }}>
              <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Leads Captured</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#10B981", margin: "0.4rem 0" }}>{usage?.total_leads_captured || 0}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{usage?.lead_conversion_rate_percent || 0}% overall conversion rate</div>
              </div>

              <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Average Lead Score</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent)", margin: "0.4rem 0" }}>{usage?.avg_lead_score || 0}<span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>/100</span></div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Mean intent score across all visitors</div>
              </div>

              <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Conversations</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#8A64E9", margin: "0.4rem 0" }}>{usage?.total_conversations || 0}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Active session instances</div>
              </div>
            </div>

            {/* Funnel Breakdown Table */}
            <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Conversion Stage Breakdown
            </h4>

            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontWeight: 600 }}>Conversion Outcome Stage</th>
                    <th style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontWeight: 600 }}>Sessions</th>
                    <th style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontWeight: 600 }}>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Just Chat (Exploratory)", count: usage?.conversion_funnel.just_chat || 0, color: "var(--text-secondary)" },
                    { label: "Lead Captured (Contact Submitted)", count: usage?.conversion_funnel.lead_captured || 0, color: "#10B981" },
                    { label: "Booked Demo (Meeting Scheduled)", count: usage?.conversion_funnel.booked_demo || 0, color: "var(--accent)" },
                  ].map((row) => {
                    const pct = usage?.total_conversations ? roundPct(row.count, usage.total_conversations) : 0;
                    return (
                      <tr key={row.label} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: row.color }}>{row.label}</td>
                        <td style={{ padding: "0.85rem 1rem", color: "var(--text-primary)" }}>{row.count}</td>
                        <td style={{ padding: "0.85rem 1rem", color: "var(--text-primary)" }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roundPct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}
