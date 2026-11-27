"use client";

import { useState, useEffect } from "react";
import LiveSiteStatus from "../_components/SiteStatusChip";
import { api } from "@/lib/api";
import ShopifyGuide from "./ShopifyGuide";
import WebsiteConfirmBanner from "../_components/WebsiteConfirmBanner";

type Platform = { key: string; name: string; steps: React.ReactNode[] };

const code = (t: string) => (
  <span
    style={{
      display: "inline-block",
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "0 7px",
      fontSize: "0.78rem",
      fontWeight: 600,
      color: "var(--text-primary)",
      whiteSpace: "nowrap",
    }}
  >
    {t}
  </span>
);
const path = (...items: string[]) => (
  <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
    {items.map((t, i) => (
      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        {code(t)}
        {i < items.length - 1 && <span style={{ color: "var(--text-muted)" }}>›</span>}
      </span>
    ))}
  </span>
);

const PLATFORMS: Platform[] = [
  { key: "shopify", name: "Shopify", steps: [] },
  {
    key: "wordpress",
    name: "WordPress",
    steps: [
      <>Install the free plugin {code("WPCode")} from {path("Plugins", "Add New")}.</>,
      <>Open {path("Code Snippets", "Header & Footer")}.</>,
      <>Paste your code into the {code("Footer")} box and click {code("Save Changes")}.</>,
    ],
  },
  {
    key: "wix",
    name: "Wix",
    steps: [
      <>In your dashboard open {path("Settings", "Custom Code")} and click {code("+ Add Custom Code")}.</>,
      <>Paste your code, choose {code("All pages")} and place it in {code("Body - end")}.</>,
      <>Click {code("Apply")}. It shows on your live site right away.</>,
    ],
  },
  {
    key: "webflow",
    name: "Webflow",
    steps: [
      <>Open {path("Site settings", "Custom code")}.</>,
      <>Paste your code into {code("Footer code")} and click {code("Save")}.</>,
      <>Click {code("Publish")} so the change goes live.</>,
    ],
  },
  {
    key: "squarespace",
    name: "Squarespace",
    steps: [
      <>Open {path("Settings", "Advanced", "Code Injection")}.</>,
      <>Paste your code into the {code("Footer")} box.</>,
      <>Click {code("Save")}.</>,
    ],
  },
  {
    key: "html",
    name: "Any website",
    steps: [
      <>Open the HTML of your pages (or the shared footer file).</>,
      <>Paste your code on the line just above {code("</body>")}.</>,
      <>Save and upload the file to your website.</>,
    ],
  },
  {
    key: "react",
    name: "React / Next.js",
    steps: [
      <>Next.js: add it to {code("app/layout.tsx")} using the {code("<Script>")} component.</>,
      <>React (Vite / CRA): paste it into {code("index.html")} just above {code("</body>")}.</>,
      <>Deploy as usual. The chat loads on every page.</>,
    ],
  },
];

const INFO_PILLS = [
  { title: "Secure", desc: "Chats are encrypted", icon: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></> },
  { title: "Lightweight", desc: "One line, nothing to install", icon: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /> },
  { title: "Mobile ready", desc: "Works on every screen size", icon: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></> },
  { title: "No style clashes", desc: "Won't change your site's look", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></> },
];

// Hostnames that should never be used in a published embed snippet.
// Broader than just "localhost"/"127.0.0.1" — also catches IPv6 loopback,
// 0.0.0.0, mDNS .local addresses, and RFC1918 LAN ranges that customers
// can't reach from outside the dev's network.
function isDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    )
      return true;
    // RFC1918 / link-local IPv4
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;
    return false;
  } catch {
    return true; // unparseable origin → treat as not-shippable
  }
}

type HealthState = "checking" | "ok" | "down";

export default function DeployPage() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [health, setHealth] = useState<HealthState>("checking");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [isSubActive, setIsSubActive] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState("shopify");

  useEffect(() => {
    async function loadTenant() {
      try {
        const me = await api.get<{
          tenant?: {
            slug: string;
            name?: string;
            is_subscription_active?: boolean;
          };
        }>("/api/auth/me");
        setTenantSlug(me.tenant?.slug || "");
        // Workspaces are created as "<Name>'s Workspace"; greet with just the name.
        setTenantName((me.tenant?.name || "").replace(/['\u2019]s workspace$/i, "").trim());
        if (me.tenant && typeof me.tenant.is_subscription_active === "boolean") {
          setIsSubActive(me.tenant.is_subscription_active);
        }
      } catch (err) {
        console.error("Failed to load user info for deploy page", err);
      }
    }
    loadTenant();
  }, []);

  // Production builds set NEXT_PUBLIC_API_URL. The localhost fallback only
  // kicks in during dev — the dev banner above flags that case to the user.
  const backendOrigin =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const isLocalhost = isDevOrigin(backendOrigin);
  const snippet = tenantSlug
    ? `<script src="${backendOrigin}/static/embed.js" data-api="${backendOrigin}" data-tenant="${tenantSlug}"><\/script>`
    : `<script src="${backendOrigin}/static/embed.js" data-api="${backendOrigin}"><\/script>`;

  // Real health check — confirms the backend the snippet points at is
  // actually reachable. Otherwise the green "Live & Running" pill would
  // lie even when the server is down.
  useEffect(() => {
    let cancelled = false;
    fetch(`${backendOrigin}/health`, { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        setHealth(res.ok ? "ok" : "down");
      })
      .catch(() => {
        if (!cancelled) setHealth("down");
      });
    return () => {
      cancelled = true;
    };
  }, [backendOrigin]);

  async function copySnippet() {
    setCopyError("");
    // navigator.clipboard is undefined in non-secure contexts and old
    // browsers — fall back to a hidden textarea + execCommand so the
    // button still works for users without HTTPS.
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
        const ta = document.createElement("textarea");
        ta.value = snippet;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand returned false");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError("Copy failed — select the text manually");
      setTimeout(() => setCopyError(""), 4000);
    }
  }

  const statusColor = health === "ok" ? "#10b981" : health === "down" ? "#ef4444" : "#f59e0b";
  const statusText = health === "ok" ? "Ferry is online" : health === "down" ? "Can't reach the server" : "Checking…";
  const current = PLATFORMS.find((p) => p.key === platform) || PLATFORMS[0];
  const card: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: "1.15rem 1.35rem",
    boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.035)",
  };

  const StepHead = ({ n, title, sub }: { n: number; title: string; sub: string }) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: "0.85rem" }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink)",
          color: "#fff",
          fontSize: "0.8rem",
          fontWeight: 700,
        }}
      >
        {n}
      </span>
      <div>
        <div style={{ fontSize: "1rem", fontWeight: 650, color: "var(--text-primary)" }}>{title}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div style={{ width: "100%", maxWidth: 1360, margin: "0 auto", padding: "2rem", boxSizing: "border-box" }}>
      <style>{`
        .dp-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
        .dp-preview { position: sticky; top: 24px; display: flex; flex-direction: column; }
        .dp-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1rem; }
        .dp-tab { padding: .42rem .85rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-secondary); font: inherit; font-size: .82rem; font-weight: 500; cursor: pointer; transition: all .15s; }
        .dp-tab:hover { border-color: #cbd5e1; color: var(--text-primary); }
        .dp-tab[aria-selected="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
        .dp-copy { display: inline-flex; align-items: center; gap: 6px; padding: .45rem .85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: #fff; color: #0f172a; font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; transition: transform .15s; }
        .dp-copy:hover { transform: translateY(-1px); }
        .dp-info { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
        @media (max-width: 1100px) { .dp-grid { grid-template-columns: minmax(0, 1fr); } .dp-preview { position: static; } }
        @media (max-width: 560px) { .dp-info { grid-template-columns: 1fr; } }
      `}</style>

      <WebsiteConfirmBanner />

      {isSubActive === false && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: 14,
            padding: "0.9rem 1.1rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            fontSize: "0.88rem",
            color: "var(--text-primary)",
          }}
        >
          <span>
            <strong>The chat is paused.</strong> Your trial has ended, so the chat won&apos;t answer on your website until you choose a plan.
          </span>
          <a href="/workspace/billing" style={{ background: "var(--ink)", color: "#fff", padding: "0.5rem 1rem", borderRadius: 10, fontWeight: 600, fontSize: "0.84rem", textDecoration: "none", whiteSpace: "nowrap" }}>
            Choose a plan
          </a>
        </div>
      )}

      {isLocalhost && (
        <div
          style={{
            background: "rgba(245, 158, 11, 0.07)",
            border: "1px solid rgba(245, 158, 11, 0.28)",
            borderRadius: 12,
            padding: "0.65rem 0.95rem",
            marginBottom: "1.25rem",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
          }}
        >
          <strong style={{ color: "#b45309" }}>Test mode:</strong> this code points to your computer, so it only works while it&apos;s running. Set{" "}
          <code style={{ background: "var(--bg-surface)", padding: "1px 6px", borderRadius: 4 }}>NEXT_PUBLIC_API_URL</code> on the live site.
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "1.1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Add the chat to your website
          </h1>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            Copy one line of code and paste it into your website. It takes about a minute.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <LiveSiteStatus hideLink />
          </div>
        </div>
        <span
          title={`${health === "down" ? "Cannot reach" : "Active at"} ${backendOrigin}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0.45rem 0.9rem",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            fontSize: "0.82rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            boxShadow: "0 1px 2px rgba(15,23,42,.05)",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: `0 0 0 3px ${statusColor}26` }} />
          {statusText}
        </span>
      </div>

      <div className="dp-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
          {/* Step 1 */}
          <div style={card}>
            <StepHead n={1} title="Copy your code" sub="This one line adds the chat button to your website." />
            <div style={{ borderRadius: 14, overflow: "hidden", background: "#0b1220", border: "1px solid #0b1220" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.45rem 0.6rem 0.45rem 1rem", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                <span style={{ display: "inline-flex", gap: 6 }} aria-hidden>
                  {["#ef4444", "#f59e0b", "#10b981"].map((c) => (
                    <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />
                  ))}
                </span>
                <button type="button" className="dp-copy" onClick={copySnippet}>
                  {copied ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                      Copy code
                    </>
                  )}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "0.8rem 1.1rem 0.9rem",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: "0.78rem",
                  lineHeight: 1.65,
                  color: "#e2e8f0",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                <span style={{ color: "#f472b6" }}>&lt;script</span> <span style={{ color: "#93c5fd" }}>src</span>=<span style={{ color: "#86efac" }}>&quot;{backendOrigin}/static/embed.js&quot;</span>
                {"\n        "}<span style={{ color: "#93c5fd" }}>data-api</span>=<span style={{ color: "#86efac" }}>&quot;{backendOrigin}&quot;</span>
                {tenantSlug && (
                  <>
                    {"\n        "}<span style={{ color: "#93c5fd" }}>data-tenant</span>=<span style={{ color: "#86efac" }}>&quot;{tenantSlug}&quot;</span>
                  </>
                )}
                <span style={{ color: "#f472b6" }}>&gt;&lt;/script&gt;</span>
              </pre>
            </div>
            {copyError && <div style={{ marginTop: 8, fontSize: "0.8rem", color: "var(--error)" }}>{copyError}</div>}
          </div>

          {/* Step 2 */}
          <div style={card}>
            <StepHead n={2} title="Paste it on your website" sub="Pick where your website is built for simple steps." />
            <div className="dp-tabs" role="tablist">
              {PLATFORMS.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={platform === p.key} className="dp-tab" onClick={() => setPlatform(p.key)}>
                  {p.name}
                </button>
              ))}
            </div>
            {current.key === "shopify" ? (
              <ShopifyGuide copied={copied} onCopy={copySnippet} />
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.85rem" }}>
                {current.steps.map((st, i) => (
                  <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        flexShrink: 0,
                        marginTop: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid var(--border)",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        background: "var(--bg-card)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{st}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

        </div>

        {/* Preview */}
        <div className="dp-preview">
          <div style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 10px 4px" }}>
            What visitors see
          </div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.7rem 1rem", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
              <span style={{ display: "inline-flex", gap: 6 }} aria-hidden>
                {["#cbd5e1", "#cbd5e1", "#cbd5e1"].map((c, i) => (
                  <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
                ))}
              </span>
              <span style={{ flex: 1, height: 22, borderRadius: 7, background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 10px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                yourwebsite.com
              </span>
            </div>
            <div style={{ position: "relative", height: 300, background: "linear-gradient(180deg, var(--bg-card), var(--bg-surface))", padding: "1.6rem 1.5rem" }} aria-hidden>
              <div style={{ height: 12, width: "45%", borderRadius: 6, background: "#e2e8f0" }} />
              <div style={{ height: 26, width: "75%", borderRadius: 8, background: "#cbd5e1", marginTop: 16 }} />
              <div style={{ height: 10, width: "85%", borderRadius: 5, background: "#e2e8f0", marginTop: 14 }} />
              <div style={{ height: 10, width: "65%", borderRadius: 5, background: "#e2e8f0", marginTop: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 24 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 64, borderRadius: 12, background: "#eef2f6" }} />
                ))}
              </div>

              {/* The real chat button design: greeting bubble + white circle */}
              <div style={{ position: "absolute", right: 22, bottom: 22, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                <div
                  style={{
                    maxWidth: 230,
                    background: "#fff",
                    color: "var(--ink)",
                    fontSize: "0.8rem",
                    lineHeight: 1.45,
                    padding: "10px 14px",
                    borderRadius: "16px 16px 4px 16px",
                    boxShadow: "0 10px 30px rgba(15,23,42,.14)",
                    border: "1px solid #eef2f6",
                  }}
                >
                  👋 Hi! Have a question? I&apos;m here to help.
                </div>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--ink)",
                    boxShadow: "0 0 0 2px var(--ink), 0 10px 26px rgba(15,23,42,.22)",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <p style={{ margin: "10px 4px 0", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            On your website, the button takes your website&apos;s own colour{tenantName ? `, and the chat greets visitors as ${tenantName}` : ""}.
          </p>
          <div style={{ height: 14 }} />
          {/* Step 3 */}
          <div style={card}>
            <StepHead n={3} title="Check it's working" sub="Open your website. The chat button appears bottom-right." />
            <div className="dp-info">
              {INFO_PILLS.map((p) => (
                <div key={p.title} style={{ display: "flex", gap: 9, alignItems: "center", padding: "0.5rem 0.6rem", border: "1px solid var(--border)", borderRadius: 12 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-surface)", color: "var(--text-secondary)" }} aria-hidden>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, color: "var(--text-primary)" }}>{p.title}</span>
                    <span style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)" }}>{p.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
