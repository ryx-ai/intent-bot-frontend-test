"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const ANALYTICS_LIMIT = 500;

/* ── Types ─────────────────────────────────────────────────── */
export interface MetricConfig {
  id: string;
  name: string;
  description: string;
  display_on_dashboard: boolean;
}

export interface AnalyticsRow {
  timestamp: string;
  session_id: string;
  user_message: string;
  assistant_message?: string | null;
  conversion_outcome?: string;
  lead_stage?: string;
  use_case?: string;
  lead_score?: string;
  customer_budget?: string;
  [key: string]: string | undefined | null;
}

export interface Session {
  id: string;
  latestTime: Date;
  firstMessage: string;
  latestMessage: string;
  messageCount: number;
  finalValues: Record<string, string>;
}

export interface TranscriptMessage {
  id: string;
  role: "visitor" | "assistant";
  content: string;
  timestamp: string;
}

export interface SessionTranscript {
  session_id: string;
  messages: TranscriptMessage[];
  message_count: number;
  first_message: string;
  latest_timestamp: string;
  details: {
    lead_stage?: string;
    use_case?: string;
    customer_budget?: string;
    lead_score?: string;
    conversion_outcome?: string;
    [key: string]: string | undefined;
  };
}

export type FilterType = "all" | "leads" | "chat";

/* ── Date parser helper ────────────────────────────────────── */
export function parseUtcDate(timestamp: string): Date {
  if (!timestamp) return new Date();
  const normalized =
    timestamp.endsWith("Z") || timestamp.includes("+")
      ? timestamp
      : `${timestamp}Z`;
  return new Date(normalized);
}

/* ── Formatting Helpers ────────────────────────────────────── */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  const dateStr = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  return `${dateStr}, ${timeStr}`;
}

export function formatTimeOnly(timestamp: string): string {
  const d = parseUtcDate(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isLeadOrBooking(outcome?: string | null): boolean {
  if (!outcome) return false;
  const clean = outcome.toLowerCase().replace(/[\s_-]+/g, "");
  return clean === "bookeddemo" || clean === "leadcaptured";
}

export function getPlainResultLabel(outcome?: string | null): string {
  if (!outcome) return "Just chatted";
  const clean = outcome.toLowerCase().replace(/[\s_-]+/g, "");
  if (clean === "bookeddemo") return "Booked a demo";
  if (clean === "leadcaptured") return "Left contact details";
  if (clean === "justchat" || clean === "unknown") return "Just chatted";
  return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getLeadScoreTier(scoreStr?: string | null): {
  label: string;
  tier: "hot" | "warm" | "cold";
  style: React.CSSProperties;
} {
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.25rem 0.65rem",
    borderRadius: "6px",
    fontSize: "0.82rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  const num = parseInt(scoreStr || "", 10);
  if (isNaN(num)) {
    return {
      label: "--",
      tier: "cold",
      style: {
        ...baseStyle,
        background: "var(--bg-hover)",
        color: "var(--text-muted)",
        border: "1px solid var(--border)",
      },
    };
  }

  if (num >= 75) {
    return {
      label: `${num} · Hot`,
      tier: "hot",
      style: {
        ...baseStyle,
        background: "rgba(16, 185, 129, 0.14)",
        color: "var(--success)",
        border: "1px solid rgba(16, 185, 129, 0.3)",
      },
    };
  }

  if (num >= 40) {
    return {
      label: `${num} · Warm`,
      tier: "warm",
      style: {
        ...baseStyle,
        background: "rgba(245, 158, 11, 0.14)",
        color: "var(--warning)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
      },
    };
  }

  return {
    label: `${num} · Cold`,
    tier: "cold",
    style: {
      ...baseStyle,
      background: "rgba(99, 102, 241, 0.12)",
      color: "var(--accent)",
      border: "1px solid rgba(99, 102, 241, 0.25)",
    },
  };
}

export function formatInterestLevel(val?: string | null): string {
  if (!val) return "Not available";
  const clean = val.toLowerCase().replace(/[\s_-]+/g, "");
  if (clean === "highintent") return "High interest";
  if (clean === "midintent") return "Medium interest";
  if (clean === "lowintent") return "Low interest";
  if (clean === "unknown") return "Not available";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Main Component ────────────────────────────────────────── */
export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<MetricConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [truncated, setTruncated] = useState<{ shown: number; total: number } | null>(null);

  // Lazy-loaded transcript cache: sessionId -> transcript payload
  const [transcriptCache, setTranscriptCache] = useState<Record<string, SessionTranscript>>({});
  const [loadingTranscriptId, setLoadingTranscriptId] = useState<string | null>(null);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<"csv" | "json" | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setLoading(true);
    try {
      const [metricsData, analyticsResponse] = await Promise.allSettled([
        api.get<MetricConfig[]>("/api/metrics/config"),
        api.get<{ records: AnalyticsRow[]; total: number }>(
          `/api/analytics?limit=${ANALYTICS_LIMIT}`
        ),
      ]);

      const metricsList =
        metricsData.status === "fulfilled" ? metricsData.value : [];
      const analyticsData =
        analyticsResponse.status === "fulfilled"
          ? analyticsResponse.value.records || []
          : [];
      const total =
        analyticsResponse.status === "fulfilled"
          ? analyticsResponse.value.total ?? analyticsData.length
          : analyticsData.length;

      setTruncated(
        total > analyticsData.length ? { shown: analyticsData.length, total } : null
      );
      setMetrics(metricsList.filter((m) => m.display_on_dashboard));

      // Group rows by session_id
      const buckets: Record<string, AnalyticsRow[]> = {};
      analyticsData.forEach((row) => {
        (buckets[row.session_id] ??= []).push(row);
      });

      const arr: Session[] = Object.entries(buckets).map(([sessionId, rows]) => {
        const sorted = [...rows].sort(
          (a, b) =>
            parseUtcDate(a.timestamp).getTime() -
            parseUtcDate(b.timestamp).getTime()
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const finalValues: Record<string, string> = {};

        // Resolve conversion outcome: If ANY message in the session achieved a conversion,
        // preserve that converted state (do not let a subsequent follow-up reset it to just chat)
        const qualifyingRow = sorted.find((r) => isLeadOrBooking(r.conversion_outcome));

        metricsList.forEach((m) => {
          if (m.id.includes("conversion") || m.id.includes("outcome")) {
            finalValues[m.id] = qualifyingRow
              ? (qualifyingRow[m.id] as string)
              : (last && (last[m.id] as string)) || "just_chat";
          } else if (m.id.includes("score")) {
            const numLast = parseInt((last?.[m.id] as string) || "0", 10);
            const numQual = qualifyingRow
              ? parseInt((qualifyingRow[m.id] as string) || "0", 10)
              : 0;
            const bestScore = Math.max(
              isNaN(numLast) ? 0 : numLast,
              isNaN(numQual) ? 0 : numQual
            );
            finalValues[m.id] = String(bestScore);
          } else {
            finalValues[m.id] = (last && (last[m.id] as string)) || "unknown";
          }
        });

        return {
          id: sessionId,
          latestTime: parseUtcDate(last?.timestamp || ""),
          firstMessage: first?.user_message || "...",
          latestMessage: last?.user_message || first?.user_message || "...",
          messageCount: sorted.length,
          finalValues,
        };
      });

      arr.sort((a, b) => b.latestTime.getTime() - a.latestTime.getTime());
      setSessions(arr);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lazy-load conversation transcript when expanding
  const toggleExpand = useCallback(
    async (sessionId: string) => {
      if (expandedId === sessionId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(sessionId);

      if (!transcriptCache[sessionId]) {
        setLoadingTranscriptId(sessionId);
        try {
          const res = await api.get<SessionTranscript>(
            `/api/analytics/sessions/${encodeURIComponent(sessionId)}`
          );
          setTranscriptCache((prev) => ({ ...prev, [sessionId]: res }));
        } catch (err) {
          console.error("Failed to load conversation transcript", err);
        } finally {
          setLoadingTranscriptId(null);
        }
      }
    },
    [expandedId, transcriptCache]
  );

  // ── Global Export Handlers ──
  const handleGlobalExport = useCallback(async (format: "csv" | "json") => {
    try {
      setExportingFormat(format);
      const blob = await api.getBlob(`/api/analytics/export?format=${format}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `chat-transcripts-${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
      alert(err instanceof Error ? err.message : "Failed to export conversations");
    } finally {
      setExportingFormat(null);
      setExportMenuOpen(false);
    }
  }, []);

  const handleDownloadSingleTranscript = useCallback((sessionId: string) => {
    const transcript = transcriptCache[sessionId];
    if (!transcript) return;

    const lines: string[] = [];
    lines.push("=====================================================");
    lines.push("RYX AI Conversation Transcript");
    lines.push(`Session ID: ${transcript.session_id}`);
    lines.push(`Date: ${formatRelativeTime(parseUtcDate(transcript.latest_timestamp))}`);
    lines.push(`Result: ${getPlainResultLabel(transcript.details?.conversion_outcome)}`);
    lines.push(`Lead Score: ${transcript.details?.lead_score || "0"} / 100`);
    lines.push(`Interest Level: ${formatInterestLevel(transcript.details?.lead_stage)}`);
    lines.push(`Use Case: ${transcript.details?.use_case || "Not available"}`);
    lines.push(`Customer Budget: ${transcript.details?.customer_budget || "Not available"}`);
    lines.push("=====================================================\n");

    transcript.messages.forEach((m) => {
      const timeStr = formatTimeOnly(m.timestamp);
      const roleLabel = m.role === "visitor" ? "Visitor" : "Assistant";
      lines.push(`[${timeStr}] ${roleLabel}:`);
      lines.push(`${m.content}\n`);
    });

    const textContent = lines.join("\n");
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${sessionId.slice(0, 12)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, [transcriptCache]);

  // ── Computed Summary Stats ──
  const totalConversations = sessions.length;
  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
  const avgMessagesPerChat =
    totalConversations > 0 ? (totalMessages / totalConversations).toFixed(1) : "0";

  const scoreMetric = metrics.find((m) => m.id.includes("score"));
  const avgScore = (() => {
    if (!scoreMetric) return "--";
    let total = 0;
    let count = 0;
    sessions.forEach((s) => {
      const n = parseInt(s.finalValues[scoreMetric.id], 10);
      if (!isNaN(n)) {
        total += n;
        count++;
      }
    });
    return count > 0 ? Math.round(total / count) : "--";
  })();

  const conversionMetric = metrics.find(
    (m) => m.id.includes("conversion") || m.id.includes("outcome")
  );

  const leadsAndBookingsCount = sessions.filter((s) => {
    const outcome = s.finalValues[conversionMetric?.id || "conversion_outcome"];
    return isLeadOrBooking(outcome);
  }).length;

  const conversionRate =
    totalConversations > 0
      ? ((leadsAndBookingsCount / totalConversations) * 100).toFixed(1)
      : "0.0";

  let hotLeadsCount = 0;
  let warmLeadsCount = 0;
  let coldLeadsCount = 0;
  sessions.forEach((s) => {
    const scoreVal = parseInt(
      s.finalValues[scoreMetric?.id || "lead_score"] || "",
      10
    );
    if (isNaN(scoreVal)) {
      coldLeadsCount++;
    } else if (scoreVal >= 75) {
      hotLeadsCount++;
    } else if (scoreVal >= 40) {
      warmLeadsCount++;
    } else {
      coldLeadsCount++;
    }
  });

  const avgScoreTier =
    avgScore !== "--" ? getLeadScoreTier(String(avgScore)) : null;

  // ── Filtered Sessions ──
  const filteredSessions = sessions.filter((s) => {
    if (filter === "all") return true;
    const outcome = s.finalValues[conversionMetric?.id || "conversion_outcome"];
    const isLead = isLeadOrBooking(outcome);
    if (filter === "leads") return isLead;
    if (filter === "chat") return !isLead;
    return true;
  });

  return (
    <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto", padding: "2rem 1.5rem", boxSizing: "border-box" }}>
      <style>{`
        .summary-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          box-shadow: var(--shadow-sm);
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .summary-card.clickable {
          cursor: pointer;
        }
        .summary-card-conv {
          border-top: 3px solid #6366f1 !important;
        }
        .summary-card-conv:hover,
        .summary-card-conv.active-filter {
          border-color: rgba(99, 102, 241, 0.6);
          border-top-color: #6366f1 !important;
          transform: translateY(-1px);
        }
        .summary-card-leads {
          border-top: 3px solid #10b981 !important;
        }
        .summary-card-leads:hover,
        .summary-card-leads.active-filter {
          border-color: rgba(16, 185, 129, 0.6);
          border-top-color: #10b981 !important;
          transform: translateY(-1px);
        }
        .summary-card-score {
          border-top: 3px solid #f59e0b !important;
        }

        @media (max-width: 767px) {
          .summary-cards-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 0.5rem !important;
          }
          .summary-card {
            padding: 0.75rem 0.5rem !important;
            text-align: center !important;
          }
          .summary-card-value {
            font-size: 1.35rem !important;
            margin-bottom: 0.2rem !important;
          }
          .summary-card-label {
            font-size: 0.72rem !important;
            line-height: 1.2 !important;
          }
          .summary-card-subtext,
          .summary-card-secondary,
          .summary-card-track,
          .summary-card-badge {
            display: none !important;
          }
          .conversation-table thead {
            display: none !important;
          }
          .conversation-row {
            display: flex !important;
            flex-direction: column !important;
            position: relative !important;
            padding: 1rem !important;
            gap: 0.35rem !important;
          }
          .conversation-cell-msg {
            padding: 0 !important;
            width: 100% !important;
            padding-right: 5rem !important;
          }
          .conversation-cell-result {
            padding: 0 !important;
            width: 100% !important;
          }
          .conversation-cell-score {
            position: absolute !important;
            top: 1rem !important;
            right: 1rem !important;
            padding: 0 !important;
            width: auto !important;
            text-align: right !important;
          }
          .drawer-grid {
            grid-template-columns: 1fr !important;
            gap: 1rem !important;
            padding: 1rem !important;
          }
        }
      `}</style>

      {/* ── Top Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.75rem",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          Conversations
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {/* Export Dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setExportMenuOpen((prev) => !prev)}
              disabled={sessions.length === 0 || exportingFormat !== null}
              title="Export chat history and transcripts"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.5rem 0.95rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor:
                  sessions.length === 0 || exportingFormat !== null
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  sessions.length === 0 || exportingFormat !== null ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (sessions.length > 0 && exportingFormat === null) {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              <span>⬇</span>
              <span>
                {exportingFormat
                  ? `Exporting ${exportingFormat.toUpperCase()}…`
                  : "Export"}
              </span>
              <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>▼</span>
            </button>

            {exportMenuOpen && (
              <>
                <div
                  onClick={() => setExportMenuOpen(false)}
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 40,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                    padding: "0.35rem",
                    minWidth: 200,
                    zIndex: 50,
                  }}
                >
                  <button
                    onClick={() => handleGlobalExport("csv")}
                    disabled={exportingFormat !== null}
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "0.5rem 0.75rem",
                      background: "transparent",
                      border: "none",
                      borderRadius: 6,
                      color: "var(--text-primary)",
                      fontSize: "0.83rem",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <span>📄</span> Export as CSV
                    </div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        marginTop: "0.15rem",
                      }}
                    >
                      Spreadsheet with full transcripts
                    </span>
                  </button>

                  <button
                    onClick={() => handleGlobalExport("json")}
                    disabled={exportingFormat !== null}
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "0.5rem 0.75rem",
                      background: "transparent",
                      border: "none",
                      borderRadius: 6,
                      color: "var(--text-primary)",
                      fontSize: "0.83rem",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <span>⚙️</span> Export as JSON
                    </div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        marginTop: "0.15rem",
                      }}
                    >
                      Structured format for CRM & APIs
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            title="Refresh analytics"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.color = "var(--accent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <span>↻</span>
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── Three Summary Metric Cards ── */}
      <div
        className="summary-cards-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        {/* Card 1: Conversations */}
        <div
          className={`summary-card summary-card-conv clickable ${
            filter === "all" ? "active-filter" : ""
          }`}
          onClick={() => setFilter("all")}
          title="Click to show all conversations"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.4rem",
            }}
          >
            <div
              className="summary-card-label"
              style={{
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Conversations
            </div>
            <span
              className="summary-card-badge"
              style={{
                fontSize: "0.85rem",
                opacity: 0.85,
              }}
            >
              💬
            </span>
          </div>
          <div
            className="summary-card-value"
            style={{
              fontSize: "2.1rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.1,
              marginBottom: "0.4rem",
            }}
          >
            {totalConversations}
          </div>
          <div
            className="summary-card-subtext"
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              lineHeight: 1.35,
            }}
          >
            <div>Visitors who chatted with your assistant</div>
            <div
              className="summary-card-secondary"
              style={{
                fontSize: "0.72rem",
                color: "var(--text-secondary)",
                marginTop: "0.3rem",
                opacity: 0.9,
              }}
            >
              {totalMessages} total msgs · {avgMessagesPerChat} avg / chat
            </div>
          </div>
        </div>

        {/* Card 2: Leads & Bookings */}
        <div
          className={`summary-card summary-card-leads clickable ${
            filter === "leads" ? "active-filter" : ""
          }`}
          onClick={() => setFilter("leads")}
          title="Click to filter by leads & bookings"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.4rem",
            }}
          >
            <div
              className="summary-card-label"
              style={{
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Leads & bookings
            </div>
            <span
              className="summary-card-badge"
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "0.15rem 0.5rem",
                borderRadius: 12,
                background:
                  leadsAndBookingsCount > 0
                    ? "rgba(16, 185, 129, 0.15)"
                    : "var(--bg-hover)",
                color:
                  leadsAndBookingsCount > 0
                    ? "var(--success)"
                    : "var(--text-muted)",
                border: `1px solid ${
                  leadsAndBookingsCount > 0
                    ? "rgba(16, 185, 129, 0.3)"
                    : "var(--border)"
                }`,
              }}
            >
              {conversionRate}% rate
            </span>
          </div>
          <div
            className="summary-card-value"
            style={{
              fontSize: "2.1rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.1,
              marginBottom: "0.4rem",
            }}
          >
            {leadsAndBookingsCount}
          </div>
          <div
            className="summary-card-subtext"
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              lineHeight: 1.35,
            }}
          >
            <div>Left contact details or booked a demo</div>
            <div
              className="summary-card-secondary"
              style={{
                fontSize: "0.72rem",
                color: "var(--text-secondary)",
                marginTop: "0.3rem",
                opacity: 0.9,
              }}
            >
              {leadsAndBookingsCount} of {totalConversations} sessions qualified
            </div>
          </div>
        </div>

        {/* Card 3: Average Lead Score */}
        <div className="summary-card summary-card-score">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.4rem",
            }}
          >
            <div
              className="summary-card-label"
              style={{
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Average lead score
            </div>
            {avgScoreTier && avgScore !== "--" && (
              <span
                className="summary-card-badge"
                style={{
                  ...avgScoreTier.style,
                  fontSize: "0.7rem",
                  padding: "0.15rem 0.5rem",
                }}
              >
                {avgScoreTier.tier.toUpperCase()}
              </span>
            )}
          </div>
          <div
            className="summary-card-value"
            style={{
              fontSize: "2.1rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.1,
              marginBottom: "0.4rem",
            }}
          >
            {avgScore !== "--" ? `${avgScore} / 100` : "--"}
          </div>
          <div
            className="summary-card-subtext"
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              lineHeight: 1.35,
            }}
          >
            {/* 3-segment distribution track */}
            {totalConversations > 0 && (
              <div
                className="summary-card-track"
                style={{
                  display: "flex",
                  height: 4,
                  width: "100%",
                  borderRadius: 2,
                  overflow: "hidden",
                  backgroundColor: "var(--bg-surface)",
                  margin: "0.35rem 0",
                  gap: 1,
                }}
                title={`${hotLeadsCount} Hot · ${warmLeadsCount} Warm · ${coldLeadsCount} Cold`}
              >
                {hotLeadsCount > 0 && (
                  <div
                    style={{
                      width: `${(hotLeadsCount / totalConversations) * 100}%`,
                      backgroundColor: "var(--success)",
                    }}
                  />
                )}
                {warmLeadsCount > 0 && (
                  <div
                    style={{
                      width: `${(warmLeadsCount / totalConversations) * 100}%`,
                      backgroundColor: "var(--warning)",
                    }}
                  />
                )}
                {coldLeadsCount > 0 && (
                  <div
                    style={{
                      width: `${(coldLeadsCount / totalConversations) * 100}%`,
                      backgroundColor: "var(--accent)",
                    }}
                  />
                )}
              </div>
            )}
            <div
              className="summary-card-secondary"
              style={{
                fontSize: "0.72rem",
                color: "var(--text-secondary)",
                marginTop: "0.2rem",
                opacity: 0.9,
              }}
            >
              {hotLeadsCount} Hot · {warmLeadsCount} Warm · {coldLeadsCount} Cold
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-bar: Filters & Truncation Notice ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {/* Filter Pills */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.25rem",
          }}
        >
          {(
            [
              { key: "all", label: `All (${sessions.length})` },
              {
                key: "leads",
                label: `Leads & bookings (${leadsAndBookingsCount})`,
              },
              {
                key: "chat",
                label: `Just chatted (${sessions.length - leadsAndBookingsCount})`,
              },
            ] as const
          ).map((t) => {
            const isActive = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                style={{
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.82rem",
                  fontWeight: isActive ? 600 : 500,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Subtle 500-limit notice */}
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {truncated
            ? `Showing your most recent ${truncated.shown} messages. Older chats aren’t counted above.`
            : `Showing your most recent ${sessions.length} conversations.`}
        </div>
      </div>

      {/* ── Conversation List Container ── */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {loading ? (
          <div
            style={{
              padding: "5rem 1rem",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            Loading conversations…
          </div>
        ) : sessions.length === 0 ? (
          /* Empty State Before First Chat */
          <div
            style={{
              padding: "4.5rem 2rem",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                backgroundColor: "var(--accent-dim)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                marginBottom: "1.25rem",
              }}
            >
              💬
            </div>
            <h3
              style={{
                margin: "0 0 0.5rem 0",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              No conversations yet
            </h3>
            <p
              style={{
                maxWidth: 440,
                margin: "0 0 1.75rem 0",
                fontSize: "0.9rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              When visitors chat with your assistant on your website, you’ll see
              what they asked and who left their details here.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Link
                href="/workspace/testing"
                style={{
                  padding: "0.6rem 1.15rem",
                  backgroundColor: "var(--accent)",
                  color: "#ffffff",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "opacity 0.2s",
                }}
              >
                Test your assistant
              </Link>
              <Link
                href="/workspace/deploy"
                style={{
                  padding: "0.6rem 1.15rem",
                  backgroundColor: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "background-color 0.2s",
                }}
              >
                Add it to your website
              </Link>
            </div>
          </div>
        ) : filteredSessions.length === 0 ? (
          /* Filtered empty state */
          <div
            style={{
              padding: "4rem 1rem",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
            }}
          >
            No conversations matching this filter.
          </div>
        ) : (
          /* Three-Column Table */
          <table
            className="conversation-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "var(--bg-surface)" }}>
                <th
                  style={{
                    padding: "0.85rem 1.25rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  What they asked
                </th>
                <th
                  style={{
                    padding: "0.85rem 1.25rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                    width: 180,
                  }}
                >
                  Result
                </th>
                <th
                  style={{
                    padding: "0.85rem 1.25rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                    width: 140,
                    textAlign: "right",
                  }}
                >
                  Lead score
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => {
                const isExpanded = expandedId === session.id;
                const rawOutcome =
                  session.finalValues[
                    conversionMetric?.id || "conversion_outcome"
                  ];
                const resultLabel = getPlainResultLabel(rawOutcome);
                const scoreTier = getLeadScoreTier(
                  session.finalValues[scoreMetric?.id || "lead_score"]
                );

                const transcript = transcriptCache[session.id];
                const isLoadingTranscript =
                  loadingTranscriptId === session.id;

                return (
                  <Fragment key={session.id}>
                    {/* Conversation Row */}
                    <tr
                      className="conversation-row"
                      onClick={() => toggleExpand(session.id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isExpanded
                          ? "var(--bg-hover)"
                          : "transparent",
                        borderBottom: "1px solid var(--border)",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isExpanded
                          ? "var(--bg-hover)"
                          : "transparent";
                      }}
                    >
                      {/* Column 1: What they asked + time + count */}
                      <td
                        className="conversation-cell-msg"
                        style={{ padding: "1rem 1.25rem" }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontSize: "0.92rem",
                            marginBottom: "0.25rem",
                            lineHeight: 1.35,
                          }}
                        >
                          {session.latestMessage}
                        </div>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {formatRelativeTime(session.latestTime)} ·{" "}
                          {session.messageCount}{" "}
                          {session.messageCount === 1 ? "message" : "messages"}
                        </div>
                      </td>

                      {/* Column 2: Result */}
                      <td
                        className="conversation-cell-result"
                        style={{ padding: "1rem 1.25rem" }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: isLeadOrBooking(rawOutcome)
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                          }}
                        >
                          {resultLabel}
                        </span>
                      </td>

                      {/* Column 3: Lead Score + chevron */}
                      <td
                        className="conversation-cell-score"
                        style={{
                          padding: "1rem 1.25rem",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.75rem",
                          }}
                        >
                          <span style={scoreTier.style}>{scoreTier.label}</span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Detail View (Two-Column Drawer) */}
                    {isExpanded && (
                      <tr key={`${session.id}-details`}>
                        <td
                          colSpan={3}
                          style={{
                            padding: 0,
                            borderBottom: "1px solid var(--border)",
                            backgroundColor: "var(--bg-surface)",
                          }}
                        >
                          <div
                            className="drawer-grid"
                            style={{
                              padding: "1.5rem",
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(320px, 1fr))",
                              gap: "1.5rem",
                            }}
                          >
                            {/* Left Panel: Chat Transcript */}
                            <div
                              style={{
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: 10,
                                padding: "1.25rem",
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "1rem",
                                  paddingBottom: "0.6rem",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.85rem",
                                    fontWeight: 700,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  What the visitor wrote
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.65rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {session.messageCount}{" "}
                                    {session.messageCount === 1
                                      ? "message"
                                      : "messages"}
                                  </span>
                                  {transcript && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadSingleTranscript(session.id);
                                      }}
                                      title="Download conversation transcript as text file"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.3rem",
                                        padding: "0.2rem 0.55rem",
                                        fontSize: "0.72rem",
                                        fontWeight: 600,
                                        background: "var(--bg-hover)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 6,
                                        color: "var(--text-secondary)",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.color =
                                          "var(--text-primary)";
                                        e.currentTarget.style.borderColor =
                                          "var(--accent)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.color =
                                          "var(--text-secondary)";
                                        e.currentTarget.style.borderColor =
                                          "var(--border)";
                                      }}
                                    >
                                      <span>⬇</span>
                                      <span>Export .txt</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isLoadingTranscript ? (
                                <div
                                  style={{
                                    padding: "2.5rem 1rem",
                                    textAlign: "center",
                                    color: "var(--text-muted)",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  Loading conversation transcript…
                                </div>
                              ) : transcript &&
                                transcript.messages &&
                                transcript.messages.length > 0 ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.75rem",
                                    maxHeight: 380,
                                    overflowY: "auto",
                                    paddingRight: "0.35rem",
                                  }}
                                >
                                  {transcript.messages.map((m) => {
                                    const isVisitor = m.role === "visitor";
                                    return (
                                      <div
                                        key={m.id}
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: isVisitor
                                            ? "flex-start"
                                            : "flex-end",
                                        }}
                                      >
                                        <div
                                          style={{
                                            maxWidth: "85%",
                                            borderRadius: 8,
                                            padding: "0.65rem 0.85rem",
                                            fontSize: "0.88rem",
                                            lineHeight: 1.45,
                                            backgroundColor: isVisitor
                                              ? "var(--bg-hover)"
                                              : "var(--accent-dim)",
                                            color: "var(--text-primary)",
                                            border: `1px solid ${
                                              isVisitor
                                                ? "var(--border)"
                                                : "var(--accent-glow)"
                                            }`,
                                          }}
                                        >
                                          {m.content}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "0.72rem",
                                            color: "var(--text-muted)",
                                            marginTop: "0.2rem",
                                            padding: "0 0.25rem",
                                          }}
                                        >
                                          {isVisitor ? "Visitor · " : "Assistant · "}
                                          {formatTimeOnly(m.timestamp)}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Note if historical transcript has no assistant responses */}
                                  {transcript.messages.every(
                                    (m) => m.role === "visitor"
                                  ) && (
                                    <div
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "var(--text-muted)",
                                        fontStyle: "italic",
                                        textAlign: "center",
                                        padding: "0.5rem 0",
                                      }}
                                    >
                                      Assistant response was not recorded for
                                      this earlier chat.
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    padding: "2rem 1rem",
                                    textAlign: "center",
                                    color: "var(--text-muted)",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  No transcript available.
                                </div>
                              )}
                            </div>

                            {/* Right Panel: About This Visitor */}
                            <div
                              style={{
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: 10,
                                padding: "1.25rem",
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  fontWeight: 700,
                                  color: "var(--text-primary)",
                                  marginBottom: "1rem",
                                  paddingBottom: "0.6rem",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                About this visitor
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "1rem",
                                }}
                              >
                                {/* Interest level */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    Interest level
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.88rem",
                                      fontWeight: 600,
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {formatInterestLevel(
                                      session.finalValues["lead_stage"]
                                    )}
                                  </div>
                                </div>

                                {/* Looking for / Use case */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    Looking for
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.88rem",
                                      fontWeight: 600,
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {session.finalValues["use_case"] &&
                                    session.finalValues["use_case"] !== "unknown"
                                      ? session.finalValues["use_case"].replace(
                                          /_/g,
                                          " "
                                        )
                                      : "Not available"}
                                  </div>
                                </div>

                                {/* Budget */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    Budget
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.88rem",
                                      fontWeight: 600,
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {session.finalValues["customer_budget"] &&
                                    session.finalValues["customer_budget"] !==
                                      "unknown" &&
                                    session.finalValues["customer_budget"] !== "0"
                                      ? session.finalValues["customer_budget"]
                                      : "Not available"}
                                  </div>
                                </div>

                                {/* SEO score */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    SEO score
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.88rem",
                                      fontWeight: 600,
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {session.finalValues["seo_score"] &&
                                    session.finalValues["seo_score"] !== "unknown"
                                      ? session.finalValues["seo_score"]
                                      : "Not available"}
                                  </div>
                                </div>

                                {/* Chat ID */}
                                <div style={{ gridColumn: "span 2" }}>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    Chat ID
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.82rem",
                                      fontFamily: "monospace",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {session.id}
                                  </div>
                                </div>

                                {/* Additional custom metrics */}
                                {metrics
                                  .filter(
                                    (m) =>
                                      ![
                                        "conversion_outcome",
                                        "lead_stage",
                                        "use_case",
                                        "lead_score",
                                        "customer_budget",
                                        "seo_score",
                                      ].includes(m.id)
                                  )
                                  .map((m) => (
                                    <div key={m.id}>
                                      <div
                                        style={{
                                          fontSize: "0.75rem",
                                          color: "var(--text-muted)",
                                          marginBottom: "0.2rem",
                                        }}
                                      >
                                        {m.name}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "0.88rem",
                                          fontWeight: 600,
                                          color: "var(--text-primary)",
                                        }}
                                      >
                                        {session.finalValues[m.id] &&
                                        session.finalValues[m.id] !== "unknown"
                                          ? session.finalValues[m.id]
                                          : "Not available"}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
