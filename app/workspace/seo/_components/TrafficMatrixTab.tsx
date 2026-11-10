"use client";

import Link from "next/link";

interface TrafficData {
  total_sessions: number;
  total_messages: number;
  avg_messages_per_session: number;
}

interface RetentionData {
  engaged_sessions: number;
  single_msg_sessions: number;
  engaged_ratio_percent: number;
  bounce_rate_percent: number;
  retention_score: number;
}

interface ChatbotUsageData {
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
}

export interface TrafficMatrixTabProps {
  traffic?: TrafficData;
  retention?: RetentionData;
  usage?: ChatbotUsageData;
  loading?: boolean;
}

function roundPct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

export function TrafficMatrixTab({ traffic, retention, usage, loading = false }: TrafficMatrixTabProps) {
  if (loading) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-muted)" }}>
        <div
          style={{
            fontSize: "1.75rem",
            marginBottom: "0.75rem",
            animation: "spin 1.5s linear infinite",
            display: "inline-block",
          }}
        >
          🔄
        </div>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
          Loading chat activity metrics…
        </div>
      </div>
    );
  }

  const totalConversations = usage?.total_conversations || traffic?.total_sessions || 0;
  const justChatCount = usage?.conversion_funnel?.just_chat || 0;
  const leadCapturedCount = usage?.conversion_funnel?.lead_captured || 0;
  const bookedDemoCount = usage?.conversion_funnel?.booked_demo || 0;

  const justChatPct = roundPct(justChatCount, totalConversations);
  const leadCapturedPct = roundPct(leadCapturedCount, totalConversations);
  const bookedDemoPct = roundPct(bookedDemoCount, totalConversations);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ── Top 3 Stat Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {/* Card 1: Chats on your website */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.5rem 1.75rem",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem" }}>
            Chats on your website
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1, marginBottom: "0.5rem" }}>
            {traffic?.total_sessions || 0}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {traffic?.total_messages || 0} messages · about {traffic?.avg_messages_per_session ? Math.round(traffic.avg_messages_per_session) : 0} per chat
          </div>
        </div>

        {/* Card 2: Kept chatting */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.5rem 1.75rem",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem" }}>
            Kept chatting
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#10B981", lineHeight: 1.1, marginBottom: "0.5rem" }}>
            {retention?.engaged_ratio_percent || 0}%
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Sent 3 or more messages
          </div>
        </div>

        {/* Card 3: Became leads */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.5rem 1.75rem",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem" }}>
            Became leads
          </div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--accent, #8A64E9)", lineHeight: 1.1, marginBottom: "0.5rem" }}>
            {usage?.lead_conversion_rate_percent || 0}%
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {usage?.total_leads_captured || 0} leads · average lead score {usage?.avg_lead_score || 0} / 100
          </div>
        </div>
      </div>

      {/* ── Lower 2 Cards: How long people chat & What chats led to ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {/* Card: How long people chat */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem 1.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              How long people chat
            </h3>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Do visitors keep talking, or leave after one message?
            </p>

            {/* Two-tone bar */}
            <div
              style={{
                width: "100%",
                height: 12,
                borderRadius: 6,
                backgroundColor: "#F59E0B",
                overflow: "hidden",
                display: "flex",
                marginBottom: "0.85rem",
              }}
            >
              <div
                style={{
                  width: `${retention?.engaged_ratio_percent || 0}%`,
                  height: "100%",
                  backgroundColor: "#10B981",
                  transition: "width 0.5s ease",
                }}
              />
            </div>

            {/* Legend / Breakdown */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#10B981", display: "inline-block" }} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  Kept chatting
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  {retention?.engaged_sessions || 0} chats · {retention?.engaged_ratio_percent || 0}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#F59E0B", display: "inline-block" }} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  Left after one message
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  {retention?.single_msg_sessions || 0} chats · {retention?.bounce_rate_percent || 0}%
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "1.5rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border)",
              fontSize: "0.82rem",
              color: "var(--text-muted)",
            }}
          >
            Engagement score: <strong style={{ color: "var(--text-primary)" }}>{retention?.retention_score || 0} / 100</strong>
          </div>
        </div>

        {/* Card: What chats led to */}
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.5rem 1.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              What chats led to
            </h3>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Out of {totalConversations} chats
            </p>

            {/* Outcome Bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Just chatted */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Just chatted</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                    {justChatCount} · {justChatPct}%
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, backgroundColor: "var(--bg-surface)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ width: `${justChatPct}%`, height: "100%", backgroundColor: "var(--text-muted)", opacity: 0.6 }} />
                </div>
              </div>

              {/* Left contact details */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Left contact details</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                    {leadCapturedCount} · {leadCapturedPct}%
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, backgroundColor: "var(--bg-surface)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ width: `${leadCapturedPct}%`, height: "100%", backgroundColor: "#10B981" }} />
                </div>
              </div>

              {/* Booked a demo */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Booked a demo</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                    {bookedDemoCount} · {bookedDemoPct}%
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, backgroundColor: "var(--bg-surface)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ width: `${bookedDemoPct}%`, height: "100%", backgroundColor: "var(--accent, #8A64E9)" }} />
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "1.5rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <Link
              href="/workspace/dashboard"
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--accent, #8A64E9)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              See the conversations ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
