"use client";

import { useEffect, useState, useRef, DragEvent, ChangeEvent, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "../_components/ConfirmDialog";

interface KBFile {
  filename: string;
  size: string;
  uploaded_at: number;
}

interface WebUrl {
  url: string;
  chunk_count: number;
  indexed_at: string | null;
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

type KnowledgeTab = "documents" | "web";

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

interface UploadResult {
  filename: string;
  status: "success" | "failed" | "skipped";
  error?: string;
}

export default function KnowledgeLakePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("documents");

  // ── Documents state ──
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

  // ── Tenant Websites state (V5 Architecture) ──
  const [websites, setWebsites] = useState<TenantWebsite[]>([]);
  const [websitesLoading, setWebsitesLoading] = useState(false);
  const [authorizingWebsite, setAuthorizingWebsite] = useState(false);
  const [reindexingWebsiteId, setReindexingWebsiteId] = useState<number | null>(null);
  const [websiteUrlInput, setWebsiteUrlInput] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [confirmDeleteWebsite, setConfirmDeleteWebsite] = useState<TenantWebsite | null>(null);
  const [deletingWebsiteId, setDeletingWebsiteId] = useState<number | null>(null);

  // ── Web URL state ──
  const [webUrls, setWebUrls] = useState<WebUrl[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webIndexing, setWebIndexing] = useState(false);
  const [webUrlInput, setWebUrlInput] = useState("");
  const [forceReindex, setForceReindex] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [confirmDeleteUrl, setConfirmDeleteUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [filesRes, statusRes] = await Promise.allSettled([
        api.get<{ files: KBFile[] }>("/api/knowledge/files"),
        api.get<SubscriptionStatus>("/api/payments/subscription-status"),
      ]);

      if (filesRes.status === "fulfilled") {
        setFiles(filesRes.value.files || []);
      }
      if (statusRes.status === "fulfilled") {
        setSubStatus(statusRes.value);
      }
    } catch (err) {
      console.error("Failed to load knowledge lake data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Web URL & Website data loaders ──
  const loadWebUrls = useCallback(async () => {
    setWebLoading(true);
    try {
      const res = await api.get<{ urls: WebUrl[] }>("/api/knowledge/web/urls");
      setWebUrls(res.urls || []);
    } catch (err) {
      console.error("Failed to load web URLs", err);
    } finally {
      setWebLoading(false);
    }
  }, []);

  const loadWebsites = useCallback(async () => {
    setWebsitesLoading(true);
    try {
      const res = await api.get<{ websites: TenantWebsite[] }>("/api/knowledge/websites");
      setWebsites(res.websites || []);
    } catch (err) {
      console.error("Failed to load tenant websites", err);
    } finally {
      setWebsitesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "web") {
      void loadWebUrls();
      void loadWebsites();
    }
  }, [activeTab, loadWebUrls, loadWebsites]);

  // Polling for active crawl jobs
  useEffect(() => {
    if (activeTab !== "web") return;
    const hasActiveJob = websites.some((w) => w.indexing_status === "indexing" || w.indexing_status === "queued");
    if (!hasActiveJob) return;
    const interval = setInterval(() => {
      void loadWebsites();
      void loadWebUrls();
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, websites, loadWebsites, loadWebUrls]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [filesRes, statusRes] = await Promise.allSettled([
          api.get<{ files: KBFile[] }>("/api/knowledge/files"),
          api.get<SubscriptionStatus>("/api/payments/subscription-status"),
        ]);

        if (cancelled) return;
        if (filesRes.status === "fulfilled") {
          setFiles(filesRes.value.files || []);
        }
        if (statusRes.status === "fulfilled") {
          setSubStatus(statusRes.value);
        }
      } catch (err) {
        console.error("Failed to load knowledge lake data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isTrial = subStatus?.subscription_status === "trial";
  const isExpired = subStatus ? !subStatus.is_active : false;
  const maxKbFiles = subStatus?.plan?.max_kb_files ?? 3;
  const isUnlimited = maxKbFiles === -1;
  const isAtCapacity = !isUnlimited && files.length >= maxKbFiles;

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

    // Check if subscription expired
    if (isExpired) {
      setUpgradeModalReason("Your subscription or free trial has expired. Upgrade your plan to reactivate document uploads and enable your AI bot.");
      setShowUpgradeModal(true);
      return;
    }

    // Check if at storage capacity
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

    // Check if adding these files would exceed quota
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

  // ── Delete ──
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

  // ── Tenant Website handlers (V5 Architecture) ──
  async function handleAuthorizeWebsite() {
    const url = websiteUrlInput.trim();
    if (!url) {
      showToast("Please enter your website URL.", "error");
      return;
    }
    if (!permissionConfirmed) {
      showToast("Please check the confirmation box to authorize indexing.", "error");
      return;
    }
    setAuthorizingWebsite(true);
    try {
      await api.post("/api/knowledge/websites", {
        url,
        confirmed: true,
        is_primary: true,
      });
      showToast("Website authorized! Indexing will trigger when your widget loads, or you can start now.", "success");
      setWebsiteUrlInput("");
      setPermissionConfirmed(false);
      await loadWebsites();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to authorize website";
      showToast(msg, "error");
    } finally {
      setAuthorizingWebsite(false);
    }
  }

  async function handleReindexWebsite(id: number) {
    setReindexingWebsiteId(id);
    try {
      await api.post(`/api/knowledge/websites/${id}/reindex`);
      showToast("Crawl queued! Crawling and indexing website pages in background...", "info");
      await loadWebsites();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to queue re-index";
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
      showToast(`Website ${site.domain} disconnected and chunks purged.`, "success");
      await loadWebsites();
      await loadWebUrls();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to disconnect website";
      showToast(msg, "error");
    } finally {
      setDeletingWebsiteId(null);
    }
  }

  // ── Web URL handlers ──
  async function handleIndexUrl() {
    const url = webUrlInput.trim();
    if (!url) { showToast("Please enter a URL.", "error"); return; }
    setWebIndexing(true);
    try {
      const res = await api.post<{ status: string; url: string; chunk_count: number; message?: string }>(
        "/api/knowledge/web/index",
        { url, force_reindex: forceReindex }
      );
      if (res.status === "already_indexed") {
        showToast(`Already indexed (${res.chunk_count} chunks). Enable "Force re-index" to refresh.`, "info");
      } else {
        showToast(`Indexed! ${res.chunk_count} chunks stored from ${res.url}`, "success");
        setWebUrlInput("");
        setForceReindex(false);
        await loadWebUrls();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to index URL";
      showToast(msg, "error");
    } finally {
      setWebIndexing(false);
    }
  }

  async function handleReindexUrl(url: string) {
    setWebIndexing(true);
    try {
      const res = await api.post<{ status: string; url: string; chunk_count: number }>(
        "/api/knowledge/web/urls/reindex",
        { url }
      );
      showToast(`Re-indexed! ${res.chunk_count} fresh chunks stored.`, "success");
      await loadWebUrls();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Re-index failed";
      showToast(msg, "error");
    } finally {
      setWebIndexing(false);
    }
  }

  async function handleDeleteWebUrl() {
    if (!confirmDeleteUrl) return;
    const url = confirmDeleteUrl;
    setDeletingUrl(url);
    setConfirmDeleteUrl(null);
    try {
      // Backend DELETE expects a JSON body {url} — use raw fetch because api.delete doesn't forward a body
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
      showToast(`Deleted. ${data.chunks_removed ?? 0} chunks removed.`, "success");
      await loadWebUrls();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
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

  // ── Tab styles ──
  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.55rem 1.1rem",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.88rem",
    cursor: "pointer",
    border: active ? "1px solid rgba(138,100,233,0.4)" : "1px solid transparent",
    background: active ? "rgba(138,100,233,0.15)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-muted)",
    transition: "all 0.18s ease",
    fontFamily: "inherit",
  });

  const primaryWebsite = websites.find((w) => w.is_primary) || websites[0];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <header style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.6rem", fontWeight: 800, color: "#fff" }}>
            Knowledge Lake
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {activeTab === "documents"
              ? "Upload and safely store unstructured documents (PDF, Word) for your AI assistant."
              : "Index public web pages into the RAG pipeline — your chatbot will use this content automatically."}
          </p>
        </div>

        {/* Quota & Plan Status Card */}
        {subStatus && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.25rem",
              background: "var(--bg-card)",
              border: isExpired ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.75rem 1.25rem",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Storage Quota
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: 4,
                    background: isExpired ? "rgba(239, 68, 68, 0.18)" : "var(--accent-light)",
                    color: isExpired ? "#f87171" : "var(--accent)",
                    fontWeight: 700,
                  }}
                >
                  {subStatus.plan?.name || "Trial Plan"}
                </span>
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: isAtCapacity ? "#f87171" : "var(--text-primary)" }}>
                {isUnlimited ? `${files.length} files (Unlimited)` : `${files.length} / ${maxKbFiles} files used`}
              </div>
            </div>

            {(isExpired || isAtCapacity || isTrial) && (
              <Link
                href="/workspace/billing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: isExpired ? "rgba(239, 68, 68, 0.15)" : "var(--accent)",
                  color: isExpired ? "#f87171" : "#fff",
                  border: isExpired ? "1px solid rgba(239, 68, 68, 0.35)" : "none",
                  padding: "0.5rem 0.9rem",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                }}
              >
                ⚡ {isExpired ? "Upgrade to Reactivate" : "Upgrade Plan"}
              </Link>
            )}
          </div>
        )}
      </header>

      {/* ── Tab Switcher ── */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
        <button style={tabStyle(activeTab === "documents")} onClick={() => setActiveTab("documents")}>
          📄 Documents
          <span style={{ marginLeft: 4, padding: "1px 8px", borderRadius: 9999, background: activeTab === "documents" ? "rgba(138,100,233,0.25)" : "rgba(255,255,255,0.06)", color: activeTab === "documents" ? "var(--accent)" : "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700 }}>{files.length}</span>
        </button>
        <button style={tabStyle(activeTab === "web")} onClick={() => setActiveTab("web")}>
          🌐 Website & Web URLs
          <span style={{ marginLeft: 4, padding: "1px 8px", borderRadius: 9999, background: activeTab === "web" ? "rgba(138,100,233,0.25)" : "rgba(255,255,255,0.06)", color: activeTab === "web" ? "var(--accent)" : "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700 }}>
            {websites.length > 0 ? (primaryWebsite?.indexed_pages_count || 1) + webUrls.length : webUrls.length}
          </span>
        </button>
      </div>

      {/* ══════════════ WEB URLS & WEBSITE TAB (V5) ══════════════ */}
      {activeTab === "web" && (
        <div>
          {/* SECTION 1: Authorized Tenant Website */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem", marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>🌐</span> Authorized Workspace Website
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem", maxWidth: 650, lineHeight: 1.5 }}>
                  Authorize your company website. When your RYX chat widget loads on your site, it will automatically crawl and index your internal pages (up to 25 pages) for instant RAG responses.
                </div>
              </div>
            </div>

            {primaryWebsite ? (
              /* Authorized Website Card */
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 42, height: 42, borderRadius: 8, background: "rgba(138,100,233,0.15)", border: "1px solid rgba(138,100,233,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>
                      🌐
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <a href={primaryWebsite.root_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}>
                          {primaryWebsite.domain}
                        </a>
                        <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: 9999, background: "rgba(138,100,233,0.2)", color: "var(--accent, #8a64e9)", fontWeight: 700 }}>
                          ⚡ Primary
                        </span>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                        {primaryWebsite.root_url}
                      </div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div>
                    {primaryWebsite.indexing_status === "ready" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 9999, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontSize: "0.82rem", fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                        Indexed & Ready ({primaryWebsite.indexed_pages_count} pages • {primaryWebsite.total_chunks_count} chunks)
                      </span>
                    )}
                    {primaryWebsite.indexing_status === "indexing" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 9999, background: "rgba(138,100,233,0.2)", border: "1px solid rgba(138,100,233,0.4)", color: "var(--accent, #8a64e9)", fontSize: "0.82rem", fontWeight: 700 }}>
                        <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>🔄</span>
                        Crawling & Indexing Pages...
                      </span>
                    )}
                    {primaryWebsite.indexing_status === "queued" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 9999, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", fontSize: "0.82rem", fontWeight: 700 }}>
                        ⏳ Queued for Background Crawl
                      </span>
                    )}
                    {primaryWebsite.indexing_status === "unindexed" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 9999, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 600 }}>
                        ℹ️ Authorized — Waiting for widget load to auto-crawl
                      </span>
                    )}
                    {primaryWebsite.indexing_status === "stale" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 9999, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", fontSize: "0.82rem", fontWeight: 700 }}>
                        ⚠️ Stale Index (Will refresh on next widget load)
                      </span>
                    )}
                    {primaryWebsite.indexing_status === "failed" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 9999, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--error, #ef4444)", fontSize: "0.82rem", fontWeight: 700 }}>
                        ❌ Crawl Failed ({primaryWebsite.last_crawl_error || "Check connectivity"})
                      </span>
                    )}
                  </div>
                </div>

                {/* Details and Actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <span>Authorized Origins: </span>
                    <strong style={{ color: "var(--text-secondary)" }}>
                      {primaryWebsite.allowed_origins.join(", ")}
                    </strong>
                    {primaryWebsite.last_indexed_at && (
                      <span style={{ marginLeft: "1rem" }}>
                        Last Crawled: {new Date(primaryWebsite.last_indexed_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => void handleReindexWebsite(primaryWebsite.id)}
                      disabled={primaryWebsite.indexing_status === "indexing" || primaryWebsite.indexing_status === "queued" || reindexingWebsiteId === primaryWebsite.id}
                      style={{
                        background: "rgba(138,100,233,0.12)",
                        border: "1px solid rgba(138,100,233,0.3)",
                        color: "var(--accent, #8a64e9)",
                        padding: "0.45rem 0.9rem",
                        borderRadius: 6,
                        cursor: primaryWebsite.indexing_status === "indexing" ? "not-allowed" : "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        fontFamily: "inherit",
                        opacity: primaryWebsite.indexing_status === "indexing" ? 0.6 : 1,
                        transition: "all 0.18s",
                      }}
                    >
                      🔄 Re-crawl Website Now
                    </button>
                    <button
                      onClick={() => setConfirmDeleteWebsite(primaryWebsite)}
                      disabled={deletingWebsiteId === primaryWebsite.id}
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        color: "var(--error, #ef4444)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        padding: "0.45rem 0.9rem",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        transition: "all 0.2s",
                      }}
                    >
                      🗑 Disconnect Website
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Website Authorization Form */
              <div style={{ background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.5rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
                  <input
                    type="url"
                    value={websiteUrlInput}
                    onChange={(e) => setWebsiteUrlInput(e.target.value)}
                    placeholder="https://yourcompany.com"
                    disabled={authorizingWebsite}
                    style={{
                      flex: 1,
                      minWidth: 280,
                      background: "rgba(0,0,0,0.2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                      fontSize: "0.92rem",
                      padding: "0.7rem 1rem",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => void handleAuthorizeWebsite()}
                    disabled={authorizingWebsite || !websiteUrlInput.trim() || !permissionConfirmed}
                    style={{
                      padding: "0.7rem 1.4rem",
                      borderRadius: 8,
                      border: "none",
                      background: "var(--accent, #8a64e9)",
                      color: "#fff",
                      fontFamily: "inherit",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      cursor: !permissionConfirmed || !websiteUrlInput.trim() || authorizingWebsite ? "not-allowed" : "pointer",
                      opacity: !permissionConfirmed || !websiteUrlInput.trim() || authorizingWebsite ? 0.55 : 1,
                      transition: "all 0.18s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {authorizingWebsite ? "Authorizing…" : "Save & Authorize Website"}
                  </button>
                </div>

                {/* Explicit Admin Confirmation Checkbox (V5 Mandatory Gate) */}
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.86rem", color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.4 }}>
                  <input
                    type="checkbox"
                    checked={permissionConfirmed}
                    onChange={(e) => setPermissionConfirmed(e.target.checked)}
                    style={{ accentColor: "var(--accent, #8a64e9)", width: 16, height: 16, marginTop: 2 }}
                  />
                  <span>
                    <strong>I confirm that I own or have permission to index this website.</strong>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2 }}>
                      Explicit tenant confirmation is required before automatic website crawling begins.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* SECTION 2: Single Manual URL Indexing */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "2rem" }}>
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Index a Standalone Page</div>
              <div style={{ fontSize: "0.83rem", color: "var(--text-muted)" }}>Paste any specific article or single landing page URL — it will be scraped and added to your chatbot knowledge.</div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <input
                type="url"
                value={webUrlInput}
                onChange={(e) => setWebUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleIndexUrl(); }}
                placeholder="https://example.com/pricing"
                disabled={webIndexing}
                style={{
                  flex: 1, minWidth: 260,
                  background: "var(--bg-surface, #1a1a27)", border: "1px solid var(--border)",
                  borderRadius: 8, color: "var(--text-primary)", fontFamily: "inherit",
                  fontSize: "0.9rem", padding: "0.65rem 1rem", outline: "none",
                  opacity: webIndexing ? 0.6 : 1,
                }}
              />
              <button
                onClick={() => void handleIndexUrl()}
                disabled={webIndexing || !webUrlInput.trim()}
                style={{
                  padding: "0.65rem 1.35rem", borderRadius: 8, border: "none",
                  background: "var(--accent, #8a64e9)", color: "#fff", fontFamily: "inherit",
                  fontWeight: 700, fontSize: "0.9rem",
                  cursor: webIndexing || !webUrlInput.trim() ? "not-allowed" : "pointer",
                  opacity: webIndexing || !webUrlInput.trim() ? 0.55 : 1,
                  transition: "opacity 0.18s",
                }}
              >
                {webIndexing ? "Indexing…" : "Index Page"}
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.9rem", fontSize: "0.83rem", color: "var(--text-muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={forceReindex}
                onChange={(e) => setForceReindex(e.target.checked)}
                style={{ accentColor: "var(--accent, #8a64e9)", width: 14, height: 14 }}
              />
              Force re-index (replace existing chunks if this URL is already indexed)
            </label>
          </div>

          {/* Stats row */}
          {webUrls.length > 0 && (
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              {[
                { label: "Indexed URLs", value: String(webUrls.length), color: "var(--accent, #8a64e9)" },
                { label: "Total Chunks", value: String(webUrls.reduce((s, u) => s + u.chunk_count, 0)), color: "#10b981" },
                { label: "URL Quota", value: `${webUrls.length} / 50`, color: "#f59e0b" },
              ].map((s) => (
                <div key={s.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.9rem 1.2rem", flex: "1 1 120px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* URLs table */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr>
                  {(["Indexed Page URL", "Chunks", "Indexed On", ""] as const).map((h) => (
                    <th key={h} style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.78rem", padding: "0.9rem 1.25rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", textAlign: h === "" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {webLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-secondary)" }}>Loading indexed pages…</td></tr>
                ) : webUrls.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🌐</div>
                    No standalone pages indexed yet.
                  </td></tr>
                ) : (
                  webUrls.map((u) => {
                    const isDeleting = deletingUrl === u.url;
                    const dt = u.indexed_at ? new Date(u.indexed_at).toLocaleString() : "Unknown";
                    return (
                      <tr key={u.url} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "0.9rem 1.25rem", maxWidth: 400 }}>
                          <a href={u.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--accent, #8a64e9)", fontWeight: 500, fontSize: "0.88rem", textDecoration: "none", wordBreak: "break-all" }}>
                            {u.url}
                          </a>
                        </td>
                        <td style={{ padding: "0.9rem 1.25rem", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 9999, background: "rgba(138,100,233,0.12)", border: "1px solid rgba(138,100,233,0.22)", color: "var(--accent, #8a64e9)", fontSize: "0.78rem", fontWeight: 700 }}>
                            ⚡ {u.chunk_count} chunks
                          </span>
                        </td>
                        <td style={{ padding: "0.9rem 1.25rem", color: "var(--text-secondary)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>{dt}</td>
                        <td style={{ padding: "0.9rem 1.25rem", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => void handleReindexUrl(u.url)}
                              disabled={webIndexing || isDeleting}
                              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "0.3rem 0.75rem", borderRadius: 6, cursor: webIndexing ? "not-allowed" : "pointer", fontSize: "0.82rem", fontWeight: 600, fontFamily: "inherit", opacity: webIndexing || isDeleting ? 0.5 : 1, transition: "all 0.18s" }}
                              onMouseEnter={(e) => { if (!webIndexing) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; } }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                            >🔄 Re-index</button>
                            <button
                              onClick={() => setConfirmDeleteUrl(u.url)}
                              disabled={isDeleting || webIndexing}
                              style={{ background: "rgba(239,68,68,0.1)", color: "var(--error, #ef4444)", border: "1px solid rgba(239,68,68,0.2)", padding: "0.3rem 0.75rem", borderRadius: 6, cursor: isDeleting ? "not-allowed" : "pointer", fontSize: "0.82rem", fontWeight: 600, fontFamily: "inherit", opacity: isDeleting || webIndexing ? 0.5 : 1, transition: "all 0.2s" }}
                              onMouseEnter={(e) => { if (!isDeleting) { e.currentTarget.style.background = "var(--error, #ef4444)"; e.currentTarget.style.color = "#fff"; } }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "var(--error, #ef4444)"; }}
                            >{isDeleting ? "Removing…" : "🗑 Remove"}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Security note */}
          <p style={{ marginTop: "1rem", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            🔒 Private IPs, localhost, and non-HTTP(S) URLs are blocked (SSRF protection). Each tenant is limited to 50 indexed URLs. Pages that require JavaScript may need Playwright mode enabled on the server (<code>WEB_SCRAPER_USE_PLAYWRIGHT=true</code>).
          </p>

          {/* Delete URL Confirm Dialog */}
          <ConfirmDialog
            open={confirmDeleteUrl !== null}
            tone="danger"
            eyebrow="Remove indexed URL"
            title="Remove this URL?"
            description="All RAG chunks for this URL will be deleted. The chatbot will no longer use content from this page."
            confirmLabel="Remove URL"
            busy={deletingUrl !== null}
            onCancel={() => setConfirmDeleteUrl(null)}
            onConfirm={() => void handleDeleteWebUrl()}
          >
            {confirmDeleteUrl && (
              <div style={dialogSummaryStyle}>
                <span style={dialogLabelStyle}>URL</span>
                <strong style={{ ...dialogValueStyle, color: "var(--accent, #8a64e9)" }}>{confirmDeleteUrl}</strong>
              </div>
            )}
          </ConfirmDialog>

          {/* Disconnect Website Confirm Dialog */}
          <ConfirmDialog
            open={confirmDeleteWebsite !== null}
            tone="danger"
            eyebrow="Disconnect Website"
            title="Disconnect authorized website?"
            description="This will remove website authorization and delete all crawled pages and vector chunks for this domain. The chatbot will no longer use this website's content."
            confirmLabel="Disconnect Website"
            busy={deletingWebsiteId !== null}
            onCancel={() => setConfirmDeleteWebsite(null)}
            onConfirm={() => void handleDeleteWebsite()}
          >
            {confirmDeleteWebsite && (
              <div style={dialogSummaryStyle}>
                <span style={dialogLabelStyle}>Website Domain</span>
                <strong style={{ ...dialogValueStyle, color: "var(--error, #ef4444)" }}>{confirmDeleteWebsite.domain}</strong>
              </div>
            )}
          </ConfirmDialog>
        </div>
      )}

      {/* ══════════════ DOCUMENTS TAB ══════════════ */}
      {activeTab === "documents" && (<>

      {/* Expired / Inactive Notice Banner */}
      {isExpired && (
        <div
          style={{
            marginBottom: "1.75rem",
            padding: "1.1rem 1.35rem",
            borderRadius: 10,
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background: "linear-gradient(90deg, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0.04) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            boxShadow: "0 4px 20px rgba(239, 68, 68, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                flexShrink: 0,
              }}
            >
              ⚠️
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>
                {isTrial ? "3-Day Free Trial Expired — Uploads Locked" : "Subscription Inactive — Uploads Locked"}
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                Document uploading and live widget responses are paused. Upgrade to a paid plan to unlock uploads and reactivate your bot.
              </div>
            </div>
          </div>
          <Link
            href="/workspace/billing"
            style={{
              padding: "0.6rem 1.1rem",
              background: "#ef4444",
              color: "#fff",
              borderRadius: 6,
              fontSize: "0.88rem",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 2px 10px rgba(239, 68, 68, 0.4)",
            }}
          >
            Upgrade Plan Now →
          </Link>
        </div>
      )}

      {/* Capacity Warning Banner (when limit reached but not expired) */}
      {!isExpired && isAtCapacity && (
        <div
          style={{
            marginBottom: "1.75rem",
            padding: "1rem 1.25rem",
            borderRadius: 10,
            border: "1px solid rgba(245, 158, 11, 0.4)",
            background: "linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.03) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(245, 158, 11, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
                flexShrink: 0,
              }}
            >
              📦
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>
                Storage Limit Reached ({files.length}/{maxKbFiles} Files)
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.85rem", marginTop: "0.15rem" }}>
                You have used all {maxKbFiles} document slots in your {subStatus?.plan?.name || "Trial"}. Upgrade for up to 20 or unlimited files.
              </div>
            </div>
          </div>
          <Link
            href="/workspace/billing"
            style={{
              padding: "0.55rem 1rem",
              background: "rgba(245, 158, 11, 0.2)",
              color: "#fbbf24",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              borderRadius: 6,
              fontSize: "0.85rem",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Upgrade Storage
          </Link>
        </div>
      )}

      {/* Drop zone */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div
          style={{
            border: isExpired
              ? "2px dashed rgba(239, 68, 68, 0.35)"
              : isAtCapacity
              ? "2px dashed rgba(245, 158, 11, 0.35)"
              : dragOver
              ? "2px dashed var(--accent)"
              : "2px dashed var(--border)",
            borderRadius: 12,
            padding: "3rem 2rem",
            cursor: "pointer",
            transition: "all 0.3s ease",
            position: "relative",
            background: isExpired
              ? "rgba(239, 68, 68, 0.03)"
              : dragOver
              ? "rgba(107, 76, 255, 0.1)"
              : "rgba(255, 255, 255, 0.02)",
            textAlign: "center",
          }}
          onClick={() => {
            if (isExpired) {
              setUpgradeModalReason("Your trial or subscription is currently expired. Upgrade to resume document uploads.");
              setShowUpgradeModal(true);
              return;
            }
            if (isAtCapacity) {
              setUpgradeModalReason(`You have reached the maximum ${maxKbFiles} files for your plan. Upgrade to unlock more document uploads.`);
              setShowUpgradeModal(true);
              return;
            }
            inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isExpired && !isAtCapacity) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div style={{ fontSize: "3rem", color: isExpired ? "#ef4444" : "#6b7280", marginBottom: "1rem" }}>
            {isExpired ? "🔒" : isAtCapacity ? "📦" : "📁"}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            {isExpired
              ? "Uploads Locked (Plan Expired)"
              : isAtCapacity
              ? "Storage Capacity Reached"
              : "Drag & drop your files here"}
          </div>
          <div style={{ color: isExpired ? "#f87171" : "var(--text-muted)", fontSize: "0.88rem" }}>
            {isExpired
              ? "Click here to upgrade your plan and unlock document uploads"
              : isAtCapacity
              ? "Click to upgrade your plan for more document storage"
              : "or click to browse from your computer (PDF, Word • max 20MB)"}
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

        {uploading && (
          <div style={{ marginTop: "1rem", color: "var(--accent)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>🔄</span>
            Uploading and processing documents... Please wait.
          </div>
        )}
      </div>

      {/* Files table */}
      <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.82rem", padding: "1rem 1.25rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", width: "45%" }}>
                Filename
              </th>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.82rem", padding: "1rem 1.25rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Size</th>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.82rem", padding: "1rem 1.25rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Uploaded On</th>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.82rem", padding: "1rem 1.25rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-secondary)" }}
                >
                  Loading documents...
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📄</div>
                  Knowledge Lake is empty. Upload PDFs or Word documents to train your bot.
                </td>
              </tr>
            ) : (
              files.map((f) => {
                const date = new Date(f.uploaded_at * 1000).toLocaleString();
                return (
                  <tr
                    key={f.filename}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background-color 0.2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <td style={{ padding: "1rem 1.25rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      <span style={{ color: "var(--accent)", marginRight: 10 }}>📄</span>
                      {f.filename}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      {f.size}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      {date}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(f.filename)}
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "var(--error)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          padding: "0.35rem 0.8rem",
                          borderRadius: 6,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--error)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                          e.currentTarget.style.color = "var(--error)";
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={deleteFilename !== null}
        tone="danger"
        eyebrow="Remove document"
        title="Remove this file?"
        description="This removes the document from the Knowledge Lake. Future ingestion and AI chatbot queries will no longer use it."
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

      {/* Overwrite Confirmation Modal */}
      <ConfirmDialog
        open={overwriteFile !== null}
        tone="warning"
        eyebrow="File already exists"
        title="Overwrite existing document?"
        description="A document with this filename is already stored. Overwriting replaces the previous file with the new upload."
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

      {/* Plan Upgrade Prompt Modal */}
      <ConfirmDialog
        open={showUpgradeModal}
        tone="neutral"
        eyebrow="Subscription Upgrade"
        title={isExpired ? "Plan Expired — Upgrade to Continue" : "Upgrade Plan for More Storage"}
        description={upgradeModalReason || "Upgrade your subscription to unlock document uploads, higher limits, and full chatbot embedding."}
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
          <strong style={{ ...dialogValueStyle, color: isExpired ? "#ef4444" : "var(--accent)" }}>
            {subStatus?.plan?.name || "Trial Plan"} ({isExpired ? "Expired" : `${files.length}/${maxKbFiles} Files Used`})
          </strong>
        </div>
      </ConfirmDialog>

      {/* Modern Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background:
              toast.type === "error"
                ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"
                : toast.type === "success"
                ? "linear-gradient(135deg, #10b981 0%, #047857 100%)"
                : "linear-gradient(135deg, #8A64E9 0%, #6366f1 100%)",
            color: "#fff",
            padding: "0.9rem 1.4rem",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.9rem",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            zIndex: 9999,
          }}
        >
          <span>{toast.type === "error" ? "⚠️" : toast.type === "success" ? "✓" : "ℹ️"}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </>)}
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
