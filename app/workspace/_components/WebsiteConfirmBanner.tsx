"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Suggestion = { id: number; domain: string; root_url: string };

/**
 * The assistant was seen on a website the owner hasn't confirmed yet.
 * Nothing is read or imported from it until the owner says it's theirs
 * (the website address a browser reports can be faked).
 */
export default function WebsiteConfirmBanner() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get<{ suggestions: Suggestion[] }>("/api/knowledge/website-suggestions")
      .then((res) => {
        if (alive) setItems(res.suggestions || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const current = items[0];
  if (!current && !done) return null;

  async function answer(accept: boolean) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/knowledge/website-suggestions/${current.id}`, { accept });
      setItems((list) => list.slice(1));
      if (accept) {
        setDone(
          `Thanks! We're reading ${current.domain} now. If we find products there, we'll ask you here whether to turn on Shop mode.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = {
    display: "flex",
    gap: "1rem",
    alignItems: "flex-start",
    flexWrap: "wrap",
    padding: "1.1rem 1.25rem",
    borderRadius: 14,
    border: "1px solid var(--accent-glow)",
    background: "linear-gradient(135deg, var(--accent-dim), transparent)",
    marginBottom: "1rem",
  };

  if (!current) {
    return (
      <section role="status" style={box}>
        <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>✅</div>
        <div style={{ flex: 1, fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>{done}</div>
        <button
          type="button"
          onClick={() => setDone("")}
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem" }}
        >
          Close
        </button>
      </section>
    );
  }

  return (
    <section role="status" style={box}>
      <div style={{ fontSize: "1.5rem", lineHeight: 1 }}>🌐</div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
          We noticed your assistant on <span style={{ color: "var(--accent)" }}>{current.domain}</span>. Is this your website?
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>
          If you say yes, your assistant will learn from its pages and we&apos;ll look for products to show. If it isn&apos;t yours,
          say no and we&apos;ll ignore it.
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
          No, not mine
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
          Yes, it&apos;s mine
        </button>
      </div>
    </section>
  );
}
