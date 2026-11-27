"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type StoreInfo = {
  store_url: string;
  platform: string | null;
  currency: string | null;
  status: "pending" | "syncing" | "ready" | "error";
  product_count: number;
  last_error: string | null;
  last_synced_at: string | null;
  has_password?: boolean;
};

type ProductPreview = {
  title: string;
  price: string | null;
  currency: string | null;
  available: boolean;
  image_url: string | null;
  url: string | null;
};

type StoreResponse = {
  store: StoreInfo | null;
  products: ProductPreview[];
  total_products: number;
};

const C = {
  bgCard: "var(--bg-card)",
  bgSurface: "var(--bg-surface)",
  border: "var(--border)",
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  error: "var(--error)",
  success: "var(--success)",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function platformName(p: string | null): string {
  if (p === "shopify") return "Shopify";
  if (p === "woocommerce") return "WooCommerce";
  return "";
}

const button = (primary: boolean): React.CSSProperties => ({
  cursor: "pointer",
  borderRadius: 8,
  padding: "0.6rem 1rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  border: primary ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
  background: primary ? C.accent : C.bgSurface,
  color: primary ? "white" : C.textPrimary,
});

/** The store's own icon (favicon), or a shopping-bag mark when there is none. */
function StoreIcon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false);
  if (!host || failed)
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 8h14l-1 12H6L5 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://${host}/favicon.ico`}
      alt=""
      width={24}
      height={24}
      style={{ borderRadius: 6, background: "#fff" }}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        if ((e.currentTarget as HTMLImageElement).naturalWidth < 2) setFailed(true);
      }}
    />
  );
}

/** Shop mode: connect a Shopify / WooCommerce store and import its products. */
export default function ShopProductsCard({ wide = false }: { wide?: boolean } = {}) {
  const [data, setData] = useState<StoreResponse | null>(null);
  const [url, setUrl] = useState("");
  // The website the chat snippet runs on: the shop address, no typing needed.
  const [siteOrigin, setSiteOrigin] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Every product, loaded when the owner asks to see them all
  const [allProducts, setAllProducts] = useState<ProductPreview[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<StoreResponse>("/api/shop/store");
      setData(res);
      if (res.store) setUrl((u) => u || res.store!.store_url);
      return res;
    } catch {
      return null;
    }
  }, []);

  // Poll while an import is running.
  const watch = useCallback(async () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    async function tick() {
      const res = await load();
      const status = res?.store?.status;
      if (status === "pending" || status === "syncing") {
        pollRef.current = setTimeout(tick, 3000);
      }
    }
    await tick();
  }, [load]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ origin?: string | null }>("/api/config/widget-status")
      .then((r) => {
        if (alive && r.origin) setSiteOrigin(r.origin);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Initial load (and resume polling if an import is already running).
    const first = setTimeout(watch, 0);
    return () => {
      clearTimeout(first);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [watch]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setAllProducts(null);
      await watch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const store = data?.store ?? null;
  const importing = store?.status === "pending" || store?.status === "syncing";
  const urlChanged = !store || url.trim() !== store.store_url;
  const passwordTyped = password.trim() !== "";
  const lockedError = store?.status === "error" && /password/i.test(store.last_error || "");
  const passwordOpen = showPassword || lockedError || !!store?.has_password;

  function connect(body: { url: string; password?: string }) {
    return run(async () => {
      await api.post("/api/shop/store", body);
      setPassword("");
      setEditingAddress(false);
    });
  }

  const host = (store?.store_url || url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const statusDot = importing ? "#f59e0b" : store?.status === "error" ? "#ef4444" : "#10b981";
  const field: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    backgroundColor: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "0.7rem 0.9rem",
    fontSize: "0.86rem",
    color: C.textPrimary,
    outline: "none",
    fontFamily: "inherit",
    boxShadow: "0 1px 2px rgba(15,23,42,.04)",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "0.68rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.textMuted,
    marginBottom: 8,
  };
  const linkBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    color: C.textMuted,
    fontSize: "0.78rem",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <section
      className={wide ? "ryx-shop-wide" : undefined}
      style={wide
        ? { display: "grid", gridTemplateColumns: "minmax(300px, 360px) minmax(0, 1fr)", gap: "1.25rem", alignItems: "stretch" }
        : { display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* ── Store summary ── */}
      <div
        style={{
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.035)",
          padding: "1.15rem 1.25rem",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {store ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              aria-hidden
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                flexShrink: 0,
                background: "var(--ink-grad)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 4px 10px rgba(15,23,42,.18)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "1rem",
              }}
            >
              <StoreIcon host={host} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {host}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, fontSize: "0.78rem", color: C.textSecondary }}>
                <span
                  aria-hidden
                  style={{ width: 7, height: 7, borderRadius: "50%", background: statusDot, boxShadow: `0 0 0 3px ${statusDot}26` }}
                />
                {importing
                  ? "Importing products… this can take a minute"
                  : store.status === "error"
                    ? "Couldn't update"
                    : `${platformName(store.platform) || "Store"} · updated ${timeAgo(store.last_synced_at) || "recently"}`}
              </div>
            </div>
            {!importing && store.status !== "error" && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: C.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                  {store.product_count}
                </div>
                <div style={{ fontSize: "0.72rem", color: C.textMuted, marginTop: 3 }}>products</div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: C.textPrimary }}>Connect your store</div>
            <p style={{ color: C.textSecondary, fontSize: "0.8rem", margin: "4px 0 0", lineHeight: 1.5 }}>
              We&apos;ll import your products (photo, price, stock and link) so the assistant can recommend them. Works with Shopify, WooCommerce and most other shops. Refreshes daily.
            </p>
          </div>
        )}

        {store?.status === "error" && store.last_error && (
          <div
            style={{
              marginTop: 12,
              padding: "0.6rem 0.8rem",
              borderRadius: 10,
              background: "rgba(239,68,68,.06)",
              border: "1px solid rgba(239,68,68,.25)",
              color: C.error,
              fontSize: "0.8rem",
              lineHeight: 1.45,
            }}
          >
            {store.last_error}
          </div>
        )}

        {/* Address + action */}
        {!editingAddress && (store || siteOrigin) && !passwordTyped ? (
          <div style={{ marginTop: 16 }}>
            {store ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: "0.8rem", color: C.textSecondary }}>
                  Reading products from <strong style={{ color: C.textPrimary }}>{host}</strong>
                </div>
                <button
                  type="button"
                  title={importing ? "Syncing…" : "Sync products now"}
                  aria-label="Sync products now"
                  className="ryx-sync"
                  style={{
                    flex: "none", width: 40, height: 38, borderRadius: 10, border: `1px solid ${C.border}`,
                    background: C.bgCard, color: C.textPrimary, display: "inline-flex", alignItems: "center",
                    justifyContent: "center", cursor: busy || importing ? "default" : "pointer",
                  }}
                  disabled={busy || importing}
                  onClick={() => run(() => api.post("/api/shop/store/sync"))}
                >
                  <svg className={busy || importing ? "ryx-spin" : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                style={{ ...button(true), width: "100%", borderRadius: 10, padding: "0.75rem 1.1rem" }}
                disabled={busy}
                onClick={() => connect({ url: siteOrigin! })}
              >
                Import products from {siteOrigin!.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setUrl(store?.store_url || siteOrigin || "");
                setEditingAddress(true);
              }}
              style={{ ...linkBtn, marginTop: 8, fontSize: "0.76rem", color: C.textMuted }}
            >
              My shop is at a different address
            </button>
          </div>
        ) : (
        <div style={{ marginTop: 16 }}>
          <div style={sectionLabel}>Store address</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourstore.com"
              disabled={busy || importing}
              style={field}
            />
            {(urlChanged || passwordTyped) && (
              <button
                type="button"
                style={{ ...button(true), borderRadius: 10, padding: "0.7rem 1.1rem" }}
                disabled={busy || importing || !url.trim()}
                onClick={() => connect(passwordTyped ? { url: url.trim(), password: password.trim() } : { url: url.trim() })}
              >
                {!store ? "Import products" : urlChanged ? "Change store" : "Save & import"}
              </button>
            )}
            {store && !urlChanged && !passwordTyped && (
              <button
                type="button"
                title={importing ? "Syncing…" : "Sync products now"}
                aria-label="Sync products now"
                className="ryx-sync"
                style={{
                  flex: "none",
                  width: 44,
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: C.bgCard,
                  color: C.textPrimary,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: busy || importing ? "default" : "pointer",
                  boxShadow: "0 1px 2px rgba(15,23,42,.05)",
                }}
                disabled={busy || importing}
                onClick={() => run(() => api.post("/api/shop/store/sync"))}
              >
                <svg className={busy || importing ? "ryx-spin" : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </button>
            )}
          </div>
        </div>
        )}

        {/* Password-protected store */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          {!passwordOpen ? (
            <button
              type="button"
              onClick={() => setShowPassword(true)}
              style={{ ...linkBtn, display: "inline-flex", alignItems: "center", gap: 8, color: C.textSecondary }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              My store is locked with a password
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <label htmlFor="shop-store-password" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.84rem", fontWeight: 600, color: C.textPrimary }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Store password
                </label>
                {store?.has_password && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: C.textSecondary,
                      border: `1px solid ${C.border}`,
                      borderRadius: 999,
                      padding: "2px 9px",
                    }}
                  >
                    <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                    Saved · encrypted
                  </span>
                )}
              </div>
              <input
                id="shop-store-password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={store?.has_password ? "Type a new one to replace it" : "Enter your store password"}
                disabled={busy || importing}
                maxLength={200}
                style={{ ...field, flex: "none", width: "100%", boxSizing: "border-box", borderColor: lockedError ? C.error : C.border }}
              />
              <span style={{ fontSize: "0.74rem", color: C.textMuted, lineHeight: 1.45 }}>
                Used only to read your products. Not needed once your store is open to everyone.
              </span>
            </div>
          )}
        </div>

        {error && <p style={{ color: C.error, fontSize: "0.8rem", margin: "12px 0 0" }}>{error}</p>}
        <div style={{ minHeight: 16 }} />
        {/* Quiet actions */}
        {store && !importing && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            {store.has_password && !passwordTyped ? (
              <button type="button" className="ryx-quiet" disabled={busy} onClick={() => connect({ url: store.store_url, password: "" })}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.9-1" />
                </svg>
                Remove password
              </button>
            ) : <span />}
            <button
              type="button"
              className="ryx-quiet ryx-quiet-danger"
              onClick={() => {
                if (window.confirm("Remove this store and all imported products from your assistant?")) {
                  run(async () => {
                    await api.delete("/api/shop/store");
                    setUrl("");
                  });
                }
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
              Remove store
            </button>
          </div>
        )}
      </div>

      {/* ── Products ── */}
      {data && data.products.length > 0 && !importing && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: wide ? "2px 2px 10px" : "4px 2px 10px" }}>
            <span style={{ ...sectionLabel, marginBottom: 0 }}>Products the assistant can show</span>
            <span style={{ fontSize: "0.74rem", color: C.textMuted }}>
              {(allProducts ?? data.products).length} of {data.total_products}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 10 }}>
            {(allProducts ?? data.products).map((p) => (
              <a
                key={`${p.title}-${p.url}`}
                href={p.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="ryx-prod"
                title={p.title}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  padding: 8,
                  borderRadius: 18,
                  border: `1px solid ${C.border}`,
                  background: C.bgCard,
                  textDecoration: "none",
                  minWidth: 0,
                  boxShadow: "0 1px 2px rgba(15,23,42,.04)",
                }}
              >
                <span className="ryx-prod-go" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                </span>
                <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 12, background: "linear-gradient(180deg,#f8fafc,#eef2f6)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" loading="lazy" className="ryx-prod-img" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: 12, boxSizing: "border-box", filter: "drop-shadow(0 6px 10px rgba(15,23,42,.12))" }} />
                  ) : (
                    <span style={{ fontSize: "0.72rem", color: C.textMuted }}>No photo</span>
                  )}
                </div>
                <div style={{ padding: "0.6rem 0.3rem 0.2rem" }}>
                  <div
                    style={{
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      color: C.textPrimary,
                      lineHeight: 1.3,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      minHeight: "2.6em",
                    }}
                  >
                    {p.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: C.textPrimary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {p.price ? `${p.currency === "INR" ? "₹" : p.currency === "USD" ? "$" : p.currency ? p.currency + " " : ""}${p.price}` : "—"}
                    </span>
                    <span title={p.available ? "In stock" : "Sold out"} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.66rem", color: C.textMuted, whiteSpace: "nowrap" }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: p.available ? "#10b981" : "#cbd5e1" }} />
                      {p.available ? "In stock" : "Sold out"}
                    </span>
                  </div>
                </div>
              </a>
            ))}
            {!allProducts && data.total_products > data.products.length && (
              <button
                type="button"
                className="ryx-more"
                disabled={loadingAll}
                onClick={async () => {
                  setLoadingAll(true);
                  try {
                    const res = await api.get<StoreResponse>("/api/shop/store?all=true");
                    setAllProducts(res.products);
                  } catch {
                    setError("Couldn't load all products. Please try again.");
                  } finally {
                    setLoadingAll(false);
                  }
                }}
                style={{
                  borderRadius: 18,
                  border: "1px solid var(--ink)",
                  background: "var(--ink-grad)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  padding: "1rem",
                  minHeight: 120,
                  color: "#fff",
                  cursor: loadingAll ? "default" : "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex" }} aria-hidden>
                  {data.products.slice(0, 3).map((p, i) => (
                    <span
                      key={i}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        marginLeft: i ? -9 : 0,
                        border: "2px solid var(--ink)",
                        background: p.image_url ? `#fff center/cover no-repeat url(${JSON.stringify(p.image_url)})` : "#334155",
                      }}
                    />
                  ))}
                </span>
                <span>
                  <span style={{ display: "block", fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {loadingAll ? "…" : `+${data.total_products - data.products.length}`}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "0.78rem", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                    {loadingAll ? "Loading…" : "View all products"}
                    {!loadingAll && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    )}
                  </span>
                </span>
              </button>
            )}
          </div>
          {allProducts && allProducts.length > data.products.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setAllProducts(null)}
                style={{ ...button(false), borderRadius: 999, background: C.bgCard, padding: "0.5rem 1.1rem" }}
              >
                Show less
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .ryx-prod { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .ryx-prod:hover { transform: translateY(-3px); border-color: #cbd5e1 !important; box-shadow: 0 14px 30px rgba(15,23,42,.10) !important; }
        .ryx-prod-img { transition: transform .3s ease; }
        .ryx-prod:hover .ryx-prod-img { transform: scale(1.05); }
        .ryx-prod-go { position: absolute; top: 14px; right: 14px; z-index: 2; width: 24px; height: 24px; border-radius: 50%; background: #fff; color: #0f172a; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(15,23,42,.15); opacity: 0; transform: translateY(2px); transition: opacity .18s ease, transform .18s ease; }
        .ryx-prod:hover .ryx-prod-go { opacity: 1; transform: none; }
        .ryx-quiet { display: inline-flex; align-items: center; gap: 6px; background: none; border: 1px solid transparent; border-radius: 8px; padding: 5px 8px; margin: -5px -8px; color: var(--text-muted); font: inherit; font-size: .78rem; cursor: pointer; transition: color .15s, background .15s; }
        .ryx-quiet:hover { color: var(--text-primary); background: var(--bg-surface); }
        .ryx-quiet-danger:hover { color: var(--error); background: rgba(239,68,68,.06); }
        .ryx-sync:hover:not(:disabled) { border-color: #cbd5e1 !important; background: var(--bg-surface) !important; }
        .ryx-spin { animation: ryxSpin 1s linear infinite; }
        @keyframes ryxSpin { to { transform: rotate(360deg); } }
        .ryx-more { transition: transform .18s ease, box-shadow .18s ease; }
        .ryx-more:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(15,23,42,.22); }
        @media (max-width: 900px) { .ryx-shop-wide { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
