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

/** Shop mode: connect a Shopify / WooCommerce store and import its products. */
export default function ShopProductsCard() {
  const [data, setData] = useState<StoreResponse | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    });
  }

  return (
    <section
      style={{
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.9rem",
      }}
    >
      <div>
        <div style={{ fontSize: "0.88rem", fontWeight: 600, color: C.textPrimary }}>Your products</div>
        <p style={{ color: C.textMuted, fontSize: "0.75rem", margin: "4px 0 0", lineHeight: 1.5 }}>
          Type your store address and we&apos;ll import your products (name, price, photo, stock and link) so the
          assistant can recommend them. Works with Shopify and WooCommerce stores. Products refresh every day.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourstore.com"
          disabled={busy || importing}
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            backgroundColor: C.bgSurface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "0.6rem 0.85rem",
            fontSize: "0.85rem",
            color: C.textPrimary,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        {(urlChanged || passwordTyped) && (
          <button
            type="button"
            style={button(true)}
            disabled={busy || importing || !url.trim()}
            onClick={() => connect(passwordTyped ? { url: url.trim(), password: password.trim() } : { url: url.trim() })}
          >
            {!store ? "Import products" : urlChanged ? "Change store" : "Save & import"}
          </button>
        )}
        {store && !urlChanged && !passwordTyped && (
          <button
            type="button"
            style={button(false)}
            disabled={busy || importing}
            onClick={() => run(() => api.post("/api/shop/store/sync"))}
          >
            Sync now
          </button>
        )}
      </div>

      {!passwordOpen ? (
        <button
          type="button"
          onClick={() => setShowPassword(true)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.accent, fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit" }}
        >
          🔒 My store is locked with a password
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "0.75rem", color: C.textSecondary, fontWeight: 600 }} htmlFor="shop-store-password">
            Store password <span style={{ color: C.textMuted, fontWeight: 400 }}>(only if visitors must type a password to open your store)</span>
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="shop-store-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={store?.has_password ? "•••••••• (saved)" : "Store password"}
              disabled={busy || importing}
              maxLength={200}
              style={{
                flex: "1 1 220px",
                minWidth: 0,
                backgroundColor: C.bgSurface,
                border: `1px solid ${lockedError ? C.error : C.border}`,
                borderRadius: 8,
                padding: "0.55rem 0.85rem",
                fontSize: "0.85rem",
                color: C.textPrimary,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            {store?.has_password && !passwordTyped && !importing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => connect({ url: store.store_url, password: "" })}
                style={{ background: "none", border: "none", color: C.textMuted, fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
              >
                Remove saved password
              </button>
            )}
          </div>
          <span style={{ fontSize: "0.72rem", color: C.textMuted }}>
            {store?.has_password ? "🔒 A store password is saved (kept encrypted). " : ""}
            Your assistant uses it only to read your products. You won&apos;t need it once your store is open to everyone.
          </span>
        </div>
      )}

      {error && <p style={{ color: C.error, fontSize: "0.78rem", margin: 0 }}>{error}</p>}

      {store && (
        <div style={{ fontSize: "0.8rem", color: C.textSecondary, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {importing ? (
            <span style={{ color: C.accent, fontWeight: 600 }}>⏳ Importing products… this can take a minute.</span>
          ) : store.status === "error" ? (
            <span style={{ color: C.error }}>⚠️ {store.last_error}</span>
          ) : (
            <span style={{ color: C.success, fontWeight: 600 }}>
              ✓ {store.product_count} products imported
              {platformName(store.platform) ? ` from ${platformName(store.platform)}` : ""}
            </span>
          )}
          {!importing && store.last_synced_at && (
            <span style={{ color: C.textMuted }}>· updated {timeAgo(store.last_synced_at)}</span>
          )}
          {!importing && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Remove this store and all imported products from your assistant?")) {
                  run(async () => {
                    await api.delete("/api/shop/store");
                    setUrl("");
                  });
                }
              }}
              style={{ marginLeft: "auto", background: "none", border: "none", color: C.textMuted, fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
            >
              Remove store
            </button>
          )}
        </div>
      )}

      {data && data.products.length > 0 && !importing && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {data.products.map((p) => (
            <a
              key={`${p.title}-${p.url}`}
              href={p.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: 6,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bgSurface,
                textDecoration: "none",
                minWidth: 0,
              }}
            >
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt="" width={36} height={36} style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 6, background: C.accentDim, flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.74rem", fontWeight: 600, color: C.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.title}
                </div>
                <div style={{ fontSize: "0.7rem", color: p.available ? C.textMuted : C.error }}>
                  {p.available ? `${p.currency ? p.currency + " " : ""}${p.price ?? ""}` : "Sold out"}
                </div>
              </div>
            </a>
          ))}
          {data.total_products > data.products.length && (
            <div style={{ fontSize: "0.72rem", color: C.textMuted, alignSelf: "center", padding: 6 }}>
              + {data.total_products - data.products.length} more
            </div>
          )}
        </div>
      )}
    </section>
  );
}
