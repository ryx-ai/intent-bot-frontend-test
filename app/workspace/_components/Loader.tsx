"use client";

/**
 * Shared loading visuals.
 * - <Spinner />: a smooth arc that grows and shrinks while it turns.
 * - <SkeletonBlock />: a soft shimmering placeholder in the shape of the content.
 */

const CSS = `
@keyframes ryxLdRotate { to { transform: rotate(360deg); } }
@keyframes ryxLdDash {
  0%   { stroke-dasharray: 1 150;  stroke-dashoffset: 0; }
  50%  { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
  100% { stroke-dasharray: 90 150; stroke-dashoffset: -124; }
}
@keyframes ryxLdShimmer { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes ryxLdFade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ryx-ld-spin, .ryx-ld-arc, .ryx-ld-sk { animation-duration: 3s !important; }
}
`;

export function Spinner({ size = 28, stroke = 3.5, label }: { size?: number; stroke?: number; label?: string }) {
  return (
    <span role="status" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <style>{CSS}</style>
      <svg
        className="ryx-ld-spin"
        width={size}
        height={size}
        viewBox="0 0 50 50"
        aria-hidden="true"
        style={{ animation: "ryxLdRotate 1.4s linear infinite" }}
      >
        <circle cx="25" cy="25" r="20" fill="none" stroke="var(--border)" strokeWidth={(stroke * 50) / size} />
        <circle
          className="ryx-ld-arc"
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={(stroke * 50) / size}
          strokeLinecap="round"
          style={{ animation: "ryxLdDash 1.4s ease-in-out infinite" }}
        />
      </svg>
      {label ? (
        <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-muted)", animation: "ryxLdFade .4s ease both .2s" }}>
          {label}
        </span>
      ) : (
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Loading</span>
      )}
    </span>
  );
}

export function SkeletonBlock({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="ryx-ld-sk"
      aria-hidden="true"
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        background: "linear-gradient(90deg, var(--bg-sidebar) 0%, var(--bg-hover) 40%, var(--bg-sidebar) 80%)",
        backgroundSize: "200% 100%",
        animation: "ryxLdShimmer 1.6s ease-in-out infinite",
        ...style,
      }}
    >
      <style>{CSS}</style>
    </span>
  );
}
