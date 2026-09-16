"use client";

import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import Script from "next/script";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function AuthPage() {
  const { login, signup, googleAuth } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const GOOGLE_CLIENT_ID =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "545089022739-gp76voof01st3vkkcs9o0e66p8kd6htg.apps.googleusercontent.com";

  useEffect(() => {
    setError("");
  }, [mode]);

  const initGoogleSignIn = () => {
    if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: any) => {
            if (response?.credential) {
              setLoading(true);
              setError("");
              try {
                await googleAuth(response.credential);
                setSuccess(true);
              } catch (err: any) {
                setLoading(false);
                if (err instanceof ApiError) {
                  setError(err.detail || "Google authentication failed.");
                } else {
                  setError("Google authentication failed. Please try again.");
                }
              }
            }
          },
        });

        const btnDiv = document.getElementById("googleBtnContainer");
        if (btnDiv) {
          btnDiv.innerHTML = "";
          (window as any).google.accounts.id.renderButton(btnDiv, {
            theme: "outline",
            size: "large",
            width: "320",
            text: mode === "signin" ? "signin_with" : "signup_with",
            shape: "pill",
          });
        }
      } catch (e) {
        console.error("Error initializing Google Identity Services:", e);
      }
    }
  };

  useEffect(() => {
    initGoogleSignIn();
  }, [mode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signin") {
        await login(email, password);
      } else {
        await signup(fullName, email, password);
      }
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.detail === "tenant_suspended") {
          setError("This account has been suspended.\nPlease contact support.");
        } else if (err.detail === "tenant_deleted") {
          setError("This account is no longer active.");
        } else if (
          err.status === 409 ||
          err.detail === "Email already in use"
        ) {
          setError("An account with this email already exists.");
        } else if (err.status === 401) {
          setError("Invalid email or password.");
        } else if (err.status === 429) {
          setError("Too many attempts. Please wait a moment and try again.");
        } else if (err.detail) {
          setError(err.detail);
        } else {
          setError("Authentication failed. Please try again.");
        }
      } else {
        setError("Network error. Check your internet connection.");
      }
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={initGoogleSignIn}
      />

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
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p style={{ fontSize: 13, color: "#64748B" }}>
              {mode === "signin"
                ? "Sign in to access your personal AI assistant"
                : "Get started with your personal AI workspace in seconds"}
            </p>
          </div>

          {/* Tab Switcher */}
          <div
            style={{
              display: "flex",
              borderRadius: 12,
              background: "#F1F5F9",
              padding: 4,
              marginBottom: 28,
              border: "1px solid #E2E8F0",
            }}
          >
            <button
              type="button"
              onClick={() => setMode("signin")}
              style={{
                flex: 1,
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
                background: mode === "signin" ? "#FFFFFF" : "transparent",
                color: mode === "signin" ? "#4F46E5" : "#64748B",
                boxShadow:
                  mode === "signin" ? "0 2px 4px rgba(0, 0, 0, 0.06)" : "none",
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              style={{
                flex: 1,
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
                background: mode === "signup" ? "#FFFFFF" : "transparent",
                color: mode === "signup" ? "#4F46E5" : "#64748B",
                boxShadow:
                  mode === "signup" ? "0 2px 4px rgba(0, 0, 0, 0.06)" : "none",
              }}
            >
              Sign Up
            </button>
          </div>

          {/* Google SSO Container */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <div
              id="googleBtnContainer"
              style={{
                width: "100%",
                maxWidth: 320,
                display: "flex",
                justifyContent: "center",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "20px 0",
              color: "#94A3B8",
              fontSize: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
            <span
              style={{
                padding: "0 12px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 500,
              }}
            >
              or continue with email
            </span>
            <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div style={{ marginBottom: 18 }}>
                <label
                  htmlFor="fullName"
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: 6,
                  }}
                >
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required
                  autoComplete="name"
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
              </div>
            )}

            {/* Email Field */}
            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: 6,
                }}
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
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
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: 22 }}>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
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

              {error && (
                <p
                  style={{
                    marginTop: 10,
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
            </div>

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
                background: success
                  ? "#10B981"
                  : "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
                transition: "all 0.2s ease",
              }}
            >
              {success
                ? "Redirecting..."
                : loading
                  ? mode === "signin"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "signin"
                    ? "Sign In"
                    : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
