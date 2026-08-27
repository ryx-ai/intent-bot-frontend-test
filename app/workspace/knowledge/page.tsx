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

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <header style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.6rem", fontWeight: 800, color: "#fff" }}>
            Knowledge Lake
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Upload and safely store unstructured documents (PDF, Word) for your AI assistant.
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
                    background: isExpired ? "rgba(239, 68, 68, 0.18)" : "rgba(138, 100, 233, 0.15)",
                    color: isExpired ? "#f87171" : "#a78bfa",
                    fontWeight: 700,
                  }}
                >
                  {subStatus.plan?.name || "Trial Plan"}
                </span>
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: isAtCapacity ? "#f87171" : "#fff" }}>
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
          <div style={{ color: "#d1d5db", fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.5rem" }}>
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
