"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import Image from "next/image";
import Script from "next/script";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void | Promise<void>;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: string;
      size?: string;
      width?: string | number;
      text?: string;
      shape?: string;
    }
  ) => void;
}

interface GoogleWindow extends Window {
  google?: {
    accounts?: {
      id?: GoogleAccountsId;
    };
  };
}

export default function AuthPage() {
  const { login, signup, googleAuth } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") === "suspended") {
        return "This account has been suspended.\nPlease contact support.";
      } else if (params.get("error") === "deleted") {
        return "This account is no longer active.";
      }
    }
    return "";
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    setError("");
  }

  const GOOGLE_CLIENT_ID =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "545089022739-gp76voof01st3vkkcs9o0e66p8kd6htg.apps.googleusercontent.com";

  const initGoogleSignIn = useCallback(() => {
    if (typeof window !== "undefined") {
      const gWin = window as unknown as GoogleWindow;
      const accountsId = gWin.google?.accounts?.id;
      if (accountsId) {
        try {
          accountsId.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (response: GoogleCredentialResponse) => {
              if (response?.credential) {
                setLoading(true);
                setError("");
                try {
                  await googleAuth(response.credential);
                  setSuccess(true);
                } catch (err: unknown) {
                  setLoading(false);
                  if (err instanceof ApiError) {
                    if (err.detail === "tenant_suspended") {
                      setError("This account has been suspended.\nPlease contact support.");
                    } else if (err.detail === "tenant_deleted") {
                      setError("This account is no longer active.");
                    } else {
                      setError(typeof err.detail === "string" ? err.detail : "Google authentication failed.");
                    }
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
            accountsId.renderButton(btnDiv, {
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
    }
  }, [GOOGLE_CLIENT_ID, googleAuth, mode]);

  useEffect(() => {
    initGoogleSignIn();
  }, [initGoogleSignIn]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "forgot") {
        await api.post("/api/auth/forgot-password", { email });
        setForgotSent(true);
        setLoading(false);
        return;
      }

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
        } else if (err.status === 422) {
          setError(typeof err.detail === "string" ? err.detail : "Validation error. Please check your email or password.");
        } else if (err.detail) {
          setError(typeof err.detail === "string" ? err.detail : err.message || "Authentication failed.");
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

      <style>{`
        .lg-wrap { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); background: #ffffff; }
        .lg-brand { position: relative; overflow: hidden; background: #0f172a; color: #e2e8f0; padding: 44px 56px; display: flex; flex-direction: column; justify-content: space-between; }
        .lg-brand::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px); background-size: 22px 22px; pointer-events: none; }
        .lg-side { display: flex; align-items: center; justify-content: center; padding: 40px 24px; background: #f8fafc; }
        .lg-card { width: 100%; max-width: 400px; }
        .lg-input { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid #e2e8f0; padding: 12px 14px; font-size: 14px; color: #0f172a; background: #ffffff; outline: none; font-family: inherit; transition: border-color .15s, box-shadow .15s; }
        .lg-input::placeholder { color: #94a3b8; }
        .lg-input:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,.08); }
        .lg-label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 7px; }
        .lg-link { background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600; color: #0f172a; }
        .lg-link:hover { text-decoration: underline; }
        .lg-primary { width: 100%; border-radius: 12px; padding: 13px 0; font-size: 14px; font-weight: 600; color: #ffffff; border: none; font-family: inherit; transition: background .15s, transform .1s; }
        .lg-primary:hover:not(:disabled) { background: #1e293b !important; }
        .lg-primary:active:not(:disabled) { transform: scale(.99); }
        .lg-tab { flex: 1; padding: 9px 0; font-size: 13px; font-weight: 600; border-radius: 9px; border: none; cursor: pointer; font-family: inherit; transition: all .15s; }
        .lg-bubble { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.5; }
        @media (max-width: 900px) {
          .lg-wrap { grid-template-columns: 1fr; }
          .lg-brand { display: none; }
          .lg-mobile-logo { display: block !important; }
        }
      `}</style>

      <div className="lg-wrap">
        {/* Brand panel */}
        <aside className="lg-brand">
          <div style={{ position: "relative" }}>
            <Image
              src="/ferry/svg/ferry-horizontal-white.svg"
              alt="Ferry by RYX AI"
              width={150}
              height={34}
              style={{ width: "auto", height: 34 }}
              priority
            />
          </div>

          <div style={{ position: "relative", maxWidth: 460 }}>
            <h2 style={{ fontSize: 34, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.03em", color: "#ffffff", margin: 0 }}>
              An assistant on your website that answers, sells and books.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#94a3b8", margin: "14px 0 26px" }}>
              Teach it about your business once. It talks to every visitor, day and night.
            </p>

            {/* Mini chat preview */}
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="lg-bubble" style={{ alignSelf: "flex-end", background: "#ffffff", color: "#0f172a", borderBottomRightRadius: 6 }}>
                Do you deliver to Kochi?
              </div>
              <div className="lg-bubble" style={{ alignSelf: "flex-start", background: "rgba(255,255,255,.08)", color: "#e2e8f0", borderBottomLeftRadius: 6 }}>
                Yes! Delivery to Kochi takes 2–3 days and is free above ₹999. Want me to show our best sellers?
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Show best sellers", "Book a call"].map((c) => (
                  <span key={c} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", color: "#cbd5e1" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, color: "#94a3b8" }}>
            {["Set up in minutes", "Works on any website", "Free trial, no card"].map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </aside>

        {/* Form side */}
        <main className="lg-side">
          <div className="lg-card">
            <div className="lg-mobile-logo" style={{ display: "none", textAlign: "center", marginBottom: 26 }}>
              <Image
                src="/ferry/svg/ferry-horizontal-black.svg"
                alt="Ferry by RYX AI"
                width={150}
                height={34}
                style={{ width: "auto", height: 34, margin: "0 auto" }}
                priority
              />
            </div>

            <div style={{ marginBottom: 26 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.03em", margin: 0 }}>
                {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
              </h1>
              <p style={{ fontSize: 14, color: "#64748b", margin: "8px 0 0" }}>
                {mode === "signin"
                  ? "Sign in to manage your assistant."
                  : mode === "signup"
                    ? "Start your free trial. No card needed."
                    : "Enter your email and we'll send you a reset link."}
              </p>
            </div>

            {mode !== "forgot" && (
              <>
                {/* Tab Switcher */}
                <div style={{ display: "flex", borderRadius: 12, background: "#eef2f6", padding: 4, marginBottom: 22 }}>
                  {(["signin", "signup"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="lg-tab"
                      onClick={() => setMode(m)}
                      style={{
                        background: mode === m ? "#ffffff" : "transparent",
                        color: mode === m ? "#0f172a" : "#64748b",
                        boxShadow: mode === m ? "0 1px 2px rgba(15,23,42,.08), 0 0 0 1px #e2e8f0" : "none",
                      }}
                    >
                      {m === "signin" ? "Sign in" : "Sign up"}
                    </button>
                  ))}
                </div>

                {/* Google SSO Container */}
                <div style={{ display: "flex", justifyContent: "center", minHeight: 44 }}>
                  <div id="googleBtnContainer" style={{ width: "100%", maxWidth: 320, display: "flex", justifyContent: "center" }} />
                </div>

                <div style={{ display: "flex", alignItems: "center", margin: "20px 0", color: "#94a3b8", fontSize: 12 }}>
                  <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                  <span style={{ padding: "0 12px" }}>or with email</span>
                  <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                </div>
              </>
            )}

            {mode === "forgot" && forgotSent ? (
              <div style={{ textAlign: "center", padding: "6px 0" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: "#ecfdf5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 6h16v12H4z" />
                    <path d="m4 7 8 6 8-6" />
                  </svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>Check your email</h3>
                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 22px" }}>
                  If an account exists for <strong style={{ color: "#0f172a" }}>{email}</strong>, we&apos;ve sent a link to
                  reset your password. Check your inbox and spam folder.
                </p>
                <button
                  type="button"
                  className="lg-primary"
                  onClick={() => {
                    setMode("signin");
                    setForgotSent(false);
                    setError("");
                  }}
                  style={{ background: "#0f172a", cursor: "pointer" }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              /* Auth Form */
              <form onSubmit={handleSubmit}>
                {mode === "signup" && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="fullName" className="lg-label">
                      Full name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      className="lg-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your name"
                      required
                      autoComplete="name"
                    />
                  </div>
                )}

                {/* Email Field */}
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="email" className="lg-label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="lg-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                  />
                </div>

                {/* Password Field (Only for signin/signup) */}
                {mode !== "forgot" && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                      <label htmlFor="password" className="lg-label" style={{ marginBottom: 0 }}>
                        Password
                      </label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="lg-link"
                          onClick={() => {
                            setMode("forgot");
                            setError("");
                            setForgotSent(false);
                          }}
                          style={{ fontWeight: 500, color: "#64748b" }}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div style={{ position: "relative" }}>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        className="lg-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                        required
                        minLength={6}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        style={{ paddingRight: 44 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          padding: 6,
                          display: "flex",
                          borderRadius: 8,
                        }}
                      >
                        {showPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.1 6.1A17 17 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 4-.9" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                            <circle cx="12" cy="12" r="2.6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p
                    role="alert"
                    style={{
                      margin: "0 0 16px",
                      fontSize: 13,
                      color: "#b91c1c",
                      background: "#fef2f2",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #fecaca",
                    }}
                  >
                    {error}
                  </p>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="lg-primary"
                  disabled={loading}
                  style={{
                    background: success ? "#10b981" : "#0f172a",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                    boxShadow: "0 1px 2px rgba(15,23,42,.1), 0 8px 20px rgba(15,23,42,.12)",
                  }}
                >
                  {success
                    ? "Redirecting..."
                    : loading
                      ? mode === "signin"
                        ? "Signing in..."
                        : mode === "signup"
                          ? "Creating account..."
                          : "Sending link..."
                      : mode === "signin"
                        ? "Sign in"
                        : mode === "signup"
                          ? "Create account"
                          : "Send reset link"}
                </button>

                {/* Back to Sign In button for forgot mode */}
                {mode === "forgot" && (
                  <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button
                      type="button"
                      className="lg-link"
                      onClick={() => {
                        setMode("signin");
                        setError("");
                      }}
                      style={{ fontWeight: 500, color: "#64748b" }}
                    >
                      ← Back to sign in
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
