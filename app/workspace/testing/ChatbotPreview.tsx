"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import ProductCards, { type ProductCard } from "./ProductCards";

export interface DocumentVisual {
  image_url: string;
  document: string;
  page: number;
  description: string;
  visual_key?: string;
}

export interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp?: string;
  calendarUrl?: string;
  followups?: string[];
  products?: ProductCard[];
}

export interface ChatbotPreviewProps {
  themeColor: string;
  tenantName: string;
  tenantSlug?: string;
  isExpanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  onReset?: () => void;
  isSubscriptionActive?: boolean;
  /** Shop mode: shopper starter questions instead of demo booking. */
  isShop?: boolean;
}

// Pure ID and timestamp generators to satisfy React compiler purity rules
let idCounter = 0;
function createMsgId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function getFormattedTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export interface StoredPreviewSession {
  visitor_token: string;
  session_id: string;
  visitor_id?: string;
  tenant_slug: string;
  expires_at?: number;
}

function getPreviewStorageKey(slug: string): string {
  return `ryx_preview_session_${slug || "preview"}`;
}

function readStoredPreviewSession(slug: string): StoredPreviewSession | null {
  try {
    if (typeof window === "undefined" || !window.localStorage || !slug) return null;
    const raw = window.localStorage.getItem(getPreviewStorageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.visitor_token === "string" &&
      parsed.visitor_token.startsWith("v1.") &&
      typeof parsed.session_id === "string" &&
      parsed.session_id.length >= 16 &&
      parsed.tenant_slug === slug
    ) {
      return parsed;
    }
  } catch (e) {
    console.warn("[ChatbotPreview] Error reading stored session:", e);
  }
  return null;
}

function persistPreviewSession(
  slug: string,
  data: {
    visitor_token: string;
    session_id: string;
    visitor_id?: string;
    tenant_slug?: string;
    expires_at?: number;
  }
): StoredPreviewSession | null {
  try {
    if (typeof window === "undefined" || !window.localStorage || !slug) return null;
    if (!data.visitor_token || !data.session_id) return null;
    const state: StoredPreviewSession = {
      visitor_token: data.visitor_token,
      session_id: data.session_id,
      visitor_id: data.visitor_id || "",
      tenant_slug: slug,
      expires_at: data.expires_at || 0,
    };
    window.localStorage.setItem(getPreviewStorageKey(slug), JSON.stringify(state));
    return state;
  } catch (e) {
    console.warn("[ChatbotPreview] Error saving stored session:", e);
    return null;
  }
}

function formatTimeFromISO(isoStr?: string): string {
  if (!isoStr) return getFormattedTime();
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return getFormattedTime();
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return getFormattedTime();
  }
}

async function restoreConversationMessages(
  token: string,
  sessId: string,
  slug: string
): Promise<ChatMessage[] | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Visitor-Token": token,
      "X-Tenant-Slug": slug,
    };
    const convRes = await fetch("/api/chat/conversations?limit=20", { headers });
    if (!convRes.ok) return null;
    const convData = await convRes.json();
    const conversations = convData?.conversations || [];
    const matchedConv = (conversations as Array<{ id?: string | number; session_id?: string; message_count?: number }>)
      .find((c) => c.session_id === sessId);
    if (!matchedConv || !matchedConv.id || matchedConv.message_count === 0) {
      return null;
    }
    const msgRes = await fetch(
      `/api/chat/conversations/${matchedConv.id}/messages?limit=50&offset=0`,
      { headers }
    );
    if (!msgRes.ok) return null;
    const msgData = await msgRes.json();
    const rawMsgs = msgData?.messages || [];
    if (!Array.isArray(rawMsgs) || rawMsgs.length === 0) return null;

    return (rawMsgs as Array<{ id?: string | number; sequence_number?: number; role?: string; content?: string; created_at?: string }>).map((m) => ({
      id: `msg_${m.id || m.sequence_number}`,
      sender: m.role === "assistant" ? "bot" : "user",
      text: m.content ?? "",
      timestamp: formatTimeFromISO(m.created_at),
    }));
  } catch (err) {
    console.warn("[ChatbotPreview] Failed to restore previous messages:", err);
    return null;
  }
}

// Star Icon component matching screenshots (Declared outside render)
function StarIcon({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        backgroundColor: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        flexShrink: 0,
        boxShadow: `0 2px 6px ${color}40`,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    </div>
  );
}

// Send Plane Icon (Declared outside render)
function SendIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: -2, marginTop: 1 }}
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// Format basic markdown safely without external libraries
function formatSimpleMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  // Strip action tags if any
  const cleaned = text
    .replace(/\[\s*(IMAGE|ACTION|ANALYTICS|FOLLOWUP)(:[^\]]*)?\]?/gi, "")
    .trim();

  const lines = cleaned.split("\n");
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (!line.trim()) {
      nodes.push(<div key={`spacer-${lineIdx}`} style={{ height: "0.5rem" }} />);
      return;
    }

    // Process bold (**bold**) and inline code (`code`) and markdown links
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={`b-${match.index}`} style={{ fontWeight: 700 }}>
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code
            key={`c-${match.index}`}
            style={{
              backgroundColor: "rgba(0,0,0,0.06)",
              padding: "2px 5px",
              borderRadius: 4,
              fontFamily: "monospace",
              fontSize: "0.85em",
            }}
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
        const linkMatch = token.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          parts.push(
            <a
              key={`a-${match.index}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#FF4D00",
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              {linkMatch[1]}
            </a>,
          );
        } else {
          parts.push(token);
        }
      }
      lastIndex = match.index + token.length;
    }

    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }

    const isBullet = line.trim().startsWith("• ") || line.trim().startsWith("- ");

    nodes.push(
      <p
        key={`line-${lineIdx}`}
        style={{
          margin: 0,
          marginBottom: lineIdx < lines.length - 1 ? 6 : 0,
          lineHeight: 1.6,
          paddingLeft: isBullet ? 14 : 0,
          textIndent: isBullet ? -14 : 0,
        }}
      >
        {parts}
      </p>,
    );
  });

  return nodes;
}

export function ChatbotPreview({
  themeColor = "#FF4D00",
  tenantName = "Tigrid Technologies",
  tenantSlug = "",
  isExpanded,
  onExpandChange,
  onReset,
  isSubscriptionActive = true,
  isShop = false,
}: ChatbotPreviewProps) {
  // Business name as visitors should read it: workspaces are created as
  // "<Name>'s Workspace", so that suffix is dropped.
  const effectiveTenantName = tenantName.trim().replace(/['’]s workspace$/i, "").trim() || "RYX AI";
  // "RYX AI" + "AI Assistant" would read "RYX AI AI Assistant".
  const assistantLabel = /(?:^|\s)AI$/i.test(effectiveTenantName)
    ? `${effectiveTenantName} assistant`
    : `${effectiveTenantName} AI assistant`;

  const [visitorToken, setVisitorToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize with greeting state directly (avoiding cascading setState in effect)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "greeting",
      sender: "bot",
      text: `Hello! I'm the ${assistantLabel}. How can I help you today?`,
      timestamp: getFormattedTime(),
    },
  ]);

  const [documents, setDocuments] = useState<DocumentVisual[]>([]);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(true);
  // Width ÷ height of the slide on show, so its box can take the same shape.
  const [docRatio, setDocRatio] = useState<number | null>(null);
  // Portrait pages: how far down the page the view is (0 = top, as a share
  // of the page height), the stage's own shape, and whether the next slide
  // should open at its bottom (when stepping backwards).
  const [pageOffset, setPageOffset] = useState(0);
  const [stageRatio, setStageRatio] = useState(16 / 9);
  const stageRef = useRef<HTMLDivElement>(null);
  const startAtEndRef = useRef(false);
  // Slide-change animation: direction of travel and the slide that is leaving.
  const [slideDir, setSlideDir] = useState<"next" | "prev" | null>(null);
  const [outgoingSlide, setOutgoingSlide] = useState<{ url: string; dir: "next" | "prev"; id: number } | null>(null);
  // Height of the slide panel, so the chat panel beside it can match it.
  const docPanelRef = useRef<HTMLDivElement>(null);
  const [docPanelHeight, setDocPanelHeight] = useState<number | null>(null);

  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lightboxDoc, setLightboxDoc] = useState<DocumentVisual | null>(null);

  const chatInputRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initPromiseRef = useRef<Promise<unknown> | null>(null);

  // Preset suggested prompts matching Reference Screenshot 1
  const presetQuestions = isShop
    ? [
        "What are your bestsellers?",
        "How long does delivery take?",
        "What is your return policy?",
      ]
    : [
        `What does ${effectiveTenantName} do?`,
        `What are the services provided by ${effectiveTenantName}?`,
        "Book a Demo/Call",
      ];

  // Helper to initialize conversation with greeting
  const resetGreeting = useCallback(() => {
    const greetingText = `Hello! I'm the ${assistantLabel}. How can I help you today?`;
    setMessages([
      {
        id: createMsgId("greet"),
        sender: "bot",
        text: greetingText,
        timestamp: getFormattedTime(),
      },
    ]);
    setDocuments([]);
    setActiveDocIndex(0);
    setIsDocViewerOpen(true);
  }, [effectiveTenantName]);

  // Initial Session setup and conversation restoration
  useEffect(() => {
    if (!tenantSlug) return;
    let isCancelled = false;

    async function initSession() {
      try {
        const stored = readStoredPreviewSession(tenantSlug);
        const curToken = stored?.visitor_token || null;
        const curSessionId = stored?.session_id || null;

        if (curToken && curSessionId) {
          if (!isCancelled) {
            setVisitorToken(curToken);
            setSessionId(curSessionId);
          }

          // Attempt to restore existing messages for this session
          const restored = await restoreConversationMessages(curToken, curSessionId, tenantSlug);
          if (!isCancelled && restored && restored.length > 0) {
            setMessages(restored);
            if (!isExpanded) {
              onExpandChange(true);
            }
          }

          // Check if token should be verified / renewed with backend
          const nowSec = Math.floor(Date.now() / 1000);
          const needsRenewal = !stored?.expires_at || stored.expires_at <= nowSec + 3600;
          if (needsRenewal) {
            const res = await fetch("/api/chat/session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Tenant-Slug": tenantSlug,
                "X-Visitor-Token": curToken,
              },
              body: JSON.stringify({}),
            });
            if (res.ok) {
              const data = await res.json();
              if (!isCancelled && data?.visitor_token) {
                persistPreviewSession(tenantSlug, {
                  visitor_token: data.visitor_token,
                  session_id: data.session_id || curSessionId,
                  visitor_id: data.visitor_id,
                  tenant_slug: tenantSlug,
                  expires_at: data.expires_at,
                });
                setVisitorToken(data.visitor_token);
                if (data.session_id) setSessionId(data.session_id);
              }
            } else if (res.status === 401 || res.status === 403) {
              // Token invalid or revoked, mint fresh identity
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(getPreviewStorageKey(tenantSlug));
              }
              const freshRes = await fetch("/api/chat/session", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Tenant-Slug": tenantSlug,
                },
                body: JSON.stringify({}),
              });
              if (freshRes.ok) {
                const data = await freshRes.json();
                if (!isCancelled && data?.visitor_token) {
                  persistPreviewSession(tenantSlug, {
                    visitor_token: data.visitor_token,
                    session_id: data.session_id,
                    visitor_id: data.visitor_id,
                    tenant_slug: tenantSlug,
                    expires_at: data.expires_at,
                  });
                  setVisitorToken(data.visitor_token);
                  setSessionId(data.session_id);
                  resetGreeting();
                }
              }
            }
          }
        } else {
          // No stored session, initialize a fresh one
          const res = await fetch("/api/chat/session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Tenant-Slug": tenantSlug,
            },
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const data = await res.json();
            if (!isCancelled && data?.visitor_token) {
              persistPreviewSession(tenantSlug, {
                visitor_token: data.visitor_token,
                session_id: data.session_id,
                visitor_id: data.visitor_id,
                tenant_slug: tenantSlug,
                expires_at: data.expires_at,
              });
              setVisitorToken(data.visitor_token);
              setSessionId(data.session_id);
            }
          }
        }
      } catch (err) {
        console.warn("[ChatbotPreview] Session initialization error:", err);
      }
    }

    if (!initPromiseRef.current) {
      initPromiseRef.current = initSession().finally(() => {
        initPromiseRef.current = null;
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [tenantSlug]);

  // Auto-scroll messages inside the message container without scrolling the main browser window
  // Runs after layout settles, so a reply's suggestion buttons and a resized
  // chat panel (it matches the slide's height) never leave the latest reply cut off.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (messagesScrollRef.current) {
        messagesScrollRef.current.scrollTo({
          top: messagesScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [messages, isLoading, docPanelHeight]);

  // Escape key for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lightboxDoc) {
        setLightboxDoc(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxDoc]);

  // Handle Cal.com booking confirmation message listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = (event.origin || "").toLowerCase();
      if (!origin.includes("cal.com") && !origin.includes("cal.video")) return;

      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;

      const rawType = (
        payload.type ||
        payload.action ||
        payload.event ||
        (payload.detail && (payload.detail.type || payload.detail.action)) ||
        ""
      )
        .toString()
        .toLowerCase();

      if (rawType.includes("bookingsuccessful") || rawType.includes("bookingconfirmed")) {
        const d = payload.data || payload;
        const title = (d.title || d.eventName || "Demo Call").toString().trim();
        const confText = `🎉 **Your meeting has been successfully booked!**\n\n• **Meeting:** ${title}\n\nFeel free to ask if you have any questions before our call!`;
        setMessages((prev) => [
          ...prev,
          {
            id: createMsgId("booking"),
            sender: "bot",
            text: confText,
            timestamp: getFormattedTime(),
          },
        ]);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Reset / New Conversation Action
  const handleResetConversation = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    resetGreeting();
    setInputText("");
    onExpandChange(false);
    if (onReset) onReset();

    // Call backend for a clean new conversation session if available
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (visitorToken) headers["X-Visitor-Token"] = visitorToken;
      if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;

      const res = await fetch("/api/chat/conversations/new", {
        method: "POST",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.session_id) {
          setSessionId(data.session_id);
          const tok = data.visitor_token || visitorToken;
          if (tok) setVisitorToken(tok);
          if (tenantSlug && tok) {
            persistPreviewSession(tenantSlug, {
              visitor_token: tok,
              session_id: data.session_id,
              tenant_slug: tenantSlug,
            });
          }
        }
      }
    } catch {
      // Offline / fallback session id
      const fbSess = createMsgId("ryx_sess");
      setSessionId(fbSess);
      if (tenantSlug && visitorToken) {
        persistPreviewSession(tenantSlug, {
          visitor_token: visitorToken,
          session_id: fbSess,
          tenant_slug: tenantSlug,
        });
      }
    }
  };

  // Helper to ensure safe image URLs
  const resolveSafeImageUrl = (rawUrl?: string): string => {
    if (!rawUrl) return "";
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return trimmed;
    }
    return `/${trimmed}`;
  };

  // Send message implementation
  const handleSendMessage = async (textToSend?: string) => {
    const rawMessage = (textToSend ?? inputText).trim();
    if (!rawMessage || isLoading) return;

    if (!isSubscriptionActive) {
      setMessages((prev) => [
        ...prev,
        {
          id: createMsgId("usr"),
          sender: "user",
          text: rawMessage,
          timestamp: getFormattedTime(),
        },
        {
          id: createMsgId("bot_exp"),
          sender: "bot",
          text: "⚠️ This AI assistant is temporarily unavailable because the subscription/trial has expired. Please upgrade in Billing & Plans.",
          timestamp: getFormattedTime(),
        },
      ]);
      setInputText("");
      if (!isExpanded) onExpandChange(true);
      return;
    }

    // 1. Instantly transition to expanded state on first message
    if (!isExpanded) {
      onExpandChange(true);
    }

    const userMsgId = createMsgId("usr");
    const botMsgId = createMsgId("bot");

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: "user",
        text: rawMessage,
        timestamp: getFormattedTime(),
      },
    ]);

    setInputText("");
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Ensure visitor token
      let currentTok = visitorToken;
      let currentSess = sessionId;

      if (!currentTok || !currentSess) {
        const stored = readStoredPreviewSession(tenantSlug || "");
        if (stored?.visitor_token && stored?.session_id) {
          currentTok = stored.visitor_token;
          currentSess = stored.session_id;
          setVisitorToken(currentTok);
          setSessionId(currentSess);
        } else {
          const sessRes = await fetch("/api/chat/session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {}),
              ...(currentTok ? { "X-Visitor-Token": currentTok } : {}),
            },
            body: JSON.stringify({}),
            signal: controller.signal,
          });
          if (sessRes.ok) {
            const sessData = await sessRes.json();
            currentTok = sessData.visitor_token;
            currentSess = sessData.session_id;
            setVisitorToken(currentTok);
            setSessionId(currentSess);
            if (tenantSlug && currentTok && currentSess) {
              persistPreviewSession(tenantSlug, {
                visitor_token: currentTok,
                session_id: currentSess,
                visitor_id: sessData.visitor_id,
                tenant_slug: tenantSlug,
                expires_at: sessData.expires_at,
              });
            }
          }
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (currentTok) headers["X-Visitor-Token"] = currentTok;
      if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: rawMessage,
          session_id: currentSess || createMsgId("sess"),
        }),
        signal: controller.signal,
      });

      // Renewed token header check
      const renewedHeader = response.headers.get("X-RYX-Visitor-Token");
      if (renewedHeader) {
        setVisitorToken(renewedHeader);
        if (tenantSlug && currentSess) {
          persistPreviewSession(tenantSlug, {
            visitor_token: renewedHeader,
            session_id: currentSess,
            tenant_slug: tenantSlug,
          });
        }
      }

      if (!response.ok) {
        let errDetail = "Unable to process message. Please try again.";
        try {
          const errJson = await response.json();
          errDetail = errJson.detail || errJson.error || errDetail;
        } catch {
          // not json
        }
        setMessages((prev) => [
          ...prev,
          {
            id: botMsgId,
            sender: "bot",
            text: errDetail,
            timestamp: getFormattedTime(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      if (!response.body) {
        setMessages((prev) => [
          ...prev,
          {
            id: botMsgId,
            sender: "bot",
            text: "No response body received from assistant.",
            timestamp: getFormattedTime(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      // Add placeholder bot message entry for real-time streaming
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          sender: "bot",
          text: "",
          timestamp: getFormattedTime(),
        },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamBuffer = "";
      let isDone = false;
      let replyHadSlides = false;

      while (!isDone) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, "").trim();
            if (!line.startsWith("data: ")) continue;

            const payloadStr = line.slice(6).trim();
            if (payloadStr === "[DONE]") {
              isDone = true;
              break;
            }

            try {
              const data = JSON.parse(payloadStr);

              if (data.content !== undefined) {
                const chunk = String(data.content);
                setMessages((prev) =>
                  prev.map((m) => (m.id === botMsgId ? { ...m, text: m.text + chunk } : m)),
                );
              }

              // Handle actual document visuals (never fake or placeholder)
              if (data.meta_visuals && Array.isArray(data.meta_visuals) && data.meta_visuals.length > 0) {
                const validVisuals: DocumentVisual[] = data.meta_visuals.map((v: Partial<DocumentVisual>) => ({
                  image_url: resolveSafeImageUrl(v.image_url),
                  document: v.document || "Document",
                  page: v.page || 1,
                  description: v.description || "",
                  visual_key: v.visual_key || "",
                }));
                setDocuments(validVisuals);
                setActiveDocIndex(0);
                setIsDocViewerOpen(true);
                replyHadSlides = true;
              } else if (data.meta_image_url && typeof data.meta_image_url === "string") {
                const singleDoc: DocumentVisual = {
                  image_url: resolveSafeImageUrl(data.meta_image_url),
                  document: "Document Preview",
                  page: 1,
                  description: "",
                };
                setDocuments([singleDoc]);
                setActiveDocIndex(0);
                setIsDocViewerOpen(true);
                replyHadSlides = true;
              }

              // Handle calendar URL if returned
              if (data.meta_calendar_url) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId ? { ...m, calendarUrl: data.meta_calendar_url } : m,
                  ),
                );
              }

              // Shop mode: product cards for the products the reply names
              if (data.meta_products && Array.isArray(data.meta_products)) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId ? { ...m, products: data.meta_products } : m,
                  ),
                );
              }

              // Handle followups if returned
              if (data.meta_followups && Array.isArray(data.meta_followups)) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId ? { ...m, followups: data.meta_followups } : m,
                  ),
                );
              }
            } catch {
              // Ignore malformed partial chunks
            }
          }
        }
      }

      // A completed reply without slides: remove the previous reply's slides
      // so they are not shown next to an answer they do not belong to.
      if (isDone && !replyHadSlides) {
        setDocuments([]);
      }

      // Handle any remaining buffer
      if (streamBuffer.trim().startsWith("data: ")) {
        const payloadStr = streamBuffer.trim().slice(6).trim();
        if (payloadStr && payloadStr !== "[DONE]") {
          try {
            const data = JSON.parse(payloadStr);
            if (data.content !== undefined) {
              const chunk = String(data.content);
              setMessages((prev) =>
                prev.map((m) => (m.id === botMsgId ? { ...m, text: m.text + chunk } : m)),
              );
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.warn("[ChatbotPreview] Chat streaming error:", err);
      // Graceful offline message fallback
      setMessages((prev) => {
        const hasExisting = prev.some((m) => m.id === botMsgId);
        if (hasExisting) {
          return prev.map((m) =>
            m.id === botMsgId && !m.text
              ? {
                  ...m,
                  text: `I'm currently unable to connect to the assistant server. Please verify your connection or refresh the page.`,
                }
              : m,
          );
        }
        return [
          ...prev,
          {
            id: botMsgId,
            sender: "bot",
            text: `I'm currently unable to connect to the assistant server. Please verify your connection or refresh the page.`,
            timestamp: getFormattedTime(),
          },
        ];
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const hasDocuments = documents.length > 0 && isDocViewerOpen;
  const currentDoc = hasDocuments ? documents[activeDocIndex] || documents[0] : null;

  // Slide panel sizing. The panel is always the same height (that of a 16:9
  // slide at full width) and only its width follows the slide's shape, so a
  // narrower slide gets no empty side margins and the chat takes the space.
  const SLIDE_MAX_WIDTH = "((100cqw - 1.5rem) * 2 / 3)";
  const SLIDE_STAGE_HEIGHT = `max(340px, min(${SLIDE_MAX_WIDTH} * 9 / 16, 100vh - 260px, 640px))`;
  const slideRatio = docRatio ?? 16 / 9;
  // Portrait pages (A4 and taller) would be too small to read if shrunk to
  // fit the height, so they use the full width and are shown in parts.
  const isPartsMode = slideRatio < 0.95;
  const slidePanelWidth = isPartsMode
    ? `calc${SLIDE_MAX_WIDTH}`
    : `max(300px, min(${SLIDE_MAX_WIDTH}, ${SLIDE_STAGE_HEIGHT} * ${slideRatio.toFixed(4)}))`;
  const pageViewShare = isPartsMode ? Math.min(1, slideRatio / stageRatio) : 1;
  const pageMaxOffset = Math.max(0, 1 - pageViewShare);
  const pageStep = pageViewShare * 0.9; // each step keeps 10% of the previous view
  const pageOffsetNow = Math.min(pageOffset, pageMaxOffset);
  const hasPageParts = isPartsMode && pageMaxOffset > 0.001;

  // Move to the previous or next slide, keeping the leaving slide on screen
  // just long enough to animate it out.
  const goToSlide = (dir: "next" | "prev") => {
    if (hasPageParts) {
      if (dir === "next" && pageOffsetNow < pageMaxOffset - 0.001) {
        setPageOffset(Math.min(pageMaxOffset, pageOffsetNow + pageStep));
        return;
      }
      if (dir === "prev" && pageOffsetNow > 0.001) {
        setPageOffset(Math.max(0, pageOffsetNow - pageStep));
        return;
      }
    }
    const total = documents.length;
    if (total < 2) {
      // A single long page: loop back to its other end.
      if (hasPageParts) setPageOffset(dir === "next" ? 0 : pageMaxOffset);
      return;
    }
    startAtEndRef.current = dir === "prev";
    const leaving = documents[activeDocIndex] || documents[0];
    if (leaving) setOutgoingSlide({ url: leaving.image_url, dir, id: Date.now() });
    setSlideDir(dir);
    setActiveDocIndex((prev) => (dir === "next" ? (prev + 1) % total : (prev - 1 + total) % total));
  };

  // A new slide opens at its top, or at its bottom when stepping backwards.
  useEffect(() => {
    setPageOffset(startAtEndRef.current ? 1 : 0);
    startAtEndRef.current = false;
    // Take the shape from the slide now on screen. If it is still loading (or
    // failed), forget the previous slide's shape; onLoad fills it in.
    const imgs = stageRef.current ? stageRef.current.querySelectorAll("img") : null;
    const shown = imgs && imgs.length ? (imgs[imgs.length - 1] as HTMLImageElement) : null;
    setDocRatio(shown && shown.complete && shown.naturalWidth && shown.naturalHeight
      ? shown.naturalWidth / shown.naturalHeight
      : null);
  }, [activeDocIndex, currentDoc?.image_url, documents]);

  // Track the stage's shape so the parts match what is actually visible.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setStageRatio(box.width / box.height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasDocuments, currentDoc?.image_url]);

  // Mouse wheel / trackpad moves through a portrait page. Attached natively
  // so it can stop the page behind from scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !hasPageParts) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pageHeightPx = el.getBoundingClientRect().width / slideRatio || 1;
      const deltaPx = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      setPageOffset((o) => Math.max(0, Math.min(pageMaxOffset, Math.min(o, pageMaxOffset) + deltaPx / pageHeightPx)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasPageParts, pageMaxOffset, slideRatio]);

  useEffect(() => {
    if (!outgoingSlide) return;
    const timer = window.setTimeout(() => setOutgoingSlide(null), 650);
    return () => window.clearTimeout(timer);
  }, [outgoingSlide]);

  // Keep the chat panel level with the slide panel (side-by-side layout only).
  useEffect(() => {
    const el = docPanelRef.current;
    if (!el || !hasDocuments) {
      setDocPanelHeight(null);
      return;
    }
    const measure = () => {
      const sideBySide = window.innerWidth > 900;
      setDocPanelHeight(sideBySide ? Math.round(el.getBoundingClientRect().height) : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hasDocuments]);

  // =========================================================================
  // INITIAL STATE – IDLE PREVIEW (Screenshot 1 Reference)
  // =========================================================================
  if (!isExpanded) {
    return (
      <div
        className="ryx-idle-preview-card"
        style={{
          width: "100%",
          minHeight: 560,
          maxHeight: 740,
          height: "calc(100vh - 140px)",
          borderRadius: 24,
          backgroundColor: "#FFFFFF",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          border: "1px solid #E5E7EB",
          transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            borderBottom: "1px solid #F3F4F6",
          }}
        >
          <StarIcon color={themeColor} />
          <span
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "#1F2937",
              fontFamily: "inherit",
            }}
          >
            AI Assistant
          </span>
        </div>

        {/* Scrollable Message Content & Suggested Prompts */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Welcome Message */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p
              style={{
                fontSize: "0.92rem",
                lineHeight: 1.6,
                color: "#1F2937",
                margin: 0,
              }}
            >
              Hello! I&apos;m the {assistantLabel}. How can I help you today?
            </p>
          </div>

          {/* Suggested Prompt Buttons (Pills with Orange outline & text) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "0.65rem",
              marginTop: "0.25rem",
            }}
          >
            {presetQuestions.map((qText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(qText)}
                style={{
                  background: "#FFFFFF",
                  border: `1.5px solid ${themeColor}`,
                  color: themeColor,
                  borderRadius: 9999,
                  padding: "0.55rem 1.15rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                  fontFamily: "inherit",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = themeColor;
                  e.currentTarget.style.color = "#FFFFFF";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#FFFFFF";
                  e.currentTarget.style.color = themeColor;
                }}
              >
                {qText}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Input Area */}
        <div
          style={{
            padding: "0.75rem 1.25rem 0.5rem 1.25rem",
            borderTop: "1px solid #F3F4F6",
            backgroundColor: "#FFFFFF",
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#F3F4F6",
              borderRadius: 9999,
              padding: "4px 6px 4px 16px",
              border: "1px solid #E5E7EB",
            }}
          >
            <input
              ref={chatInputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type to Ask"
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "0.88rem",
                color: "#1F2937",
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              aria-label="Send message"
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: themeColor,
                border: "none",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isLoading || !inputText.trim() ? "default" : "pointer",
                opacity: isLoading || !inputText.trim() ? 0.7 : 1,
                boxShadow: `0 2px 8px ${themeColor}40`,
                transition: "transform 0.15s ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isLoading && inputText.trim()) {
                  e.currentTarget.style.transform = "scale(1.05)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <SendIcon />
            </button>
          </form>

          {/* Footer Branding */}
          <div
            style={{
              textAlign: "center",
              fontSize: "0.7rem",
              color: "#9CA3AF",
              paddingTop: "0.5rem",
              paddingBottom: "0.25rem",
              userSelect: "none",
            }}
          >
            Powered by <strong style={{ color: "#6B7280" }}>RYX AI</strong> · ©2026
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ACTIVE STATE – EXPANDED TESTING WORKSPACE (Screenshot 2 Reference)
  // =========================================================================
  return (
    <div
      className="ryx-active-expanded-workspace"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        animation: "workspaceFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Expanded Two-Panel or Single-Panel Layout */}
      <div
        className="ryx-panels-row"
        style={{
          containerType: "inline-size",
          display: "flex",
          gap: "1.5rem",
          alignItems: "stretch",
          width: "100%",
          minHeight: 560,
        }}
      >
        {/* ===================================================================
            LEFT PANEL: Document Viewer (Rendered ONLY when actual documents exist)
           =================================================================== */}
        {hasDocuments && currentDoc && (
          <div
            ref={docPanelRef}
            className="ryx-document-viewer-panel"
            onMouseMove={(e) => {
              const panel = e.currentTarget;
              const box = panel.getBoundingClientRect();
              const x = e.clientX - box.left;
              const y = e.clientY - box.top;
              const side = Math.max(110, box.width * 0.2);
              panel.classList.toggle("ryx-zone-left", x < side);
              panel.classList.toggle("ryx-zone-right", x > box.width - side);
              panel.classList.toggle("ryx-zone-counter", x < 180 && y < 110);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove("ryx-zone-left", "ryx-zone-right", "ryx-zone-counter");
            }}
            style={{
              flex: "0 0 auto",
              width: slidePanelWidth,
              minWidth: 0,
              transition: "width 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
              borderRadius: 22,
              backgroundColor: "#FFFFFF",
              border: "1px solid #E5E7EB",
              boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              alignSelf: "flex-start",
              animation: "slideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Page counter: floats over the top-left corner of the slide */}
            <div className="ryx-pv-counter" aria-live="polite">
              {activeDocIndex + 1} of {documents.length}
            </div>

            {/* Close button: appears only when the pointer is near the top-right corner */}
            <div className="ryx-pv-close-zone">
              <button
                type="button"
                className="ryx-pv-close"
                onClick={() => setIsDocViewerOpen(false)}
                aria-label="Close document viewer"
                title="Hide document viewer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Document Navigation Arrows (several slides, or one page shown in parts) */}
            {(documents.length > 1 || hasPageParts) && (
              <>
                <button
                  type="button"
                  className="ryx-pv-nav ryx-pv-prev"
                  onClick={() => goToSlide("prev")}
                  aria-label="Previous slide"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="ryx-pv-nav ryx-pv-next"
                  onClick={() => goToSlide("next")}
                  aria-label="Next slide"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}

            {/* Document Image Stage */}
            {hasPageParts && (
              <div className="ryx-pv-page-track" aria-hidden="true">
                <div
                  className="ryx-pv-page-thumb"
                  style={{ height: `${pageViewShare * 100}%`, top: `${pageOffsetNow * 100}%` }}
                />
              </div>
            )}
            <div
              ref={stageRef}
              className="ryx-pv-stage-box"
              style={{
                width: "100%",
                height: SLIDE_STAGE_HEIGHT,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F9FAFB",
                overflow: "hidden",
                cursor: "zoom-in",
              }}
              onClick={() => setLightboxDoc(currentDoc)}
              title="Click to enlarge slide"
            >
              {outgoingSlide && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`out-${outgoingSlide.id}`}
                  src={outgoingSlide.url}
                  alt=""
                  aria-hidden="true"
                  className={`ryx-pv-slide-out-${outgoingSlide.dir}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`in-${activeDocIndex}-${currentDoc.image_url}`}
                className={slideDir ? `ryx-pv-slide-in-${slideDir}` : undefined}
                src={currentDoc.image_url}
                alt={currentDoc.description || "Related visual slide"}
                onLoad={(e) => {
                  const im = e.currentTarget;
                  if (im.naturalWidth && im.naturalHeight) {
                    setDocRatio(im.naturalWidth / im.naturalHeight);
                  }
                }}
                style={
                  isPartsMode
                    ? {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        display: "block",
                        width: "100%",
                        height: "auto",
                        transform: `translateY(-${(pageOffsetNow * 100).toFixed(3)}%)`,
                        transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                      }
                    : {
                        display: "block",
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }
                }
              />
            </div>

            {/* Only the slide is shown here. The file name and description
                are left out so the panel stays clean; the enlarged view
                still shows the file name and page. */}
          </div>
        )}

        {/* ===================================================================
            RIGHT PANEL: Conversation Panel (Expands to full width when no doc)
           =================================================================== */}
        <div
          className="ryx-conversation-panel"
          style={{
            flex: hasDocuments ? "1 1 0%" : "1 1 100%",
            maxWidth: hasDocuments ? "none" : 860,
            margin: hasDocuments ? 0 : "0 auto",
            borderRadius: 22,
            backgroundColor: "#FFFFFF",
            boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
            minHeight: hasDocuments && docPanelHeight ? 0 : 540,
            maxHeight: hasDocuments && docPanelHeight ? "none" : 700,
            height: hasDocuments && docPanelHeight ? Math.max(docPanelHeight, 340) : undefined,
            alignSelf: hasDocuments && docPanelHeight ? "flex-start" : undefined,
            border: "1px solid #E5E7EB",
            transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Conversation Panel Header */}
          <div
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #F3F4F6",
              backgroundColor: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
              <StarIcon color={themeColor} />
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: "#1F2937",
                  fontFamily: "inherit",
                }}
              >
                AI Assistant
              </span>
            </div>

            {/* Close / Reset Action in Top-Right of Conversation Card (Screenshot 2) */}
            <button
              type="button"
              onClick={handleResetConversation}
              aria-label="Reset conversation"
              title="Reset conversation"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "1px solid #E5E7EB",
                backgroundColor: "#F9FAFB",
                color: "#6B7280",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "0.95rem",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F3F4F6";
                e.currentTarget.style.color = "#1F2937";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#F9FAFB";
                e.currentTarget.style.color = "#6B7280";
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable Message List */}
          <div
            ref={messagesScrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              backgroundColor: "#FFFFFF",
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    gap: "0.35rem",
                    maxWidth: "100%",
                  }}
                >
                  {/* Bot message header with star badge */}
                  {!isUser && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <StarIcon color={themeColor} />
                      <span
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          color: "#374151",
                        }}
                      >
                        AI Assistant
                      </span>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    style={{
                      maxWidth: "88%",
                      padding: isUser ? "0.65rem 1rem" : "0.75rem 1rem",
                      borderRadius: isUser ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                      backgroundColor: isUser ? "#F3F4F6" : "#FFFFFF",
                      color: isUser ? "#1F2937" : "#374151",
                      border: "none",
                      fontSize: "0.88rem",
                      lineHeight: 1.6,
                      wordBreak: "break-word",
                      boxShadow: isUser ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                    }}
                  >
                    {isUser ? (
                      msg.text
                    ) : (
                      <div>
                        {msg.text ? (
                          formatSimpleMarkdown(msg.text)
                        ) : (
                          <div style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "4px 0" }}>
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: themeColor,
                                animation: "pulseDot 1.2s infinite ease-in-out",
                              }}
                            />
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: themeColor,
                                animation: "pulseDot 1.2s infinite ease-in-out 0.2s",
                              }}
                            />
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: themeColor,
                                animation: "pulseDot 1.2s infinite ease-in-out 0.4s",
                              }}
                            />
                          </div>
                        )}

                        {/* Calendar booking button / iframe */}
                        {msg.calendarUrl && (
                          <div style={{ marginTop: "0.75rem" }}>
                            <a
                              href={msg.calendarUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                backgroundColor: themeColor,
                                color: "#FFFFFF",
                                padding: "0.55rem 1.1rem",
                                borderRadius: 8,
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                textDecoration: "none",
                                boxShadow: `0 2px 8px ${themeColor}40`,
                              }}
                            >
                              <span>📅 Book Meeting</span>
                            </a>
                          </div>
                        )}

                        {msg.products && msg.products.length > 0 && (
                          <ProductCards products={msg.products} themeColor={themeColor} />
                        )}

                        {/* Followup suggested question chips */}
                        {msg.followups && msg.followups.length > 0 && (
                          <div
                            style={{
                              marginTop: "0.85rem",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.5rem",
                            }}
                          >
                            {msg.followups.map((chip, chipIdx) => (
                              <button
                                key={chipIdx}
                                type="button"
                                onClick={() => handleSendMessage(chip)}
                                style={{
                                  backgroundColor: "#FFFFFF",
                                  border: `1.5px solid ${themeColor}`,
                                  color: themeColor,
                                  borderRadius: 9999,
                                  padding: "0.35rem 0.85rem",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = themeColor;
                                  e.currentTarget.style.color = "#FFFFFF";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "#FFFFFF";
                                  e.currentTarget.style.color = themeColor;
                                }}
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =====================================================================
          BOTTOM INPUT SECTION (Underneath Both Panels, matching Screenshot 2)
          ===================================================================== */}
      <div
        className="ryx-bottom-input-container"
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            backgroundColor: "#FFFFFF",
            borderRadius: 9999,
            padding: "5px 6px 5px 20px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.1)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <input
            ref={chatInputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type to Ask"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: "0.92rem",
              color: "#1F2937",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            aria-label="Send message"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              backgroundColor: themeColor,
              border: "none",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isLoading || !inputText.trim() ? "default" : "pointer",
              opacity: isLoading || !inputText.trim() ? 0.7 : 1,
              boxShadow: `0 2px 10px ${themeColor}50`,
              transition: "transform 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isLoading && inputText.trim()) {
                e.currentTarget.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <SendIcon />
          </button>
        </form>

        {/* Branding Footer */}
        <div
          style={{
            fontSize: "0.72rem",
            color: "#9CA3AF",
            userSelect: "none",
          }}
        >
          Powered by <strong style={{ color: "#E5E7EB" }}>RYX AI</strong> · ©2026
        </div>
      </div>

      {/* Lightbox Zoom Modal for Document Slide */}
      {lightboxDoc && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxDoc(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            cursor: "zoom-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: "92vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxDoc(null)}
              style={{
                position: "absolute",
                top: -42,
                right: 0,
                width: 34,
                height: 34,
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                color: "#FFFFFF",
                border: "none",
                cursor: "pointer",
                fontSize: "1.1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxDoc.image_url}
              alt={lightboxDoc.description || "Enlarged document slide"}
              style={{
                maxWidth: "100%",
                maxHeight: "82vh",
                objectFit: "contain",
                borderRadius: 12,
                boxShadow: "0 25px 60px rgba(0,0,0,0.7)",
              }}
            />
            {lightboxDoc.document && (
              <div
                style={{
                  marginTop: "0.85rem",
                  color: "#FFFFFF",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  padding: "0.35rem 1rem",
                  borderRadius: 9999,
                }}
              >
                {lightboxDoc.document} — Page {lightboxDoc.page}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global CSS for dots animation & panel responsiveness */}
      <style jsx>{`
        /* Previous / next buttons: frosted glass, appear when the pointer is
           over the slide, nudge in their direction on hover. */
        .ryx-pv-nav {
          position: absolute;
          top: 50%;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          padding: 0;
          color: #1f2937;
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(14px) saturate(160%);
          -webkit-backdrop-filter: blur(14px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.95);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9);
          opacity: 0;
          transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.25s ease, background 0.25s ease, color 0.25s ease;
        }
        .ryx-pv-prev {
          left: 16px;
          transform: translate(-8px, -50%);
        }
        .ryx-pv-next {
          right: 16px;
          transform: translate(8px, -50%);
        }
        .ryx-document-viewer-panel.ryx-zone-left .ryx-pv-prev,
        .ryx-document-viewer-panel.ryx-zone-right .ryx-pv-next,
        .ryx-pv-nav:focus-visible {
          opacity: 1;
          transform: translate(0, -50%);
        }
        .ryx-pv-nav:hover {
          background: #ffffff;
          color: #7c3aed;
          transform: translate(0, -50%) scale(1.08);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.22), 0 0 0 4px rgba(124, 58, 237, 0.18);
        }
        .ryx-pv-nav:active {
          transform: translate(0, -50%) scale(0.94);
        }
        .ryx-pv-nav:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px #7c3aed;
        }
        .ryx-pv-nav svg {
          transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* Page counter and close button sit on the slide itself, in dark
           frosted glass so they read on light and dark slides alike. */
        .ryx-pv-counter,
        .ryx-pv-close {
          color: #ffffff;
          background: rgba(15, 23, 42, 0.42);
          backdrop-filter: blur(12px) saturate(160%);
          -webkit-backdrop-filter: blur(12px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.35);
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.22);
        }
        .ryx-pv-counter {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 11;
          padding: 0.3rem 0.8rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          pointer-events: none;
          opacity: 0;
          transform: translateY(-4px);
          transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .ryx-document-viewer-panel.ryx-zone-counter .ryx-pv-counter {
          opacity: 1;
          transform: translateY(0);
        }
        .ryx-pv-close-zone {
          position: absolute;
          top: 0;
          right: 0;
          width: 140px;
          height: 110px;
          z-index: 12;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          padding: 14px;
          box-sizing: border-box;
        }
        .ryx-pv-close {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          opacity: 0;
          transform: scale(0.9);
          transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.2s ease;
        }
        .ryx-pv-close-zone:hover .ryx-pv-close,
        .ryx-pv-close:focus-visible {
          opacity: 1;
          transform: scale(1);
        }
        .ryx-pv-close:hover {
          background: rgba(15, 23, 42, 0.62);
        }
        .ryx-pv-close:hover svg {
          transform: rotate(90deg);
        }
        .ryx-pv-close svg {
          transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .ryx-pv-close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px #7c3aed;
        }
        @media (hover: none) {
          .ryx-pv-counter,
          .ryx-pv-close {
            opacity: 1;
            transform: none;
          }
        }
        .ryx-pv-prev:hover svg {
          transform: translateX(-2px);
        }
        .ryx-pv-next:hover svg {
          transform: translateX(2px);
        }
        @media (hover: none) {
          .ryx-pv-nav {
            opacity: 1;
            transform: translate(0, -50%);
          }
        }

        /* Thin bar on the right edge: position within a portrait page */
        .ryx-pv-page-track {
          position: absolute;
          top: 16px;
          bottom: 16px;
          right: 8px;
          width: 4px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.12);
          z-index: 9;
          pointer-events: none;
        }
        .ryx-pv-page-thumb {
          position: absolute;
          left: 0;
          width: 100%;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.5);
          transition: top 0.6s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s ease;
        }

        /* Slide change: the old slide drifts out one side as the new one
           drifts in from the other. */
        @keyframes ryxPvInNext {
          from { opacity: 0; transform: translateX(7%) scale(0.98); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes ryxPvInPrev {
          from { opacity: 0; transform: translateX(-7%) scale(0.98); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes ryxPvOutNext {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to { opacity: 0; transform: translateX(-7%) scale(0.98); }
        }
        @keyframes ryxPvOutPrev {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to { opacity: 0; transform: translateX(7%) scale(0.98); }
        }
        .ryx-pv-slide-in-next {
          animation: ryxPvInNext 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        .ryx-pv-slide-in-prev {
          animation: ryxPvInPrev 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        .ryx-pv-slide-out-next {
          animation: ryxPvOutNext 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .ryx-pv-slide-out-prev {
          animation: ryxPvOutPrev 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .ryx-pv-slide-in-next,
          .ryx-pv-slide-in-prev,
          .ryx-pv-slide-out-next,
          .ryx-pv-slide-out-prev {
            animation-duration: 0.01s;
          }
        }

        @keyframes pulseDot {
          0%,
          80%,
          100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (max-width: 900px) {
          .ryx-panels-row {
            flex-direction: column !important;
          }
          .ryx-document-viewer-panel {
            align-self: stretch !important;
            width: 100% !important;
          }
          .ryx-pv-stage-box {
            height: auto !important;
            aspect-ratio: 16 / 9;
          }
          .ryx-conversation-panel {
            min-height: 440px !important;
          }
        }
      `}</style>
    </div>
  );
}

export default ChatbotPreview;
