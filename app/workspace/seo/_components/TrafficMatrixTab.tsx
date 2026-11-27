"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

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

function pct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

// Calm, consistent palette: colour only where it carries meaning.
const ACCENT = "var(--text-primary)";
const ACCENT_SOFT = "color-mix(in srgb, var(--text-primary) 35%, var(--bg-card))";
const NEUTRAL = "#cbd5e1";
const GOOD = "#10b981";

const card: CSSProperties = {
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 20px rgba(15, 23, 42, 0.035)",
};

const numStyle: CSSProperties = { fontVariantNumeric: "tabular-nums" };

function Icon({ path }: { path: ReactNode }) {
  return (
    <span
      aria-hidden
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        color: "var(--text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    </span>
  );
}

function Meter({ value, color, height = 4 }: { value: number; color: string; height?: number }) {
  return (
    <div style={{ height, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: "100%",
          borderRadius: 999,
          background: color,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  meter,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  icon: ReactNode;
  meter?: { value: number; color: string };
}) {
  return (
    <div style={{ ...card, padding: "1.35rem 1.5rem 1.4rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-secondary)" }}>{label}</span>
        <Icon path={icon} />
      </div>
      <div
        style={{
          ...numStyle,
          fontSize: "2.25rem",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
      {meter && <Meter value={meter.value} color={meter.color} />}
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.45 }}>{sub}</div>
    </div>
  );
}

function PanelHeader({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div style={{ marginBottom: "1.35rem" }}>
      <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>{title}</h3>
      <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>{sub}</p>
    </div>
  );
}

function LegendRow({ color, label, count, share }: { color: string; label: string; count: number; share: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        alignItems: "center",
        gap: "0.65rem",
        padding: "0.7rem 0",
        borderTop: "1px solid var(--border)",
        fontSize: "0.84rem",
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 3, background: color }} />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ ...numStyle, color: "var(--text-muted)", fontSize: "0.78rem" }}>
        {count} {count === 1 ? "chat" : "chats"}
      </span>
      <span style={{ ...numStyle, color: "var(--text-primary)", fontWeight: 600, minWidth: "2.6rem", textAlign: "right" }}>{share}%</span>
    </div>
  );
}

function SkeletonBlock({ h, w = "100%" }: { h: number; w?: string }) {
  return <div className="ryx-skeleton" style={{ height: h, width: w, borderRadius: 8 }} />;
}

export function TrafficMatrixTab({ traffic, retention, usage, loading = false }: TrafficMatrixTabProps) {
  const skeletonCss = `
    .ryx-skeleton { background: linear-gradient(90deg, var(--border) 0%, var(--bg-surface) 50%, var(--border) 100%); background-size: 200% 100%; animation: ryxShimmer 1.4s ease-in-out infinite; }
    @keyframes ryxShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  `;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }} aria-busy="true" aria-label="Loading chat activity">
        <style>{skeletonCss}</style>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...card, padding: "1.4rem 1.5rem", display: "grid", gap: "0.9rem" }}>
              <SkeletonBlock h={12} w="45%" />
              <SkeletonBlock h={30} w="35%" />
              <SkeletonBlock h={10} w="70%" />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ ...card, padding: "1.5rem", display: "grid", gap: "0.9rem" }}>
              <SkeletonBlock h={14} w="40%" />
              <SkeletonBlock h={8} />
              <SkeletonBlock h={10} w="80%" />
              <SkeletonBlock h={10} w="65%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalChats = traffic?.total_sessions || 0;
  const totalConversations = usage?.total_conversations || totalChats;

  // Chat length: 3+ messages, exactly 2, and only 1. The middle group is what
  // is left over, so the three always add up to every chat.
  const kept = retention?.engaged_sessions || 0;
  const leftAfterOne = retention?.single_msg_sessions || 0;
  const short = Math.max(0, totalChats - kept - leftAfterOne);
  const keptPct = pct(kept, totalChats);
  const shortPct = pct(short, totalChats);
  const leftPct = Math.max(0, totalChats ? 100 - keptPct - shortPct : 0);

  const justChat = usage?.conversion_funnel?.just_chat || 0;
  const leads = usage?.conversion_funnel?.lead_captured || 0;
  const booked = usage?.conversion_funnel?.booked_demo || 0;
  const leadRate = usage?.lead_conversion_rate_percent || 0;
  const engagement = retention?.retention_score || 0;

  const segments = [
    { key: "kept", value: kept, color: ACCENT },
    { key: "short", value: short, color: ACCENT_SOFT },
    { key: "left", value: leftAfterOne, color: NEUTRAL },
  ].filter((s) => s.value > 0);

  const outcomes = [
    { label: "Just chatted", count: justChat, color: "#94a3b8" },
    { label: "Left contact details", count: leads, color: GOOD },
    { label: "Booked a demo", count: booked, color: ACCENT },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ── Top stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
        <StatCard
          label="Chats on your website"
          value={totalChats}
          sub={
            <>
              <span style={numStyle}>{traffic?.total_messages || 0}</span> messages · about{" "}
              <span style={numStyle}>{traffic?.avg_messages_per_session ? Math.round(traffic.avg_messages_per_session) : 0}</span> per chat
            </>
          }
          icon={<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />}
        />
        <StatCard
          label="Kept chatting"
          value={<>{keptPct}<span style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--text-muted)", marginLeft: 2 }}>%</span></>}
          meter={{ value: keptPct, color: ACCENT }}
          sub="Sent 3 or more messages"
          icon={<path d="M3 17l5-5 4 4 8-8M15 8h5v5" />}
        />
        <StatCard
          label="Became leads"
          value={<>{leadRate}<span style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--text-muted)", marginLeft: 2 }}>%</span></>}
          meter={{ value: leadRate, color: GOOD }}
          sub={
            <>
              <span style={numStyle}>{usage?.total_leads_captured || 0}</span> leads · average lead score{" "}
              <span style={numStyle}>{usage?.avg_lead_score || 0}</span>/100
            </>
          }
          icon={
            <>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </>
          }
        />
      </div>

      {/* ── Detail panels ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
        {/* How long people chat */}
        <div style={{ ...card, padding: "1.5rem 1.6rem", display: "flex", flexDirection: "column" }}>
          <PanelHeader title="How long people chat" sub="Do visitors keep talking, or leave after one message?" />

          <div style={{ display: "flex", gap: 4, height: 10, marginBottom: "1.1rem" }} aria-hidden>
            {segments.length === 0 ? (
              <div style={{ flex: 1, borderRadius: 999, background: "var(--border)" }} />
            ) : (
              segments.map((s) => (
                <div
                  key={s.key}
                  style={{ flexGrow: s.value, flexBasis: 0, minWidth: 6, borderRadius: 999, background: s.color, transition: "flex-grow 0.6s ease" }}
                />
              ))
            )}
          </div>

          <div style={{ flex: 1 }}>
            <LegendRow color={ACCENT} label="Kept chatting (3+ messages)" count={kept} share={keptPct} />
            <LegendRow color={ACCENT_SOFT} label="Short chat (2 messages)" count={short} share={shortPct} />
            <LegendRow color={NEUTRAL} label="Left after one message" count={leftAfterOne} share={leftPct} />
          </div>

          <div
            style={{
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Engagement score</span>
            <div style={{ flex: 1 }}>
              <Meter value={engagement} color={ACCENT} />
            </div>
            <span style={{ ...numStyle, fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
              {engagement}
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>/100</span>
            </span>
          </div>
        </div>

        {/* What chats led to */}
        <div style={{ ...card, padding: "1.5rem 1.6rem", display: "flex", flexDirection: "column" }}>
          <PanelHeader title="What chats led to" sub={<>Out of <span style={numStyle}>{totalConversations}</span> chats</>} />

          <div style={{ display: "grid", gap: "1.1rem", flex: 1, alignContent: "start" }}>
            {outcomes.map((o) => {
              const share = pct(o.count, totalConversations);
              return (
                <div key={o.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, fontSize: "0.84rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{o.label}</span>
                    <span style={numStyle}>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginRight: 8 }}>
                        {o.count} {o.count === 1 ? "chat" : "chats"}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{share}%</span>
                    </span>
                  </div>
                  <Meter value={share} color={o.color} height={6} />
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <Link
              href="/workspace/dashboard"
              className="ryx-see-convos"
              style={{
                fontSize: "0.84rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              See the conversations
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
      <style>{`.ryx-see-convos:hover { color: var(--text-primary) !important; } .ryx-see-convos svg { transition: transform 0.15s ease; } .ryx-see-convos:hover svg { transform: translateX(2px); }`}</style>
    </div>
  );
}
