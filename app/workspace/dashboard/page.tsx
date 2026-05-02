"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const ANALYTICS_LIMIT = 500;

/* ── Types ─────────────────────────────────────────────────── */
interface MetricConfig {
  id: string;
  name: string;
  description: string;
  display_on_dashboard: boolean;
}

interface AnalyticsRow {
  timestamp: string;
  session_id: string;
  user_message: string;
  [key: string]: string | undefined;
}

interface Session {
  id: string;
  messages: AnalyticsRow[];
  latestTime: Date;
  firstMessage: string;
  finalValues: Record<string, string>;
}

/* ── Badge color helper ────────────────────────────────────── */
function getBadgeStyle(metricId: string, val: string) {
  const baseStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "0.25rem 0.6rem",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontWeight: 500,
    textTransform: "capitalize",
  };

  if (metricId.includes("score")) {
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      if (num >= 75) // hot
        return { ...baseStyle, background: "#2d1515", color: "#fc5c5c" };
      if (num >= 40) // warm
        return { ...baseStyle, background: "#2d1f0e", color: "#ffae42" };
      return { ...baseStyle, background: "#0f1e2d", color: "#4db8ff" }; // cold
    }
  }

  if (val === "lead_captured") {
    return { ...baseStyle, background: "#0d2318", color: "#32d583", fontWeight: 600 };
  }
  if (val === "booked_demo") {
    return { ...baseStyle, background: "var(--accent)", color: "#fff", fontWeight: 600 };
  }
  if (val === "dropped") {
    return { ...baseStyle, background: "#2d1515", color: "#ff6b6b" };
  }
  
  if (val === "just_chat" || val === "unknown") {
    return { ...baseStyle, background: "#2a2d45", color: val === "just_chat" ? "#fff" : "var(--text-secondary)" };
  }

  // fallback
  return { ...baseStyle, background: "#2a2d45", color: "var(--text-primary)" };
}

/* ── Component ─────────────────────────────────────────────── */
export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<MetricConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // When the backend reports more rows than we fetched, surface that to the
  // user rather than silently showing a partial dashboard.
  const [truncated, setTruncated] = useState<{ shown: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsData, analyticsResponse] = await Promise.all([
        api.get<MetricConfig[]>("/api/metrics/config"),
        api.get<{ records: AnalyticsRow[]; total: number }>(
          `/api/analytics?limit=${ANALYTICS_LIMIT}`
        ),
      ]);

      const analyticsData = analyticsResponse.records || [];
      const total = analyticsResponse.total ?? analyticsData.length;
      setTruncated(
        total > analyticsData.length ? { shown: analyticsData.length, total } : null
      );
      setMetrics(metricsData.filter((m) => m.display_on_dashboard));

      // Group rows by session, then sort each session's messages once
      // (chronologically ascending). Doing it here — not in render — avoids
      // mutating arrays during render and lets us derive first/last cheaply.
      const buckets: Record<string, AnalyticsRow[]> = {};
      analyticsData.forEach((row) => {
        (buckets[row.session_id] ??= []).push(row);
      });

      const arr: Session[] = Object.entries(buckets).map(([sessionId, rows]) => {
        const sorted = [...rows].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const finalValues: Record<string, string> = {};
        metricsData.forEach((m) => {
          finalValues[m.id] = (last && last[m.id]) || "unknown";
        });
        return {
          id: sessionId,
          messages: sorted,
          latestTime: new Date(last.timestamp),
          firstMessage: first.user_message || "...",
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
    load();
  }, [load]);

  // ── Computed stats ──
  const totalSessions = sessions.length;

  // Find score metric dynamically (any metric with "score" in its ID)
  const scoreMetric = metrics.find((m) => m.id.includes("score"));
  const avgScore = (() => {
    if (!scoreMetric) return "--";
    let total = 0,
      count = 0;
    sessions.forEach((s) => {
      const n = parseInt(s.finalValues[scoreMetric.id], 10);
      if (!isNaN(n)) {
        total += n;
        count++;
      }
    });
    return count > 0 ? Math.round(total / count) : "--";
  })();

  // Find conversion metric dynamically (any metric with "conversion" or "outcome" in its ID)
  const conversionMetric = metrics.find((m) => m.id.includes("conversion") || m.id.includes("outcome"));
  const highIntentLeads = conversionMetric
    ? sessions.filter((s) => {
        const val = s.finalValues[conversionMetric.id];
        return val === "lead_captured" || val === "booked_demo";
      }).length
    : 0;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "2.5rem",
          paddingBottom: "1.5rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
            Intent Flow Engine
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
            Real-time Conversation Analytics
          </p>
        </div>

        <div style={{ display: "flex", gap: "1.5rem", alignItems: "stretch" }}>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh analytics"
            style={{
              alignSelf: "stretch",
              padding: "0 1rem",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              fontFamily: "inherit",
              transition: "all 0.2s",
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
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          {[
            { label: "Total Sessions", value: totalSessions },
            { label: "High-Intent Leads", value: conversionMetric ? highIntentLeads : "N/A", hint: !conversionMetric ? "No conversion metric configured" : "" },
            { label: "Avg Lead Score", value: avgScore, hint: !scoreMetric ? "No score metric configured" : "" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                padding: "1rem 1.5rem",
                borderRadius: 8,
                minWidth: 140,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                {card.label}
              </span>
              <span style={{ fontSize: "1.8rem", fontWeight: 600, color: "var(--accent)" }}>
                {card.value}
              </span>
              {card.hint && (
                <span style={{ fontSize: "0.7rem", color: "var(--warning)", marginTop: "0.25rem" }}>
                  {card.hint}
                </span>
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Truncation warning when the backend has more rows than we fetched. */}
      {truncated && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            background: "rgba(255, 174, 66, 0.08)",
            border: "1px solid rgba(255, 174, 66, 0.3)",
            borderRadius: 8,
            color: "var(--warning)",
            fontSize: "0.85rem",
          }}
        >
          Showing the most recent {truncated.shown.toLocaleString()} of{" "}
          {truncated.total.toLocaleString()} analytics rows. Older sessions are not
          included in stats below.
        </div>
      )}

      {/* ── Table Container ── */}
      <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "5rem", textAlign: "center", color: "var(--text-secondary)" }}>
            Loading analytics...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: "5rem", textAlign: "center", color: "var(--text-muted)" }}>
            No interactions tracked yet. Start chatting!
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr>
                <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Time</th>
                <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Session</th>
                <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Message</th>
                {metrics.map((m) => (
                  <th key={m.id} style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const isExpanded = expandedId === session.id;
                const timeStr = session.latestTime.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                                  });
                
                return (
                  <Fragment key={session.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : session.id)}
                      style={{
                        cursor: "pointer",
                        background: isExpanded ? "rgba(255, 255, 255, 0.02)" : "transparent",
                        transition: "background-color 0.2s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isExpanded ? "rgba(255, 255, 255, 0.02)" : "transparent"}
                    >
                      <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                        {timeStr}
                        <span style={{ fontSize: "0.7rem", marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)", fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        {session.id.substring(0, 10)}
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)", maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff", fontSize: "0.95rem" }}>
                        {session.firstMessage}
                      </td>
                      {metrics.map((m) => {
                        const val = session.finalValues[m.id] || "unknown";
                        const badgeStyle = getBadgeStyle(m.id, val);
                        return (
                          <td key={m.id} style={{ padding: "1rem", borderBottom: "1px solid var(--border)" }}>
                            <span style={badgeStyle}>
                              {val.replace(/_/g, " ")}
                            </span>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Drawer */}
                    {isExpanded && (
                      <tr key={`${session.id}-drawer`}>
                        <td colSpan={3 + metrics.length} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                          <div style={{ backgroundColor: "var(--bg-surface)", borderTop: "1px dashed var(--border)", padding: "1rem" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                {session.messages.map((m, idx) => (
                                  <tr key={`${session.id}-${idx}`}>
                                    <td style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.85rem", whiteSpace: "nowrap", width: 140 }}>
                                      {new Date(m.timestamp).toLocaleString("en-US", {
                                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
                                      })}
                                    </td>
                                    <td style={{ padding: "0.5rem 0", color: "var(--text-primary)", fontSize: "0.9rem" }}>
                                      {m.user_message || <em style={{ color: "var(--text-muted)" }}>No message</em>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
