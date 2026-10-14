"use client";

import { useState, FormEvent, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#FEF2F2",
            color: "#DC2626",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            margin: "0 auto 18px auto",
            border: "1px solid #FECACA",
          }}
        >
          ✕
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#0F172A",
            marginBottom: 8,
          }}
        >
          Invalid Reset Link
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#64748B",
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          No reset token was found in this link. Please request a new password
          reset link from the sign-in page.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            width: "100%",
            borderRadius: 10,
            padding: "12px 0",
            fontSize: 14,
            fontWeight: 600,
            color: "#FFFFFF",
            background: "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/api/auth/reset-password", {
        token,
        new_password: password,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError) {
        setError(err.detail || err.message || "Failed to reset password.");
      } else {
        setError("Network error. Please try again.");
      }
    }
  }

  if (success) {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#ECFDF5",
            color: "#10B981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            margin: "0 auto 18px auto",
            border: "1px solid #A7F3D0",
          }}
        >
          ✓
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#0F172A",
            marginBottom: 8,
          }}
        >
          Password Reset Complete!
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#64748B",
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          Your password has been successfully updated. Redirecting you to the
          sign-in page...
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            width: "100%",
            borderRadius: 10,
            padding: "12px 0",
            fontSize: 14,
            fontWeight: 600,
            color: "#FFFFFF",
            background: "#10B981",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Sign In Now
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* New Password */}
      <div style={{ marginBottom: 18 }}>
        <label
          htmlFor="new-password"
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            marginBottom: 6,
          }}
        >
          New Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="new-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete="new-password"
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid #CBD5E1",
              padding: "12px 14px",
              fontSize: 14,
              color: "#0F172A",
              background: "#F8FAFC",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#64748B",
              cursor: "pointer",
              padding: "4px",
              fontSize: 16,
            }}
          >
            {showPassword ? "👁️" : "👁️‍🗨️"}
          </button>
        </div>
      </div>

      {/* Confirm Password */}
      <div style={{ marginBottom: 22 }}>
        <label
          htmlFor="confirm-password"
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            marginBottom: 6,
          }}
        >
          Confirm Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="confirm-password"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete="new-password"
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid #CBD5E1",
              padding: "12px 14px",
              fontSize: 14,
              color: "#0F172A",
              background: "#F8FAFC",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#64748B",
              cursor: "pointer",
              padding: "4px",
              fontSize: 16,
            }}
          >
            {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
          </button>
        </div>
      </div>

      {error && (
        <p
          style={{
            marginBottom: 16,
            fontSize: 12,
            color: "#DC2626",
            background: "#FEF2F2",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #FCA5A5",
          }}
        >
          {error}
        </p>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          borderRadius: 10,
          padding: "14px 0",
          fontSize: 14,
          fontWeight: 600,
          color: "#ffffff",
          background: "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
          boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
          transition: "all 0.2s ease",
        }}
      >
        {loading ? "Updating password..." : "Set New Password"}
      </button>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <Link
          href="/"
          style={{
            color: "#64748B",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          ← Back to Sign In
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)",
      }}
    >
      {/* Glow background accent */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          height: "600px",
          background:
            "radial-gradient(circle, rgba(79, 70, 229, 0.08) 0%, rgba(248,250,252,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Card Container */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 420,
          borderRadius: 20,
          border: "1px solid #E2E8F0",
          padding: "40px 36px",
          background: "#FFFFFF",
          boxShadow:
            "0 20px 40px -15px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.8)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Image
            src="/logo-only.png"
            alt="RYX AI Logo"
            width={180}
            height={60}
            style={{
              width: "auto",
              height: 52,
              margin: "0 auto 16px auto",
              objectFit: "contain",
            }}
            priority
          />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#0F172A",
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            Create New Password
          </h1>
          <p style={{ fontSize: 13, color: "#64748B" }}>
            Enter and confirm your new password below.
          </p>
        </div>

        <Suspense
          fallback={
            <div style={{ textAlign: "center", padding: "20px 0", color: "#64748B" }}>
              Loading...
            </div>
          }
        >
          <ResetPasswordContent />
        </Suspense>
      </div>
    </div>
  );
}
