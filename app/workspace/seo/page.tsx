"use client";

import { useEffect, useState } from "react";
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
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "traffic" || tab === "chat-activity") {
        return "traffic";
      }
    }
    return "site-audit";
  });
  const [primaryWebsite, setPrimaryWebsite] = useState<ConnectedWebsite | null>(null);

  // Lazy-loaded Chat Activity performance data
  const [performanceData, setPerformanceData] = useState<AppPerformanceData | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);

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


  useEffect(() => {
    let cancelled = false;
    if (activeTab === "traffic" && !performanceData && !loadingPerformance) {
      void (async () => {
        try {
          const res = await api.get<AppPerformanceData>("/api/analytics/app-performance");
          if (!cancelled) {
            setPerformanceData(res);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            console.error("Failed to load app performance data", err);
            setPerformanceError("Unable to load chat activity data.");
          }
        } finally {
          if (!cancelled) {
            setLoadingPerformance(false);
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [activeTab, performanceData, loadingPerformance]);

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
              fontSize: "0.82rem",
              fontWeight: 500,
              color: "var(--text-secondary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "0.42rem 0.8rem",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0 3px rgba(16,185,129,0.15)" }}
            />
            <span>{domainDisplay}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--text-muted)" }}>
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        )}
      </header>

      {/* ── Primary Navigation Tabs: "Website check" and "Chat activity" ── */}
      <div
        style={{
          display: "flex",
          gap: "1.75rem",
          marginBottom: "1.75rem",
          borderBottom: "1px solid var(--border)",
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
                padding: "0.4rem 0 0.8rem",
                marginBottom: -1,
                fontSize: "0.9rem",
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                border: "none",
                borderBottom: `2px solid ${isActive ? "var(--text-primary)" : "transparent"}`,
                backgroundColor: "transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                transition: "color 0.15s ease, border-color 0.15s ease",
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
