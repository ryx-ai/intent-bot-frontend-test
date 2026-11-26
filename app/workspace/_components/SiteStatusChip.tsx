"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export type SiteStatus = {
  state: "connected" | "quiet" | "not_connected";
  last_seen_at: string | null;
  origin: string | null;
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Shows whether the chat box snippet is live on the owner's website.
export function SiteStatusChip({
  status,
  hideLink = false,
}: {
  status: SiteStatus;
  hideLink?: boolean;
}) {
  const host = status.origin ? status.origin.replace(/^https?:\/\//, "") : "";
  const tone =
    status.state === "connected"
      ? { dot: "#10b981", label: `Live on ${host}`, sub: status.last_seen_at ? `seen ${timeAgo(status.last_seen_at)}` : "" }
      : status.state === "quiet"
        ? { dot: "#f59e0b", label: `Not seen on ${host} lately`, sub: status.last_seen_at ? `last ${timeAgo(status.last_seen_at)}` : "" }
        : { dot: "#94a3b8", label: "Not on your website yet", sub: "" };
  const showLink = !hideLink && status.state !== "connected";
  return (
    <span
      title={
        status.state === "connected"
          ? "Your chat box loaded on your website recently."
          : status.state === "quiet"
            ? "Your chat box was installed, but hasn't loaded on your site for over a week. Check the snippet is still there."
            : "We haven't seen your chat box load on a website yet. Add the snippet to your site to go live."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 11px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        fontSize: "0.78rem",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tone.dot,
          boxShadow: status.state === "connected" ? `0 0 0 3px color-mix(in srgb, ${tone.dot} 22%, transparent)` : "none",
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {tone.label}
      </span>
      {tone.sub && <span>· {tone.sub}</span>}
      {showLink && (
        <Link href="/workspace/deploy" style={{ fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" }}>
          · {status.state === "quiet" ? "Check snippet" : "Add to website"} ›
        </Link>
      )}
    </span>
  );
}

/** Loads the snippet status and keeps it fresh (every minute). */
export default function LiveSiteStatus({ hideLink = false }: { hideLink?: boolean }) {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<SiteStatus>("/api/config/widget-status")
        .then((s) => {
          if (alive && s) setStatus(s);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  if (!status) return null;
  return <SiteStatusChip status={status} hideLink={hideLink} />;
}
