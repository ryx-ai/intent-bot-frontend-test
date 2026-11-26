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

// Quiet, neutral chip: the tier colour lives only in a small dot / meter,
// never in a tinted box, so long lists stay calm and readable.
const TIER_COLOR: Record<"hot" | "warm" | "cold", string> = {
  hot: "#10b981",
  warm: "#f59e0b",
  cold: "#94a3b8",
};

export function getLeadScoreTier(scoreStr?: string | null): {
  label: string;
  tier: "hot" | "warm" | "cold";
  num: number | null;
  name: string;
  color: string;
  style: React.CSSProperties;
} {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.2rem 0.6rem",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    background: "var(--bg-card)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
  };

  const num = parseInt(scoreStr || "", 10);
  if (isNaN(num)) {
    return { label: "--", tier: "cold", num: null, name: "", color: "var(--border)", style };
  }
  const tier = num >= 75 ? "hot" : num >= 40 ? "warm" : "cold";
  const name = tier === "hot" ? "Hot" : tier === "warm" ? "Warm" : "Cold";
  return { label: `${num} · ${name}`, tier, num, name, color: TIER_COLOR[tier], style };
}

/** Lead score as a number, a slim meter and a quiet tier word. */
function LeadScoreMeter({ scoreStr }: { scoreStr?: string | null }) {
  const t = getLeadScoreTier(scoreStr);
  if (t.num === null) {
    return <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>—</span>;
  }
  const pct = Math.max(4, Math.min(100, t.num));
  return (
    <span
      title={`Lead score ${t.num} of 100 (${t.name})`}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", whiteSpace: "nowrap" }}
    >
      <span
        style={{
          fontSize: "0.9rem",
          fontWeight: 650,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          minWidth: "1.4rem",
          textAlign: "right",
        }}
      >
        {t.num}
      </span>
      <span
        aria-hidden
        style={{
          position: "relative",
          width: 44,
          height: 4,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            borderRadius: 999,
            background: t.color,
          }}
        />
      </span>
      <span
        style={{
          fontSize: "0.75rem",
          fontWeight: 500,
          color: "var(--text-secondary)",
          minWidth: "2.2rem",
          textAlign: "left",
        }}
      >
        {t.name}
      </span>
    </span>
  );
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
          } else if (m.id === "lead_score") {
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
            // The latest value the assistant actually noted in this chat
            // (a visitor may mention it early and never again).
            const noted = [...sorted]
              .reverse()
              .map((r) => String((r[m.id] as string) ?? "").trim())
              .find((v) => v && !["unknown", "none", "null", "n/a", "0"].includes(v.toLowerCase()));
            finalValues[m.id] = noted || "unknown";
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
    void (async () => {
      await loadData();
    })();
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
    <div style={{ width: "100%", maxWidth: 1360, margin: "0 auto", padding: "2rem", boxSizing: "border-box" }}>
      <style>{`
        .summary-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border) !important;
          border-radius: 16px;
          padding: 1.35rem 1.5rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 20px rgba(15, 23, 42, 0.035);
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .summary-card.clickable {
          cursor: pointer;
        }
        .summary-card.clickable:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(15, 23, 42, 0.05), 0 10px 28px rgba(15, 23, 42, 0.06);
        }
        /* Selected filter: a slightly firmer neutral edge, no colour tint. */
        .summary-card.active-filter {
          border-color: color-mix(in srgb, var(--text-primary) 22%, var(--border)) !important;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06);
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

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Export menu */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="ryx-hbtn"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              disabled={sessions.length === 0 || exportingFormat !== null}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title="Download your conversations"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              </svg>
              <span>{exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}…` : "Export"}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                style={{ opacity: 0.6, transition: "transform .2s ease", transform: exportMenuOpen ? "rotate(180deg)" : "none" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {exportMenuOpen && (
              <>
                <div onClick={() => setExportMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div role="menu" className="ryx-menu">
                  <div style={{ padding: "0.55rem 0.7rem 0.45rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                      Download
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {sessions.length} {sessions.length === 1 ? "conversation" : "conversations"}
                    </span>
                  </div>
                  {(
                    [
                      {
                        fmt: "csv" as const,
                        title: "Spreadsheet",
                        desc: "Open in Excel or Google Sheets. Includes full chats.",
                        tint: "#10b981",
                        icon: <path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16" />,
                      },
                      {
                        fmt: "json" as const,
                        title: "Developer file",
                        desc: "Structured data for a CRM or an API.",
                        tint: "#0ea5e9",
                        icon: <path d="M9 4c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3" />,
                      },
                    ]
                  ).map((o) => (
                    <button
                      key={o.fmt}
                      type="button"
                      role="menuitem"
                      className="ryx-mitem"
                      onClick={() => handleGlobalExport(o.fmt)}
                      disabled={exportingFormat !== null}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: o.tint,
                          background: `color-mix(in srgb, ${o.tint} 10%, var(--bg-card))`,
                          border: `1px solid color-mix(in srgb, ${o.tint} 22%, var(--border))`,
                        }}
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          {o.icon}
                        </svg>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "0.86rem", color: "var(--text-primary)" }}>
                          {o.title}
                          <span
                            style={{
                              fontSize: "0.64rem",
                              fontWeight: 600,
                              letterSpacing: "0.04em",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "1px 6px",
                            }}
                          >
                            .{o.fmt}
                          </span>
                        </span>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
                          {o.desc}
                        </span>
                      </span>
                      <svg className="ryx-mitem-go" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 4v11M7 10l5 5 5-5" />
                      </svg>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button type="button" className="ryx-hbtn" onClick={() => loadData(true)} disabled={loading} title="Refresh">
            <svg className={loading ? "ryx-hspin" : undefined} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>

          <style>{`
            .ryx-hbtn { display: inline-flex; align-items: center; gap: .5rem; padding: .55rem .95rem; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); font: inherit; font-size: .85rem; font-weight: 500; cursor: pointer; box-shadow: 0 1px 2px rgba(15,23,42,.05); transition: border-color .15s, box-shadow .15s, background .15s; }
            .ryx-hbtn:hover:not(:disabled) { border-color: #cbd5e1; box-shadow: 0 2px 6px rgba(15,23,42,.08); }
            .ryx-hbtn:disabled { opacity: .55; cursor: not-allowed; }
            .ryx-hbtn[aria-expanded="true"] { border-color: #cbd5e1; background: var(--bg-surface); }
            .ryx-hspin { animation: ryxHSpin 1s linear infinite; }
            @keyframes ryxHSpin { to { transform: rotate(360deg); } }
            .ryx-menu { position: absolute; top: calc(100% + 8px); right: 0; z-index: 50; width: 320px; padding: .35rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 2px 6px rgba(15,23,42,.06), 0 18px 44px rgba(15,23,42,.14); transform-origin: top right; animation: ryxMenuIn .14s ease-out; }
            @keyframes ryxMenuIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
            .ryx-mitem { width: 100%; display: flex; align-items: center; gap: .75rem; padding: .65rem .7rem; border: none; border-radius: 10px; background: transparent; text-align: left; cursor: pointer; font: inherit; transition: background .15s; }
            .ryx-mitem:hover:not(:disabled) { background: var(--bg-surface); }
            .ryx-mitem:disabled { opacity: .6; cursor: default; }
            .ryx-mitem-go { color: var(--text-muted); opacity: 0; transform: translateY(-2px); transition: opacity .15s, transform .15s; flex-shrink: 0; }
            .ryx-mitem:hover .ryx-mitem-go { opacity: 1; transform: none; }
            @media (max-width: 480px) { .ryx-menu { width: min(320px, calc(100vw - 32px)); } }
          `}</style>
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
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              </svg>
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
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "0.2rem 0.6rem",
                borderRadius: 999,
                background: "var(--bg-card)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: leadsAndBookingsCount > 0 ? "#10b981" : "#cbd5e1",
                }}
              />
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
                style={avgScoreTier.style}
              >
                <span
                  aria-hidden
                  style={{ width: 6, height: 6, borderRadius: "50%", background: avgScoreTier.color }}
                />
                {avgScoreTier.name}
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
            {avgScore !== "--" ? (
              <>
                {avgScore}
                <span style={{ fontSize: "1.1rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: 3 }}>/100</span>
              </>
            ) : (
              "--"
            )}
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
                  height: 6,
                  width: "100%",
                  margin: "0.5rem 0 0.45rem",
                  gap: 3,
                }}
                title={`${hotLeadsCount} Hot · ${warmLeadsCount} Warm · ${coldLeadsCount} Cold`}
              >
                {hotLeadsCount > 0 && (
                  <div
                    style={{
                      flexGrow: hotLeadsCount, flexBasis: 0, minWidth: 6, borderRadius: 999,
                      backgroundColor: TIER_COLOR.hot,
                    }}
                  />
                )}
                {warmLeadsCount > 0 && (
                  <div
                    style={{
                      flexGrow: warmLeadsCount, flexBasis: 0, minWidth: 6, borderRadius: 999,
                      backgroundColor: TIER_COLOR.warm,
                    }}
                  />
                )}
                {coldLeadsCount > 0 && (
                  <div
                    style={{
                      flexGrow: coldLeadsCount, flexBasis: 0, minWidth: 6, borderRadius: 999,
                      backgroundColor: TIER_COLOR.cold,
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
            gap: "0.25rem",
            background: "color-mix(in srgb, var(--text-primary) 5%, transparent)",
            borderRadius: 10,
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
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.82rem",
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: "inherit",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  background: isActive ? "var(--bg-card)" : "transparent",
                  boxShadow: isActive
                    ? "0 1px 2px rgba(15, 23, 42, 0.08), 0 1px 1px rgba(15, 23, 42, 0.04)"
                    : "none",
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
              aria-hidden
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: "var(--text-primary)",
                color: "var(--bg-card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.25rem",
                boxShadow: "0 8px 20px rgba(15, 23, 42, 0.16)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              </svg>
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
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
              <Link
                href="/workspace/testing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0.7rem 1.25rem",
                  backgroundColor: "var(--text-primary)",
                  color: "var(--bg-card)",
                  borderRadius: 10,
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.12)",
                }}
              >
                Test your assistant
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link
                href="/workspace/deploy"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0.7rem 1.25rem",
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  borderRadius: 10,
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m8 9-4 3 4 3M16 9l4 3-4 3M13.5 5l-3 14" />
                </svg>
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
                          ? "var(--bg-surface)"
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
                          ? "var(--bg-surface)"
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
                          <LeadScoreMeter
                            scoreStr={session.finalValues[scoreMetric?.id || "lead_score"]}
                          />
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
                              padding: "1.25rem 1.5rem 1.5rem",
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(320px, 1fr))",
                              gap: "1.25rem",
                              alignItems: "stretch",
                            }}
                          >
                            {/* Left Panel: Chat Transcript */}
                            <div
                              style={{
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: 16,
                                padding: "1.15rem 1.25rem 1.25rem",
                                display: "flex",
                                flexDirection: "column",
                                boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.04)",
                                minWidth: 0,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "0.9rem",
                                  paddingBottom: "0.75rem",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.92rem",
                                    fontWeight: 650,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  Conversation
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
                                      fontSize: "0.72rem",
                                      fontWeight: 600,
                                      color: "var(--text-secondary)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 999,
                                      padding: "2px 9px",
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
                                        padding: "0.3rem 0.7rem",
                                        fontSize: "0.74rem",
                                        fontWeight: 600,
                                        fontFamily: "inherit",
                                        background: "var(--bg-card)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                        color: "var(--text-secondary)",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.color =
                                          "var(--text-primary)";
                                        e.currentTarget.style.borderColor =
                                          "#cbd5e1";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.color =
                                          "var(--text-secondary)";
                                        e.currentTarget.style.borderColor =
                                          "var(--border)";
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                                      <span>Download</span>
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
                                    gap: "0.9rem",
                                    maxHeight: 400,
                                    overflowY: "auto",
                                    paddingRight: "0.35rem",
                                  }}
                                >
                                  {transcript.messages.map((m) => {
                                    const isVisitor = m.role === "visitor";
                                    const avatar = (
                                      <span
                                        aria-hidden
                                        style={{
                                          width: 26,
                                          height: 26,
                                          borderRadius: "50%",
                                          flexShrink: 0,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: "0.66rem",
                                          fontWeight: 700,
                                          background: isVisitor ? "var(--bg-hover)" : "#0f172a",
                                          color: isVisitor ? "var(--text-secondary)" : "#fff",
                                        }}
                                      >
                                        {isVisitor ? (
                                          "V"
                                        ) : (
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
                                        )}
                                      </span>
                                    );
                                    return (
                                      <div
                                        key={m.id}
                                        style={{
                                          display: "flex",
                                          gap: 8,
                                          alignItems: "flex-end",
                                          flexDirection: isVisitor ? "row" : "row-reverse",
                                        }}
                                      >
                                        {avatar}
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: isVisitor ? "flex-start" : "flex-end", maxWidth: "80%", minWidth: 0 }}>
                                          <div
                                            style={{
                                              borderRadius: isVisitor ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                                              padding: "0.6rem 0.85rem",
                                              fontSize: "0.86rem",
                                              lineHeight: 1.5,
                                              backgroundColor: isVisitor ? "var(--bg-surface)" : "var(--bg-card)",
                                              color: "var(--text-primary)",
                                              border: "1px solid var(--border)",
                                              boxShadow: isVisitor ? "none" : "0 1px 2px rgba(15,23,42,.05)",
                                              overflowWrap: "anywhere",
                                            }}
                                          >
                                            {m.content}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "0.7rem",
                                              color: "var(--text-muted)",
                                              marginTop: "0.25rem",
                                              padding: "0 0.25rem",
                                            }}
                                          >
                                            {isVisitor ? "Visitor · " : "Assistant · "}
                                            {formatTimeOnly(m.timestamp)}
                                          </div>
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
                                borderRadius: 16,
                                padding: "1.15rem 1.25rem 1.25rem",
                                display: "flex",
                                flexDirection: "column",
                                boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.04)",
                                minWidth: 0,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.92rem",
                                  fontWeight: 650,
                                  color: "var(--text-primary)",
                                  marginBottom: "0.9rem",
                                  paddingBottom: "0.75rem",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                About this visitor
                              </div>

                              {/* This chat at a glance */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "0.6rem",
                                  marginBottom: "0.9rem",
                                }}
                              >
                                <div style={{ padding: "0.75rem 0.85rem", borderRadius: 12, background: "var(--bg-surface)" }}>
                                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>Result</div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: isLeadOrBooking(rawOutcome) ? "#10b981" : "#cbd5e1" }} />
                                    {resultLabel}
                                  </div>
                                </div>
                                <div style={{ padding: "0.75rem 0.85rem", borderRadius: 12, background: "var(--bg-surface)" }}>
                                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>Lead score</div>
                                  <LeadScoreMeter scoreStr={session.finalValues[scoreMetric?.id || "lead_score"]} />
                                </div>
                              </div>

                              {(() => {
                                // Exactly the owner's list: their names, their order, only items set to "Shown".
                                // Result and lead score already have their own columns in the table.
                                const items = metrics.filter(
                                  (m) => m.id !== "conversion_outcome" && m.id !== "lead_score"
                                );
                                const valueOf = (id: string) => {
                                  const raw = (session.finalValues[id] || "").trim();
                                  if (!raw || ["unknown", "none", "null", "n/a"].includes(raw.toLowerCase())) return "";
                                  if (id === "lead_stage") return formatInterestLevel(raw);
                                  return raw.replace(/_/g, " ");
                                };
                                if (items.length === 0) {
                                  return (
                                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                      Nothing else is tracked yet. Add items in AI Core Metrics.
                                    </div>
                                  );
                                }
                                return (
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                                    {items.map((m) => {
                                      const v = valueOf(m.id);
                                      return (
                                        <div
                                          key={m.id}
                                          style={{
                                            minWidth: 0,
                                            padding: "0.7rem 0.85rem",
                                            borderRadius: 12,
                                            border: v ? "1px solid var(--border)" : "1px dashed var(--border)",
                                          }}
                                        >
                                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                                            {m.name}
                                          </div>
                                          <div
                                            title={v || undefined}
                                            style={{
                                              fontSize: "0.88rem",
                                              fontWeight: v ? 600 : 400,
                                              color: v ? "var(--text-primary)" : "var(--text-muted)",
                                              overflowWrap: "anywhere",
                                            }}
                                          >
                                            {v || "Not mentioned"}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
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
