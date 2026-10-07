"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectedWebsite {
  id: number;
  domain: string;
  root_url: string;
  is_primary: boolean;
  is_authorized: boolean;
  indexing_status: string;
}

interface SiteAudit {
  id: number;
  website_id: number;
  status: "pending" | "running" | "completed" | "failed";
  pages_crawled: number;
  pages_failed: number;
  avg_overall_score: number | null;
  avg_meta_score: number | null;
  avg_structure_score: number | null;
  avg_media_score: number | null;
  avg_social_score: number | null;
  total_errors: number;
  total_warnings: number;
  total_passed: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  pages?: AuditPage[];
}

interface AuditPage {
  id: number;
  url: string;
  http_status: number | null;
  overall_score: number | null;
  meta_score: number | null;
  structure_score: number | null;
  media_score: number | null;
  social_score: number | null;
  errors: number;
  warnings: number;
  passed: number;
  audits: AuditItem[];
  error: string | null;
  crawled_at: string | null;
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

interface AggregatedIssue {
  id: string;
  category: string;
  title: string;
  status: "error" | "warning";
  affectedPages: { url: string; score_text: string }[];
  description: string;
  fix_recommendation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number | null) {
  if (score === null) return "#6B7280";
  if (score >= 80) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(score: number | null) {
  if (score === null) return "—";
  if (score >= 80) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

function scoreBg(score: number | null) {
  if (score === null) return "rgba(107, 114, 128, 0.12)";
  if (score >= 80) return "rgba(16, 185, 129, 0.12)";
  if (score >= 50) return "rgba(245, 158, 11, 0.12)";
  return "rgba(239, 68, 68, 0.12)";
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
  if (status === "completed")
    return { ...base, background: "rgba(16,185,129,0.15)", color: "#10B981" };
  if (status === "running" || status === "pending")
    return { ...base, background: "rgba(99,102,241,0.15)", color: "#818CF8" };
  if (status === "failed")
    return { ...base, background: "rgba(239,68,68,0.15)", color: "#EF4444" };
  return { ...base, background: "rgba(107,114,128,0.15)", color: "#9CA3AF" };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ── Discoverability Layer Taxonomy (SEO · AEO · GEO) ─────────────────────────

export type DiscoverabilityLayer = "all" | "technical" | "onpage" | "aeo" | "geo";

export interface LayerMeta {
  key: DiscoverabilityLayer;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}

export const DISCOVERABILITY_LAYERS: LayerMeta[] = [
  { key: "all", label: "All Layers", shortLabel: "All", icon: "🔬", description: "All discoverability checks" },
  { key: "technical", label: "Technical SEO", shortLabel: "Technical", icon: "⚙️", description: "Crawlability, HTTPS, robots, canonicals & sitemaps" },
  { key: "onpage", label: "On-Page & Content", shortLabel: "On-Page", icon: "📝", description: "Titles, meta descriptions, headings, media & structure" },
  { key: "aeo", label: "Answer Engine (AEO)", shortLabel: "AEO", icon: "💡", description: "Schema.org, question headings, answer-first paragraphs" },
  { key: "geo", label: "Generative AI (GEO)", shortLabel: "GEO", icon: "🤖", description: "AI bot access, llms.txt, chunkability, E-E-A-T signals" },
];

function getAuditLayer(category: string, title?: string): "technical" | "onpage" | "aeo" | "geo" {
  const cat = (category || "").toLowerCase();
  const t = (title || "").toLowerCase();

  // GEO detection
  if (
    cat.includes("geo") ||
    cat.includes("generative") ||
    cat.includes("ai crawler") ||
    cat.includes("llm") ||
    t.includes("gptbot") ||
    t.includes("claudebot") ||
    t.includes("perplexity") ||
    t.includes("llms.txt") ||
    t.includes("chunk") ||
    t.includes("e-e-a-t")
  ) {
    return "geo";
  }

  // AEO detection
  if (
    cat.includes("aeo") ||
    cat.includes("answer engine") ||
    cat.includes("schema") ||
    cat.includes("faq") ||
    t.includes("schema") ||
    t.includes("faq") ||
    t.includes("question") ||
    t.includes("answer") ||
    t.includes("speakable") ||
    t.includes("readability")
  ) {
    return "aeo";
  }

  // Technical SEO detection
  if (
    cat.includes("technical") ||
    cat.includes("crawl") ||
    cat.includes("indexing") ||
    t.includes("robot") ||
    t.includes("sitemap") ||
    t.includes("https") ||
    t.includes("canonical") ||
    t.includes("redirect") ||
    t.includes("viewport") ||
    t.includes("vitals") ||
    t.includes("status code")
  ) {
    return "technical";
  }

  // Default to On-Page
  return "onpage";
}

function layerBadgeStyle(layer: "technical" | "onpage" | "aeo" | "geo"): { bg: string; color: string; border: string; label: string } {
  switch (layer) {
    case "geo":
      return { bg: "rgba(16, 185, 129, 0.12)", color: "#10B981", border: "rgba(16, 185, 129, 0.3)", label: "🤖 GEO" };
    case "aeo":
      return { bg: "rgba(245, 158, 11, 0.12)", color: "#F59E0B", border: "rgba(245, 158, 11, 0.3)", label: "💡 AEO" };
    case "technical":
      return { bg: "rgba(59, 130, 246, 0.12)", color: "#3B82F6", border: "rgba(59, 130, 246, 0.3)", label: "⚙️ Technical" };
    case "onpage":
    default:
      return { bg: "rgba(139, 92, 246, 0.12)", color: "#8B5CF6", border: "rgba(139, 92, 246, 0.3)", label: "📝 On-Page" };
  }
}

function ScoreGauge({
  score,
  size = 88,
  strokeWidth,
  label,
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const actualStroke = strokeWidth ?? (size < 60 ? 5 : 7);
  const r = (size - actualStroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const filled = (pct / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        {/* Background track circle - clearly visible in both light & dark mode */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={actualStroke}
          style={{ opacity: 0.9 }}
        />
        {/* Active colored progress arc */}
        {score !== null && score > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={actualStroke}
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.7s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        )}
      </svg>

      {/* Mathematically centered score value */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontSize: size >= 75 ? "1.35rem" : "0.92rem",
            fontWeight: 800,
            color,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {score !== null ? Math.round(score) : "—"}
        </span>
        {label && (
          <span
            style={{
              fontSize: "0.62rem",
              color: "var(--text-muted)",
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Tab Component ─────────────────────────────────────────────────────────────

export function FullSiteAuditTab() {
  const [websites, setWebsites] = useState<ConnectedWebsite[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<number | null>(null);
  const [auditHistory, setAuditHistory] = useState<SiteAudit[]>([]);
  const [currentAudit, setCurrentAudit] = useState<SiteAudit | null>(null);
  const [selectedPage, setSelectedPage] = useState<AuditPage | null>(null);
  const [viewMode, setViewMode] = useState<"pages" | "issues">("pages");
  const [pageFilter, setPageFilter] = useState<"all" | "error" | "warning" | "passed">("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "error" | "warning">("all");
  const [layerFilter, setLayerFilter] = useState<DiscoverabilityLayer>("all");
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [maxPages, setMaxPages] = useState(25);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollRunnerRef = useRef<((id: number) => Promise<void>) | null>(null);

  // ── Load websites + audit history ──────────────────────────────────────────

  const loadWebsites = useCallback(async () => {
    try {
      const res = await api.get<{ websites: ConnectedWebsite[] }>("/api/knowledge/websites");
      const authorized = (res.websites || []).filter((w) => w.is_authorized);
      setWebsites(authorized);
      if (authorized.length > 0 && !selectedWebsiteId) {
        const primary = authorized.find((w) => w.is_primary) || authorized[0];
        setSelectedWebsiteId(primary.id);
      }
    } catch (err) {
      console.error("Failed to load websites", err);
    }
  }, [selectedWebsiteId]);

  const loadAuditHistory = useCallback(async () => {
    try {
      const res = await api.get<{ audits: SiteAudit[] }>("/api/site-audit?limit=10");
      setAuditHistory(res.audits || []);
    } catch (err) {
      console.error("Failed to load audit history", err);
    }
  }, []);

  const loadLatestAudit = useCallback(
    async (websiteId: number) => {
      try {
        const res = await api.get<SiteAudit & { audit?: SiteAudit }>(`/api/site-audit/latest/${websiteId}`);
        if (res && res.id) {
          setCurrentAudit(res);
        } else {
          setCurrentAudit(null);
        }
      } catch {
        setCurrentAudit(null);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await Promise.all([loadWebsites(), loadAuditHistory()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadWebsites, loadAuditHistory]);

  useEffect(() => {
    if (selectedWebsiteId) {
      void loadLatestAudit(selectedWebsiteId);
    }
  }, [selectedWebsiteId, loadLatestAudit]);

  // ── Poll while an audit is running ────────────────────────────────────────

  const pollRunningAudit = useCallback(
    async (auditId: number) => {
      try {
        const res = await api.get<SiteAudit>(`/api/site-audit/${auditId}`);
        setCurrentAudit(res);
        if (res.status === "running" || res.status === "pending") {
          pollingRef.current = setTimeout(() => {
            if (pollRunnerRef.current) pollRunnerRef.current(auditId);
          }, 4000);
        } else {
          await loadAuditHistory();
          setLaunching(false);
        }
      } catch (err: unknown) {
        console.error("Polling error", err);
        setLaunching(false);
      }
    },
    [loadAuditHistory]
  );

  useEffect(() => {
    pollRunnerRef.current = pollRunningAudit;
  }, [pollRunningAudit]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  // ── Launch new audit ───────────────────────────────────────────────────────

  const handleStartAudit = async () => {
    if (!selectedWebsiteId) return;
    setLaunching(true);
    setErrorMsg(null);
    setSelectedPage(null);
    try {
      const res = await api.post<SiteAudit>("/api/site-audit/start", {
        website_id: selectedWebsiteId,
        max_pages: maxPages,
      });
      setCurrentAudit(res);
      pollingRef.current = setTimeout(() => {
        if (pollRunnerRef.current) pollRunnerRef.current(res.id);
      }, 3000);
    } catch (err: unknown) {
      setLaunching(false);
      const msg =
        err && typeof err === "object" && "data" in err && (err as { data: { error?: string } }).data?.error
          ? (err as { data: { error: string } }).data.error
          : err instanceof Error
          ? err.message
          : "Failed to start audit.";
      setErrorMsg(msg);
    }
  };

  // ── CSV Export (Actionable Fix Checklist + Page Scores) ─────────────────────

  const exportSummaryCSV = () => {
    if (!currentAudit || !currentAudit.pages) return;
    const rows = [
      ["URL", "HTTP Status", "Overall Score", "Meta Score", "Structure Score", "Media Score", "Social Score", "Errors", "Warnings", "Passed", "Error Message"],
      ...currentAudit.pages.map((p) => [
        `"${p.url.replace(/"/g, '""')}"`,
        p.http_status ?? "",
        p.overall_score ?? "",
        p.meta_score ?? "",
        p.structure_score ?? "",
        p.media_score ?? "",
        p.social_score ?? "",
        p.errors,
        p.warnings,
        p.passed,
        `"${(p.error || "").replace(/"/g, '""')}"`,
      ]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `site-audit-${currentAudit.id}-pages-summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportActionableChecklistCSV = () => {
    if (!currentAudit || !currentAudit.pages) return;
    const headers = [
      "Page URL",
      "Discoverability Layer",
      "Category",
      "Check Title",
      "Severity",
      "Evidence / Details",
      "Actionable Fix Recommendation",
    ];
    const rows: string[][] = [];
    for (const page of currentAudit.pages) {
      for (const item of page.audits || []) {
        if (item.status === "error" || item.status === "warning") {
          const layer = getAuditLayer(item.category, item.title);
          const layerLabel = DISCOVERABILITY_LAYERS.find((l) => l.key === layer)?.label || layer;
          rows.push([
            `"${page.url.replace(/"/g, '""')}"`,
            `"${layerLabel}"`,
            `"${(item.category || "").replace(/"/g, '""')}"`,
            `"${(item.title || "").replace(/"/g, '""')}"`,
            `"${item.status.toUpperCase()}"`,
            `"${(item.score_text || item.description || "").replace(/"/g, '""')}"`,
            `"${(item.fix_recommendation || "").replace(/"/g, '""')}"`,
          ]);
        }
      }
    }
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `site-audit-${currentAudit.id}-actionable-fix-checklist.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Aggregate Issues across all pages ──────────────────────────────────────

  const aggregatedIssues: AggregatedIssue[] = [];
  if (currentAudit?.pages) {
    const issueMap = new Map<string, AggregatedIssue>();
    for (const page of currentAudit.pages) {
      for (const item of page.audits || []) {
        if (item.status === "error" || item.status === "warning") {
          const key = `${item.id}-${item.status}`;
          if (!issueMap.has(key)) {
            issueMap.set(key, {
              id: item.id,
              category: item.category,
              title: item.title,
              status: item.status,
              affectedPages: [],
              description: item.description,
              fix_recommendation: item.fix_recommendation,
            });
          }
          issueMap.get(key)!.affectedPages.push({
            url: page.url,
            score_text: item.score_text,
          });
        }
      }
    }
    aggregatedIssues.push(...Array.from(issueMap.values()));
    aggregatedIssues.sort((a, b) => {
      if (a.status !== b.status) return a.status === "error" ? -1 : 1;
      return b.affectedPages.length - a.affectedPages.length;
    });
  }

  // ── Layer Counts & Issue Filtering ─────────────────────────────────────────

  const layerCounts: Record<DiscoverabilityLayer, number> = {
    all: aggregatedIssues.length,
    technical: aggregatedIssues.filter((i) => getAuditLayer(i.category, i.title) === "technical").length,
    onpage: aggregatedIssues.filter((i) => getAuditLayer(i.category, i.title) === "onpage").length,
    aeo: aggregatedIssues.filter((i) => getAuditLayer(i.category, i.title) === "aeo").length,
    geo: aggregatedIssues.filter((i) => getAuditLayer(i.category, i.title) === "geo").length,
  };

  const filteredIssues = aggregatedIssues.filter((issue) => {
    const matchesSeverity = issueFilter === "all" || issue.status === issueFilter;
    const issueLayer = getAuditLayer(issue.category, issue.title);
    const matchesLayer = layerFilter === "all" || issueLayer === layerFilter;
    return matchesSeverity && matchesLayer;
  });

  // ── Filter pages ──────────────────────────────────────────────────────────

  const filteredPages = (currentAudit?.pages || []).filter((p) => {
    if (pageFilter === "all") return true;
    if (pageFilter === "error") return p.errors > 0 || p.error;
    if (pageFilter === "warning") return p.warnings > 0 && !p.errors;
    if (pageFilter === "passed") return p.errors === 0 && p.warnings === 0;
    return true;
  });

  const isRunning = currentAudit?.status === "running" || currentAudit?.status === "pending";
  const selectedWebsite = websites.find((w) => w.id === selectedWebsiteId);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: "6rem 2rem", textAlign: "center", color: "var(--text-muted)" }}>
        <div
          style={{
            fontSize: "2rem",
            marginBottom: "1rem",
            animation: "spin 1.5s linear infinite",
            display: "inline-block",
          }}
        >
          🔄
        </div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
          Loading Full-Site Audit...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* ── Launch New Audit Card ── */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.25rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🚀</span>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Launch Multi-Page Site Audit
          </h2>
        </div>
        <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Crawl your authorized website and analyze each page&apos;s technical SEO health, headings, and discoverability.
        </p>

        {websites.length === 0 ? (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: 8,
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.25)",
              color: "#F59E0B",
              fontSize: "0.88rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span>No authorized website found. Connect and authorize your company domain in Knowledge Lake first.</span>
            <Link
              href="/workspace/knowledge"
              style={{
                color: "#F59E0B",
                fontWeight: 700,
                textDecoration: "underline",
                fontSize: "0.85rem",
              }}
            >
              Connect website in Knowledge Lake →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
                Website
              </label>
              <select
                value={selectedWebsiteId ?? ""}
                onChange={(e) => setSelectedWebsiteId(Number(e.target.value))}
                disabled={isRunning || launching}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.9rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.88rem",
                  fontFamily: "inherit",
                }}
              >
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.domain} {w.is_primary ? "(Primary)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: 140 }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
                Max Pages
              </label>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                disabled={isRunning || launching}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.9rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.88rem",
                  fontFamily: "inherit",
                }}
              >
                <option value={10}>10 pages</option>
                <option value={25}>25 pages</option>
                <option value={50}>50 pages</option>
              </select>
            </div>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                onClick={handleStartAudit}
                disabled={isRunning || launching || !selectedWebsiteId}
                style={{
                  padding: "0.65rem 1.4rem",
                  borderRadius: 8,
                  border: "none",
                  background: isRunning ? "rgba(99,102,241,0.5)" : "linear-gradient(135deg, #6366F1, #8B5CF6)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: isRunning || launching ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                  transition: "opacity 0.2s",
                }}
              >
                {isRunning || launching ? (
                  <>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🔄</span>
                    Running Audit...
                  </>
                ) : (
                  <>
                    <span>🔬</span> Run Audit
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.65rem 0.9rem",
              borderRadius: 6,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#EF4444",
              fontSize: "0.82rem",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* ── Active Audit Running Banner ── */}
      {isRunning && (
        <div
          style={{
            backgroundColor: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 14,
            padding: "1.75rem",
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 12,
              background: "rgba(99,102,241,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              animation: "spin 2s linear infinite",
            }}
          >
            🔄
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: 4 }}>
              Crawl in progress for {selectedWebsite?.domain}…
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
              The crawler is fetching up to {maxPages} pages, extracting metadata, and calculating category scores in the background. Results will refresh automatically.
            </div>
          </div>
        </div>
      )}

      {/* ── Current/Latest Audit Results ── */}
      {currentAudit && currentAudit.status === "completed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Summary Card */}
          <div
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "1.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "1.5rem",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Site Audit Summary
                </h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Completed {formatDate(currentAudit.completed_at)} · {currentAudit.pages_crawled} pages crawled
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={exportActionableChecklistCSV}
                  title="Download complete actionable fix checklist with exact evidence and fix recommendations"
                  style={{
                    padding: "0.45rem 0.95rem",
                    borderRadius: 6,
                    border: "1px solid rgba(139, 92, 246, 0.4)",
                    background: "rgba(139, 92, 246, 0.12)",
                    color: "var(--accent, #8A64E9)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📥 Export Fix Checklist (CSV)
                </button>
                <button
                  onClick={exportSummaryCSV}
                  title="Download page-by-page score matrix"
                  style={{
                    padding: "0.45rem 0.9rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📊 Page Scores (CSV)
                </button>
                <Link
                  href={`/workspace/seo/site-audit/${currentAudit.id}`}
                  style={{
                    padding: "0.45rem 0.9rem",
                    borderRadius: 6,
                    border: "1px solid rgba(99,102,241,0.3)",
                    background: "rgba(99,102,241,0.12)",
                    color: "#818CF8",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Permalink ↗
                </Link>
                <span style={statusBadgeStyle(currentAudit.status)}>
                  ✓ Completed
                </span>
              </div>
            </div>

            {/* Score Gauges Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "1.25rem",
                padding: "1.5rem 0",
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {[
                { label: "Overall", score: currentAudit.avg_overall_score },
                { label: "Meta & Headings", score: currentAudit.avg_meta_score },
                { label: "Structure", score: currentAudit.avg_structure_score },
                { label: "Media & Assets", score: currentAudit.avg_media_score },
                { label: "Social & OG", score: currentAudit.avg_social_score },
              ].map(({ label, score }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  <ScoreGauge score={score} size={88} strokeWidth={7} />
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      textAlign: "center",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 10px",
                      borderRadius: 9999,
                      backgroundColor: scoreBg(score),
                      color: scoreColor(score),
                      letterSpacing: "0.02em",
                    }}
                  >
                    {scoreLabel(score)}
                  </span>
                </div>
              ))}
            </div>

            {/* Error / Warning / Passed counters */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1rem",
                marginTop: "1.5rem",
              }}
            >
              <div
                style={{
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  borderRadius: 10,
                  padding: "1.1rem 1rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#EF4444", lineHeight: 1.1, marginBottom: 4 }}>
                  {currentAudit.total_errors}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Total Errors
                </div>
              </div>

              <div
                style={{
                  background: "rgba(245,158,11,0.06)",
                  border: "1px solid rgba(245,158,11,0.22)",
                  borderRadius: 10,
                  padding: "1.1rem 1rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#F59E0B", lineHeight: 1.1, marginBottom: 4 }}>
                  {currentAudit.total_warnings}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Total Warnings
                </div>
              </div>

              <div
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.22)",
                  borderRadius: 10,
                  padding: "1.1rem 1rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#10B981", lineHeight: 1.1, marginBottom: 4 }}>
                  {currentAudit.total_passed}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Checks Passed
                </div>
              </div>
            </div>
          </div>

          {/* ── Sub-Tabs: Pages Breakdown vs Aggregated Issues ── */}
          <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            <button
              onClick={() => setViewMode("pages")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 8,
                border: "none",
                background: viewMode === "pages" ? "rgba(99,102,241,0.15)" : "transparent",
                color: viewMode === "pages" ? "#818CF8" : "var(--text-muted)",
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              📄 Pages Breakdown ({currentAudit.pages?.length || 0})
            </button>
            <button
              onClick={() => setViewMode("issues")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 8,
                border: "none",
                background: viewMode === "issues" ? "rgba(99,102,241,0.15)" : "transparent",
                color: viewMode === "issues" ? "#818CF8" : "var(--text-muted)",
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              📋 Aggregated Issues & Fix Checklist ({aggregatedIssues.length})
            </button>
          </div>

          {/* ── View 1: Pages Breakdown Table ── */}
          {viewMode === "pages" && (
            <div
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                  Page Results ({filteredPages.length})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["all", "error", "warning", "passed"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPageFilter(f)}
                      style={{
                        padding: "0.3rem 0.75rem",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: pageFilter === f ? "rgba(99,102,241,0.2)" : "transparent",
                        color: pageFilter === f ? "#818CF8" : "var(--text-muted)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredPages.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No pages match filter &quot;{pageFilter}&quot;.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {filteredPages.map((page) => (
                    <div
                      key={page.id}
                      onClick={() => setSelectedPage(selectedPage?.id === page.id ? null : page)}
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "1rem 1.25rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 260 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: `${scoreColor(page.overall_score)}15`,
                              border: `2px solid ${scoreColor(page.overall_score)}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              color: scoreColor(page.overall_score),
                              flexShrink: 0,
                            }}
                          >
                            {page.overall_score !== null ? Math.round(page.overall_score) : "—"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                              {page.url.replace(/^https?:\/\//, "")}
                            </div>
                            <div style={{ display: "flex", gap: 8, fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                              {page.errors > 0 && <span style={{ color: "#EF4444" }}>{page.errors} errors</span>}
                              {page.warnings > 0 && <span style={{ color: "#F59E0B" }}>{page.warnings} warnings</span>}
                              {page.errors === 0 && page.warnings === 0 && <span style={{ color: "#10B981" }}>All passed</span>}
                            </div>
                          </div>
                        </div>

                        {/* Category badges */}
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: scoreColor(page.meta_score) }}>
                            M
                          </span>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: scoreColor(page.structure_score) }}>
                            S
                          </span>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: scoreColor(page.media_score) }}>
                            A
                          </span>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: scoreColor(page.social_score) }}>
                            G
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: 6 }}>
                            {selectedPage?.id === page.id ? "▲" : "▼"}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Page Findings */}
                      {selectedPage?.id === page.id && (
                        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          {page.audits.map((item) => {
                            const layer = getAuditLayer(item.category, item.title);
                            const b = layerBadgeStyle(layer);
                            return (
                              <div
                                key={item.id}
                                style={{
                                  padding: "0.75rem",
                                  borderRadius: 8,
                                  background: "var(--bg-card)",
                                  border: "1px solid var(--border)",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span>{item.status === "passed" ? "✅" : item.status === "warning" ? "⚠️" : "❌"}</span>
                                    <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                      {item.title}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "0.68rem",
                                        fontWeight: 700,
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        background: b.bg,
                                        color: b.color,
                                        border: `1px solid ${b.border}`,
                                      }}
                                    >
                                      {b.label}
                                    </span>
                                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                      ({item.category})
                                    </span>
                                  </div>
                                  <span style={{ fontSize: "0.78rem", color: item.status === "passed" ? "#10B981" : item.status === "warning" ? "#F59E0B" : "#EF4444", fontWeight: 700 }}>
                                    {item.score_text}
                                  </span>
                                </div>
                                <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                  {item.description}
                                </p>
                                {item.fix_recommendation && (
                                  <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: 6, background: "rgba(0,0,0,0.2)", fontSize: "0.78rem", color: "var(--text-primary)", borderLeft: `3px solid ${item.status === "passed" ? "#10B981" : item.status === "warning" ? "#F59E0B" : "#EF4444"}` }}>
                                    <strong>Fix:</strong> {item.fix_recommendation}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── View 2: Aggregated Issues Checklist ── */}
          {viewMode === "issues" && (
            <div
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1.25rem",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <h4 style={{ margin: "0 0 0.2rem 0", fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Aggregated Issues Checklist
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    Issues grouped across all crawled pages with affected URL lists, evidence, and actionable code fixes.
                  </p>
                </div>

                {/* Severity Filter */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Severity:</span>
                  {(["all", "error", "warning"] as const).map((f) => {
                    const isActive = issueFilter === f;
                    return (
                      <button
                        key={f}
                        onClick={() => setIssueFilter(f)}
                        style={{
                          padding: "0.3rem 0.75rem",
                          borderRadius: 6,
                          border: isActive ? "1px solid rgba(99,102,241,0.5)" : "1px solid var(--border)",
                          background: isActive ? "rgba(99,102,241,0.2)" : "transparent",
                          color: isActive ? "#818CF8" : "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                      >
                        {f === "error" ? "❌ Errors" : f === "warning" ? "⚠️ Warnings" : "All"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discoverability Layer Filter Bar */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "1.5rem",
                  paddingBottom: "1rem",
                  borderBottom: "1px solid var(--border)",
                  overflowX: "auto",
                  flexWrap: "wrap",
                }}
              >
                {DISCOVERABILITY_LAYERS.map((layer) => {
                  const isActive = layerFilter === layer.key;
                  const count = layerCounts[layer.key];
                  return (
                    <button
                      key={layer.key}
                      onClick={() => setLayerFilter(layer.key)}
                      title={layer.description}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0.4rem 0.85rem",
                        borderRadius: 8,
                        border: isActive ? "1px solid rgba(139, 92, 246, 0.5)" : "1px solid var(--border)",
                        background: isActive ? "rgba(139, 92, 246, 0.15)" : "var(--bg-surface)",
                        color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                        fontSize: "0.8rem",
                        fontWeight: isActive ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>{layer.icon}</span>
                      <span>{layer.label}</span>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          padding: "1px 6px",
                          borderRadius: 10,
                          background: isActive ? "rgba(139, 92, 246, 0.25)" : "rgba(125,125,125,0.12)",
                          color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                          fontWeight: 700,
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {filteredIssues.length === 0 ? (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                  No issues found matching the selected filter ({issueFilter} / {DISCOVERABILITY_LAYERS.find(l => l.key === layerFilter)?.label}).
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {filteredIssues.map((issue) => {
                    const layer = getAuditLayer(issue.category, issue.title);
                    const b = layerBadgeStyle(layer);
                    return (
                      <div
                        key={issue.id}
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "1.25rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{ fontSize: "1.2rem", marginTop: 2 }}>{issue.status === "error" ? "❌" : "⚠️"}</span>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                  {issue.title}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    backgroundColor: b.bg,
                                    color: b.color,
                                    border: `1px solid ${b.border}`,
                                  }}
                                >
                                  {b.label}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                Category: <strong>{issue.category}</strong> · Affects{" "}
                                <strong style={{ color: issue.status === "error" ? "#EF4444" : "#F59E0B" }}>
                                  {issue.affectedPages.length} {issue.affectedPages.length === 1 ? "page" : "pages"}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                            style={{
                              padding: "0.35rem 0.75rem",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: "var(--bg-card)",
                              color: "var(--text-primary)",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {expandedIssue === issue.id ? "Hide Pages ▲" : `View ${issue.affectedPages.length} Pages ▼`}
                          </button>
                        </div>

                      <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                        {issue.description}
                      </p>

                      {issue.fix_recommendation && (
                        <div
                          style={{
                            marginTop: "0.85rem",
                            padding: "0.75rem 1rem",
                            borderRadius: 6,
                            background: "var(--bg-card)",
                            borderLeft: `3px solid ${issue.status === "error" ? "#EF4444" : "#F59E0B"}`,
                            fontSize: "0.82rem",
                            color: "var(--text-primary)",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Actionable Fix:</strong> {issue.fix_recommendation}
                        </div>
                      )}

                      {/* Expanded list of affected URLs */}
                      {expandedIssue === issue.id && (
                        <div
                          style={{
                            marginTop: "1rem",
                            padding: "0.75rem 1rem",
                            borderRadius: 8,
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
                            Affected URLs ({issue.affectedPages.length}):
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                            {issue.affectedPages.map((ap, i) => (
                              <div
                                key={i}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  fontSize: "0.8rem",
                                  padding: "4px 0",
                                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                                }}
                              >
                                <span style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>
                                  {ap.url}
                                </span>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                                  {ap.score_text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Recent Audit History ── */}
      {auditHistory.length > 0 && (
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem",
          }}
        >
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Recent Audit History
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {auditHistory.map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  if (a.website_id) {
                    setSelectedWebsiteId(a.website_id);
                    void api.get<SiteAudit>(`/api/site-audit/${a.id}`).then(setCurrentAudit);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.85rem 1.1rem",
                  borderRadius: 8,
                  backgroundColor: currentAudit?.id === a.id ? "rgba(99,102,241,0.12)" : "var(--bg-surface)",
                  border: currentAudit?.id === a.id ? "1px solid rgba(99,102,241,0.35)" : "1px solid var(--border)",
                  cursor: "pointer",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background:
                        a.status === "completed"
                          ? `${scoreColor(a.avg_overall_score)}20`
                          : "rgba(107,114,128,0.15)",
                      border: `2px solid ${a.status === "completed" ? scoreColor(a.avg_overall_score) : "#6B7280"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "0.85rem",
                      color: a.status === "completed" ? scoreColor(a.avg_overall_score) : "#6B7280",
                    }}
                  >
                    {a.status === "completed" && a.avg_overall_score !== null
                      ? Math.round(a.avg_overall_score)
                      : "—"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                      {formatDate(a.created_at)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {a.pages_crawled} pages · {a.total_errors} errors · {a.total_warnings} warnings
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={statusBadgeStyle(a.status)}>
                    {a.status}
                  </span>
                  {a.status === "completed" && (
                    <Link
                      href={`/workspace/seo/site-audit/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: "0.75rem",
                        color: "#fff",
                        background: "rgba(99,102,241,0.2)",
                        border: "1px solid rgba(99,102,241,0.35)",
                        padding: "3px 8px",
                        borderRadius: 6,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      Full Report ↗
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
