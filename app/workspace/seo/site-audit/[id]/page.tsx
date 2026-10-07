"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Page Component ────────────────────────────────────────────────────────────

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params?.id ? String(params.id) : null;

  const [audit, setAudit] = useState<SiteAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"pages" | "issues">("pages");
  const [pageFilter, setPageFilter] = useState<"all" | "error" | "warning" | "passed">("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "error" | "warning">("all");
  const [layerFilter, setLayerFilter] = useState<DiscoverabilityLayer>("all");
  const [selectedPage, setSelectedPage] = useState<AuditPage | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAudit = useCallback(async () => {
    if (!auditId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get<SiteAudit>(`/api/site-audit/${auditId}`);
      setAudit(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit report.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [auditId]);

  useEffect(() => {
    let cancelled = false;
    const fetchInitial = async () => {
      if (!auditId) return;
      try {
        const res = await api.get<SiteAudit>(`/api/site-audit/${auditId}`);
        if (!cancelled) setAudit(res);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load audit report.";
          setErrorMsg(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchInitial();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  const handleDelete = async () => {
    if (!audit || !confirm(`Delete Site Audit #${audit.id}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/api/site-audit/${audit.id}`);
      router.push("/workspace/seo");
    } catch (err: unknown) {
      alert("Failed to delete audit: " + (err instanceof Error ? err.message : "Unknown error"));
      setDeleting(false);
    }
  };

  // ── CSV Export (Actionable Fix Checklist + Page Scores) ─────────────────────

  const exportSummaryCSV = () => {
    if (!audit || !audit.pages) return;
    const rows = [
      ["URL", "HTTP Status", "Overall Score", "Meta Score", "Structure Score", "Media Score", "Social Score", "Errors", "Warnings", "Passed", "Error Message"],
      ...audit.pages.map((p) => [
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
    link.setAttribute("download", `site-audit-${audit.id}-pages-summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportActionableChecklistCSV = () => {
    if (!audit || !audit.pages) return;
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
    for (const page of audit.pages) {
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
    link.setAttribute("download", `site-audit-${audit.id}-actionable-fix-checklist.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Aggregate Issues across all pages ──────────────────────────────────────
  const aggregatedIssues: AggregatedIssue[] = [];
  if (audit?.pages) {
    const issueMap = new Map<string, AggregatedIssue>();
    for (const page of audit.pages) {
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
    // Sort errors first, then by number of affected pages descending
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

  const filteredPages = (audit?.pages || []).filter((p) => {
    if (pageFilter === "all") return true;
    if (pageFilter === "error") return p.errors > 0 || p.error;
    if (pageFilter === "warning") return p.warnings > 0 && !p.errors;
    if (pageFilter === "passed") return p.errors === 0 && p.warnings === 0;
    return true;
  });

  const filteredIssues = aggregatedIssues.filter((issue) => {
    const matchesSeverity = issueFilter === "all" || issue.status === issueFilter;
    const issueLayer = getAuditLayer(issue.category, issue.title);
    const matchesLayer = layerFilter === "all" || issueLayer === layerFilter;
    return matchesSeverity && matchesLayer;
  });

  if (loading) {
    return (
      <div style={{ padding: "6rem 2rem", textAlign: "center", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem", animation: "spin 1.5s linear infinite", display: "inline-block" }}>
          🔄
        </div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
          Loading Audit Report #{auditId}...
        </div>
      </div>
    );
  }

  if (errorMsg || !audit) {
    return (
      <div style={{ maxWidth: 800, margin: "3rem auto", padding: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚠️</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
          Audit Report Not Found
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          {errorMsg || "The requested audit report could not be found or you do not have permission to view it."}
        </p>
        <Link
          href="/workspace/seo"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "0.6rem 1.25rem",
            borderRadius: 8,
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.88rem",
            textDecoration: "none",
          }}
        >
          ← Back to Site Audit Hub
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* ── Top Navigation Bar ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/workspace/seo"
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
          }}
        >
          ← Back to SEO Health &amp; Audit Hub
        </Link>
      </div>

      {/* ── Breadcrumb & Top Controls ── */}
      <div style={{ marginBottom: "1.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.4rem" }}>
            <Link
              href="/workspace/seo"
              style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}
            >
              SEO Health
            </Link>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>/</span>
            <Link
              href="/workspace/seo"
              style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}
            >
              Site Audit
            </Link>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>/</span>
            <span style={{ color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600 }}>
              Audit #{audit.id}
            </span>
          </div>
          <h1
            style={{
              margin: "0 0 0.3rem 0",
              fontSize: "1.75rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Audit Report #{audit.id}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)", fontSize: "0.85rem" }}>
            <span>Completed {formatDate(audit.completed_at)}</span>
            <span>·</span>
            <span>{audit.pages_crawled} pages analyzed</span>
            {audit.pages_failed > 0 && (
              <>
                <span>·</span>
                <span style={{ color: "#EF4444" }}>{audit.pages_failed} failed</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={exportActionableChecklistCSV}
            title="Download complete actionable fix checklist with exact evidence and fix recommendations"
            style={{
              padding: "0.55rem 1rem",
              borderRadius: 8,
              border: "1px solid rgba(139, 92, 246, 0.4)",
              background: "rgba(139, 92, 246, 0.12)",
              color: "var(--accent, #8A64E9)",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
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
              padding: "0.55rem 1rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            📊 Page Scores (CSV)
          </button>
          <Link
            href="/workspace/seo"
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 700,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🔬 Run New Audit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: "0.55rem 0.9rem",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)",
              color: "#EF4444",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: deleting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      {/* ── Summary & Gauges Card ── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "2rem",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
              Overall Health Scores
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              Aggregated across all {audit.pages_crawled} analyzed URLs
            </div>
          </div>
          <span style={statusBadgeStyle(audit.status)}>
            ✅ {audit.status}
          </span>
        </div>

        {/* Score Gauges Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "1.25rem",
            textAlign: "center",
          }}
        >
          {[
            { label: "Overall", score: audit.avg_overall_score },
            { label: "Meta & Headings", score: audit.avg_meta_score },
            { label: "Structure", score: audit.avg_structure_score },
            { label: "Media & Assets", score: audit.avg_media_score },
            { label: "Social & OG", score: audit.avg_social_score },
          ].map(({ label, score }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <ScoreGauge score={score} size={88} strokeWidth={7} />
              <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 700 }}>{label}</span>
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

        {/* Issue Count Summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1rem",
            marginTop: "1.75rem",
          }}
        >
          {[
            { label: "Total Errors", count: audit.total_errors, color: "#EF4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.22)" },
            { label: "Total Warnings", count: audit.total_warnings, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.22)" },
            { label: "Checks Passed", count: audit.total_passed, color: "#10B981", bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.22)" },
          ].map(({ label, count, color, bg, border }) => (
            <div
              key={label}
              style={{
                padding: "1.1rem 1rem",
                borderRadius: 10,
                background: bg,
                border: `1px solid ${border}`,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color, lineHeight: 1.1, marginBottom: 4 }}>{count}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── View Mode Switcher (Pages vs Issues) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: "1.5rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          padding: "6px",
          borderRadius: 10,
          width: "fit-content",
        }}
      >
        <button
          onClick={() => setViewMode("pages")}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "none",
            background: viewMode === "pages" ? "rgba(99,102,241,0.2)" : "transparent",
            color: viewMode === "pages" ? "#818CF8" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "0.85rem",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          📄 Pages Breakdown ({audit.pages?.length ?? 0})
        </button>
        <button
          onClick={() => setViewMode("issues")}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "none",
            background: viewMode === "issues" ? "rgba(99,102,241,0.2)" : "transparent",
            color: viewMode === "issues" ? "#818CF8" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "0.85rem",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          📋 Aggregated Issues & Fix Checklist ({aggregatedIssues.length})
        </button>
      </div>

      {/* ── VIEW 1: Pages Breakdown ── */}
      {viewMode === "pages" && (
        <div style={{ display: "grid", gridTemplateColumns: selectedPage ? "1fr 440px" : "1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* Page List */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            }}
          >
            {/* Filter Bar */}
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                Crawled URLs ({audit.pages?.length ?? 0})
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["all", "error", "warning", "passed"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setPageFilter(f)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 20,
                      border: "1px solid",
                      borderColor: pageFilter === f ? "#6366F1" : "var(--border)",
                      background: pageFilter === f ? "rgba(99,102,241,0.15)" : "transparent",
                      color: pageFilter === f ? "#818CF8" : "var(--text-muted)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      textTransform: "capitalize",
                      transition: "all 0.15s",
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Rows */}
            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              {filteredPages.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No pages match this filter.
                </div>
              ) : (
                filteredPages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => setSelectedPage(selectedPage?.id === page.id ? null : page)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "0.9rem 1.25rem",
                      borderBottom: "1px solid var(--border)",
                      background: selectedPage?.id === page.id ? "rgba(99,102,241,0.08)" : "transparent",
                      border: "none",
                      borderLeft: selectedPage?.id === page.id ? "3px solid #6366F1" : "3px solid transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    {/* Score circle */}
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: page.error
                          ? "rgba(239,68,68,0.15)"
                          : `${scoreColor(page.overall_score)}20`,
                        border: `2px solid ${page.error ? "#EF4444" : scoreColor(page.overall_score)}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                        color: page.error ? "#EF4444" : scoreColor(page.overall_score),
                        flexShrink: 0,
                      }}
                    >
                      {page.error ? "!" : page.overall_score !== null ? Math.round(page.overall_score) : "?"}
                    </div>

                    {/* URL info */}
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {page.url.replace(/^https?:\/\//, "")}
                      </div>
                      {page.error ? (
                        <div style={{ fontSize: "0.72rem", color: "#EF4444", marginTop: 2 }}>
                          {page.error.slice(0, 70)}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                          {page.errors > 0 && (
                            <span style={{ fontSize: "0.7rem", color: "#EF4444", fontWeight: 600 }}>
                              {page.errors} error{page.errors !== 1 ? "s" : ""}
                            </span>
                          )}
                          {page.warnings > 0 && (
                            <span style={{ fontSize: "0.7rem", color: "#F59E0B", fontWeight: 600 }}>
                              {page.warnings} warning{page.warnings !== 1 ? "s" : ""}
                            </span>
                          )}
                          {page.errors === 0 && page.warnings === 0 && (
                            <span style={{ fontSize: "0.7rem", color: "#10B981", fontWeight: 600 }}>
                              ✓ All passed
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mini score indicators */}
                    {!page.error && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {[
                          { s: page.meta_score, label: "M" },
                          { s: page.structure_score, label: "S" },
                          { s: page.media_score, label: "A" },
                          { s: page.social_score, label: "G" },
                        ].map(({ s, label }) => (
                          <div
                            key={label}
                            title={`${label}: ${s ?? "—"}`}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              background: `${scoreColor(s)}25`,
                              border: `1px solid ${scoreColor(s)}50`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.58rem",
                              fontWeight: 700,
                              color: scoreColor(s),
                            }}
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Page Detail Panel */}
          {selectedPage && (
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                overflow: "hidden",
                position: "sticky",
                top: 20,
                maxHeight: "85vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: 2 }}>
                    Page Audit Details
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#818CF8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedPage.url}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPage(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "1.2rem",
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Gauges mini row */}
              {!selectedPage.error && (
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    gap: "0.5rem",
                    justifyContent: "space-around",
                  }}
                >
                  {[
                    { label: "Overall", score: selectedPage.overall_score },
                    { label: "Meta", score: selectedPage.meta_score },
                    { label: "Structure", score: selectedPage.structure_score },
                    { label: "Media", score: selectedPage.media_score },
                    { label: "Social", score: selectedPage.social_score },
                  ].map(({ label, score }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <ScoreGauge score={score} size={48} />
                      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Checks list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
                {selectedPage.error ? (
                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: 8,
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      color: "#EF4444",
                      fontSize: "0.85rem",
                    }}
                  >
                    {selectedPage.error}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(selectedPage.audits || []).map((auditItem) => {
                      const layer = getAuditLayer(auditItem.category, auditItem.title);
                      const b = layerBadgeStyle(layer);
                      return (
                        <div
                          key={auditItem.id}
                          style={{
                            padding: "0.85rem 1rem",
                            borderRadius: 10,
                            background: "var(--bg-secondary)",
                            borderLeft: `3px solid ${
                              auditItem.status === "passed"
                                ? "#10B981"
                                : auditItem.status === "warning"
                                ? "#F59E0B"
                                : "#EF4444"
                            }`,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>
                                {auditItem.title}
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
                            </div>
                            <span
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                padding: "2px 6px",
                                borderRadius: 4,
                                background:
                                  auditItem.status === "passed"
                                    ? "rgba(16,185,129,0.15)"
                                    : auditItem.status === "warning"
                                    ? "rgba(245,158,11,0.15)"
                                    : "rgba(239,68,68,0.15)",
                                color:
                                  auditItem.status === "passed"
                                    ? "#10B981"
                                    : auditItem.status === "warning"
                                    ? "#F59E0B"
                                    : "#EF4444",
                              }}
                            >
                              {auditItem.status}
                            </span>
                          </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 6 }}>
                          {auditItem.description}
                        </div>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                          Found: {auditItem.score_text}
                        </div>
                        {auditItem.fix_recommendation && auditItem.status !== "passed" && (
                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              background: "rgba(99,102,241,0.08)",
                              border: "1px solid rgba(99,102,241,0.2)",
                              fontSize: "0.73rem",
                              color: "#818CF8",
                              lineHeight: 1.4,
                            }}
                          >
                            💡 <strong>Fix:</strong> {auditItem.fix_recommendation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 2: Aggregated Issues & Fix Checklist ── */}
      {viewMode === "issues" && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem",
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          }}
        >
          {/* Filter Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                Issues Requiring Action ({filteredIssues.length})
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                Grouped across all crawled pages. Click any issue to view affected URLs, evidence, and suggested code fixes.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Severity:</span>
              {(["all", "error", "warning"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setIssueFilter(f)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 20,
                    border: "1px solid",
                    borderColor: issueFilter === f ? "#6366F1" : "var(--border)",
                    background: issueFilter === f ? "rgba(99,102,241,0.15)" : "transparent",
                    color: issueFilter === f ? "#818CF8" : "var(--text-muted)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all 0.15s",
                  }}
                >
                  {f === "all" ? "All" : f === "error" ? "❌ Errors" : "⚠️ Warnings"}
                </button>
              ))}
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
                    background: isActive ? "rgba(139, 92, 246, 0.15)" : "var(--bg-secondary)",
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
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎉</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                No issues found!
              </div>
              <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                All audited pages passed the checks for {issueFilter} / {DISCOVERABILITY_LAYERS.find(l => l.key === layerFilter)?.label}.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {filteredIssues.map((issue) => {
                const isExpanded = expandedIssue === `${issue.id}-${issue.status}`;
                const layer = getAuditLayer(issue.category, issue.title);
                const b = layerBadgeStyle(layer);
                return (
                  <div
                    key={`${issue.id}-${issue.status}`}
                    style={{
                      borderRadius: 12,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      borderLeft: `4px solid ${issue.status === "error" ? "#EF4444" : "#F59E0B"}`,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      onClick={() => setExpandedIssue(isExpanded ? null : `${issue.id}-${issue.status}`)}
                      style={{
                        padding: "1rem 1.25rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background: issue.status === "error" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                            color: issue.status === "error" ? "#EF4444" : "#F59E0B",
                          }}
                        >
                          {issue.status}
                        </span>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>
                              {issue.title}
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
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                            Category: <strong>{issue.category}</strong> · Affects {issue.affectedPages.length} page{issue.affectedPages.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: "rgba(255,255,255,0.06)",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          {issue.affectedPages.length} URL{issue.affectedPages.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "0 1.25rem 1.25rem 1.25rem", borderTop: "1px solid var(--border)" }}>
                        <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {issue.description}
                        </div>

                        {issue.fix_recommendation && (
                          <div
                            style={{
                              marginTop: "0.75rem",
                              padding: "0.85rem 1rem",
                              borderRadius: 8,
                              background: "rgba(99,102,241,0.08)",
                              border: "1px solid rgba(99,102,241,0.25)",
                              fontSize: "0.82rem",
                              color: "#818CF8",
                              lineHeight: 1.5,
                            }}
                          >
                            🛠️ <strong>Recommended Action:</strong> {issue.fix_recommendation}
                          </div>
                        )}

                        <div style={{ marginTop: "1rem" }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                            Affected URLs ({issue.affectedPages.length}):
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                            {issue.affectedPages.map((aff, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "5px 10px",
                                  borderRadius: 6,
                                  background: "var(--bg-card)",
                                  fontSize: "0.78rem",
                                }}
                              >
                                <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {aff.url}
                                </span>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flexShrink: 0, marginLeft: 8 }}>
                                  {aff.score_text}
                                </span>
                              </div>
                            ))}
                          </div>
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
  );
}
