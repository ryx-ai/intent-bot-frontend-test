"use client";

import { useEffect, useState, useRef, DragEvent, ChangeEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "../_components/ConfirmDialog";

interface KBFile {
  filename: string;
  size: string;
  uploaded_at: number;
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
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState("");
  const [deleteFilename, setDeleteFilename] = useState<string | null>(null);
  const [deletingFilename, setDeletingFilename] = useState("");
  const [overwriteFile, setOverwriteFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overwriteDecisionRef = useRef<((overwrite: boolean) => void) | null>(
    null
  );

  // ── Fetch files ──
  async function fetchFiles() {
    try {
      const data = await api.get<{ files: KBFile[] }>("/api/knowledge/files");
      setFiles(data.files || []);
    } catch (err) {
      console.error("Failed to fetch files", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  // ── Upload one file. Recursively retries with overwrite=true if the user
  //    confirms a 409 conflict. ──
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
      // 409 conflict — backend returns {conflict: true} so the UI can offer
      // overwrite. Skip the prompt if we're already in the overwrite retry.
      if (err.status === 409 && !overwrite) {
        const ok = await requestOverwrite(file);
        if (ok) return uploadOne(file, true);
        return { filename: file.name, status: "skipped", error: "Already exists" };
      }
      let msg = "Upload failed";
      if (err.status === 400) msg = "Invalid file";
      else if (err.status === 413) msg = "File too large";
      else if (err.status === 415) msg = "Unsupported type";
      else if (err.status === 429) msg = "Too many uploads — try again later";
      else if (err.status === 501) msg = "DOCX conversion unavailable on server";
      else if (err.status >= 500) msg = "Server error";
      return { filename: file.name, status: "failed", error: msg };
    }
  }

  // ── Upload entry point. Filters drag-dropped files (the `accept`
  //    attribute on <input> doesn't apply to drag-drop), pre-checks size,
  //    then uploads valid files in parallel. ──
  async function handleUpload(fileList: FileList) {
    if (fileList.length === 0) return;

    const valid: File[] = [];
    const preRejected: UploadResult[] = [];

    for (const f of Array.from(fileList)) {
      const ext = fileExt(f.name);
      if (!ALLOWED_EXTS.includes(ext)) {
        preRejected.push({ filename: f.name, status: "failed", error: "Unsupported type" });
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        preRejected.push({ filename: f.name, status: "failed", error: "File too large (>20MB)" });
        continue;
      }
      valid.push(f);
    }

    if (valid.length === 0 && preRejected.length === 0) return;

    setUploading(true);

    // Run sequentially so any overwrite conflict can wait for the custom modal.
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
      showToast(`Uploaded ${successCount} file(s) successfully!`);
    } else if (successCount === 0 && skippedCount === 0) {
      // Surface the first specific reason rather than a generic count.
      showToast(`Upload failed: ${failed[0]?.error ?? "unknown error"}`);
    } else {
      const parts: string[] = [];
      if (successCount > 0) parts.push(`${successCount} uploaded`);
      if (failed.length > 0) parts.push(`${failed.length} failed (${failed[0].error})`);
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
      showToast(parts.join(", "));
    }
    fetchFiles();
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
      showToast("File Removed");
      fetchFiles();
    } catch {
      showToast("Failed to delete file");
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
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
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
          Knowledge Lake
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Upload and safely store unstructured documents (PDF, Word) for future
          ingestion.
        </p>
      </header>

      {/* Drop zone */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div
          style={{
            border: dragOver ? "2px dashed var(--accent)" : "2px dashed var(--border)",
            borderRadius: 8,
            padding: "3rem 2rem",
            cursor: "pointer",
            transition: "all 0.3s ease",
            position: "relative",
            background: dragOver ? "rgba(107, 76, 255, 0.1)" : "rgba(255, 255, 255, 0.02)",
            textAlign: "center",
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div style={{ fontSize: "3rem", color: "#6b7280", marginBottom: "1rem" }}>📁</div>
          <div style={{ color: "#d1d5db", fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            Drag & drop your files here
          </div>
          <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>
            or click to browse from your computer
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
          <div style={{ marginTop: "1rem", color: "var(--accent)", fontWeight: 600 }}>
            Uploading... Please wait.
          </div>
        )}
      </div>

      {/* Files table */}
      <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", width: "50%" }}>
                Filename
              </th>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Size</th>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>Uploaded On</th>
              <th style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}
                >
                  Loading documents...
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}
                >
                  Lake is empty. Drop some knowledge above.
                </td>
              </tr>
            ) : (
              files.map((f) => {
                const date = new Date(f.uploaded_at * 1000).toLocaleString();
                return (
                  <tr
                    key={f.filename}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background-color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <td style={{ padding: "1rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      <span style={{ color: "var(--text-secondary)", marginRight: 8 }}>📄</span>
                      {f.filename}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      {f.size}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      {date}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(f.filename)}
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "var(--error)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          padding: "0.3rem 0.7rem",
                          borderRadius: 4,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontSize: "0.85rem",
                          fontWeight: 500,
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

      <ConfirmDialog
        open={deleteFilename !== null}
        tone="danger"
        eyebrow="Remove document"
        title="Remove this file?"
        description="This removes the document from the Knowledge Lake. Future ingestion will no longer use it."
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

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: toast.toLowerCase().includes("fail") ? "var(--error)" : "var(--success)",
            color: "#fff",
            padding: "1rem 2rem",
            borderRadius: 4,
            fontWeight: 600,
            zIndex: 100,
          }}
        >
          {toast}
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
