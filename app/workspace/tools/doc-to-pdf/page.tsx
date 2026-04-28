"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";

export default function DocToPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.name.toLowerCase().endsWith(".doc") || selected.name.toLowerCase().endsWith(".docx")) {
        setFile(selected);
        setError(null);
        setDownloadUrl(null);
      } else {
        setError("Only .doc and .docx files are supported.");
      }
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setConverting(true);
    setError(null);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Use the native fetch for blob response as our api lib might expect JSON
      const response = await fetch("http://127.0.0.1:8003/api/tools/convert/doc2pdf", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token") || ""}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Conversion failed.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      setError(err.message || "An error occurred during conversion.");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "3rem 2rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "2.25rem", fontWeight: 900, color: "#fff", marginBottom: "0.5rem", letterSpacing: "-0.5px" }}>
          📄 Doc to PDF
        </h1>
        <p style={{ color: "#64748b", fontSize: "1rem" }}>
          Convert your Word documents to high-quality PDF files instantly.
        </p>
      </div>

      {/* Main Card */}
      <div style={{
        background: "#1c1f26",
        border: "1px solid #2b2f36",
        borderRadius: 24,
        padding: "2.5rem",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)"
      }}>
        <div 
          style={{
            border: file ? "2px solid #6b4cff" : "2px dashed #2b2f36",
            borderRadius: 16,
            padding: "3rem 2rem",
            textAlign: "center",
            background: file ? "rgba(107,76,255,0.05)" : "transparent",
            transition: "all 0.3s ease",
            cursor: "pointer",
            position: "relative"
          }}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input 
            id="file-input"
            type="file" 
            accept=".doc,.docx" 
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
            {file ? "📁" : "☁️"}
          </div>
          
          {file ? (
            <div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>{file.name}</p>
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                Click to upload or drag and drop
              </p>
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
                Microsoft Word Files (.doc, .docx)
              </p>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, color: "#ef4444", fontSize: "0.85rem", textAlign: "center" }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center" }}>
          {!downloadUrl ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleConvert(); }}
              disabled={!file || converting}
              style={{
                background: !file || converting ? "#2b2f36" : "#6b4cff",
                color: !file || converting ? "#64748b" : "#fff",
                border: "none",
                borderRadius: 12,
                padding: "1rem 2.5rem",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: !file || converting ? "default" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: file && !converting ? "0 10px 15px -3px rgba(107,76,255,0.4)" : "none",
                width: "100%"
              }}
            >
              {converting ? "Converting Document..." : "Convert to PDF"}
            </button>
          ) : (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
               <a
                href={downloadUrl}
                download={`${file?.name.split('.')[0]}.pdf`}
                style={{
                  background: "#32d583",
                  color: "#fff",
                  textDecoration: "none",
                  textAlign: "center",
                  borderRadius: 12,
                  padding: "1rem 2.5rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  boxShadow: "0 10px 15px -3px rgba(50,213,131,0.4)",
                  width: "100%",
                  boxSizing: "border-box"
                }}
              >
                📥 Download PDF
              </a>
              <button 
                onClick={() => { setFile(null); setDownloadUrl(null); }}
                style={{ background: "transparent", color: "#64748b", border: "none", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}
              >
                Convert another file
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div style={{ marginTop: "3rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        <div style={{ background: "#1c1f26", padding: "1.5rem", borderRadius: 16, border: "1px solid #2b2f36" }}>
          <h3 style={{ color: "#fff", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 8 }}>
            🔒 Secure & Private
          </h3>
          <p style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.5 }}>
            Your files are processed locally and deleted immediately after conversion. We never store your data.
          </p>
        </div>
        <div style={{ background: "#1c1f26", padding: "1.5rem", borderRadius: 16, border: "1px solid #2b2f36" }}>
          <h3 style={{ color: "#fff", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 8 }}>
            ⚡ High Fidelity
          </h3>
          <p style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.5 }}>
            Our engine uses Microsoft Word integration to ensure 100% accurate layout and font preservation.
          </p>
        </div>
      </div>
    </div>
  );
}
