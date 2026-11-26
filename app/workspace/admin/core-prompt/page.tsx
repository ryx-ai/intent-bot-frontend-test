"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "../../_components/ConfirmDialog";

interface UserInfo {
  id: number;
  email: string;
  role: string;
}

interface GlobalPromptResponse {
  template: string;
  is_customized: boolean;
  version: number;
  updated_at: string | null;
  updated_by_email: string | null;
  default_template: string;
}

interface PreviewResponse {
  valid: boolean;
  preview: string | null;
  errors: string[];
}

const REQUIRED_TOKENS = [
  { tag: "[ACTION:SHOW_CALENDAR]", label: "Calendar Tag", desc: "Required for appointment scheduling" },
  { tag: "[ACTION:SAVE_LEAD", label: "Lead Tag", desc: "Required for lead capture" },
  { tag: "{{DYNAMIC_ROLE}}", label: "Dynamic Role", desc: "Runtime role injection token" },
  { tag: "{{DYNAMIC_CALENDAR_LINK}}", label: "Calendar Link", desc: "Runtime booking link token" },
  { tag: "{{DYNAMIC_ROLE_BEHAVIOR}}", label: "Role Behavior", desc: "Runtime intent routing token" },
  { tag: "{{DYNAMIC_ANALYTICS}}", label: "Analytics Tag", desc: "Runtime conversation tracking token" },
];

const OPTIONAL_INJECTION_TOKENS = [
  { tag: "{{COMPANY_NAME}}", label: "Company Name", desc: "Tenant organization name" },
  { tag: "{{COMPANY_POSSESSIVE}}", label: "Possessive Name", desc: "e.g. Acme's" },
  { tag: "{{KNOWLEDGE_BASE_CONTEXT}}", label: "Knowledge Context", desc: "Synthesized documents & site data" },
  { tag: "{{TENANT_CUSTOM_RULES}}", label: "Tenant Rules", desc: "Tenant custom instructions" },
  { tag: "{{DYNAMIC_IMAGE_KEYS}}", label: "Image Keys", desc: "Visual mapping keywords" },
];

export default function CorePromptAdminPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [config, setConfig] = useState<GlobalPromptResponse | null>(null);
  const [templateText, setTemplateText] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Preview Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewOutput, setPreviewOutput] = useState<string | null>(null);
  const [sampleCompany, setSampleCompany] = useState("Tigrid Technologies");
  const [sampleRole, setSampleRole] = useState("hybrid");

  // Reset Confirm Dialog
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Load config & verify super admin
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const user = await api.get<UserInfo>("/api/auth/me");
        if (user.role !== "super_admin") {
          router.replace("/workspace/testing");
          return;
        }

        const data = await api.get<GlobalPromptResponse>("/api/admin/core-prompt");
        if (!isMounted) return;
        setConfig(data);
        setTemplateText(data.template || data.default_template || "");
      } catch (err) {
        if (!isMounted) return;
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/workspace/testing");
          return;
        }
        setFeedback({
          type: "error",
          message:
            err instanceof ApiError && err.detail
              ? err.detail
              : "Failed to load Core System Prompt configuration.",
        });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // Insert token helper
  const handleInsertToken = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setTemplateText((prev) => prev + "\n" + token);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = templateText.substring(0, start) + token + templateText.substring(end);
    setTemplateText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 50);
  };

  // Client-side quick check
  const missingRequired = REQUIRED_TOKENS.filter((t) => !templateText.includes(t.tag));

  // Save changes
  const handleSave = async () => {
    setFeedback(null);
    setValidationErrors([]);

    if (missingRequired.length > 0) {
      setValidationErrors(
        missingRequired.map((t) => `Missing required protocol: ${t.tag} (${t.desc})`)
      );
      setFeedback({
        type: "error",
        message: "Validation failed: Required system protocols must be preserved.",
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await api.post<GlobalPromptResponse>("/api/admin/core-prompt", {
        core_prompt_template: templateText,
      });
      setConfig(updated);
      setTemplateText(updated.template);
      setFeedback({
        type: "success",
        message: `Global Core System Prompt updated successfully (v${updated.version}). Changes propagate to all platform-managed tenant agents.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.detail) {
        setFeedback({ type: "error", message: err.detail });
      } else {
        setFeedback({ type: "error", message: "Failed to save Core System Prompt template." });
      }
    } finally {
      setSaving(false);
    }
  };

  // Reset to Platform Default
  const handleConfirmReset = async () => {
    setResetting(true);
    setFeedback(null);
    setValidationErrors([]);
    try {
      const reset = await api.post<GlobalPromptResponse>("/api/admin/core-prompt/reset", {});
      setConfig(reset);
      setTemplateText(reset.template);
      setShowResetDialog(false);
      setFeedback({
        type: "success",
        message: "Successfully reset Core System Prompt to platform default. Tenant agents inherit standard platform guardrails.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof ApiError && err.detail
            ? err.detail
            : "Failed to reset Core System Prompt.",
      });
    } finally {
      setResetting(false);
    }
  };

  // Preview compilation
  const handlePreview = async () => {
    setPreviewing(true);
    setFeedback(null);
    setValidationErrors([]);
    try {
      const res = await api.post<PreviewResponse>("/api/admin/core-prompt/preview", {
        core_prompt_template: templateText,
        sample_company_name: sampleCompany,
        sample_role: sampleRole,
      });

      if (!res.valid) {
        setValidationErrors(res.errors || ["Preview compilation failed."]);
        setFeedback({
          type: "error",
          message: "Template contains validation errors. Resolve them before compiling.",
        });
        return;
      }

      setPreviewOutput(res.preview);
      setShowPreviewModal(true);
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof ApiError && err.detail
            ? err.detail
            : "Failed to generate prompt preview.",
      });
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          padding: "3rem",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "60vh",
          color: "var(--text-secondary)",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid color-mix(in srgb, var(--text-primary) 11%, transparent)",
              borderTopColor: "var(--accent, #8A64E9)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <span>Loading platform Core System Prompt configuration...</span>
        </div>
      </div>
    );
  }

  const isCustomized = config?.is_customized ?? false;
  const isDirty = config && templateText !== config.template;

  return (
    <div
      style={{
        width: "100%",
        padding: "2rem",
        boxSizing: "border-box",
        maxWidth: 1400,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        color: "var(--text-primary)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--accent, #8A64E9)",
              textTransform: "uppercase",
              marginBottom: "0.25rem",
            }}
          >
            Super Admin / Platform Configuration
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Core System Prompt
          </h1>
          <p
            style={{
              margin: "0.35rem 0 0 0",
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
              maxWidth: 820,
              lineHeight: 1.5,
            }}
          >
            Manage the platform-global Core System Prompt template. This template defines root platform instructions,
            security guardrails, action tags, and intent routing inherited by all platform-managed tenant agents.
          </p>
        </div>

        {/* Action Buttons Top Bar */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {isCustomized && (
            <button
              type="button"
              onClick={() => setShowResetDialog(true)}
              disabled={resetting || saving}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                border: "1px solid rgba(239, 68, 68, 0.35)",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                color: "var(--error, #EF4444)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Reset to Platform Default
            </button>
          )}

          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || saving}
            style={{
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "1px solid var(--border-color, rgba(255,255,255,0.12))",
              backgroundColor: "var(--card-bg, #1A1D2D)",
              color: "var(--text-primary)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {previewing ? "Compiling Preview..." : "Preview Output"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || resetting}
            style={{
              padding: "0.6rem 1.3rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              backgroundColor: "var(--accent, #8A64E9)",
              color: "#FFFFFF",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "all 0.15s ease",
              boxShadow: "0 2px 8px color-mix(in srgb, var(--text-primary) 16%, transparent)",
            }}
          >
            {saving ? "Saving Changes..." : isDirty ? "Save Changes *" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor:
              feedback.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${
              feedback.type === "success" ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)"
            }`,
            color: feedback.type === "success" ? "var(--success, #10B981)" : "var(--error, #EF4444)",
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "1.1rem",
              lineHeight: 1,
              padding: "0 0.25rem",
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Validation Errors Box */}
      {validationErrors.length > 0 && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "var(--error, #EF4444)",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            Protocol Validation Errors ({validationErrors.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {validationErrors.map((err, idx) => (
              <li key={idx} style={{ marginBottom: "0.25rem" }}>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI Status Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Status Card */}
        <div
          style={{
            padding: "1.25rem",
            borderRadius: "12px",
            backgroundColor: "var(--card-bg, #1A1D2D)",
            border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Template Mode
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: isCustomized ? "#F59E0B" : "#10B981",
              }}
            />
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: isCustomized ? "#F59E0B" : "var(--text-primary)",
              }}
            >
              {isCustomized ? "Customized by Super Admin" : "Platform Default"}
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {isCustomized
              ? "Tenant prompts inherit this customized core template."
              : "Tenant prompts inherit standard platform system instructions."}
          </div>
        </div>

        {/* Version Card */}
        <div
          style={{
            padding: "1.25rem",
            borderRadius: "12px",
            backgroundColor: "var(--card-bg, #1A1D2D)",
            border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Configuration Version
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
            v{config?.version ?? 1}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Incremented automatically whenever modifications are published.
          </div>
        </div>

        {/* Audit Card */}
        <div
          style={{
            padding: "1.25rem",
            borderRadius: "12px",
            backgroundColor: "var(--card-bg, #1A1D2D)",
            border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Audit Information
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {config?.updated_by_email ? config.updated_by_email : "Platform Default System"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {config?.updated_at
              ? `Modified: ${new Date(config.updated_at).toLocaleString()}`
              : "Active since platform initialization"}
          </div>
        </div>
      </div>

      {/* Information Notice */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderRadius: "10px",
          backgroundColor: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
          border: "1px solid color-mix(in srgb, var(--text-primary) 11%, transparent)",
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-start",
        }}
      >
        <span style={{ color: "var(--accent, #8A64E9)", fontSize: "1.2rem", lineHeight: 1 }}>ℹ</span>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text-primary)" }}>Dynamic Platform Inheritance: </strong>
          Changes saved here apply globally across the platform. When tenant agents are rebuilt (during rule updates or knowledge indexing),
          they dynamically inherit this template. Tenant-specific customizations previously configured by Super Admin on individual tenant bots remain protected.
        </div>
      </div>

      {/* Placeholders Bar */}
      <div
        style={{
          padding: "1rem",
          borderRadius: "10px",
          backgroundColor: "var(--card-bg, #1A1D2D)",
          border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          Available Placeholders & Runtime Protocol Tokens:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {REQUIRED_TOKENS.map((t) => (
            <button
              key={t.tag}
              type="button"
              onClick={() => handleInsertToken(t.tag)}
              title={`${t.label}: ${t.desc}`}
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid color-mix(in srgb, var(--text-primary) 16%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--text-primary) 6%, transparent)",
                color: "var(--accent, #8A64E9)",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              + {t.tag}
            </button>
          ))}
          {OPTIONAL_INJECTION_TOKENS.map((t) => (
            <button
              key={t.tag}
              type="button"
              onClick={() => handleInsertToken(t.tag)}
              title={`${t.label}: ${t.desc}`}
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border-color, rgba(255,255,255,0.12))",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              + {t.tag}
            </button>
          ))}
        </div>
      </div>

      {/* Editor Container */}
      <div
        style={{
          borderRadius: "12px",
          backgroundColor: "var(--card-bg, #1A1D2D)",
          border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1.25rem",
            backgroundColor: "rgba(0,0,0,0.15)",
            borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.06))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Template Editor
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
            {templateText.length} characters | {templateText.split("\n").length} lines
          </span>
        </div>

        <textarea
          ref={textareaRef}
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            height: "560px",
            padding: "1.25rem",
            boxSizing: "border-box",
            backgroundColor: "var(--input-bg, #10121E)",
            border: "none",
            color: "var(--text-primary, #E2E8F0)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.875rem",
            lineHeight: 1.6,
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "2rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 960,
              maxHeight: "90vh",
              backgroundColor: "var(--card-bg, #1A1D2D)",
              borderRadius: "14px",
              border: "1px solid var(--border-color, rgba(255,255,255,0.1))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.08))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Sample Compiled System Prompt Preview
                </h3>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Simulated dynamic tenant compilation with sample organization data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: "1.4rem",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Controls */}
            <div
              style={{
                padding: "0.85rem 1.5rem",
                backgroundColor: "rgba(0,0,0,0.15)",
                display: "flex",
                gap: "1.5rem",
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Sample Tenant:</span>
                <input
                  type="text"
                  value={sampleCompany}
                  onChange={(e) => setSampleCompany(e.target.value)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
                    backgroundColor: "var(--input-bg, #10121E)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Sample Role:</span>
                <select
                  value={sampleRole}
                  onChange={(e) => setSampleRole(e.target.value)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
                    backgroundColor: "var(--input-bg, #10121E)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="hybrid">Sales + Support (Hybrid)</option>
                  <option value="sales">Sales</option>
                  <option value="support">Support</option>
                  <option value="booking">Demo Booking</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handlePreview}
                style={{
                  padding: "0.35rem 0.85rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--accent, #8A64E9)",
                  color: "#FFFFFF",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Re-compile
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
              <pre
                style={{
                  margin: 0,
                  padding: "1.25rem",
                  borderRadius: "8px",
                  backgroundColor: "var(--input-bg, #10121E)",
                  border: "1px solid var(--border-color, rgba(255,255,255,0.06))",
                  color: "var(--text-primary, #E2E8F0)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "0.825rem",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {previewOutput}
              </pre>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--border-color, rgba(255,255,255,0.08))",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                style={{
                  padding: "0.55rem 1.25rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
                  backgroundColor: "transparent",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        open={showResetDialog}
        eyebrow="Reset Platform Template"
        title="Reset Core System Prompt to Platform Default?"
        description="This will clear all Super Admin global customizations and restore the platform's default Core System Prompt template. All platform-managed tenant agents will inherit baseline platform system instructions upon their next prompt rebuild."
        confirmLabel="Reset to Default"
        tone="warning"
        busy={resetting}
        onCancel={() => setShowResetDialog(false)}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
}
