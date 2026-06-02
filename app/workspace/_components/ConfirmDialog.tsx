"use client";

import { ReactNode } from "react";

type ConfirmTone = "danger" | "warning" | "success" | "neutral";

interface ConfirmDialogProps {
  open: boolean;
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

const toneStyles: Record<
  ConfirmTone,
  {
    color: string;
    borderColor: string;
    background: string;
    buttonBackground: string;
    icon: string;
  }
> = {
  danger: {
    color: "var(--error)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    background: "rgba(239, 68, 68, 0.12)",
    buttonBackground: "var(--error)",
    icon: "!",
  },
  warning: {
    color: "var(--warning)",
    borderColor: "rgba(245, 158, 11, 0.38)",
    background: "rgba(245, 158, 11, 0.12)",
    buttonBackground: "var(--warning)",
    icon: "!",
  },
  success: {
    color: "var(--success)",
    borderColor: "rgba(16, 185, 129, 0.38)",
    background: "rgba(16, 185, 129, 0.12)",
    buttonBackground: "var(--success)",
    icon: "+",
  },
  neutral: {
    color: "var(--accent-light)",
    borderColor: "rgba(107, 76, 255, 0.35)",
    background: "rgba(107, 76, 255, 0.12)",
    buttonBackground: "var(--accent)",
    icon: "i",
  },
};

export function ConfirmDialog({
  open,
  eyebrow,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  disabled = false,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  const toneStyle = toneStyles[tone];
  const confirmDisabled = busy || disabled;

  return (
    <div
      role="presentation"
      style={overlayStyle}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div
            aria-hidden="true"
            style={{
              ...iconStyle,
              color: toneStyle.color,
              borderColor: toneStyle.borderColor,
              background: toneStyle.background,
            }}
          >
            {toneStyle.icon}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                margin: "0 0 0.35rem 0",
                color: toneStyle.color,
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 0,
              }}
            >
              {eyebrow}
            </p>
            <h2
              id="confirm-dialog-title"
              style={{ margin: 0, color: "#fff", fontSize: "1.15rem" }}
            >
              {title}
            </h2>
            <p style={descriptionStyle}>{description}</p>
          </div>
        </div>

        {children && <div style={contentStyle}>{children}</div>}

        <div style={actionRowStyle}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              ...secondaryButtonStyle,
              opacity: busy ? 0.6 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{
              ...primaryButtonStyle,
              background: toneStyle.buttonBackground,
              opacity: confirmDisabled ? 0.55 : 1,
              cursor: confirmDisabled ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  background: "rgba(5, 7, 15, 0.72)",
  backdropFilter: "blur(8px)",
};

const dialogStyle: React.CSSProperties = {
  width: "min(100%, 520px)",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
  padding: "1.25rem",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  alignItems: "flex-start",
};

const iconStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  flex: "0 0 auto",
  borderRadius: 8,
  border: "1px solid",
  display: "grid",
  placeItems: "center",
  fontSize: "1.2rem",
  fontWeight: 900,
};

const descriptionStyle: React.CSSProperties = {
  margin: "0.55rem 0 0 0",
  color: "var(--text-secondary)",
  fontSize: "0.9rem",
  lineHeight: 1.6,
};

const contentStyle: React.CSSProperties = {
  marginTop: "1.1rem",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.75rem",
  marginTop: "1.25rem",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.7rem 0.95rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontFamily: "inherit",
  fontWeight: 700,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.7rem 0.95rem",
  borderRadius: 8,
  border: "none",
  color: "#fff",
  fontFamily: "inherit",
  fontWeight: 800,
};
