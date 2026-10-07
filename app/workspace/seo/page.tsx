"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { FullSiteAuditTab } from "./_components/FullSiteAuditTab";
import type { SeoAnalysisResult } from "./_components/SinglePageScanTab";
// import { SinglePageScanTab } from "./_components/SinglePageScanTab";
import { TrafficMatrixTab } from "./_components/TrafficMatrixTab";

interface ConnectedWebsite {
  id: number;
  domain: string;
  root_url: string;
  is_primary: boolean;
  authorization_status: string;
  is_authorized: boolean;
  indexing_status: string;
  indexed_pages_count: number;
  total_chunks_count: number;
  last_indexed_at: string | null;
  last_crawl_error: string | null;
}

interface AppPerformanceData {
  target_website_url: string | null;
  connected_website?: ConnectedWebsite | null;
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

type TabKey = "site-audit" | /* "single-page" | */ "traffic";

export default function SeoHubPage() {
  const [data, setData] = useState<AppPerformanceData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("site-audit");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync tab from URL if present (e.g. ?tab=traffic)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "site-audit" || /* tab === "single-page" || */ tab === "traffic") {
        setActiveTab(tab as TabKey);
      }
    }
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setErrorMsg(null);
    try {
      const res = await api.get<AppPerformanceData>("/api/analytics/app-performance");
      setData(res);
    } catch (err: unknown) {
      console.error("Failed to load app performance data", err);
      setErrorMsg("Unable to load performance matrix data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await api.get<AppPerformanceData>("/api/analytics/app-performance");
        if (!cancelled) setData(res);
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("Failed to load app performance data", err);
          setErrorMsg("Unable to load performance matrix data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const connectedWebsite = data?.connected_website;
  const targetUrl = data?.target_website_url;
  const isConfigured = Boolean(connectedWebsite?.root_url || targetUrl);
  const websiteUrl = connectedWebsite?.root_url || targetUrl || "";

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* ── Main Header ── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
          flexWrap: "wrap",
          gap: "1.25rem",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 0.35rem 0",
              fontSize: "1.75rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            SEO Health &amp; Audit Hub
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Run multi-page site crawls, inspect single-page SEO diagnostics, and track visitor traffic retention.
          </p>
        </div>

        {/* Connected Website Status Pill */}
        {isConfigured && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0.6rem 1rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "rgba(138,100,233,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
              }}
            >
              🌐
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                Primary Domain
              </div>
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  textDecoration: "none",
                }}
              >
                {websiteUrl.replace(/^https?:\/\//, "")} ↗
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ── Primary Navigation Tabs ── */}
      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          marginBottom: "2rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        {[
          {
            id: "site-audit" as const,
            label: "🔬 Full-Site Audit (Crawler)",
            badge: "Multi-Page",
          },
          /* {
            id: "single-page" as const,
            label: "📄 Single-Page Quick Scan",
            badge: null,
          }, */
          {
            id: "traffic" as const,
            label: "📊 Traffic & Conversions",
            badge: null,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0.6rem 1.15rem",
                borderRadius: 8,
                fontSize: "0.88rem",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                border: isActive ? "1px solid rgba(138, 100, 233, 0.45)" : "1px solid transparent",
                backgroundColor: isActive ? "rgba(138, 100, 233, 0.14)" : "transparent",
                color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                transition: "all 0.18s ease",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
              {tab.badge && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 6px",
                    borderRadius: 9999,
                    background: isActive ? "rgba(138, 100, 233, 0.25)" : "rgba(255,255,255,0.06)",
                    color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                    fontWeight: 700,
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active Tab Content ── */}
      {activeTab === "site-audit" && <FullSiteAuditTab />}

      {/* {activeTab === "single-page" && (
        <SinglePageScanTab
          initialSeo={data?.seo_analysis || null}
          defaultUrl={websiteUrl}
          isConfigured={isConfigured}
        />
      )} */}

      {activeTab === "traffic" && (
        <TrafficMatrixTab
          traffic={data?.traffic}
          retention={data?.retention}
          usage={data?.chatbot_usage}
        />
      )}
    </div>
  );
}
