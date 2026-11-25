"use client";

export interface ProductCard {
  title: string;
  price: string | null;
  compare_at_price: string | null;
  currency: string | null;
  available: boolean;
  image_url: string | null;
  url: string | null;
  variants?: { id: string; options: Record<string, string>; price: string | null; available: boolean }[];
  platform?: string | null;
  store_url?: string | null;
}

/** Add-to-cart / buy-now links for a product with one buyable version (same rules as the website widget). */
function buyLinks(p: ProductCard): { add: string; buy: string } | null {
  const store = safeUrl(p.store_url ?? null);
  const versions = (p.variants ?? []).filter((v) => /^[0-9]{1,20}$/.test(String(v.id)));
  if (!store || versions.length !== 1) return null;
  const base = store.replace(/\/+$/, "");
  const vid = versions[0].id;
  if (p.platform === "shopify") return { add: `${base}/cart/add?id=${vid}&quantity=1`, buy: `${base}/cart/${vid}:1` };
  if (p.platform === "woocommerce" && !Object.keys(versions[0].options || {}).length) {
    return { add: `${base}/?add-to-cart=${vid}&quantity=1`, buy: `${base}/checkout/?add-to-cart=${vid}&quantity=1` };
  }
  return null;
}

function safeUrl(u: string | null): string | undefined {
  if (!u) return undefined;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function formatPrice(value: string | null, currency: string | null): string {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(num)) return String(value);
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: num % 1 === 0 ? 0 : 2,
      }).format(num);
    } catch {
      return `${currency.toUpperCase()} ${num}`;
    }
  }
  return String(num);
}

/** Shop mode: product cards shown under a bot reply (same design as the website widget). */
export default function ProductCards({ products, themeColor }: { products: ProductCard[]; themeColor: string }) {
  if (!products.length) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        padding: "4px 2px 8px",
        marginTop: "0.75rem",
        scrollSnapType: "x mandatory",
      }}
    >
      {products.slice(0, 6).map((p, i) => {
        const url = safeUrl(p.url);
        const img = safeUrl(p.image_url);
        const price = Number(String(p.price ?? "").replace(/,/g, ""));
        const was = Number(String(p.compare_at_price ?? "").replace(/,/g, ""));
        const onSale = p.available && Number.isFinite(price) && Number.isFinite(was) && was > price;
        return (
          <div
            key={`${p.title}-${i}`}
            style={{
              flex: "0 0 152px",
              display: "flex",
              flexDirection: "column",
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 14,
              overflow: "hidden",
              scrollSnapAlign: "start",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#F3F4F6" }}>
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={p.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: p.available ? 1 : 0.55 }}
                />
              )}
              {(!p.available || onSale) && (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    background: onSale ? "#DC2626" : "#111827",
                  }}
                >
                  {p.available ? `-${Math.round((100 * (was - price)) / was)}%` : "Sold out"}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "9px 10px 10px", flex: 1 }}>
              <div
                title={p.title}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  color: "#1F2937",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  minHeight: "2.6em",
                }}
              >
                {p.title}
              </div>
              {p.price && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>
                  {formatPrice(p.price, p.currency)}
                  {onSale && (
                    <s style={{ fontWeight: 500, color: "#9CA3AF", marginLeft: 5, fontSize: 11.5 }}>
                      {formatPrice(p.compare_at_price, p.currency)}
                    </s>
                  )}
                </div>
              )}
              {(() => {
                const links = p.available ? buyLinks(p) : null;
                if (!links) return null;
                const btn: React.CSSProperties = {
                  flex: 1, display: "block", textAlign: "center", padding: "7px 0", borderRadius: 9,
                  fontSize: 12, fontWeight: 700, textDecoration: "none", marginTop: "auto",
                };
                return (
                  <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                    <a href={links.add} target="_blank" rel="noopener noreferrer"
                      style={{ ...btn, border: "1px solid #111827", color: "#111827", background: "#FFFFFF" }}>Add</a>
                    <a href={links.buy} target="_blank" rel="noopener noreferrer"
                      style={{ ...btn, background: themeColor, color: "#FFFFFF" }}>Buy now</a>
                  </div>
                );
              })()}
              {url && !(p.available && buyLinks(p)) && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: "auto",
                    display: "block",
                    textAlign: "center",
                    padding: "7px 0",
                    borderRadius: 9,
                    background: p.available ? themeColor : "#9CA3AF",
                    color: "#FFFFFF",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {!p.available ? "View (sold out)" : (p.variants?.length ?? 0) > 1 ? "Choose options" : p.platform === "website" ? "Buy on website" : "View product"}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
