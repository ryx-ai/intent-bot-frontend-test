"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { FullSiteAuditTab, type ConnectedWebsite } from "./_components/FullSiteAuditTab";
import { TrafficMatrixTab } from "./_components/TrafficMatrixTab";

interface AppPerformanceData {
  target_website_url: string | null;
  connected_website?: ConnectedWebsite | null;
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

type TabKey = "site-audit" | "traffic";

export default function SeoHubPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("site-audit");
  const [primaryWebsite, setPrimaryWebsite] = useState<ConnectedWebsite | null>(null);

  // Lazy-loaded Chat Activity performance data
  const [performanceData, setPerformanceData] = useState<AppPerformanceData | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);

  // Sync tab from URL if present (e.g. ?tab=traffic or ?tab=chat-activity)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "site-audit" || tab === "website-check") {
        setActiveTab("site-audit");
      } else if (tab === "traffic" || tab === "chat-activity") {
        setActiveTab("traffic");
      }
    }
  }, []);

  // Fetch website list once for header domain link
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ websites: ConnectedWebsite[] }>("/api/knowledge/websites")
      .then((res) => {
        if (cancelled) return;
        const authorized = (res.websites || []).filter((w) => w.is_authorized);
        if (authorized.length > 0) {
          const primary = authorized.find((w) => w.is_primary) || authorized[0];
          setPrimaryWebsite(primary);
        }
      })
      .catch((err) => {
        console.warn("Could not load tenant websites for header", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-load app-performance only when Chat Activity is activated
  const loadPerformance = useCallback(async () => {
    if (performanceData || loadingPerformance) return;
    setLoadingPerformance(true);
    setPerformanceError(null);
    try {
      const res = await api.get<AppPerformanceData>("/api/analytics/app-performance");
      setPerformanceData(res);
    } catch (err: unknown) {
      console.error("Failed to load app performance data", err);
      setPerformanceError("Unable to load chat activity data.");
    } finally {
      setLoadingPerformance(false);
    }
  }, [performanceData, loadingPerformance]);

  useEffect(() => {
    if (activeTab === "traffic" && !performanceData && !loadingPerformance) {
      void loadPerformance();
    }
  }, [activeTab, performanceData, loadingPerformance, loadPerformance]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab === "traffic" ? "chat-activity" : "website-check");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const domainDisplay = primaryWebsite?.domain || primaryWebsite?.root_url?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "";

  return (
    <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto", padding: "2rem 1.5rem", boxSizing: "border-box" }}>
      {/* ── Main Header: "Website health" with site link on the right ── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          Website health
        </h1>

        {/* Site link on the right */}
        {primaryWebsite?.root_url && (
          <a
            href={primaryWebsite.root_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>🌐</span>
            <span>{domainDisplay}</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>↗</span>
          </a>
        )}
      </header>

      {/* ── Primary Navigation Tabs: "Website check" and "Chat activity" ── */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.75rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "0.5rem",
        }}
      >
        {[
          { id: "site-audit" as const, label: "Website check" },
          { id: "traffic" as const, label: "Chat activity" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: "0.5rem 1.15rem",
                borderRadius: 8,
                fontSize: "0.9rem",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                border: isActive ? "1px solid rgba(138, 100, 233, 0.4)" : "1px solid transparent",
                backgroundColor: isActive ? "rgba(138, 100, 233, 0.12)" : "transparent",
                color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Active Tab Content ── */}
      {activeTab === "site-audit" && (
        <FullSiteAuditTab
          onWebsiteLoaded={(site) => {
            if (site && !primaryWebsite) {
              setPrimaryWebsite(site);
            }
          }}
        />
      )}

      {activeTab === "traffic" && (
        <div>
          {performanceError && (
            <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444", fontSize: "0.85rem" }}>
              ⚠️ {performanceError}
            </div>
          )}
          <TrafficMatrixTab
            traffic={performanceData?.traffic}
            retention={performanceData?.retention}
            usage={performanceData?.chatbot_usage}
            loading={loadingPerformance}
          />
        </div>
      )}
    </div>
  );
}
