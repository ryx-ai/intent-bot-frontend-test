"use client";

import { useEffect, useState, useRef, DragEvent, ChangeEvent } from "react";
import { api, ApiError } from "@/lib/api";

interface KBFile {
  filename: string;
  size: string;
  uploaded_at: number;
}

export default function KnowledgeLakePage() {
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ── Upload ──
  async function handleUpload(fileList: FileList) {
    if (fileList.length === 0) return;
    setUploading(true);

    for (let i = 0; i < fileList.length; i++) {
      const formData = new FormData();
      formData.append("file", fileList[i]);

      try {
        await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
      } catch (err) {
        console.error("Upload failed", err);
      }
    }

    setUploading(false);
    showToast("Upload Successful!");
    fetchFiles();
  }

  // ── Delete ──
  async function handleDelete(filename: string) {
    if (!confirm(`Are you sure you want to remove ${filename}?`)) return;
    try {
      await api.delete(`/api/knowledge/files/${encodeURIComponent(filename)}`);
      showToast("File Removed");
      fetchFiles();
    } catch (err) {
      if (err instanceof ApiError) alert("Failed to delete file");
    }
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
        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.75rem", fontWeight: 600, color: "#e6e8eb" }}>
          Knowledge Lake
        </h1>
        <p style={{ margin: 0, color: "#9aa0a6", fontSize: "0.95rem" }}>
          Upload and safely store unstructured documents (PDF, Word) for future
          ingestion.
        </p>
      </header>

      {/* Drop zone */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div
          style={{
            border: dragOver ? "2px dashed #6b4cff" : "2px dashed #4b5563",
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
          <div style={{ marginTop: "1rem", color: "#6b4cff", fontWeight: 600 }}>
            Uploading... Please wait.
          </div>
        )}
      </div>

      {/* Files table */}
      <div style={{ background: "#191c21", border: "1px solid #2b2f36", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36", width: "50%" }}>
                Filename
              </th>
              <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36" }}>Size</th>
              <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36" }}>Uploaded On</th>
              <th style={{ background: "#14171a", color: "#9aa0a6", fontWeight: 500, fontSize: "0.85rem", padding: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2b2f36", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", padding: "2rem", color: "#9aa0a6" }}
                >
                  Loading documents...
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
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
                    style={{ borderBottom: "1px solid #2b2f36", transition: "background-color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <td style={{ padding: "1rem", color: "#e6e8eb", fontWeight: 500 }}>
                      <span style={{ color: "#9aa0a6", marginRight: 8 }}>📄</span>
                      {f.filename}
                    </td>
                    <td style={{ padding: "1rem", color: "#9aa0a6", fontSize: "0.9rem" }}>
                      {f.size}
                    </td>
                    <td style={{ padding: "1rem", color: "#9aa0a6", fontSize: "0.9rem" }}>
                      {date}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(f.filename)}
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "#ef4444",
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
                          e.currentTarget.style.background = "#ef4444";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                          e.currentTarget.style.color = "#ef4444";
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

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "#32d583",
            color: "#0e291e",
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
