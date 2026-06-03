"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      setSuccess(true);
      // Don't reset `loading` here — navigation is in progress. Resetting
      // would un-disable the form during the transition and allow a second
      // submit.
    } catch (err) {
      if (err instanceof ApiError) {
        // Check for specific tenant status errors (these override status code handling)
        if (err.detail === "tenant_suspended") {
          setError(
            "This workspace has been suspended.\nPlease contact your administrator.",
          );
        } else if (err.detail === "tenant_deleted") {
          setError(
            "This workspace has been deleted.\nPlease contact your administrator.",
          );
        } else if (err.status === 401) {
          setError("Invalid email or password.");
        } else if (err.status === 429) {
          setError("Too many attempts. Please wait and try again.");
        } else if (err.status >= 500) {
          setError("Server error. Please try again later.");
        } else {
          setError("Login failed. Please try again.");
        }
      } else {
        setError("Network error. Check your connection.");
      }
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Login Card */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          border: "1px solid var(--border)",
          padding: "48px 40px",
          background: "var(--bg-card)",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.6)",
        }}
      >
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Image
            src="/logo1.png"
            alt="RYX AI Logo"
            width={200}
            height={80}
            style={{
              width: "auto",
              height: 60,
              margin: "0 auto 16px auto",
              objectFit: "contain",
            }}
            priority
          />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
              marginBottom: 4,
            }}
          >
            Welcome Back
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Access the Communication Infrastructure
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Account ID */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              Account ID
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@ryxai.in"
              required
              autoComplete="email"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "14px 16px",
                fontSize: 15,
                color: "#fff",
                background: "var(--bg-surface)",
                outline: "none",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "14px 16px",
                fontSize: 15,
                color: "#fff",
                background: "var(--bg-surface)",
                outline: "none",
              }}
            />
            {error && (
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--error)" }}>
                {error}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              borderRadius: 10,
              padding: "14px 0",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: success ? "var(--success)" : "var(--accent)",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginTop: 8,
            }}
          >
            {success
              ? "Access Granted ✓"
              : loading
                ? "Verifying..."
                : "Authorize Access"}
          </button>
        </form>
      </div>
    </div>
  );
}
