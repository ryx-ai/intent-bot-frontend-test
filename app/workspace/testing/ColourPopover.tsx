"use client";

import { useEffect, useRef, useState } from "react";

type HSV = { h: number; s: number; v: number };

function hexToHsv(hex: string): HSV {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0x1c22d8;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (
    "#" +
    [r, g, b]
      .map((u) => Math.round((u + m) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** Our own colour picker (the browser's built-in one can't be styled). */
export default function ColourPopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [text, setText] = useState(value.toUpperCase());
  const boxRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);
  const canPickFromScreen = typeof window !== "undefined" && "EyeDropper" in window;

  useEffect(() => {
    function outside(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  function apply(next: HSV) {
    setHsv(next);
    const h = hsvToHex(next);
    setText(h);
    onChange(h);
  }

  function drag(ref: React.RefObject<HTMLDivElement | null>, move: (x: number, y: number) => void) {
    return (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      e.preventDefault();
      const at = (ev: { clientX: number; clientY: number }) => {
        const r = el.getBoundingClientRect();
        move(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
      };
      at(e);
      const mv = (ev: PointerEvent) => at(ev);
      const up = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    };
  }

  async function pickFromScreen() {
    try {
      // EyeDropper is available in Chrome and Edge.
      const result = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open();
      apply(hexToHsv(result.sRGBHex));
    } catch {
      /* cancelled */
    }
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Choose a colour"
      style={{
        position: "absolute",
        zIndex: 50,
        top: "calc(100% + 10px)",
        left: 0,
        width: 264,
        padding: 14,
        borderRadius: 18,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "0 24px 60px rgba(17,24,39,.22), 0 2px 8px rgba(17,24,39,.08)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Colour area */}
      <div
        ref={areaRef}
        onPointerDown={drag(areaRef, (x, y) => apply({ ...hsv, s: x, v: 1 - y }))}
        style={{
          position: "relative",
          height: 150,
          borderRadius: 12,
          cursor: "crosshair",
          touchAction: "none",
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            width: 18,
            height: 18,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            border: "3px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.3)",
            background: hex,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Hue */}
      <div
        ref={hueRef}
        onPointerDown={drag(hueRef, (x) => apply({ ...hsv, h: Math.min(359.9, x * 360) }))}
        style={{
          position: "relative",
          height: 14,
          borderRadius: 999,
          cursor: "pointer",
          touchAction: "none",
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: `${(hsv.h / 360) * 100}%`,
            top: "50%",
            width: 18,
            height: 18,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background: hueColor,
            border: "3px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,.2), 0 2px 6px rgba(0,0,0,.25)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Preview + code + eyedropper */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)", flex: "none" }} />
        <input
          value={text}
          onChange={(e) => {
            let v = e.target.value.trim().toUpperCase();
            if (v && !v.startsWith("#")) v = "#" + v;
            v = v.slice(0, 7);
            setText(v);
            if (/^#[0-9A-F]{6}$/.test(v)) {
              setHsv(hexToHsv(v));
              onChange(v);
            }
          }}
          aria-label="Colour code"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "0.55rem 0.7rem",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        {canPickFromScreen && (
          <button
            type="button"
            onClick={pickFromScreen}
            title="Pick a colour from your screen"
            aria-label="Pick a colour from your screen"
            style={{
              width: 38,
              height: 38,
              flex: "none",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          padding: "0.6rem",
          borderRadius: 10,
          border: "none",
          background: "var(--ink)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.82rem",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Done
      </button>
    </div>
  );
}
