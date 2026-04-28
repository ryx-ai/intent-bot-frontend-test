"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";

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
  conversion_outcome?: string;
  lead_stage?: string;
  use_case?: string;
  lead_score?: string;
  customer_budget?: string;
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
    const num = parseInt(val);
    if (!isNaN(num)) {
      if (num >= 75) // hot
        return { ...baseStyle, background: "#2b1111", color: "#fc5c5c" };
      if (num >= 40) // warm
        return { ...baseStyle, background: "#2e2112", color: "#ffae42" };
      return { ...baseStyle, background: "#122129", color: "#4db8ff" }; // cold
    }
  }

  if (val === "lead_captured") {
    return { ...baseStyle, background: "#0e291e", color: "#32d583", fontWeight: 600 };
  }
  if (val === "booked_demo") {
    return { ...baseStyle, background: "#6b4cff", color: "#fff", fontWeight: 600 };
  }
  if (val === "dropped") {
    return { ...baseStyle, background: "#331515", color: "#ff6b6b" };
  }
  
  if (val === "just_chat" || val === "unknown") {
    return { ...baseStyle, background: "#3b3e45", color: val === "just_chat" ? "#fff" : "#9aa0a6" };
  }

  // fallback
  return { ...baseStyle, background: "#3b3e45", color: "#e6e8eb" };
}

/* ── Component ─────────────────────────────────────────────── */
export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<MetricConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [metricsData, analyticsResponse] = await Promise.all([
          api.get<MetricConfig[]>("/api/metrics/config"),
          api.get<{ records: AnalyticsRow[]; total: number }>("/api/analytics?limit=1000"),
        ]);

        const analyticsData = analyticsResponse.records || [];
        setMetrics(metricsData.filter((m) => m.display_on_dashboard));

        // Group by session
        const map: Record<string, Session> = {};
        analyticsData.forEach((row) => {
          if (!map[row.session_id]) {
            map[row.session_id] = {
              id: row.session_id,
              messages: [],
              latestTime: new Date(row.timestamp),
              firstMessage: row.user_message || "...",
              finalValues: {},
            };
          }
          const session = map[row.session_id];
          const rowTime = new Date(row.timestamp);
          session.messages.push(row);

          if (rowTime >= session.latestTime) {
            session.latestTime = rowTime;
            metricsData.forEach((m) => {
              session.finalValues[m.id] = row[m.id] || "unknown";
            });
          }
          if (session.messages.length === 1) {
            session.firstMessage = row.user_message;
          }
        });

        const arr = Object.values(map);
        arr.sort((a, b) => b.latestTime.getTime() - a.latestTime.getTime());
        setSessions(arr);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Computed stats ──
  const totalSessions = sessions.length;
  const highIntentLeads = sessions.filter(
    (s) =>
      s.finalValues.conversion_outcome === "lead_captured" ||
      s.finalValues.conversion_outcome === "booked_demo"
  ).length;
  const avgScore = (() => {
    let total = 0,
      count = 0;
    sessions.forEach((s) => {
      const n = parseInt(s.finalValues.lead_score);
      if (!isNaN(n)) {
        total += n;
        count++;
      }
    });
    return count > 0 ? Math.round(total / count) : "--";
  })();

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
          borderBottom: "1px solid #2b2f36",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.75rem", fontWeight: 600, color: "#e6e8eb" }}>
            Intent Flow Engine
          </h1>
          <p style={{ margin: 0, color: "#9aa0a6", fontSize: "0.95rem" }}>
            Real-time Conversation Analytics
          </p>
        </div>

        <div style={{ display: "flex", gap: "1.5rem" }}>
          {[
            { label: "Total Sessions", value: totalSessions },
            { label: "High-Intent Leads", value: highIntentLeads },
            { label: "Avg Lead Score", value: avgScore },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "#191c21",
                border: "1px solid #2b2f36",
                padding: "1rem 1.5rem",
                borderRadius: 8,
                minWidth: 140,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ fontSize: "0.8rem", color: "#9aa0a6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                {card.label}
              </span>
              <span style={{ fontSize: "1.8rem", fontWeight: 600, color: "#6b4cff" }}>
                {card.value}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Table Container ── */}
      <div style={{ background: "#191c21", border: "1px solid #2b2f36", borderRadius: 8, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "5rem", textAlign: "center", color: "#9aa0a6" }}>
            Loading analytics...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: "5rem", textAlign: "center", color: "#64748b" }}>
            No interactions tracked yet. Start chatting!
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr>
                <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36" }}>Time</th>
                <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36" }}>Session</th>
                <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36" }}>Message</th>
                {metrics.map((m) => (
                  <th key={m.id} style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36" }}>
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
                  timeZone: "Asia/Kolkata",
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
                      <td style={{ padding: "1rem", borderBottom: "1px solid #2b2f36", color: "#9aa0a6", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                        {timeStr}
                        <span style={{ fontSize: "0.7rem", marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #2b2f36", fontFamily: "monospace", color: "#9aa0a6", fontSize: "0.85rem" }}>
                        {session.id.substring(0, 10)}
                      </td>
                      <td style={{ padding: "1rem", borderBottom: "1px solid #2b2f36", maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff", fontSize: "0.95rem" }}>
                        {session.firstMessage}
                      </td>
                      {metrics.map((m) => {
                        const val = session.finalValues[m.id] || "unknown";
                        const badgeStyle = getBadgeStyle(m.id, val);
                        return (
                          <td key={m.id} style={{ padding: "1rem", borderBottom: "1px solid #2b2f36" }}>
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
                        <td colSpan={3 + metrics.length} style={{ padding: 0, borderBottom: "1px solid #2b2f36" }}>
                          <div style={{ background: "#121418", borderTop: "1px dashed #2b2f36", padding: "1rem" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                {session.messages
                                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                  .map((m, i) => (
                                    <tr key={i}>
                                      <td style={{ padding: "0.5rem 0", color: "#9aa0a6", fontSize: "0.85rem", whiteSpace: "nowrap", width: 140 }}>
                                        {new Date(m.timestamp).toLocaleString("en-US", {
                                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata",
                                        })}
                                      </td>
                                      <td style={{ padding: "0.5rem 0", color: "#e6e8eb", fontSize: "0.9rem" }}>
                                        {m.user_message || <em style={{ color: "#64748b" }}>No message</em>}
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
