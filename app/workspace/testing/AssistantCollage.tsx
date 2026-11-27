"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MATCH_WEBSITE_COLOR } from "./ChatColourPicker";

/** Which setting a tile opens in the side panel. */
export type SettingKey = "role" | "colour" | "support" | "products" | "rules" | "booking" | "starters";

type Role = { key: string; label: string; desc: string };
type Rule = { id: number; instruction_text: string; is_active: boolean };

type StoreSummary = {
  store: { platform: string | null; status: string; product_count: number; last_synced_at: string | null } | null;
  products: { title: string; image_url: string | null }[];
  total_products: number;
};

type Performance = {
  traffic?: { total_sessions: number };
  retention?: { engaged_ratio_percent: number };
  chatbot_usage?: { total_leads_captured: number };
};

const card: CSSProperties = {
  position: "relative",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 18,
  boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.035)",
  padding: "1.2rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  textAlign: "left",
  fontFamily: "inherit",
  color: "var(--text-primary)",
};

const tag: CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function platformName(p: string | null): string {
  if (p === "shopify") return "Shopify";
  if (p === "woocommerce") return "WooCommerce";
  return "your website";
}

/** A tile that opens one setting. The whole tile is the button. */
function Tile({
  label,
  action,
  onOpen,
  style,
  dark,
  children,
}: {
  label: string;
  action: string;
  onOpen: () => void;
  style?: CSSProperties;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="ryx-tile"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        ...card,
        cursor: "pointer",
        ...(dark ? { background: "var(--ink)", borderColor: "var(--ink)", color: "#fff" } : null),
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ ...tag, color: dark ? "#94a3b8" : tag.color }}>{label}</span>
        <span className="ryx-tile-action" style={{ fontSize: "0.74rem", color: dark ? "#94a3b8" : "var(--text-muted)" }}>
          {action} ›
        </span>
      </div>
      {children}
    </div>
  );
}

export default function AssistantCollage({
  roles,
  role,
  onRoleChange,
  themeColor,
  supportContact,
  calendarLink,
  rules,
  maxRules,
  isSuperAdmin,
  onOpen,
  locked,
  siteColor,
  starterQuestions = [],
}: {
  roles: Role[];
  role: string;
  onRoleChange: (key: string) => void;
  themeColor: string;
  supportContact: string;
  calendarLink: string;
  rules: Rule[];
  maxRules: number;
  isSuperAdmin: boolean;
  onOpen: (key: SettingKey) => void;
  /** Settings the customer's plan does not include. */
  locked?: { colour?: boolean; booking?: boolean };
  /** Colour the chat found on the owner's website ("Match my website"). */
  siteColor?: string | null;
  /** First questions the owner approved (empty = general defaults). */
  starterQuestions?: string[];
}) {
  const isShop = role === "shop" || role === "all";
  const router = useRouter();
  const toPlans = () => router.push("/workspace/billing");
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Performance>("/api/analytics/app-performance")
      .then((r) => alive && setPerf(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isShop) return;
    let alive = true;
    api
      .get<StoreSummary>("/api/shop/store")
      .then((r) => alive && setStore(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isShop]);

  const current = roles.find((r) => r.key === role) || roles[0];
  const matchSite = (themeColor || "").toUpperCase() === MATCH_WEBSITE_COLOR.toUpperCase();
  const showBooking = role !== "shop" || isSuperAdmin;
  const bottomCount = (isShop ? 1 : 0) + (showBooking ? 1 : 0);
  const chats = perf?.traffic?.total_sessions ?? 0;
  const kept = perf?.retention?.engaged_ratio_percent ?? 0;
  const leads = perf?.chatbot_usage?.total_leads_captured ?? 0;
  const productCount = store?.store?.product_count ?? store?.total_products ?? 0;

  return (
    <div className="ryx-collage">
      {/* What it does: changed right here */}
      <div style={{ ...card, gridColumn: "span 4", gridRow: "span 2", padding: "1.35rem 1.4rem" }} className="ryx-span-role">
        <span style={tag}>What it does</span>
        <div style={{ fontSize: "1.45rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 6 }}>{current.label}</div>
        <p style={{ margin: "4px 0 1rem", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: 520 }}>
          {current.desc}
        </p>
        <div className="ryx-role-grid">
          {roles.map((r) => {
            const active = r.key === role;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => onRoleChange(r.key)}
                aria-pressed={active}
                style={{
                  textAlign: "left",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 10,
                  background: "var(--bg-card)",
                  border: active ? "1.5px solid var(--text-primary)" : "1px solid var(--border)",
                  boxShadow: active ? "0 1px 3px rgba(15,23,42,.10)" : "none",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: active ? 600 : 500,
                  fontSize: "0.84rem",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* This week */}
      <Link
        href="/workspace/dashboard"
        className="ryx-tile ryx-span-week"
        style={{ ...card, gridColumn: "span 2", gridRow: "span 2", background: "var(--ink)", borderColor: "var(--ink)", color: "#fff", textDecoration: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ ...tag, color: "#94a3b8" }}>Results</span>
          <span className="ryx-tile-action" style={{ fontSize: "0.74rem", color: "#94a3b8" }}>See chats ›</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
          <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden>
            <circle cx="29" cy="29" r="23" fill="none" stroke="#1e293b" strokeWidth="6" />
            <circle
              cx="29"
              cy="29"
              r="23"
              fill="none"
              stroke="#fff"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(2 * Math.PI * 23 * Math.min(100, kept)) / 100} ${2 * Math.PI * 23}`}
              transform="rotate(-90 29 29)"
            />
          </svg>
          <div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{chats}</div>
            <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: 4 }}>chats</div>
          </div>
        </div>
        <div style={{ marginTop: "auto", paddingTop: 14, display: "grid", gap: 7, fontSize: "0.82rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Kept chatting</span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{kept}%</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Leads</span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{leads}</b>
          </div>
        </div>
      </Link>

      {/* Products (shops) */}
      {isShop && (
        <Tile label="Products" action="Manage" onOpen={() => onOpen("products")} style={{ gridColumn: "span 3" }}>
          {store?.store ? (
            <>
              <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.03em", marginTop: 8, lineHeight: 1 }}>{productCount}</div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  From {platformName(store.store.platform)}
                  {store.store.last_synced_at ? ` · synced ${timeAgo(store.store.last_synced_at)}` : ""}
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  {store.products.slice(0, 3).map((p, i) => (
                    <span
                      key={i}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: p.image_url ? `center/cover no-repeat url(${JSON.stringify(p.image_url)})` : "var(--bg-surface)",
                      }}
                    />
                  ))}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "auto" }}>Connect your store</div>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>Import products from Shopify or WooCommerce</span>
            </>
          )}
        </Tile>
      )}

      {/* Chat colour */}
      {locked?.colour ? (
      <Tile label="Chat colour" action="Upgrade" onOpen={toPlans} style={{ gridColumn: isShop ? "span 3" : "span 6", background: "transparent", border: "1.5px dashed var(--border)", boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-secondary)" }}>Standard colour</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.72rem", fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Not in your plan
          </span>
        </div>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "auto", paddingTop: 12 }}>
          Upgrade to use your own brand colour in the chat.
        </span>
      </Tile>
      ) : (
      <Tile label="Chat colour" action="Change" onOpen={() => onOpen("colour")} style={{ gridColumn: isShop ? "span 3" : "span 6" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: 8 }}>{matchSite ? "Matches your website" : "Your brand colour"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto", paddingTop: 12 }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: matchSite ? siteColor || "conic-gradient(#0f172a 0 25%,#2563eb 0 50%,#059669 0 75%,#e11d48 0)" : themeColor,
              boxShadow: "0 0 0 2px var(--bg-card), 0 0 0 3.5px var(--text-primary)",
            }}
          />
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {matchSite
              ? siteColor
                ? `Your website's colour · ${siteColor.toUpperCase()}`
                : "Uses your website's colour and fonts"
              : themeColor.toUpperCase()}
          </span>
        </div>
      </Tile>
      )}

      {/* Rules */}
      <Tile
        label={`Rules · ${rules.length} of ${maxRules}`}
        action={rules.length ? "Edit" : "Add"}
        onOpen={() => onOpen("rules")}
        style={{ gridColumn: `span ${6 - 2 * bottomCount}` }}
      >
        {rules.length === 0 ? (
          <>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "auto" }}>No rules yet</div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>e.g. &ldquo;Keep replies short&rdquo;</span>
          </>
        ) : (
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {rules.slice(0, 3).map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.82rem",
                  color: r.is_active ? "var(--text-primary)" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  padding: "0.45rem 0.6rem",
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: r.is_active ? "#10b981" : "#cbd5e1" }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.instruction_text}</span>
              </div>
            ))}
            {rules.length > 3 && <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>+{rules.length - 3} more</span>}
          </div>
        )}
      </Tile>

      {/* Support contact (shops) */}
      {isShop && (
        <Tile label="Support contact" action={supportContact ? "Edit" : "Add"} onOpen={() => onOpen("support")} style={{ gridColumn: "span 2" }}>
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              marginTop: "auto",
              color: supportContact ? "var(--text-primary)" : "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {supportContact || "Not set"}
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>Shared when someone needs a person</span>
        </Tile>
      )}

      {/* Booking link (and admin options) */}
      {showBooking && role !== "shop" && locked?.booking && (
        <Tile
          label="Booking link"
          action="Upgrade"
          onOpen={toPlans}
          style={{ gridColumn: "span 2", background: "transparent", border: "1.5px dashed var(--border)", boxShadow: "none" }}
        >
          <div style={{ marginTop: "auto" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.72rem", fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Not in your plan
          </span></div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 8 }}>
            Upgrade to let visitors book a call from the chat
          </span>
        </Tile>
      )}
      {showBooking && !(role !== "shop" && locked?.booking) && (
        <Tile
          label={role === "shop" ? "Advanced" : "Booking link"}
          action={role === "shop" ? "Open" : calendarLink ? "Edit" : "Add"}
          onOpen={() => onOpen("booking")}
          style={{
            gridColumn: "span 2",
            ...(role !== "shop" && !calendarLink ? { background: "transparent", border: "1.5px dashed var(--border)", boxShadow: "none" } : null),
          }}
        >
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              marginTop: "auto",
              color: role === "shop" || calendarLink ? "var(--text-primary)" : "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {role === "shop" ? "Admin settings" : calendarLink ? calendarLink.replace(/^https?:\/\//, "") : "Not set"}
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
            {role === "shop" ? "Prompt and platform options" : "Shown when someone wants to book a call"}
          </span>
        </Tile>
      )}

      {/* First questions shown when the chat opens */}
      <Tile
        label="Suggested questions"
        action={starterQuestions.length ? "Edit" : "Set up"}
        onOpen={() => onOpen("starters")}
        style={{ gridColumn: "span 6", gridRow: "auto" }}
      >
        {starterQuestions.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {starterQuestions.map((q) => (
              <span
                key={q}
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  padding: "0.4rem 0.8rem",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                }}
              >
                {q}
              </span>
            ))}
          </div>
        ) : (
          <>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "auto" }}>Using the default questions</div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
              Choose your own: we&apos;ll suggest some from your website.
            </span>
          </>
        )}
      </Tile>

      <style>{`
        .ryx-collage { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: minmax(112px, auto); gap: 14px; }
        .ryx-role-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: auto; }
        .ryx-tile { transition: transform .15s ease, box-shadow .15s ease; }
        .ryx-tile:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(15,23,42,.05), 0 14px 32px rgba(15,23,42,.07) !important; }
        .ryx-tile:hover .ryx-tile-action { color: var(--text-primary) !important; }
        .ryx-tile.ryx-span-week:hover .ryx-tile-action { color: #fff !important; }
        .ryx-tile:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
        @media (max-width: 1100px) {
          .ryx-collage { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ryx-collage > * { grid-column: span 2 !important; grid-row: auto !important; }
        }
        @media (max-width: 560px) { .ryx-role-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </div>
  );
}
