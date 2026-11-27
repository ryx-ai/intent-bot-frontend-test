"use client";

import { useEffect, useState, useRef, DragEvent, ChangeEvent, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import { SkeletonBlock, Spinner } from "../_components/Loader";

interface KBFile {
  filename: string;
  size: string;
  uploaded_at: number;
}

interface WebUrl {
  url: string;
  chunk_count: number;
  indexed_at: string | null;
  is_manual?: boolean;
}

interface TenantWebsite {
  id: number;
  domain: string;
  root_url: string;
  allowed_origins: string[];
  is_primary: boolean;
  authorization_status: "configured" | "admin_approved";
  is_authorized: boolean;
  approved_at: string | null;
  indexing_status: "unindexed" | "queued" | "indexing" | "ready" | "stale" | "failed";
  indexed_pages_count: number;
  total_chunks_count: number;
  last_indexed_at: string | null;
  last_crawl_error: string | null;
  created_at: string | null;
}

interface Plan {
  id: number;
  slug: string;
  name: string;
  price_inr: number;
  max_kb_files: number;
}

interface SubscriptionStatus {
  subscription_status: "trial" | "active" | "expired" | "canceled" | string;
  is_active: boolean;
  plan: Plan | null;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  days_remaining: number;
  message: string;
}

const ALLOWED_EXTS = [".pdf", ".doc", ".docx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB — must match backend cap

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function formatShortDate(timestampOrIso: number | string | null | undefined): string {
  if (!timestampOrIso) return "";
  const d = typeof timestampOrIso === "number" ? new Date(timestampOrIso * 1000) : new Date(timestampOrIso);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${day} ${month}`;
}

function formatDateTime(timestampOrIso: number | string | null | undefined): string {
  if (!timestampOrIso) return "";
  const d = typeof timestampOrIso === "number" ? new Date(timestampOrIso * 1000) : new Date(timestampOrIso);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month}, ${time}`;
}

interface UploadResult {
  filename: string;
  status: "success" | "failed" | "skipped";
  error?: string;
}

export default function KnowledgeLakePage() {
  const router = useRouter();

  // ── Documents / Files state ──
  const [files, setFiles] = useState<KBFile[]>([]);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [deleteFilename, setDeleteFilename] = useState<string | null>(null);
  const [deletingFilename, setDeletingFilename] = useState("");
  const [overwriteFile, setOverwriteFile] = useState<File | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);
  const overwriteDecisionRef = useRef<((overwrite: boolean) => void) | null>(null);

  // ── Tenant Websites state ──
  const [websites, setWebsites] = useState<TenantWebsite[]>([]);
  const [reindexingWebsiteId, setReindexingWebsiteId] = useState<number | null>(null);
  const [confirmDeleteWebsite, setConfirmDeleteWebsite] = useState<TenantWebsite | null>(null);
  const [deletingWebsiteId, setDeletingWebsiteId] = useState<number | null>(null);
  const [websiteMenuOpen, setWebsiteMenuOpen] = useState(false);

  // ── Extra Pages state ──
  const [webUrls, setWebUrls] = useState<WebUrl[]>([]);
  const [webIndexing, setWebIndexing] = useState(false);
  const [webUrlInput, setWebUrlInput] = useState("");
  const [forceReindex, setForceReindex] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [confirmDeleteUrl, setConfirmDeleteUrl] = useState<string | null>(null);
  const [reindexingUrl, setReindexingUrl] = useState<string | null>(null);
  const [openUrlMenu, setOpenUrlMenu] = useState<string | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-menu-root]")) {
        setWebsiteMenuOpen(false);
        setOpenUrlMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadWebUrls = useCallback(async (silent = false) => {
    try {
      const res = await api.get<{ urls: WebUrl[] }>("/api/knowledge/web/urls?manual_only=true");
      setWebUrls(res.urls || []);
    } catch (err) {
      if (!silent) console.error("Failed to load web URLs", err);
    }
  }, []);

  const loadWebsites = useCallback(async () => {
    try {
      const res = await api.get<{ websites: TenantWebsite[] }>("/api/knowledge/websites");
      setWebsites(res.websites || []);
    } catch (err) {
      console.error("Failed to load tenant websites", err);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [filesRes, statusRes, urlsRes, websitesRes] = await Promise.allSettled([
        api.get<{ files: KBFile[] }>("/api/knowledge/files"),
        api.get<SubscriptionStatus>("/api/payments/subscription-status"),
        api.get<{ urls: WebUrl[] }>("/api/knowledge/web/urls?manual_only=true"),
        api.get<{ websites: TenantWebsite[] }>("/api/knowledge/websites"),
      ]);

      if (filesRes.status === "fulfilled") {
        setFiles(filesRes.value.files || []);
      }
      if (statusRes.status === "fulfilled") {
        setSubStatus(statusRes.value);
      }
      if (urlsRes.status === "fulfilled") {
        setWebUrls(urlsRes.value.urls || []);
      }
      if (websitesRes.status === "fulfilled") {
        setWebsites(websitesRes.value.websites || []);
      }
    } catch (err) {
      console.error("Failed to load knowledge lake data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [filesRes, statusRes, urlsRes, websitesRes] = await Promise.allSettled([
          api.get<{ files: KBFile[] }>("/api/knowledge/files"),
          api.get<SubscriptionStatus>("/api/payments/subscription-status"),
          api.get<{ urls: WebUrl[] }>("/api/knowledge/web/urls?manual_only=true"),
          api.get<{ websites: TenantWebsite[] }>("/api/knowledge/websites"),
        ]);

        if (cancelled) return;
        if (filesRes.status === "fulfilled") {
          setFiles(filesRes.value.files || []);
        }
        if (statusRes.status === "fulfilled") {
          setSubStatus(statusRes.value);
        }
        if (urlsRes.status === "fulfilled") {
          setWebUrls(urlsRes.value.urls || []);
        }
        if (websitesRes.status === "fulfilled") {
          setWebsites(websitesRes.value.websites || []);
        }
      } catch (err) {
        console.error("Failed to load knowledge lake data", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling for active crawl jobs or waiting for initial widget connection
  useEffect(() => {
    const hasActiveJob = websites.some((w) => w.indexing_status === "indexing" || w.indexing_status === "queued");
    const hasNoWebsite = websites.length === 0;
    if (!hasActiveJob && !hasNoWebsite) return;

    const intervalTime = hasActiveJob ? 3000 : 5000;
    const interval = setInterval(() => {
      void loadWebsites();
      void loadWebUrls(true);
    }, intervalTime);
    return () => clearInterval(interval);
  }, [websites, loadWebsites, loadWebUrls]);

  const isTrial = subStatus?.subscription_status === "trial";
  const isExpired = subStatus ? !subStatus.is_active : false;
  const maxKbFiles = subStatus?.plan?.max_kb_files ?? 3;
  const isUnlimited = maxKbFiles === -1;
  const isAtCapacity = !isUnlimited && files.length >= maxKbFiles;

  const planSlug = subStatus?.plan?.slug?.toLowerCase() || "";
  const planName = subStatus?.plan?.name?.toLowerCase() || "";
  const isBasicOrTrial =
    isTrial ||
    planSlug === "trial" ||
    planSlug === "basic" ||
    planName.includes("trial") ||
    planName.includes("basic");
  const canGetMore = !isUnlimited && isBasicOrTrial;

  // ── Upload one file ──
  async function uploadOne(file: File, overwrite: boolean): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    const endpoint = overwrite
      ? "/api/knowledge/upload?overwrite=true"
      : "/api/knowledge/upload";

    try {
      await api.postFormData(endpoint, formData);
      return { filename: file.name, status: "success" };
    } catch (err) {
      if (!(err instanceof ApiError)) {
        return { filename: file.name, status: "failed", error: "Network error" };
      }
      if (err.status === 409 && !overwrite) {
        const ok = await requestOverwrite(file);
        if (ok) return uploadOne(file, true);
        return { filename: file.name, status: "skipped", error: "Already exists" };
      }

      let msg = err.detail || "Upload failed";
      if (err.status === 403) {
        msg = "Subscription expired or plan limit reached";
        setUpgradeModalReason("Your plan has reached its upload limits or is currently inactive. Upgrade to add more documents.");
        setShowUpgradeModal(true);
      } else if (err.status === 400 && !err.detail) {
        msg = "Invalid file";
      } else if (err.status === 413) {
        msg = "File too large (>20MB)";
      } else if (err.status === 415) {
        msg = "Unsupported type";
      } else if (err.status === 429) {
        msg = "Upload rate limit reached (max 10/hr). Try again later.";
      } else if (err.status === 501) {
        msg = "DOCX conversion unavailable on server. Please upload PDF.";
      }

      return { filename: file.name, status: "failed", error: msg };
    }
  }

  // ── Upload entry point ──
  async function handleUpload(fileList: FileList) {
    if (fileList.length === 0) return;

    if (isExpired) {
      setUpgradeModalReason("Your subscription or free trial has expired. Upgrade your plan to reactivate document uploads and enable your AI bot.");
      setShowUpgradeModal(true);
      return;
    }

    if (isAtCapacity) {
      setUpgradeModalReason(`You have reached the maximum limit of ${maxKbFiles} document(s) for your current plan (${subStatus?.plan?.name || "Trial"}). Upgrade to Basic or Advanced for more document storage.`);
      setShowUpgradeModal(true);
      return;
    }

    const valid: File[] = [];
    const preRejected: UploadResult[] = [];

    for (const f of Array.from(fileList)) {
      const ext = fileExt(f.name);
      if (!ALLOWED_EXTS.includes(ext)) {
        preRejected.push({ filename: f.name, status: "failed", error: "Unsupported type (only PDF, DOC, DOCX accepted)" });
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        preRejected.push({ filename: f.name, status: "failed", error: "File exceeds 20MB limit" });
        continue;
      }
      valid.push(f);
    }

    if (valid.length === 0 && preRejected.length === 0) return;

    if (!isUnlimited && files.length + valid.length > maxKbFiles) {
      setUpgradeModalReason(`Uploading ${valid.length} file(s) would exceed your plan limit of ${maxKbFiles} files (currently using ${files.length}/${maxKbFiles}). Upgrade your plan to increase limits.`);
      setShowUpgradeModal(true);
      return;
    }

    setUploading(true);

    const apiResults: UploadResult[] = [];
    for (const f of valid) {
      apiResults.push(await uploadOne(f, false));
    }
    const results = [...preRejected, ...apiResults];
    setUploading(false);

    const successCount = results.filter((r) => r.status === "success").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed");

    if (failed.length === 0 && skippedCount === 0) {
      showToast(`Uploaded ${successCount} file(s) successfully!`, "success");
    } else if (successCount === 0 && skippedCount === 0) {
      showToast(`Upload failed: ${failed[0]?.error ?? "Unknown error"}`, "error");
    } else {
      const parts: string[] = [];
      if (successCount > 0) parts.push(`${successCount} uploaded`);
      if (failed.length > 0) parts.push(`${failed.length} failed (${failed[0].error})`);
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
      showToast(parts.join(", "), failed.length > 0 ? "error" : "info");
    }
    loadData();
  }

  // ── Delete file ──
  async function handleDelete(filename: string) {
    setDeleteFilename(filename);
  }

  async function confirmDelete() {
    if (!deleteFilename) return;
    const filename = deleteFilename;
    setDeletingFilename(filename);
    try {
      await api.delete(`/api/knowledge/files/${encodeURIComponent(filename)}`);
      showToast("File removed successfully.", "success");
      loadData();
    } catch {
      showToast("Failed to delete file.", "error");
    } finally {
      setDeletingFilename("");
      setDeleteFilename(null);
    }
  }

  function requestOverwrite(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      overwriteDecisionRef.current = resolve;
      setOverwriteFile(file);
    });
  }

  function resolveOverwriteDecision(overwrite: boolean) {
    overwriteDecisionRef.current?.(overwrite);
    overwriteDecisionRef.current = null;
    setOverwriteFile(null);
  }

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Tenant Website handlers ──
  async function handleReindexWebsite(id: number) {
    setReindexingWebsiteId(id);
    try {
      await api.post(`/api/knowledge/websites/${id}/reindex`);
      showToast("Reading your website in the background…", "info");
      await loadWebsites();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to read website";
      showToast(msg, "error");
    } finally {
      setReindexingWebsiteId(null);
    }
  }

  async function handleDeleteWebsite() {
    if (!confirmDeleteWebsite) return;
    const site = confirmDeleteWebsite;
    setDeletingWebsiteId(site.id);
    setConfirmDeleteWebsite(null);
    try {
      await api.delete(`/api/knowledge/websites/${site.id}`);
      showToast(`Website ${site.domain} disconnected.`, "success");
      await loadWebsites();
      await loadWebUrls();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to disconnect website";
      showToast(msg, "error");
    } finally {
      setDeletingWebsiteId(null);
    }
  }

  // ── Extra Web URL handlers ──
  async function handleIndexUrl() {
    const url = webUrlInput.trim();
    if (!url) {
      showToast("Please enter a URL.", "error");
      return;
    }
    setWebIndexing(true);
    try {
      const res = await api.post<{ status: string; url: string; chunk_count: number; message?: string }>(
        "/api/knowledge/web/index",
        { url, force_reindex: forceReindex }
      );
      if (res.status === "already_indexed") {
        showToast("Already read. Enable \"read it again\" to refresh.", "info");
      } else {
        showToast("Page added successfully!", "success");
        setWebUrlInput("");
        setForceReindex(false);
        setShowManualUrl(false);
        await loadWebUrls();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to read page";
      showToast(msg, "error");
    } finally {
      setWebIndexing(false);
    }
  }

  async function handleReindexUrl(url: string) {
    setReindexingUrl(url);
    try {
      await api.post<{ status: string; url: string; chunk_count: number }>(
        "/api/knowledge/web/urls/reindex",
        { url }
      );
      showToast("Page refreshed successfully.", "success");
      await loadWebUrls();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to refresh page";
      showToast(msg, "error");
    } finally {
      setReindexingUrl(null);
    }
  }

  async function handleDeleteWebUrl() {
    if (!confirmDeleteUrl) return;
    const url = confirmDeleteUrl;
    setDeletingUrl(url);
    setConfirmDeleteUrl(null);
    try {
      const resp = await fetch("/api/knowledge/web/urls", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json().catch(() => ({})) as { status?: string; chunks_removed?: number; error?: string };
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      showToast("Page removed.", "success");
      await loadWebUrls();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove page";
      showToast(msg, "error");
    } finally {
      setDeletingUrl(null);
    }
  }

  // ── Drag handlers ──
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleUpload(e.target.files);
    e.target.value = "";
  }

  const primaryWebsite = websites.find((w) => w.is_primary) || websites[0];
  const manualWebUrls = webUrls.filter((u) => u.is_manual !== false);

  return (
    <div style={{ width: "100%", maxWidth: 1360, margin: "0 auto", padding: "2rem", boxSizing: "border-box" }}>
      <style>{`
        @keyframes indeterminateMove {
          0% { left: -40%; width: 40%; }
          60% { left: 35%; width: 45%; }
          100% { left: 100%; width: 40%; }
        }
        @keyframes knBreathe {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--text-primary) 35%, transparent); }
          50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--text-primary) 0%, transparent); }
        }
        .kn-reading { display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px 3px 8px; border-radius: 9999px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font-weight: 600; font-size: 0.78rem; }
        .kn-reading-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-primary); animation: knBreathe 1.8s ease-in-out infinite; }
        .kn-progress { height: 4px; border-radius: 9999px; overflow: hidden; position: relative; background: var(--bg-hover); }
        .kn-progress-bar { position: absolute; top: 0; bottom: 0; border-radius: 9999px; background: linear-gradient(90deg, transparent, var(--text-primary) 35%, var(--text-primary) 65%, transparent); animation: indeterminateMove 1.8s cubic-bezier(.65,0,.35,1) infinite; }
        @media (prefers-reduced-motion: reduce) { .kn-progress-bar, .kn-reading-dot { animation-duration: 4s; } }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        .desktop-only-actions {
          display: flex;
        }
        .mobile-only-menu {
          display: none;
        }
        .kn-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; align-items: stretch; }
        .kn-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
        .kn-stat { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 1rem 1.15rem; display: flex; align-items: center; gap: .85rem; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.03); }
        .kn-ico { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-secondary); }
        .kn-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 18px; padding: 1.5rem; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.035); display: flex; flex-direction: column; }
        .kn-btn-dark { display: inline-flex; align-items: center; gap: .5rem; padding: .62rem 1.2rem; border-radius: 10px; border: none; background: var(--ink); color: #fff; font: inherit; font-weight: 600; font-size: .86rem; cursor: pointer; box-shadow: 0 4px 12px rgba(15,23,42,.18); transition: transform .15s, box-shadow .15s; }
        .kn-btn-dark:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(15,23,42,.22); }
        @media (max-width: 1080px) { .kn-grid { grid-template-columns: minmax(0, 1fr); } }
        .kn-card { min-width: 0; overflow-wrap: anywhere; }
        @media (max-width: 640px) { .kn-card { padding: 1.15rem; } }
        @media (max-width: 760px) { .kn-stats { grid-template-columns: 1fr; } }
        @media (max-width: 640px) {
          .desktop-only-actions {
            display: none !important;
          }
          .mobile-only-menu {
            display: block !important;
          }
        }
      `}</style>

      {/* ── Page Header ── */}
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: "0 0 0.35rem 0", fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          What your assistant knows
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Your assistant answers customers using these files and website pages.
        </p>
      </header>

      {/* ── At a glance ── */}
      <div className="kn-stats">
        <div className="kn-stat">
          <span className="kn-ico" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1.1 }}>
              {loading ? <SkeletonBlock width={44} height={22} radius={6} /> : files.length}
              {!loading && !isUnlimited && <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}> / {maxKbFiles}</span>}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Files</div>
          </div>
        </div>
        <div className="kn-stat">
          <span className="kn-ico" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1.1 }}>
              {loading ? <SkeletonBlock width={32} height={22} radius={6} /> : primaryWebsite ? primaryWebsite.indexed_pages_count : 0}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Website pages read</div>
          </div>
        </div>
        <div className="kn-stat">
          <span className="kn-ico" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", lineHeight: 1.1 }}>
              {loading ? <SkeletonBlock width={44} height={22} radius={6} /> : manualWebUrls.length}
              {!loading && <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}> / 50</span>}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Extra pages</div>
          </div>
        </div>
      </div>

      <div className="kn-grid">
      {/* ══════════════════════════════════════════════════════════
          CARD 1: Files
      ══════════════════════════════════════════════════════════ */}
      <div className="kn-card">
        {/* Card Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Files
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              PDF or Word, up to 20 MB each
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                {isUnlimited ? `${files.length} files used` : `${files.length} of ${maxKbFiles} used`}
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  {subStatus?.plan?.name || (isTrial ? "Trial" : "Plan")}
                </span>
              </div>
              {!isUnlimited && maxKbFiles > 0 && (
                <div style={{ height: 4, background: "var(--bg-hover)", borderRadius: 9999, overflow: "hidden", width: "100%" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round((files.length / maxKbFiles) * 100))}%`,
                      background: isAtCapacity ? "var(--warning)" : "var(--ink)",
                      borderRadius: 9999,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              )}
            </div>

            {canGetMore && (
              <Link
                href="/workspace/billing"
                style={{
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  textDecoration: "none",
                  padding: "0.35rem 0.75rem",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  transition: "border-color 0.15s",
                }}
              >
                Get more
              </Link>
            )}
          </div>
        </div>

        {/* Upload Zone / Special Capacity or Empty State */}
        {loading ? (
          <div role="status" aria-label="Loading files" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SkeletonBlock height={150} radius={14} />
            {[0, 1].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "0.25rem 0" }}>
                <SkeletonBlock width={36} height={36} radius={10} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                  <SkeletonBlock width={`${60 - i * 15}%`} height={12} />
                  <SkeletonBlock width={`${30 - i * 5}%`} height={10} />
                </div>
              </div>
            ))}
          </div>
        ) : isAtCapacity ? (
          /* Capacity Reached State (Yellow box) */
          <div
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              borderRadius: 10,
              padding: "1.25rem 1.4rem",
              marginBottom: files.length > 0 ? "1.25rem" : 0,
            }}
          >
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.3rem" }}>
              {"You've used all "}
              {maxKbFiles}
              {" files on the "}
              {subStatus?.plan?.name || "Trial"}
              {" plan"}
            </div>
            <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginBottom: "0.9rem" }}>
              Remove a file to add another, or upgrade for more.
            </div>
            <Link
              href="/workspace/billing"
              style={{
                display: "inline-block",
                padding: "0.45rem 1rem",
                background: "var(--ink)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.84rem",
                borderRadius: 6,
                textDecoration: "none",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              See plans
            </Link>
          </div>
        ) : files.length === 0 ? (
          /* Zero Files Empty State */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              border: dragOver ? "1.5px dashed var(--accent)" : "1.5px dashed var(--border)",
              borderRadius: 14,
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              background: dragOver ? "var(--accent-dim)" : "linear-gradient(180deg, var(--bg-surface), transparent)",
              transition: "all 0.2s ease",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div
              aria-hidden
              style={{
                width: 52,
                height: 52,
                margin: "0 auto 1rem",
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--ink-grad)",
                color: "#fff",
                boxShadow: "0 8px 20px rgba(15,23,42,.18)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M7 9l5-5 5 5" />
                <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 650, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
              Add your first file
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: 400, margin: "0 auto 1.25rem auto", lineHeight: 1.55 }}>
              A price list, brochure or FAQ is a great start. Drag it here or choose it from your computer.
            </div>
            <button type="button" className="kn-btn-dark" onClick={() => inputRef.current?.click()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Choose files
            </button>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: "1rem" }}>
              {["PDF", "DOC", "DOCX"].map((t) => (
                <span key={t} style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "1px 7px" }}>
                  {t}
                </span>
              ))}
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx"
              style={{ display: "none" }}
              onChange={onFileChange}
            />
          </div>
        ) : (
          /* Compact Drop Zone */
          <div
            style={{
              border: dragOver ? "1.5px dashed var(--accent)" : "1.5px dashed var(--border)",
              borderRadius: 10,
              padding: "1.35rem 1rem",
              textAlign: "center",
              background: dragOver ? "var(--accent-dim)" : "var(--bg-surface)",
              cursor: "pointer",
              marginBottom: "1.25rem",
              transition: "all 0.2s ease",
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
              Drop files here or{" "}
              <span style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 3 }}>choose files</span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Price lists, brochures, FAQs, policies
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx"
              style={{ display: "none" }}
              onChange={onFileChange}
            />
          </div>
        )}

        {/* Uploading progress indicator */}
        {uploading && (
          <div style={{ margin: "0.75rem 0", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }} aria-hidden><path d="M21 12a9 9 0 1 1-3-6.7" /></svg>
            Uploading and processing documents... Please wait.
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {files.map((f) => {
              const shortDate = formatShortDate(f.uploaded_at);
              const isDeleting = deletingFilename === f.filename;
              return (
                <div
                  key={f.filename}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.7rem 0.85rem",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                    <div style={{ color: "var(--text-secondary)", flexShrink: 0, width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.filename}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        {f.size}
                        {shortDate ? ` · added ${shortDate}` : ""}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(f.filename)}
                    disabled={isDeleting}
                    aria-label={`Remove ${f.filename}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: isDeleting ? "not-allowed" : "pointer",
                      padding: "0.45rem",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.15s, color 0.15s",
                      opacity: isDeleting ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
                      e.currentTarget.style.color = "var(--error)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          CARD 2: Your website
      ══════════════════════════════════════════════════════════ */}
      <div className="kn-card">
        {/* Card Header */}
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Your website
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            {!loading && websites.length === 0
              ? "Add the chat to your website and we'll read your public pages automatically (up to 25). Nothing else to set up."
              : "Your assistant reads the public pages of your website automatically."}
          </div>
        </div>

        {loading ? (
          <div
            role="status"
            aria-label="Loading your website"
            style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", gap: 14, alignItems: "center" }}
          >
            <SkeletonBlock width={40} height={40} radius={10} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <SkeletonBlock width="40%" height={14} />
              <SkeletonBlock width="25%" height={18} radius={999} />
            </div>
            <SkeletonBlock width={110} height={36} radius={10} />
          </div>
        ) : /* ── Case 1: No website connected yet (3-step setup) ── */
        websites.length === 0 ? (
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.7rem" }}>
                <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-card)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)" }}>1</span>
                <span>Add the chat to your website</span>
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.7rem" }}>
                <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-card)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)" }}>2</span>
                <span>We find your website by ourselves</span>
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.7rem" }}>
                <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-card)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)" }}>3</span>
                <span>Your assistant learns your pages</span>
              </div>
            </div>

            <Link
              href="/workspace/deploy"
              style={{
                display: "inline-block",
                padding: "0.62rem 1.25rem",
                borderRadius: 10,
                background: "var(--ink)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.88rem",
                textDecoration: "none",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              Add chat to my website
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#f59e0b",
                  animation: "pulseDot 2s infinite ease-in-out",
                }}
              />
              Waiting for the chat to appear on your website
            </div>
          </div>
        ) : (
          /* ── Case 2: Website connected ── */
          primaryWebsite && (
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "1.25rem",
                marginBottom: "1.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                {/* Left: Domain & Status */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", minWidth: 0 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: primaryWebsite.indexing_status === "ready" ? "rgba(16, 185, 129, 0.12)" : "var(--accent-dim)",
                      color: primaryWebsite.indexing_status === "ready" ? "#10b981" : "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {primaryWebsite.domain}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem", fontSize: "0.82rem" }}>
                      {/* Status Tag */}
                      {primaryWebsite.indexing_status === "ready" && (
                        <>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#10b981", fontWeight: 600 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
                            Up to date
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>·</span>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {primaryWebsite.indexed_pages_count} {primaryWebsite.indexed_pages_count === 1 ? "page" : "pages"}
                            {primaryWebsite.last_indexed_at ? ` · last read ${formatDateTime(primaryWebsite.last_indexed_at)}` : ""}
                          </span>
                        </>
                      )}

                      {(primaryWebsite.indexing_status === "indexing" || primaryWebsite.indexing_status === "queued") && (
                        <span className="kn-reading">
                          <span className="kn-reading-dot" aria-hidden="true" />
                          Reading your website…
                        </span>
                      )}

                      {primaryWebsite.indexing_status === "stale" && (
                        <span style={{ padding: "2px 8px", borderRadius: 9999, background: "rgba(245, 158, 11, 0.15)", color: "#d97706", fontWeight: 600 }}>
                          Out of date
                        </span>
                      )}

                      {primaryWebsite.indexing_status === "failed" && (
                        <span style={{ padding: "2px 8px", borderRadius: 9999, background: "rgba(239, 68, 68, 0.15)", color: "var(--error)", fontWeight: 600 }}>
                          {"Couldn't read"}
                        </span>
                      )}

                      {primaryWebsite.indexing_status === "unindexed" && (
                        <span style={{ padding: "2px 8px", borderRadius: 9999, background: "var(--bg-hover)", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Not read yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} data-menu-root>
                  {primaryWebsite.indexing_status === "failed" ? (
                    <button
                      onClick={() => void handleReindexWebsite(primaryWebsite.id)}
                      disabled={reindexingWebsiteId === primaryWebsite.id}
                      style={{
                        padding: "0.45rem 0.95rem",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Try again
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleReindexWebsite(primaryWebsite.id)}
                      disabled={primaryWebsite.indexing_status === "indexing" || primaryWebsite.indexing_status === "queued" || reindexingWebsiteId === primaryWebsite.id}
                      style={{
                        padding: "0.45rem 0.95rem",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        fontSize: "0.82rem",
                        cursor: (primaryWebsite.indexing_status === "indexing" || primaryWebsite.indexing_status === "queued") ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        opacity: (primaryWebsite.indexing_status === "indexing" || primaryWebsite.indexing_status === "queued") ? 0.6 : 1,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>↻</span> Read again
                    </button>
                  )}

                  {/* Three dots menu */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setWebsiteMenuOpen(!websiteMenuOpen)}
                      aria-label="More options"
                      style={{
                        padding: "0.45rem 0.65rem",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: websiteMenuOpen ? "var(--bg-hover)" : "var(--bg-card)",
                        color: "var(--text-primary)",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      ···
                    </button>

                    {websiteMenuOpen && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "calc(100% + 4px)",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          boxShadow: "var(--shadow-md)",
                          padding: "0.35rem",
                          zIndex: 20,
                          minWidth: 140,
                        }}
                      >
                        <button
                          onClick={() => {
                            setWebsiteMenuOpen(false);
                            setConfirmDeleteWebsite(primaryWebsite);
                          }}
                          disabled={deletingWebsiteId === primaryWebsite.id}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.5rem 0.75rem",
                            borderRadius: 5,
                            border: "none",
                            background: "transparent",
                            color: "var(--error)",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status-specific details under main row */}
              {(primaryWebsite.indexing_status === "indexing" || primaryWebsite.indexing_status === "queued") && (
                <div style={{ marginTop: "1rem" }}>
                  <div className="kn-progress" role="progressbar" aria-label="Reading your website">
                    <div className="kn-progress-bar" />
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>
                    This takes a few minutes. You can leave this page.
                  </div>
                </div>
              )}

              {primaryWebsite.indexing_status === "stale" && (
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
                  Your website has changed since we last read it.
                </div>
              )}

              {primaryWebsite.indexing_status === "failed" && (
                <div
                  style={{
                    marginTop: "0.85rem",
                    padding: "0.7rem 0.85rem",
                    borderRadius: 10,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    fontSize: "0.82rem",
                    lineHeight: 1.55,
                    color: "var(--text-secondary)",
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>We couldn&apos;t read your website last time.</strong>{" "}
                  {/javascript|meaningful content/i.test(primaryWebsite.last_crawl_error || "")
                    ? "It loads its content slowly, and we stopped before it appeared. Press Try again."
                    : "Make sure it's online and public, then press Try again."}
                </div>
              )}
            </div>
          )
        )}

        {/* ── Extra Pages Section ── */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Extra pages
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                Any other public page you want your assistant to read · {manualWebUrls.length} of 50 used
              </div>
            </div>

            <button
              onClick={() => setShowManualUrl(!showManualUrl)}
              style={{
                background: showManualUrl ? "var(--bg-hover)" : "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "0.45rem 0.95rem",
                borderRadius: 8,
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              {showManualUrl ? "✕ Cancel" : "+ Add a single page"}
            </button>
          </div>

          {/* Add page inline form */}
          {showManualUrl && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <input
                  type="url"
                  value={webUrlInput}
                  onChange={(e) => setWebUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleIndexUrl();
                  }}
                  placeholder="https://example.com/pricing"
                  disabled={webIndexing}
                  style={{
                    flex: 1,
                    minWidth: 240,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                    fontFamily: "inherit",
                    fontSize: "0.88rem",
                    padding: "0.6rem 0.95rem",
                    outline: "none",
                    opacity: webIndexing ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={() => void handleIndexUrl()}
                  disabled={webIndexing || !webUrlInput.trim()}
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--ink)",
                    color: "#fff",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor: webIndexing || !webUrlInput.trim() ? "not-allowed" : "pointer",
                    opacity: webIndexing || !webUrlInput.trim() ? 0.55 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {webIndexing ? "Adding…" : "Add page"}
                </button>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", fontSize: "0.82rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={forceReindex}
                  onChange={(e) => setForceReindex(e.target.checked)}
                  style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                />
                If this page was added before, read it again
              </label>
            </div>
          )}

          {/* Extra pages list */}
          {manualWebUrls.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {manualWebUrls.map((u) => {
                const isDeleting = deletingUrl === u.url;
                const isReindexing = reindexingUrl === u.url;
                const shortDate = formatShortDate(u.indexed_at);
                const isMenuOpen = openUrlMenu === u.url;

                return (
                  <div
                    key={u.url}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.75rem 1rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          textDecoration: "none",
                          wordBreak: "break-all",
                        }}
                      >
                        {u.url}
                      </a>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        {shortDate ? `Read ${shortDate}` : "Read"}
                      </div>
                    </div>

                    {/* Desktop actions: Read again button + red trash icon button */}
                    <div className="desktop-only-actions" style={{ alignItems: "center", gap: "0.4rem" }}>
                      <button
                        onClick={() => void handleReindexUrl(u.url)}
                        disabled={isReindexing || isDeleting}
                        style={{
                          padding: "0.35rem 0.75rem",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--bg-card)",
                          color: "var(--text-primary)",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          cursor: isReindexing || isDeleting ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          opacity: isReindexing || isDeleting ? 0.5 : 1,
                        }}
                      >
                        {isReindexing ? "Reading…" : "Read again"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteUrl(u.url)}
                        disabled={isDeleting || isReindexing}
                        aria-label={`Remove ${u.url}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--error)",
                          cursor: isDeleting || isReindexing ? "not-allowed" : "pointer",
                          padding: "0.45rem",
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isDeleting || isReindexing ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    {/* Mobile menu: ··· dropdown */}
                    <div className="mobile-only-menu" style={{ position: "relative" }} data-menu-root>
                      <button
                        onClick={() => setOpenUrlMenu(isMenuOpen ? null : u.url)}
                        aria-label="Page options"
                        style={{
                          padding: "0.35rem 0.6rem",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: isMenuOpen ? "var(--bg-hover)" : "var(--bg-card)",
                          color: "var(--text-primary)",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        ···
                      </button>

                      {isMenuOpen && (
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "calc(100% + 4px)",
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            boxShadow: "var(--shadow-md)",
                            padding: "0.35rem",
                            zIndex: 20,
                            minWidth: 120,
                          }}
                        >
                          <button
                            onClick={() => {
                              setOpenUrlMenu(null);
                              void handleReindexUrl(u.url);
                            }}
                            disabled={isReindexing || isDeleting}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.45rem 0.65rem",
                              borderRadius: 5,
                              border: "none",
                              background: "transparent",
                              color: "var(--text-primary)",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Read again
                          </button>
                          <button
                            onClick={() => {
                              setOpenUrlMenu(null);
                              setConfirmDeleteUrl(u.url);
                            }}
                            disabled={isDeleting || isReindexing}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.45rem 0.65rem",
                              borderRadius: 5,
                              border: "none",
                              background: "transparent",
                              color: "var(--error)",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.85rem" }}>
            Only public pages can be added.
          </div>
        </div>
      </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DIALOGS & MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Delete File Confirm Dialog */}
      <ConfirmDialog
        open={deleteFilename !== null}
        tone="danger"
        eyebrow="Remove file"
        title="Remove this file?"
        description="Your assistant will no longer use this file to answer questions."
        confirmLabel="Remove file"
        busy={deletingFilename !== ""}
        onCancel={() => setDeleteFilename(null)}
        onConfirm={() => void confirmDelete()}
      >
        {deleteFilename && (
          <div style={dialogSummaryStyle}>
            <span style={dialogLabelStyle}>Filename</span>
            <strong style={dialogValueStyle}>{deleteFilename}</strong>
          </div>
        )}
      </ConfirmDialog>

      {/* Overwrite File Confirm Dialog */}
      <ConfirmDialog
        open={overwriteFile !== null}
        tone="warning"
        eyebrow="File already exists"
        title="Overwrite existing file?"
        description="A file with this name already exists. Overwriting will replace it with the new version."
        confirmLabel="Overwrite file"
        cancelLabel="Skip file"
        onCancel={() => resolveOverwriteDecision(false)}
        onConfirm={() => resolveOverwriteDecision(true)}
      >
        {overwriteFile && (
          <div style={dialogSummaryStyle}>
            <span style={dialogLabelStyle}>Filename</span>
            <strong style={dialogValueStyle}>{overwriteFile.name}</strong>
          </div>
        )}
      </ConfirmDialog>

      {/* Delete URL Confirm Dialog */}
      <ConfirmDialog
        open={confirmDeleteUrl !== null}
        tone="danger"
        eyebrow="Remove page"
        title="Remove this page?"
        description="Your assistant will no longer use content from this page to answer questions."
        confirmLabel="Remove page"
        busy={deletingUrl !== null}
        onCancel={() => setConfirmDeleteUrl(null)}
        onConfirm={() => void handleDeleteWebUrl()}
      >
        {confirmDeleteUrl && (
          <div style={dialogSummaryStyle}>
            <span style={dialogLabelStyle}>URL</span>
            <strong style={{ ...dialogValueStyle, color: "var(--accent)" }}>{confirmDeleteUrl}</strong>
          </div>
        )}
      </ConfirmDialog>

      {/* Disconnect Website Confirm Dialog */}
      <ConfirmDialog
        open={confirmDeleteWebsite !== null}
        tone="danger"
        eyebrow="Disconnect website"
        title="Disconnect your website?"
        description="Your assistant will stop using the pages from this website."
        confirmLabel="Disconnect website"
        busy={deletingWebsiteId !== null}
        onCancel={() => setConfirmDeleteWebsite(null)}
        onConfirm={() => void handleDeleteWebsite()}
      >
        {confirmDeleteWebsite && (
          <div style={dialogSummaryStyle}>
            <span style={dialogLabelStyle}>Website domain</span>
            <strong style={{ ...dialogValueStyle, color: "var(--error)" }}>{confirmDeleteWebsite.domain}</strong>
          </div>
        )}
      </ConfirmDialog>

      {/* Plan Upgrade Prompt Modal */}
      <ConfirmDialog
        open={showUpgradeModal}
        tone="neutral"
        eyebrow="Subscription Upgrade"
        title={isExpired ? "Plan Expired — Upgrade to Continue" : "Upgrade Plan for More Storage"}
        description={upgradeModalReason || "Upgrade your subscription to unlock document uploads and higher limits."}
        confirmLabel="View Pricing & Upgrade"
        cancelLabel="Dismiss"
        onCancel={() => setShowUpgradeModal(false)}
        onConfirm={() => {
          setShowUpgradeModal(false);
          router.push("/workspace/billing");
        }}
      >
        <div style={dialogSummaryStyle}>
          <span style={dialogLabelStyle}>Current Plan</span>
          <strong style={{ ...dialogValueStyle, color: isExpired ? "var(--error)" : "var(--accent)" }}>
            {subStatus?.plan?.name || "Trial Plan"} ({isExpired ? "Expired" : `${files.length}/${maxKbFiles} Files Used`})
          </strong>
        </div>
      </ConfirmDialog>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            padding: "0.75rem 1.1rem 0.75rem 0.8rem",
            borderRadius: 12,
            fontWeight: 500,
            fontSize: "0.86rem",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            maxWidth: 380,
            zIndex: 9999,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background:
                toast.type === "error" ? "rgba(239,68,68,0.1)" : toast.type === "success" ? "rgba(16,185,129,0.1)" : "var(--bg-sidebar)",
              color: toast.type === "error" ? "var(--error)" : toast.type === "success" ? "var(--success)" : "var(--text-primary)",
            }}
          >
            {toast.type === "info" ? (
              <Spinner size={15} stroke={2.2} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {toast.type === "success" ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 8v5M12 16.5v.01" />}
              </svg>
            )}
          </span>
          <span role="status">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

const dialogSummaryStyle: React.CSSProperties = {
  padding: "0.9rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
};

const dialogLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.35rem",
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const dialogValueStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  overflowWrap: "anywhere",
};