"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConnectedWebsite {
  id: number;
  domain: string;
  root_url: string;
  is_primary: boolean;
  is_authorized: boolean;
  indexing_status: string;
}

export interface SiteAudit {
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

export interface AuditPage {
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

export interface AuditItem {
  id: string;
  layer?: "technical" | "on_page" | "aeo" | "geo" | string;
  category: string;
  title: string;
  status: "passed" | "warning" | "error";
  score: number;
  max_score: number;
  score_text: string;
  description: string;
  fix_recommendation: string;
}

export interface AggregatedIssue {
  id: string;
  layer: "technical" | "on_page" | "aeo" | "geo";
  category: string;
  title: string;
  status: "error" | "warning";
  affectedPages: { url: string; score_text: string }[];
  description: string;
  fix_recommendation: string;
}

export type DiscoverabilityLayer = "all" | "technical" | "on_page" | "aeo" | "geo";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function scoreColor(score: number | null): string {
  if (score === null || score === undefined) return "#6B7280";
  if (score >= 80) return "#10B981"; // Good
  if (score >= 50) return "#F59E0B"; // Fair
  return "#EF4444"; // Poor
}

export function scoreLabel(score: number | null): string {
  if (score === null || score === undefined) return "—";
  if (score >= 80) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

export function scoreBg(score: number | null): string {
  if (score === null || score === undefined) return "rgba(107, 114, 128, 0.12)";
  if (score >= 80) return "rgba(16, 185, 129, 0.12)";
  if (score >= 50) return "rgba(245, 158, 11, 0.12)";
  return "rgba(239, 68, 68, 0.12)";
}

export function resolveItemLayer(item: { layer?: string; category?: string; title?: string }): "technical" | "on_page" | "aeo" | "geo" {
  if (item.layer === "technical" || item.layer === "aeo" || item.layer === "geo") {
    return item.layer;
  }
  if (item.layer === "on_page" || item.layer === "onpage") {
    return "on_page";
  }

  const cat = (item.category || "").toLowerCase();
  const t = (item.title || "").toLowerCase();

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

  return "on_page";
}

export function getLayerDisplayName(layer: "technical" | "on_page" | "aeo" | "geo"): string {
  switch (layer) {
    case "technical":
      return "Search basics";
    case "on_page":
      return "Page content";
    case "aeo":
      return "Answer boxes";
    case "geo":
      return "AI search";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function formatUrlDisplay(rawUrl: string, rootUrl?: string): string {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname + parsed.search;
    if (!path || path === "/" || path === "") {
      return "/ (home page)";
    }
    return path;
  } catch {
    if (!rawUrl || rawUrl === "/" || rawUrl.endsWith("/")) {
      return "/ (home page)";
    }
    return rawUrl.replace(/^https?:\/\/[^/]+/, "") || "/ (home page)";
  }
}

// ── Tab Component ─────────────────────────────────────────────────────────────

export interface FullSiteAuditTabProps {
  onWebsiteLoaded?: (primarySite: ConnectedWebsite | null) => void;
}

export function FullSiteAuditTab({ onWebsiteLoaded }: FullSiteAuditTabProps = {}) {
  const [websites, setWebsites] = useState<ConnectedWebsite[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<number | null>(null);
  const [auditHistory, setAuditHistory] = useState<SiteAudit[]>([]);
  const [currentAudit, setCurrentAudit] = useState<SiteAudit | null>(null);

  // View state: "what-to-fix" (default) or "by-page"
  const [viewMode, setViewMode] = useState<"what-to-fix" | "by-page">("what-to-fix");

  // What to fix filters
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning">("all");
  const [typeFilter, setTypeFilter] = useState<DiscoverabilityLayer>("all");
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());

  // By page filters
  const [pageFilter, setPageFilter] = useState<"all" | "has-must-fix" | "should-fix-only" | "all-good">("all");
  const [expandedPageIds, setExpandedPageIds] = useState<Set<number>>(new Set());
  const [expandedPassedPageIds, setExpandedPassedPageIds] = useState<Set<number>>(new Set());

  // Options popover & Download dropdown state
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [maxPages, setMaxPages] = useState<number>(25);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollRunnerRef = useRef<((id: number) => Promise<void>) | null>(null);

  // ── Load websites + audit history ──────────────────────────────────────────

  const loadWebsites = useCallback(async () => {
    try {
      const res = await api.get<{ websites: ConnectedWebsite[] }>("/api/knowledge/websites");
      const authorized = (res.websites || []).filter((w) => w.is_authorized);
      setWebsites(authorized);
      if (authorized.length > 0) {
        const primary = authorized.find((w) => w.is_primary) || authorized[0];
        if (!selectedWebsiteId) {
          setSelectedWebsiteId(primary.id);
        }
        if (onWebsiteLoaded) {
          onWebsiteLoaded(primary);
        }
      } else if (onWebsiteLoaded) {
        onWebsiteLoaded(null);
      }
    } catch (err) {
      console.error("Failed to load websites", err);
    }
  }, [selectedWebsiteId, onWebsiteLoaded]);

  const loadAuditHistory = useCallback(async () => {
    try {
      const res = await api.get<{ audits: SiteAudit[] }>("/api/site-audit?limit=10");
      setAuditHistory(res.audits || []);
    } catch (err) {
      console.error("Failed to load audit history", err);
    }
  }, []);

  const loadLatestAudit = useCallback(async (websiteId: number) => {
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
  }, []);

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

  // Close download menu on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    }
    if (showDownloadMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showDownloadMenu]);

  // ── Polling while an audit is running ────────────────────────────────────────

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
    setShowOptionsModal(false);
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

  // ── CSV Exports ────────────────────────────────────────────────────────────

  const exportSummaryCSV = () => {
    setShowDownloadMenu(false);
    if (!currentAudit || !currentAudit.pages) return;
    const rows = [
      ["URL", "HTTP Status", "Overall Score", "Titles Score", "Structure Score", "Media Score", "Social Score", "Errors", "Warnings", "Passed", "Error Message"],
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
    setShowDownloadMenu(false);
    if (!currentAudit || !currentAudit.pages) return;
    const headers = [
      "Page URL",
      "Type",
      "Category",
      "Check Title",
      "Severity",
      "Diagnostic Evidence",
      "How to Fix",
    ];
    const rows: string[][] = [];
    for (const page of currentAudit.pages) {
      for (const item of page.audits || []) {
        if (item.status === "error" || item.status === "warning") {
          const layer = resolveItemLayer(item);
          const typeName = getLayerDisplayName(layer);
          rows.push([
            `"${page.url.replace(/"/g, '""')}"`,
            `"${typeName}"`,
            `"${(item.category || "").replace(/"/g, '""')}"`,
            `"${(item.title || "").replace(/"/g, '""')}"`,
            `"${item.status === "error" ? "Must fix" : "Should fix"}"`,
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
          const layer = resolveItemLayer(item);
          if (!issueMap.has(key)) {
            issueMap.set(key, {
              id: item.id,
              layer,
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
    // Sort errors (Must fix) first, then by number of affected pages descending
    aggregatedIssues.sort((a, b) => {
      if (a.status !== b.status) return a.status === "error" ? -1 : 1;
      return b.affectedPages.length - a.affectedPages.length;
    });
  }

  // Counts for filters
  const mustFixCount = aggregatedIssues.filter((i) => i.status === "error").length;
  const shouldFixCount = aggregatedIssues.filter((i) => i.status === "warning").length;
  const totalIssuesCount = aggregatedIssues.length;

  const typeCounts = {
    all: totalIssuesCount,
    technical: aggregatedIssues.filter((i) => i.layer === "technical").length,
    on_page: aggregatedIssues.filter((i) => i.layer === "on_page").length,
    aeo: aggregatedIssues.filter((i) => i.layer === "aeo").length,
    geo: aggregatedIssues.filter((i) => i.layer === "geo").length,
  };

  const filteredIssues = aggregatedIssues.filter((issue) => {
    const matchesSeverity = severityFilter === "all" || issue.status === severityFilter;
    const matchesType = typeFilter === "all" || issue.layer === typeFilter;
    return matchesSeverity && matchesType;
  });

  // ── By Page filtering ──────────────────────────────────────────────────────

  const pages = currentAudit?.pages || [];
  const mustFixPagesCount = pages.filter((p) => p.errors > 0 || p.error).length;
  const shouldFixOnlyPagesCount = pages.filter((p) => p.errors === 0 && p.warnings > 0 && !p.error).length;
  const allGoodPagesCount = pages.filter((p) => p.errors === 0 && p.warnings === 0 && !p.error).length;

  const filteredPages = pages.filter((p) => {
    if (pageFilter === "all") return true;
    if (pageFilter === "has-must-fix") return p.errors > 0 || p.error;
    if (pageFilter === "should-fix-only") return p.errors === 0 && p.warnings > 0 && !p.error;
    if (pageFilter === "all-good") return p.errors === 0 && p.warnings === 0 && !p.error;
    return true;
  });

  const isRunning = currentAudit?.status === "running" || currentAudit?.status === "pending" || launching;
  const selectedWebsite = websites.find((w) => w.id === selectedWebsiteId) || websites[0];
  const overallScore = currentAudit?.avg_overall_score ?? null;

  // Toggle issue expansion
  const toggleIssueExpanded = (issueId: string) => {
    setExpandedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  // Toggle page expansion
  const togglePageExpanded = (pageId: number) => {
    setExpandedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  // Toggle passed checks expansion for a page
  const togglePassedChecksExpanded = (pageId: number) => {
    setExpandedPassedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  // ── Render Loading State ───────────────────────────────────────────────────

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
        <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>
          Checking website health…
        </div>
      </div>
    );
  }

  // ── State A: No Authorized Website ─────────────────────────────────────────

  if (websites.length === 0) {
    return (
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "3rem 2rem",
          textAlign: "center",
          maxWidth: 580,
          margin: "2rem auto",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            color: "#F59E0B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.75rem",
            margin: "0 auto 1.25rem auto",
          }}
        >
          🌐
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>
          Connect your website first
        </h2>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 1.5rem 0" }}>
          Add and confirm your website in Knowledge Lake. Then come back here to check how healthy it is.
        </p>
        <Link
          href="/workspace/knowledge"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0.7rem 1.4rem",
            borderRadius: 8,
            backgroundColor: "var(--accent, #8A64E9)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "0.9rem",
            textDecoration: "none",
          }}
        >
          Go to Knowledge Lake →
        </Link>
      </div>
    );
  }

  // ── State B: Website Connected, Never Audited ──────────────────────────────

  if (!currentAudit && !isRunning) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {errorMsg && (
          <div style={{ padding: "0.85rem 1rem", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444", fontSize: "0.88rem" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "3.5rem 2rem",
            textAlign: "center",
            maxWidth: 620,
            margin: "2rem auto",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "#10B981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.75rem",
              margin: "0 auto 1.25rem auto",
            }}
          >
            ⚡
          </div>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>
            See how healthy your website is
          </h2>
          <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 1.75rem 0" }}>
            We&apos;ll check up to {maxPages} pages of <strong>{selectedWebsite?.domain}</strong> and give you a simple list of what to fix so more people find you on Google and in AI search.
          </p>
          <button
            onClick={handleStartAudit}
            disabled={launching}
            style={{
              padding: "0.75rem 1.75rem",
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--accent, #8A64E9)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.92rem",
              cursor: launching ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(138, 100, 233, 0.35)",
            }}
          >
            {launching ? "Starting check…" : "Check my website"}
          </button>
        </div>
      </div>
    );
  }

  // ── State C: While Check is Running ────────────────────────────────────────

  if (isRunning) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "3.5rem 2rem",
            textAlign: "center",
            maxWidth: 600,
            margin: "2rem auto",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "rgba(138, 100, 233, 0.15)",
              color: "var(--accent, #8A64E9)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.75rem",
              marginBottom: "1.25rem",
              animation: "spin 2s linear infinite",
            }}
          >
            🔄
          </div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>
            Checking {selectedWebsite?.domain}…
          </h2>
          <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 auto 1.5rem auto", maxWidth: 460 }}>
            We&apos;re looking at up to {maxPages} pages. This usually takes a few minutes. You can leave this page — results will show up here by themselves.
          </p>

          <div
            style={{
              width: "100%",
              maxWidth: 320,
              height: 6,
              borderRadius: 3,
              backgroundColor: "var(--bg-surface)",
              overflow: "hidden",
              margin: "0 auto",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "45%",
                height: "100%",
                backgroundColor: "var(--accent, #8A64E9)",
                borderRadius: 3,
                animation: "pulse 1.8s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Dynamic advice sentence
  const adviceSentence = (() => {
    const label = scoreLabel(overallScore);
    if (mustFixCount > 0) {
      return `Your website is in ${label.toLowerCase()} shape. Fixing the ${mustFixCount} must-fix ${mustFixCount === 1 ? "problem" : "problems"} will help the most.`;
    }
    if (shouldFixCount > 0) {
      return `Your website is in ${label.toLowerCase()} shape. Addressing the ${shouldFixCount} should-fix recommendations will help boost your score.`;
    }
    return `Your website is in great shape! All ${currentAudit?.total_passed || 0} checks passed.`;
  })();

  // ── Render Completed Audit Results ─────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ── Top Sub-bar: Last checked + Options + Check again ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          paddingBottom: "0.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "var(--text-muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#10B981", display: "inline-block" }} />
          <span>
            Last checked {formatDate(currentAudit?.completed_at || currentAudit?.created_at || null)} · {currentAudit?.pages_crawled || 0} pages
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button
            onClick={() => setShowOptionsModal(true)}
            style={{
              padding: "0.5rem 0.95rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Options
          </button>

          <button
            onClick={handleStartAudit}
            disabled={isRunning}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0.5rem 1.15rem",
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--accent, #8A64E9)",
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: isRunning ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(138, 100, 233, 0.3)",
            }}
          >
            <span>⟳</span> Check again
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: "0.85rem 1rem", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444", fontSize: "0.88rem" }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* ── Results Overview Card ── */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
        }}
      >
        {/* Results Header Line */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
            position: "relative",
          }}
        >
          <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Results
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Download Dropdown */}
            <div style={{ position: "relative" }} ref={downloadMenuRef}>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "0.4rem 0.8rem",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span>↓</span> Download
              </button>

              {showDownloadMenu && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 4px)",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    zIndex: 50,
                    minWidth: 220,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={exportActionableChecklistCSV}
                    style={{
                      width: "100%",
                      padding: "0.65rem 1rem",
                      textAlign: "left",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>📋</span> Actionable Fix Checklist (CSV)
                  </button>
                  <button
                    onClick={exportSummaryCSV}
                    style={{
                      width: "100%",
                      padding: "0.65rem 1rem",
                      textAlign: "left",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      borderTop: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>📊</span> Page Scores Summary (CSV)
                  </button>
                </div>
              )}
            </div>

            {/* Open Full Report Link */}
            {currentAudit && (
              <Link
                href={`/workspace/seo/site-audit/${currentAudit.id}`}
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--accent, #8A64E9)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Open full report ↗
              </Link>
            )}
          </div>
        </div>

        {/* Score Overview: Circle + Advice + Chips + 4 Area Bars */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "2rem",
            alignItems: "center",
          }}
        >
          {/* Left / Middle: Score Circle + Sentence + 3 Chips */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            {/* Round Score Circle */}
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                backgroundColor: scoreBg(overallScore),
                border: `3px solid ${scoreColor(overallScore)}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "1.85rem", fontWeight: 800, color: scoreColor(overallScore), lineHeight: 1 }}>
                {overallScore !== null ? Math.round(overallScore) : "—"}
              </span>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: scoreColor(overallScore), marginTop: 2 }}>
                {scoreLabel(overallScore)}
              </span>
            </div>

            {/* Advice Sentence & 3 Chips */}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.5, marginBottom: "0.85rem" }}>
                {adviceSentence}
              </div>

              {/* 3 Summary Chips */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    backgroundColor: "rgba(239, 68, 68, 0.12)",
                    color: "#EF4444",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                  }}
                >
                  {mustFixCount} must fix
                </span>

                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    color: "#F59E0B",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                  }}
                >
                  {shouldFixCount} should fix
                </span>

                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                    color: "#10B981",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                  }}
                >
                  {currentAudit?.total_passed || 0} checks passed
                </span>
              </div>
            </div>
          </div>

          {/* Right: 4 Area Progress Bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[
              { label: "Titles & headings", score: currentAudit?.avg_meta_score ?? null },
              { label: "Page structure", score: currentAudit?.avg_structure_score ?? null },
              { label: "Images & files", score: currentAudit?.avg_media_score ?? null },
              { label: "Social sharing", score: currentAudit?.avg_social_score ?? null },
            ].map(({ label, score }) => {
              const val = score !== null ? Math.round(score) : 0;
              const color = scoreColor(score);
              return (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 3 }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
                    <span style={{ color, fontWeight: 700 }}>
                      {score !== null ? `${val} · ${scoreLabel(score)}` : "—"}
                    </span>
                  </div>
                  <div style={{ width: "100%", height: 6, backgroundColor: "var(--bg-surface)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <div style={{ width: `${val}%`, height: "100%", backgroundColor: color, borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── View Switcher Pills: What to fix vs By page ── */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
        <button
          onClick={() => setViewMode("what-to-fix")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "none",
            backgroundColor: viewMode === "what-to-fix" ? "var(--bg-card)" : "transparent",
            color: viewMode === "what-to-fix" ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: "0.9rem",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: viewMode === "what-to-fix" ? "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))" : "none",
          }}
        >
          What to fix · {totalIssuesCount}
        </button>

        <button
          onClick={() => setViewMode("by-page")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "none",
            backgroundColor: viewMode === "by-page" ? "var(--bg-card)" : "transparent",
            color: viewMode === "by-page" ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: "0.9rem",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: viewMode === "by-page" ? "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))" : "none",
          }}
        >
          By page · {pages.length}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── VIEW 1: WHAT TO FIX (Default) ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {viewMode === "what-to-fix" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Sub-filters row: Severity chips on left, Type dropdown on right */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {/* Severity sub-pills */}
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "all" as const, label: `All · ${totalIssuesCount}` },
                { key: "error" as const, label: `Must fix · ${mustFixCount}` },
                { key: "warning" as const, label: `Should fix · ${shouldFixCount}` },
              ].map(({ key, label }) => {
                const isActive = severityFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSeverityFilter(key)}
                    style={{
                      padding: "0.35rem 0.85rem",
                      borderRadius: 9999,
                      border: isActive ? "1px solid rgba(138, 100, 233, 0.45)" : "1px solid var(--border)",
                      backgroundColor: isActive ? "rgba(138, 100, 233, 0.14)" : "var(--bg-card)",
                      color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                      fontSize: "0.8rem",
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Type dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DiscoverabilityLayer)}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <option value="all">All types ({typeCounts.all})</option>
                <option value="technical">Search basics ({typeCounts.technical})</option>
                <option value="on_page">Page content ({typeCounts.on_page})</option>
                <option value="aeo">Answer boxes ({typeCounts.aeo})</option>
                <option value="geo">AI search ({typeCounts.geo})</option>
              </select>
            </div>
          </div>

          {/* Issue Cards */}
          {filteredIssues.length === 0 ? (
            <div
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "3rem 2rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              No problems found matching this filter.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {filteredIssues.map((issue) => {
                const isExpanded = expandedIssueIds.has(issue.id);
                const isError = issue.status === "error";
                const isSiteWide = issue.affectedPages.length >= (pages.length || 1);
                const locationText = isSiteWide
                  ? `On the whole site · ${getLayerDisplayName(issue.layer)}`
                  : `On ${issue.affectedPages.length} of ${pages.length} pages · ${getLayerDisplayName(issue.layer)}`;

                return (
                  <div
                    key={`${issue.id}-${issue.status}`}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "1.25rem 1.5rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                      <div>
                        {/* Severity tag */}
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            backgroundColor: isError ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)",
                            color: isError ? "#EF4444" : "#F59E0B",
                            border: `1px solid ${isError ? "rgba(239, 68, 68, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            marginBottom: "0.4rem",
                          }}
                        >
                          {isError ? "Must fix" : "Should fix"}
                        </span>

                        {/* Title */}
                        <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.98rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          {issue.title}
                        </h4>

                        {/* Subtitle */}
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.65rem" }}>
                          {locationText}
                        </div>
                      </div>

                      {/* Show/Hide Pages Button */}
                      <button
                        onClick={() => toggleIssueExpanded(issue.id)}
                        style={{
                          padding: "0.35rem 0.75rem",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-secondary)",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isExpanded ? "Hide pages ▲" : "Show pages ▼"}
                      </button>
                    </div>

                    {/* How to Fix Recommendation */}
                    {issue.fix_recommendation && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                          lineHeight: 1.5,
                          marginTop: "0.25rem",
                        }}
                      >
                        <strong style={{ color: "var(--text-primary)" }}>How to fix:</strong> {issue.fix_recommendation}
                      </div>
                    )}

                    {/* Expandable Affected Pages List */}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: "1rem",
                          paddingTop: "0.85rem",
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          maxHeight: 280,
                          overflowY: "auto",
                        }}
                      >
                        {issue.affectedPages.map((ap, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "0.82rem",
                              padding: "4px 0",
                              borderBottom: i < issue.affectedPages.length - 1 ? "1px solid var(--border)" : "none",
                              gap: 12,
                            }}
                          >
                            <span style={{ color: "var(--text-primary)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {formatUrlDisplay(ap.url, selectedWebsite?.root_url)}
                            </span>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                              {ap.score_text || "Needs attention"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── VIEW 2: BY PAGE ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {viewMode === "by-page" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Sub-filters row */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all" as const, label: `All · ${pages.length}` },
              { key: "has-must-fix" as const, label: `Has must-fix · ${mustFixPagesCount}` },
              { key: "should-fix-only" as const, label: `Should fix only · ${shouldFixOnlyPagesCount}` },
              { key: "all-good" as const, label: `All good · ${allGoodPagesCount}` },
            ].map(({ key, label }) => {
              const isActive = pageFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setPageFilter(key)}
                  style={{
                    padding: "0.35rem 0.85rem",
                    borderRadius: 9999,
                    border: isActive ? "1px solid rgba(138, 100, 233, 0.45)" : "1px solid var(--border)",
                    backgroundColor: isActive ? "rgba(138, 100, 233, 0.14)" : "var(--bg-card)",
                    color: isActive ? "var(--accent, #8A64E9)" : "var(--text-muted)",
                    fontSize: "0.8rem",
                    fontWeight: isActive ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Page Cards */}
          {filteredPages.length === 0 ? (
            <div
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "3rem 2rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              No pages match filter &quot;{pageFilter}&quot;.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredPages.map((page) => {
                const isExpanded = expandedPageIds.has(page.id);
                const isPassedExpanded = expandedPassedPageIds.has(page.id);
                const color = scoreColor(page.overall_score);
                const problemAudits = (page.audits || []).filter((a) => a.status === "error" || a.status === "warning");
                const passedAudits = (page.audits || []).filter((a) => a.status === "passed");

                const summaryText = (() => {
                  if (page.error) return "Page check failed";
                  if (page.errors > 0 && page.warnings > 0) return `${page.errors} must fix · ${page.warnings} should fix`;
                  if (page.errors > 0) return `${page.errors} must fix`;
                  if (page.warnings > 0) return `${page.warnings} should fix`;
                  return "All good";
                })();

                return (
                  <div
                    key={page.id}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "1.1rem 1.4rem",
                    }}
                  >
                    {/* Page Row Header */}
                    <div
                      onClick={() => togglePageExpanded(page.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        gap: 12,
                        userSelect: "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 200 }}>
                        {/* Score Circle */}
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: "50%",
                            backgroundColor: scoreBg(page.overall_score),
                            border: `2px solid ${color}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.88rem",
                            fontWeight: 800,
                            color,
                            flexShrink: 0,
                          }}
                        >
                          {page.overall_score !== null ? Math.round(page.overall_score) : "—"}
                        </div>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              {formatUrlDisplay(page.url, selectedWebsite?.root_url)}
                            </span>
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Open live URL in new tab"
                              style={{
                                color: "var(--text-muted)",
                                fontSize: "0.78rem",
                                textDecoration: "none",
                              }}
                            >
                              ↗
                            </a>
                          </div>

                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                            {summaryText}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", paddingLeft: 8 }}>
                        {isExpanded ? "▲" : "▼"}
                      </div>
                    </div>

                    {/* Expanded Page Findings */}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: "1.25rem",
                          paddingTop: "1.25rem",
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "1.25rem",
                        }}
                      >
                        {/* 4 Area Scores Row */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                            gap: "1rem",
                            padding: "0.85rem 1rem",
                            backgroundColor: "var(--bg-surface)",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                          }}
                        >
                          {[
                            { label: "Titles & headings", score: page.meta_score },
                            { label: "Page structure", score: page.structure_score },
                            { label: "Images & files", score: page.media_score },
                            { label: "Social sharing", score: page.social_score },
                          ].map(({ label, score }) => (
                            <div key={label}>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>
                                {label}
                              </div>
                              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: scoreColor(score), marginTop: 2 }}>
                                {score !== null ? `${Math.round(score)} · ${scoreLabel(score)}` : "—"}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Page Problem Items (Errors & Warnings first) */}
                        {problemAudits.length === 0 ? (
                          <div style={{ fontSize: "0.85rem", color: "#10B981", fontWeight: 600, padding: "0.5rem 0" }}>
                            ✓ No problems detected on this page. All checks passed!
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                            {problemAudits.map((item) => {
                              const isError = item.status === "error";
                              return (
                                <div
                                  key={item.id}
                                  style={{
                                    padding: "0.85rem 1rem",
                                    borderRadius: 8,
                                    backgroundColor: "var(--bg-surface)",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      <span
                                        style={{
                                          padding: "1px 6px",
                                          borderRadius: 4,
                                          backgroundColor: isError ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)",
                                          color: isError ? "#EF4444" : "#F59E0B",
                                          fontSize: "0.7rem",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {isError ? "Must fix" : "Should fix"}
                                      </span>
                                      <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                        {item.title}
                                      </span>
                                    </div>

                                    {item.score_text && (
                                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                        {item.score_text}
                                      </span>
                                    )}
                                  </div>

                                  {item.fix_recommendation && (
                                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.4rem", lineHeight: 1.4 }}>
                                      <strong style={{ color: "var(--text-primary)" }}>How to fix:</strong> {item.fix_recommendation}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Hidden Passed Checks Drawer */}
                        {passedAudits.length > 0 && (
                          <div>
                            <button
                              onClick={() => togglePassedChecksExpanded(page.id)}
                              style={{
                                padding: "0.4rem 0.85rem",
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                backgroundColor: "transparent",
                                color: "var(--text-muted)",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {isPassedExpanded ? "Hide passed checks ▲" : `Show ${passedAudits.length} passed checks ▼`}
                            </button>

                            {isPassedExpanded && (
                              <div
                                style={{
                                  marginTop: "0.75rem",
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                                  gap: "0.5rem",
                                  padding: "0.75rem",
                                  backgroundColor: "var(--bg-surface)",
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                }}
                              >
                                {passedAudits.map((item) => (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      fontSize: "0.78rem",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    <span style={{ color: "#10B981", fontWeight: 800 }}>✓</span>
                                    <span>{item.title}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── PAST CHECKS SECTION (At bottom of results) ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {auditHistory.length > 0 && (
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem 1.75rem",
            marginTop: "1rem",
          }}
        >
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Past checks
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {auditHistory.map((a) => {
              const isCurrent = currentAudit?.id === a.id;
              const color = scoreColor(a.avg_overall_score);

              return (
                <div
                  key={a.id}
                  onClick={() => {
                    if (a.website_id && !isCurrent) {
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
                    backgroundColor: isCurrent ? "rgba(138, 100, 233, 0.08)" : "var(--bg-surface)",
                    border: isCurrent ? "1px solid rgba(138, 100, 233, 0.3)" : "1px solid var(--border)",
                    cursor: isCurrent ? "default" : "pointer",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Score Circle */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: scoreBg(a.avg_overall_score),
                        border: `2px solid ${color}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        color,
                        flexShrink: 0,
                      }}
                    >
                      {a.avg_overall_score !== null ? Math.round(a.avg_overall_score) : "—"}
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                        {formatDate(a.completed_at || a.created_at)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                        {a.pages_crawled} pages · {a.total_errors} must fix · {a.total_warnings} should fix
                      </div>
                    </div>
                  </div>

                  <div>
                    {isCurrent ? (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 20,
                          backgroundColor: "rgba(138, 100, 233, 0.15)",
                          color: "var(--accent, #8A64E9)",
                        }}
                      >
                        Showing now
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Done
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── OPTIONS MODAL ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {showOptionsModal && (
        <div
          onClick={() => setShowOptionsModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "1.75rem",
              width: "100%",
              maxWidth: 420,
              boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ margin: "0 0 1.25rem 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Check Options
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Website Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
                  Website
                </label>
                <select
                  value={selectedWebsiteId ?? ""}
                  onChange={(e) => setSelectedWebsiteId(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.88rem",
                  }}
                >
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.domain} {w.is_primary ? "(Primary)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Max Pages Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
                  Pages to check
                </label>
                <select
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.88rem",
                  }}
                >
                  <option value={10}>10 pages</option>
                  <option value={25}>25 pages (recommended)</option>
                  <option value={50}>50 pages</option>
                </select>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "0.5rem" }}>
                <button
                  onClick={() => setShowOptionsModal(false)}
                  style={{
                    padding: "0.55rem 1rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowOptionsModal(false)}
                  style={{
                    padding: "0.55rem 1.25rem",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "var(--accent, #8A64E9)",
                    color: "#fff",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
