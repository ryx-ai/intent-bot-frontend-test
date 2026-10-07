"use client";

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
}

function roundPct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

export function TrafficMatrixTab({ traffic, retention, usage }: TrafficMatrixTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* ── 3 Top KPI Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.25rem",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Total Website Sessions
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {traffic?.total_sessions || 0}
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {traffic?.total_messages || 0} total messages ({traffic?.avg_messages_per_session || 0} msgs/session)
          </span>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Retention &amp; Engagement Score
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "#10B981" }}>
              {retention?.retention_score || 0}%
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {retention?.engaged_ratio_percent || 0}% engaged sessions · {retention?.bounce_rate_percent || 0}% bounce rate
          </span>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem 1.5rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Chatbot Lead Conversion Rate
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.5rem 0" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent, #8A64E9)" }}>
              {usage?.lead_conversion_rate_percent || 0}%
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {usage?.total_leads_captured || 0} leads captured · Avg score: {usage?.avg_lead_score || 0}/100
          </span>
        </div>
      </div>

      {/* ── User Engagement Depth Card ── */}
      <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.75rem" }}>
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
          User Engagement Depth &amp; Retention Index
        </h3>
        <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Measures how deeply visitors interact with your website chatbot across multi-message sessions vs single-turn drop-offs.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Engaged Session Rate (&gt;=3 Msgs)
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#10B981", margin: "0.4rem 0" }}>
              {retention?.engaged_ratio_percent || 0}%
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {retention?.engaged_sessions || 0} out of {traffic?.total_sessions || 0} sessions
            </div>
          </div>

          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Bounce Rate (Single-Msg Sessions)
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#F59E0B", margin: "0.4rem 0" }}>
              {retention?.bounce_rate_percent || 0}%
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {retention?.single_msg_sessions || 0} single-turn drop-offs
            </div>
          </div>

          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Overall Retention Score
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent, #8A64E9)", margin: "0.4rem 0" }}>
              {retention?.retention_score || 0}<span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>/100</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Calculated from engagement depth ratio
            </div>
          </div>
        </div>

        {/* Visual Retention Bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            <span>Engagement Distribution</span>
            <span>{retention?.engaged_ratio_percent || 0}% Engaged</span>
          </div>
          <div style={{ width: "100%", height: 12, backgroundColor: "#F59E0B", borderRadius: 6, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${retention?.engaged_ratio_percent || 0}%`, height: "100%", backgroundColor: "#10B981" }} />
          </div>
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
              Engaged Sessions (3+ msgs)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
              Short / Bounce Sessions
            </span>
          </div>
        </div>
      </div>

      {/* ── Conversion Funnel Breakdown ── */}
      <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.75rem" }}>
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
          Chatbot Usage &amp; Conversion Funnel
        </h3>
        <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Track visitor conversion from casual browsing into captured leads and booked demo meetings.
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontWeight: 600 }}>Conversion Outcome Stage</th>
                <th style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontWeight: 600 }}>Sessions</th>
                <th style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontWeight: 600 }}>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Just Chat (Exploratory)", count: usage?.conversion_funnel.just_chat || 0, color: "var(--text-secondary)" },
                { label: "Lead Captured (Contact Submitted)", count: usage?.conversion_funnel.lead_captured || 0, color: "#10B981" },
                { label: "Booked Demo (Meeting Scheduled)", count: usage?.conversion_funnel.booked_demo || 0, color: "var(--accent, #8A64E9)" },
              ].map((row) => {
                const pct = usage?.total_conversations ? roundPct(row.count, usage.total_conversations) : 0;
                return (
                  <tr key={row.label} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: row.color }}>{row.label}</td>
                    <td style={{ padding: "0.85rem 1rem", color: "var(--text-primary)" }}>{row.count}</td>
                    <td style={{ padding: "0.85rem 1rem", color: "var(--text-primary)" }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
