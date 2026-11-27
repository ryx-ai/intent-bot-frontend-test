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
  { tag: "[ACTION:SHOW_CALENDAR]", label: "Show calendar", desc: "Lets the assistant open the booking calendar" },
  { tag: "[ACTION:SAVE_LEAD", label: "Save lead", desc: "Lets the assistant save a visitor's details" },
  { tag: "{{DYNAMIC_ROLE}}", label: "Assistant type", desc: "Sales, Support, Shop… as chosen by the customer" },
  { tag: "{{DYNAMIC_CALENDAR_LINK}}", label: "Booking link", desc: "The customer's own booking link" },
  { tag: "{{DYNAMIC_ROLE_BEHAVIOR}}", label: "Type behaviour", desc: "How that assistant type should act" },
  { tag: "{{DYNAMIC_ANALYTICS}}", label: "Tracking", desc: "What to note about each chat (lead score, budget…)" },
];

const OPTIONAL_INJECTION_TOKENS = [
  { tag: "{{COMPANY_NAME}}", label: "Business name", desc: "e.g. Snow Gear Shop" },
  { tag: "{{COMPANY_POSSESSIVE}}", label: "Business name's", desc: "e.g. Snow Gear Shop's" },
  { tag: "{{KNOWLEDGE_BASE_CONTEXT}}", label: "Knowledge", desc: "The customer's files and website pages" },
  { tag: "{{TENANT_CUSTOM_RULES}}", label: "Customer rules", desc: "Rules the customer added themselves" },
  { tag: "{{DYNAMIC_IMAGE_KEYS}}", label: "Pictures", desc: "Names of the customer's pictures" },
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
              borderTopColor: "var(--text-primary)",
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
        padding: "1.5rem 2rem",
        boxSizing: "border-box",
        maxWidth: 1400,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
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
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: "0.3rem",
            }}
          >
            Platform
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
            Core prompt
          </h1>
          <p
            style={{
              margin: "0.3rem 0 0 0",
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
              maxWidth: 820,
              lineHeight: 1.5,
            }}
          >
            The master instructions every customer&apos;s assistant follows. Saving here changes every assistant on the platform.
          </p>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: "0.7rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.2rem 0.65rem", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-card)", fontWeight: 600, color: "var(--text-primary)" }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: isCustomized ? "#f59e0b" : "#10b981" }} />
              {isCustomized ? "Customised" : "Platform default"}
            </span>
            <span style={{ padding: "0.2rem 0.65rem", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-card)", fontWeight: 600, color: "var(--text-primary)" }}>
              v{config?.version ?? 1}
            </span>
            <span>
              {config?.updated_at
                ? `Last changed ${new Date(config.updated_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}${config?.updated_by_email ? ` by ${config.updated_by_email}` : ""}`
                : "Never changed"}
            </span>
          </div>
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
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-card)",
                color: "var(--error, #EF4444)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Reset to default
            </button>
          )}

          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || saving}
            style={{
              padding: "0.6rem 1.1rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {previewing ? "Building preview..." : "Preview"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || resetting}
            style={{
              padding: "0.6rem 1.3rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              backgroundColor: "var(--text-primary)",
              color: "var(--bg-card)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "all 0.15s ease",
              boxShadow: "0 2px 8px color-mix(in srgb, var(--text-primary) 16%, transparent)",
            }}
          >
            {saving ? "Saving..." : isDirty ? "Save changes •" : "Save changes"}
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

      <style>{`
        .cp-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 1rem; height: calc(100vh - 205px); min-height: 420px; }
        .cp-grid > * { min-height: 0; height: 100%; }
        .cp-token { width: 100%; text-align: left; font-family: inherit; cursor: pointer; transition: background .15s, border-color .15s; }
        .cp-token:hover { background: var(--bg-surface); border-color: var(--text-muted); }
        .cp-text { flex: 1; min-height: 0; }
        @media (max-width: 1000px) {
          .cp-grid { grid-template-columns: 1fr; height: auto; }
          .cp-grid > * { height: auto; }
          .cp-text { flex: none; height: 60vh; }
        }
      `}</style>

      <div className="cp-grid">
        {/* Editor */}
        <div
          style={{
            borderRadius: "16px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.04)",
          }}
        >
          <div
            style={{
              padding: "0.7rem 1.1rem",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: "0.88rem", fontWeight: 650, color: "var(--text-primary)" }}>Instructions</span>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
              {templateText.length.toLocaleString()} characters · {templateText.split("\n").length} lines
            </span>
          </div>
          <textarea
            ref={textareaRef}
            className="cp-text"
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              padding: "1rem 1.1rem",
              boxSizing: "border-box",
              backgroundColor: "var(--bg-card)",
              border: "none",
              color: "var(--text-primary)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "0.84rem",
              lineHeight: 1.65,
              resize: "none",
              outline: "none",
            }}
          />
        </div>

        {/* Side panel: placeholders + note */}
        <aside
          style={{
            borderRadius: "16px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 1px 2px rgba(15,23,42,.04)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "0.8rem 1rem 0.6rem", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 650 }}>Placeholders</div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 2 }}>
              Click to insert where your cursor is. Each is filled in per customer.
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.7rem 0.75rem", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", padding: "0.2rem 0.25rem" }}>
              Must stay in
            </div>
            {REQUIRED_TOKENS.map((t) => {
              const present = templateText.includes(t.tag);
              return (
                <button
                  key={t.tag}
                  type="button"
                  className="cp-token"
                  onClick={() => handleInsertToken(t.tag)}
                  title={t.tag}
                  style={{ padding: "0.5rem 0.65rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{t.label}</span>
                    <span
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 650,
                        padding: "1px 7px",
                        borderRadius: 999,
                        color: present ? "color-mix(in srgb, #10b981 70%, var(--text-primary))" : "color-mix(in srgb, #ef4444 75%, var(--text-primary))",
                        background: present ? "color-mix(in srgb, #10b981 12%, transparent)" : "color-mix(in srgb, #ef4444 12%, transparent)",
                      }}
                    >
                      {present ? "In use" : "Missing"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>{t.desc}</div>
                </button>
              );
            })}
            <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", padding: "0.6rem 0.25rem 0.2rem" }}>
              Optional
            </div>
            {OPTIONAL_INJECTION_TOKENS.map((t) => (
              <button
                key={t.tag}
                type="button"
                className="cp-token"
                onClick={() => handleInsertToken(t.tag)}
                title={t.tag}
                style={{ padding: "0.5rem 0.65rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
              >
                <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text-primary)" }}>Applies to everyone.</strong> Each assistant picks up changes the
            next time it is rebuilt. Rules set for one customer are kept.
          </div>
        </aside>
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
            backgroundColor: "var(--scrim)",
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
              backgroundColor: "var(--bg-card)",
              borderRadius: "14px",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(15,23,42,0.25)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Preview
                </h3>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  What an assistant receives, filled in for a sample business.
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
                backgroundColor: "var(--bg-surface)",
                display: "flex",
                gap: "1.5rem",
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Business</span>
                <input
                  type="text"
                  value={sampleCompany}
                  onChange={(e) => setSampleCompany(e.target.value)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Assistant type</span>
                <select
                  value={sampleRole}
                  onChange={(e) => setSampleRole(e.target.value)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-surface)",
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
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "var(--text-primary)",
                  color: "var(--bg-card)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
              <pre
                style={{
                  margin: 0,
                  padding: "1.25rem",
                  borderRadius: "8px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
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
                borderTop: "1px solid var(--border)",
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
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
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
