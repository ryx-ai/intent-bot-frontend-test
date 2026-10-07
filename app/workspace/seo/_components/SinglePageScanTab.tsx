"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export interface CategoryInfo {
  name: string;
  score: number;
  weight: number;
}

export interface AuditItem {
  id: string;
  category: string;
  title: string;
  status: "passed" | "warning" | "error";
  score: number;
  max_score: number;
  score_text: string;
  description: string;
  fix_recommendation: string;
}

export interface SeoAnalysisResult {
  url: string;
  overall_score: number;
  status_code: number;
  categories: {
    meta: CategoryInfo;
    structure: CategoryInfo;
    media: CategoryInfo;
    social: CategoryInfo;
  };
  summary: {
    total_audits: number;
    passed: number;
    warnings: number;
    errors: number;
  };
  audits: AuditItem[];
}

export interface SinglePageScanTabProps {
  initialSeo: SeoAnalysisResult | null;
  defaultUrl: string;
  isConfigured: boolean;
}

export function SinglePageScanTab({ initialSeo, defaultUrl, isConfigured }: SinglePageScanTabProps) {
  const [urlInput, setUrlInput] = useState(defaultUrl || "");
  const [seo, setSeo] = useState<SeoAnalysisResult | null>(initialSeo);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "passed">("all");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#10B981";
    if (score >= 50) return "#F59E0B";
    return "#EF4444";
  };

  const handleAnalyze = async () => {
    const target = urlInput.trim();
    if (!target) return;
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      const res = await api.post<SeoAnalysisResult>("/api/seo/analyze", { url: target });
      setSeo(res);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err && (err as { data: { error?: string } }).data?.error
          ? (err as { data: { error: string } }).data.error
          : err instanceof Error
          ? err.message
          : "Failed to analyze URL.";
      setErrorMsg(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredAudits = seo
    ? seo.audits.filter((item) => {
        if (filter === "all") return true;
        return item.status === filter;
      })
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* ── Single Page URL Scan Box ── */}
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.25rem" }}>
          <span style={{ fontSize: "1.2rem" }}>📄</span>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Instant Single-Page SEO Scanner
          </h2>
        </div>
        <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Analyze any specific URL on-the-fly to test landing pages, blog posts, or preview heading and OpenGraph tag health.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://yourdomain.com/landing-page"
            disabled={analyzing}
            style={{
              flex: 1,
              minWidth: 280,
              padding: "0.65rem 1rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: "0.9rem",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !urlInput.trim()}
            style={{
              padding: "0.65rem 1.4rem",
              borderRadius: 8,
              border: "none",
              background: analyzing ? "rgba(99,102,241,0.5)" : "var(--accent, #8A64E9)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: analyzing || !urlInput.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "opacity 0.2s",
            }}
          >
            {analyzing ? (
              <>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🔄</span>
                Analyzing Page...
              </>
            ) : (
              <>
                <span>🔍</span> Scan Page Now
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.65rem 0.9rem",
              borderRadius: 6,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#EF4444",
              fontSize: "0.82rem",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* ── Results State ── */}
      {!seo && !isConfigured ? (
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "3.5rem 2rem",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🌐</div>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Enter a URL or Connect Website
          </h3>
          <p style={{ fontSize: "0.88rem", maxWidth: 500, margin: "0.5rem auto 1.5rem auto", lineHeight: 1.5 }}>
            Type any URL above to perform a live scan, or configure your primary website in Knowledge Lake.
          </p>
          <Link
            href="/workspace/knowledge"
            style={{
              padding: "0.65rem 1.35rem",
              borderRadius: 8,
              backgroundColor: "var(--accent, #8a64e9)",
              color: "#fff",
              fontSize: "0.88rem",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            Configure in Knowledge Lake →
          </Link>
        </div>
      ) : seo ? (
        <>
          {/* Summary / Category Matrix Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
            {Object.entries(seo.categories).map(([key, cat]) => (
              <div
                key={key}
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>{cat.name}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Weight: {cat.weight}%</span>
                </div>

                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: getScoreColor(cat.score), marginBottom: "0.5rem" }}>
                  {cat.score}<span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-muted)" }}>/100</span>
                </div>

                <div style={{ width: "100%", height: 6, backgroundColor: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${cat.score}%`, height: "100%", backgroundColor: getScoreColor(cat.score) }} />
                </div>
              </div>
            ))}
          </div>

          {/* Audit Details */}
          <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h3 style={{ margin: "0 0 0.2rem 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Technical SEO Audits &amp; Actionable Fixes
                </h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                  Target: {seo.url}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {(
                  [
                    { id: "all", label: `All (${seo.audits.length})` },
                    { id: "error", label: `Critical (${seo.summary.errors})` },
                    { id: "warning", label: `Warnings (${seo.summary.warnings})` },
                    { id: "passed", label: `Passed (${seo.summary.passed})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setFilter(t.id)}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: filter === t.id ? "rgba(138, 100, 233, 0.2)" : "transparent",
                      color: filter === t.id ? "var(--accent)" : "var(--text-muted)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {filteredAudits.map((item) => (
                <div key={item.id} style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <span style={{ fontSize: "1.2rem" }}>
                        {item.status === "passed" && "✅"}
                        {item.status === "warning" && "⚠️"}
                        {item.status === "error" && "❌"}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                          {item.title} <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>({item.category})</span>
                        </div>
                        <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0.25rem 0.5rem", borderRadius: 4, backgroundColor: item.status === "passed" ? "#ECFDF5" : item.status === "warning" ? "#FFFBEE" : "#FEF2F2", color: item.status === "passed" ? "#059669" : item.status === "warning" ? "#D97706" : "#DC2626", whiteSpace: "nowrap" }}>
                      {item.score_text}
                    </span>
                  </div>

                  {item.fix_recommendation && (
                    <div style={{ marginTop: "0.85rem", padding: "0.75rem 1rem", borderRadius: 6, backgroundColor: "var(--bg-card)", borderLeft: `3px solid ${getScoreColor(item.score)}`, fontSize: "0.83rem", color: "var(--text-primary)" }}>
                      <strong>Recommended Fix:</strong> {item.fix_recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
