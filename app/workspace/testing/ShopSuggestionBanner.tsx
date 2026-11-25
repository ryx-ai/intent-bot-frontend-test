"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Suggestion = { show: boolean; product_count: number; platform: string | null; store_url: string | null };

/**
 * Products were found automatically on the website the assistant was installed
 * on. Ask the owner whether to turn on Shop mode (never switched on silently).
 */
export default function ShopSuggestionBanner({ onAccepted }: { onAccepted: () => void }) {
  const [data, setData] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get<Suggestion>("/api/shop/suggestion")
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data || !data.show) return null;

  async function answer(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/shop/suggestion", { accept });
      setData(null);
      if (accept) onAccepted();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const site = (data.store_url || "").replace(/^https?:\/\//, "");
  return (
    <section
      role="status"
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "flex-start",
        flexWrap: "wrap",
        padding: "1.1rem 1.25rem",
        borderRadius: 14,
        border: "1px solid var(--accent-glow)",
        background: "linear-gradient(135deg, var(--accent-dim), transparent)",
      }}
    >
      <div style={{ fontSize: "1.6rem", lineHeight: 1 }}>🛍️</div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
          We found {data.product_count} products on your website{site ? ` (${site})` : ""}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>
          Turn on <strong>Shop mode</strong> so your assistant recommends them with photos, prices and
          {data.platform === "website" ? " a “Buy on website” button" : " Add to cart / Buy now buttons"}. You can switch
          back any time.
        </p>
        {error && <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--error)" }}>{error}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => answer(false)}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            borderRadius: 8,
            padding: "0.55rem 0.9rem",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Not now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => answer(true)}
          style={{
            background: "var(--accent)",
            border: "1px solid var(--accent)",
            color: "#FFFFFF",
            borderRadius: 8,
            padding: "0.55rem 1rem",
            fontSize: "0.82rem",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Turn on Shop mode
        </button>
      </div>
    </section>
  );
}
