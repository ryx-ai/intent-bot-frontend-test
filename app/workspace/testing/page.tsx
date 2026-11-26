"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { unsavedChangesStore } from "@/lib/unsaved-changes";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import { ChatbotPreview } from "./ChatbotPreview";
import ShopProductsCard from "./ShopProductsCard";
import ChatColourPicker, { MATCH_WEBSITE_COLOR } from "./ChatColourPicker";
import ShopSuggestionBanner from "./ShopSuggestionBanner";
import WebsiteConfirmBanner from "../_components/WebsiteConfirmBanner";
import AssistantCollage, { type SettingKey } from "./AssistantCollage";
import LiveSiteStatus from "../_components/SiteStatusChip";

interface Plan {
  id: number;
  slug: string;
  name: string;
  price_inr: number;
  features?: string[];
}

interface SubscriptionStatus {
  subscription_status: "trial" | "active" | "expired" | "canceled" | string;
  is_active: boolean;
  plan: Plan | null;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  days_remaining: number;
  message: string;
}

// Design tokens mapped to CSS variables
const C = {
  bg: "var(--bg)",
  bgSurface: "var(--bg-surface)",
  bgCard: "var(--bg-card)",
  bgHover: "var(--bg-hover)",
  border: "var(--border)",
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  error: "var(--error)",
  success: "var(--success)",
  warning: "#f59e0b",
};

const ROLES = [
  {
    key: "all",
    label: "All-rounder",
    desc: "Does everything: answers questions, shows your products (if you have a store), helps people buy, and books demos or calls when someone asks.",
  },
  {
    key: "hybrid",
    label: "Sales + Support",
    desc: "Answers questions and gently guides people to buy or book.",
  },
  {
    key: "sales",
    label: "Sales",
    desc: "Aggressive qualification and booking. Every message pushes the funnel.",
  },
  {
    key: "support",
    label: "Support",
    desc: "Resolves questions without aggressive selling. Soft CTAs only.",
  },
  {
    key: "booking",
    label: "Demo booking",
    desc: "Focuses only on collecting Name, Email & Time for a demo.",
  },
  {
    key: "shop",
    label: "Shop assistant",
    desc: "For online shops: helps visitors find products and answers shipping, returns and order questions. Never offers demos or calls.",
  },
];

// Empty input -> booking disabled. Otherwise must be a parseable http(s) URL.
function validateCalendarLink(
  raw: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: "" };
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, reason: "Use an http:// or https:// URL" };
    }
    if (!u.hostname || !u.hostname.includes(".")) {
      return {
        ok: false,
        reason: "Enter a complete URL (e.g. https://cal.com/you/demo)",
      };
    }
    return { ok: true, url: candidate };
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
}

type CalCredential = {
  id: number;
  name: string;
  api_key: string;
  event_type_id: string;
  is_active: boolean;
  created_at: string;
};

export interface BotRule {
  id: number;
  tenant_id: number;
  instruction_text: string;
  original_request?: string | null;
  category: string;
  is_active: boolean;
  display_order: number;
  is_applied: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BotRulesListResponse {
  rules: BotRule[];
  has_unapplied_changes: boolean;
  is_customized_by_admin: boolean;
  total_count: number;
  max_rules: number;
}

export interface GenerateRuleResponse {
  rule_text: string;
  category: string;
  status: string;
}

export interface ApplyChangesResponse {
  status: "success" | "blocked" | string;
  message: string;
  rules_applied_count: number;
  effective_prompt?: string;
}

const EXAMPLE_CHIPS = [
  "Don't share pricing",
  "Keep replies short",
  "Reply in Malayalam",
];

export default function TestingPage() {
  const [role, setRole] = useState("hybrid");
  const [themeColor, setThemeColor] = useState("#FF4D00");
  const [calendarLink, setCalendarLink] = useState("");
  const [supportContact, setSupportContact] = useState("");
  // Role as last saved: the test chat follows the saved settings.
  const [savedRole, setSavedRole] = useState("hybrid");
  const [calCredentials, setCalCredentials] = useState<CalCredential[]>([]);
  const [calCredLoading, setCalCredLoading] = useState(true);
  const [calCredName, setCalCredName] = useState("");
  const [calCredApiKey, setCalCredApiKey] = useState("");
  const [calCredEventTypeId, setCalCredEventTypeId] = useState("");
  const [calCredSubmitting, setCalCredSubmitting] = useState(false);
  const [calCredActionId, setCalCredActionId] = useState<number | null>(null);
  const [calCredMessage, setCalCredMessage] = useState("");
  const [calCredError, setCalCredError] = useState("");
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [calDialogType, setCalDialogType] = useState<
    "disconnect" | "remove" | null
  >(null);
  const [calDialogCredId, setCalDialogCredId] = useState<number | null>(null);

  // System Prompt & Super Admin Override State
  const [promptText, setPromptText] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptDirty, setPromptDirty] = useState(false);
  const [userRole, setUserRole] = useState("admin");
  const [isCustomizedByAdmin, setIsCustomizedByAdmin] = useState(false);
  const [resettingPrompt, setResettingPrompt] = useState(false);

  // Custom Rules State (Tell us what to change)
  const [rules, setRules] = useState<BotRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [hasUnappliedChanges, setHasUnappliedChanges] = useState(false);
  const [maxRules, setMaxRules] = useState(15);
  const [ruleInstructionInput, setRuleInstructionInput] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [savingEditRule, setSavingEditRule] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<number | null>(null);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [showSuperAdminOverrideModal, setShowSuperAdminOverrideModal] = useState(false);

  // Collapsible Sections
  const [showBookingOptions, setShowBookingOptions] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Mobile Drawer State
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Two-State Chat Preview Lifecycle
  // False = Initial State (Idle Preview alongside config panel)
  // True = Active State (Expanded Two-Panel Testing Workspace)
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [showConfigDrawerInExpanded, setShowConfigDrawerInExpanded] = useState(false);

  // Reset key incremented only when explicit conversation reset is requested
  const [chatResetKey, setChatResetKey] = useState(0);

  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [calError, setCalError] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantName, setTenantName] = useState("Tigrid Technologies");

  // Bumped after saving so preview or directives refresh cleanly
  const [widgetKey, setWidgetKey] = useState(0);

  // Plan switches (set by the super admin on the Packages page). A plan with no
  // feature list, the platform's own account and the super admin are never locked.
  const planHas = (code: string): boolean => {
    if (isSuperAdmin || tenantSlug === "ryxai") return true;
    const feats = subStatus?.plan?.features;
    if (!feats || feats.length === 0) return true;
    return feats.includes(code);
  };


  // Collage view: which setting is open in the side panel
  const [openSetting, setOpenSetting] = useState<SettingKey | null>(null);
  useEffect(() => {
    if (!openSetting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSetting(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSetting]);

  const isSuperAdmin = userRole === "super_admin";

  // Colour shown in the test chat. "Match your website" can't be shown here (we
  // can't see their site), and plans without own branding use the standard navy.
  const previewColor =
    !planHas("custom_branding") || themeColor.toLowerCase() === MATCH_WEBSITE_COLOR.toLowerCase()
      ? "#0f172a"
      : themeColor;

  function showCalCredentialMessage(message: string, isError = false) {
    if (isError) {
      setCalCredError(message);
      setCalCredMessage("");
      setTimeout(() => setCalCredError(""), 4000);
      return;
    }
    setCalCredMessage(message);
    setCalCredError("");
    setTimeout(() => setCalCredMessage(""), 3000);
  }

  const loadCalCredentials = useCallback(async () => {
    setCalCredLoading(true);
    try {
      const creds = await api.get<CalCredential[]>("/api/config/cal/list");
      setCalCredentials(creds || []);
    } catch (err) {
      console.error("Failed to load Cal.com credentials", err);
      showCalCredentialMessage("Failed to load Cal.com credentials.", true);
    } finally {
      setCalCredLoading(false);
    }
  }, []);

  const refreshRules = useCallback(async () => {
    try {
      const data = await api.get<BotRulesListResponse>("/api/config/rules");
      setRules(data.rules || []);
      setHasUnappliedChanges(Boolean(data.has_unapplied_changes));
      setIsCustomizedByAdmin(Boolean(data.is_customized_by_admin));
      if (typeof data.max_rules === "number") setMaxRules(data.max_rules);
    } catch (err) {
      console.error("Failed to refresh rules", err);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [dataRes, meRes, credsRes, statusRes, rulesRes] = await Promise.allSettled([
          api.get<{
            bot_role: string;
            calendar_link: string;
            theme_color: string;
            system_prompt_text: string;
            support_contact?: string;
            is_customized_by_admin?: boolean;
          }>("/api/config/bot"),
          api.get<{ role?: string; tenant?: { slug: string; name?: string } }>("/api/auth/me"),
          api.get<CalCredential[]>("/api/config/cal/list"),
          api.get<SubscriptionStatus>("/api/payments/subscription-status"),
          api.get<BotRulesListResponse>("/api/config/rules"),
        ]);

        if (statusRes.status === "fulfilled") {
          setSubStatus(statusRes.value);
        }
        if (credsRes.status === "fulfilled") {
          setCalCredentials(credsRes.value || []);
        }
        if (meRes.status === "fulfilled") {
          if (meRes.value.role) setUserRole(meRes.value.role);
          const t = meRes.value.tenant;
          if (t?.slug) setTenantSlug(t.slug);
          if (t?.name) setTenantName(t.name);
        }
        if (rulesRes.status === "fulfilled") {
          setRules(rulesRes.value.rules || []);
          setHasUnappliedChanges(Boolean(rulesRes.value.has_unapplied_changes));
          setIsCustomizedByAdmin(Boolean(rulesRes.value.is_customized_by_admin));
          if (typeof rulesRes.value.max_rules === "number") {
            setMaxRules(rulesRes.value.max_rules);
          }
        }
        if (dataRes.status === "fulfilled") {
          const data = dataRes.value;
          setRole(data.bot_role || "hybrid");
          setSavedRole(data.bot_role || "hybrid");
          setSupportContact(data.support_contact || "");
          if (data.theme_color) {
            setThemeColor(data.theme_color);
          }
          if (data.calendar_link) {
            try {
              const url = new URL(data.calendar_link);
              url.searchParams.delete("theme");
              url.searchParams.delete("hideEventTypeDetails");
              url.searchParams.delete("embed");
              setCalendarLink(url.toString().replace(/\?$/, ""));
            } catch {
              setCalendarLink(data.calendar_link);
            }
          } else {
            setCalendarLink("");
          }
          setPromptText(data.system_prompt_text || "");
          if (typeof data.is_customized_by_admin === "boolean") {
            setIsCustomizedByAdmin(data.is_customized_by_admin);
          }
        }
      } catch (err) {
        console.error("Failed to load config", err);
      } finally {
        setCalCredLoading(false);
        setRulesLoading(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  // Warn before navigating away with unsaved edits or unapplied rules
  useEffect(() => {
    const isDirty = dirty || promptDirty || hasUnappliedChanges;
    unsavedChangesStore.setDirty(
      isDirty,
      "You have unapplied rule changes or unsaved assistant settings. Navigating away will not publish these changes. Are you sure you want to leave?"
    );
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      unsavedChangesStore.setDirty(false);
    };
  }, [dirty, promptDirty, hasUnappliedChanges]);

  // Normal Configuration Save: Sends ONLY bot_role, theme_color, and calendar_link.
  async function save() {
    const validated = validateCalendarLink(calendarLink);
    if (!validated.ok) {
      setCalError(validated.reason);
      setToast("Fix the calendar URL before saving");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setCalError("");

    setSaving(true);
    try {
      let finalLink = validated.url;
      if (finalLink) {
        const urlObj = new URL(finalLink);
        urlObj.searchParams.set("theme", "auto");
        urlObj.searchParams.set("hideEventTypeDetails", "false");
        urlObj.searchParams.set("embed", "true");
        finalLink = urlObj.toString();
      }
      await api.post("/api/config/bot", {
        bot_role: role,
        calendar_link: finalLink,
        theme_color: themeColor,
        support_contact: supportContact.trim(),
      });
      setSavedRole(role);
      setToast("Configuration saved!");
      setTimeout(() => setToast(""), 3000);
      setDirty(false);
      setWidgetKey((k) => k + 1);
    } catch {
      setToast("Failed to save.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  // Explicit System Prompt Save: Isolated save for prompt only (Super Admin)
  async function saveSystemPrompt() {
    if (!promptText.trim()) {
      const ok = window.confirm(
        "The prompt box is empty. Saving will remove your custom prompt and restore platform auto-assembly. Continue?",
      );
      if (!ok) return;
    }
    setSavingPrompt(true);
    try {
      await api.post("/api/config/bot", {
        system_prompt_text: promptText,
      });
      setToast("System prompt saved successfully! Configuration is now locked.");
      setTimeout(() => setToast(""), 4000);
      setPromptDirty(false);
      setIsCustomizedByAdmin(true);
      setWidgetKey((k) => k + 1);
    } catch (err: unknown) {
      let msg = "Failed to save system prompt.";
      if (err instanceof Error) {
        msg = err.message;
      } else if (
        err &&
        typeof err === "object" &&
        "detail" in err &&
        typeof (err as { detail: unknown }).detail === "string"
      ) {
        msg = (err as { detail: string }).detail;
      }
      setToast(msg);
      setTimeout(() => setToast(""), 4000);
    } finally {
      setSavingPrompt(false);
    }
  }

  // Natural Language Rule Creation
  async function handleAddRule(customText?: string) {
    const text = (customText ?? ruleInstructionInput).trim();
    if (!text) return;
    if (rules.length >= maxRules) {
      setRuleError(`Maximum limit of ${maxRules} rules reached.`);
      return;
    }
    setRuleError("");
    setAddingRule(true);
    try {
      const genRes = await api.post<GenerateRuleResponse>("/api/config/rules/generate", {
        request_text: text,
      });
      await api.post<BotRule>("/api/config/rules", {
        instruction_text: genRes.rule_text,
        original_request: text,
        category: genRes.category || "general",
        is_active: true,
      });
      setRuleInstructionInput("");
      await refreshRules();
      setToast("Rule added to drafts! Click 'Apply changes' to publish.");
      setTimeout(() => setToast(""), 4000);
    } catch (err: unknown) {
      let msg = "Failed to add rule.";
      if (err instanceof Error) {
        msg = err.message;
      } else if (
        err &&
        typeof err === "object" &&
        "detail" in err &&
        typeof (err as { detail: unknown }).detail === "string"
      ) {
        msg = (err as { detail: string }).detail;
      }
      setRuleError(msg);
    } finally {
      setAddingRule(false);
    }
  }

  async function handleToggleRule(rule: BotRule) {
    setTogglingRuleId(rule.id);
    try {
      await api.put(`/api/config/rules/${rule.id}`, {
        is_active: !rule.is_active,
      });
      await refreshRules();
      setToast(`Rule marked as ${!rule.is_active ? "active" : "inactive"}. Click Apply changes.`);
      setTimeout(() => setToast(""), 3000);
    } catch {
      setToast("Failed to update rule status.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setTogglingRuleId(null);
    }
  }

  function handleStartEdit(rule: BotRule) {
    setEditingRuleId(rule.id);
    setEditingRuleText(rule.instruction_text);
  }

  async function handleSaveEdit(ruleId: number) {
    if (!editingRuleText.trim()) return;
    setSavingEditRule(true);
    try {
      await api.put(`/api/config/rules/${ruleId}`, {
        instruction_text: editingRuleText.trim(),
      });
      setEditingRuleId(null);
      setEditingRuleText("");
      await refreshRules();
      setToast("Rule updated! Click 'Apply changes' to publish.");
      setTimeout(() => setToast(""), 3000);
    } catch {
      setToast("Failed to save rule edit.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSavingEditRule(false);
    }
  }

  async function handleDeleteRule(ruleId: number) {
    const ok = window.confirm("Are you sure you want to delete this rule?");
    if (!ok) return;
    setDeletingRuleId(ruleId);
    try {
      await api.delete(`/api/config/rules/${ruleId}`);
      await refreshRules();
      setToast("Rule deleted. Click 'Apply changes' to publish.");
      setTimeout(() => setToast(""), 3000);
    } catch {
      setToast("Failed to delete rule.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setDeletingRuleId(null);
    }
  }

  async function handleApplyChanges(force = false) {
    setApplyingChanges(true);
    setApplyError("");
    try {
      const url = force ? "/api/config/rules/apply?force=true" : "/api/config/rules/apply";
      const res = await api.post<ApplyChangesResponse>(url, {});
      if (res && res.status === "blocked") {
        if (userRole === "super_admin") {
          setShowSuperAdminOverrideModal(true);
        } else {
          setApplyError(res.message || "Changes blocked: Super Admin prompt customization lock is active.");
        }
        return;
      }
      setToast(res?.message || "Changes applied! Assistant updated.");
      setTimeout(() => setToast(""), 4000);
      await refreshRules();
      try {
        const botData = await api.get<{ system_prompt_text?: string }>("/api/config/bot");
        if (botData?.system_prompt_text) {
          setPromptText(botData.system_prompt_text);
        }
      } catch {
        // ignore
      }
      setWidgetKey((k) => k + 1);
      setChatResetKey((k) => k + 1);
    } catch (err: unknown) {
      let msg = "Failed to apply changes.";
      if (err instanceof Error) {
        msg = err.message;
      } else if (
        err &&
        typeof err === "object" &&
        "detail" in err &&
        typeof (err as { detail: unknown }).detail === "string"
      ) {
        msg = (err as { detail: string }).detail;
      }
      setApplyError(msg);
    } finally {
      setApplyingChanges(false);
    }
  }

  async function handleResetToPlatformManaged() {
    const ok = window.confirm(
      "Resetting will clear the manual Super Admin prompt override and restore automatic platform prompt assembly from rules and knowledge. Continue?"
    );
    if (!ok) return;
    setResettingPrompt(true);
    try {
      await api.post("/api/config/bot", { reset_system_prompt: true });
      setIsCustomizedByAdmin(false);
      setToast("Prompt reset to platform-managed!");
      setTimeout(() => setToast(""), 4000);
      await refreshRules();
      try {
        const botData = await api.get<{ system_prompt_text?: string }>("/api/config/bot");
        setPromptText(botData?.system_prompt_text || "");
      } catch {
        // ignore
      }
      setWidgetKey((k) => k + 1);
      setChatResetKey((k) => k + 1);
    } catch {
      setToast("Failed to reset prompt override.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setResettingPrompt(false);
    }
  }

  async function addCalCredential() {
    const calApiKey = calCredApiKey.trim();
    const eventTypeId = calCredEventTypeId.trim();
    const name = calCredName.trim() || "Primary Booking";

    if (!calApiKey || !eventTypeId) {
      showCalCredentialMessage(
        "API key and event type ID are required.",
        true,
      );
      return;
    }

    setCalCredSubmitting(true);
    try {
      const res = await api.post<{
        success?: boolean;
        id?: number;
        error?: string;
      }>("/api/config/verify-cal", {
        name,
        cal_api_key: calApiKey,
        cal_event_type_id: eventTypeId,
      });
      if (res?.success === false) {
        throw new Error(res.error || "Cal.com verification failed.");
      }
      setCalCredName("");
      setCalCredApiKey("");
      setCalCredEventTypeId("");
      showCalCredentialMessage("Cal.com connected successfully.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to add Cal.com credential", err);
      showCalCredentialMessage(
        "Verification failed. Check API key and event type ID.",
        true,
      );
    } finally {
      setCalCredSubmitting(false);
    }
  }

  async function activateCalCredential(id: number) {
    setCalCredActionId(id);
    try {
      await api.post(`/api/config/cal/activate/${id}`);
      showCalCredentialMessage("Active Cal.com credential updated.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to activate Cal.com credential", err);
      showCalCredentialMessage("Failed to activate credential.", true);
    } finally {
      setCalCredActionId(null);
    }
  }

  async function removeCalCredential(id: number) {
    setCalDialogType("remove");
    setCalDialogCredId(id);
    setCalDialogOpen(true);
  }

  async function confirmRemoveCalCredential() {
    if (!calDialogCredId) return;
    setCalDialogOpen(false);

    setCalCredActionId(calDialogCredId);
    try {
      await api.delete(`/api/config/cal/remove/${calDialogCredId}`);
      showCalCredentialMessage("Cal.com credential removed.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to remove Cal.com credential", err);
      showCalCredentialMessage("Failed to remove credential.", true);
    } finally {
      setCalCredActionId(null);
      setCalDialogCredId(null);
    }
  }

  async function disconnectCal() {
    setCalDialogType("disconnect");
    setCalDialogOpen(true);
  }

  async function confirmDisconnectCal() {
    setCalDialogOpen(false);

    setCalCredActionId(-1);
    try {
      await api.post("/api/config/cal/disconnect");
      showCalCredentialMessage("Cal.com disconnected for this tenant.");
      await loadCalCredentials();
      setWidgetKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to disconnect Cal.com", err);
      showCalCredentialMessage("Failed to disconnect Cal.com.", true);
    } finally {
      setCalCredActionId(null);
    }
  }

  // Action to reset testing back to State 1
  const handleResetTesting = () => {
    setIsChatExpanded(false);
    setShowConfigDrawerInExpanded(false);
    if (typeof window !== "undefined" && tenantSlug) {
      window.localStorage.removeItem(`ryx_preview_session_${tenantSlug}`);
    }
    setChatResetKey((k) => k + 1);
  };

  const selectedRole = ROLES.find((r) => r.key === role) || ROLES[0];
  const activeCred =
    calCredentials.find((c) => c.is_active) ||
    (calCredentials.length > 0 ? calCredentials[0] : null);

  if (loading || !tenantSlug) {
    return (
      <div
        style={{
          padding: "5rem",
          textAlign: "center",
          color: C.textMuted,
          fontSize: "0.95rem",
        }}
      >
        Loading assistant settings…
      </div>
    );
  }

  // Reusable Assistant Configuration Form Component.
  //  - page (idle):        header + banners + the collage of tiles
  //  - side panel:         only the one setting a tile opened (`only`)
  //  - expanded-chat side: every setting stacked (the full list)
  const renderConfigurationForms = (isDrawer = false, only?: SettingKey) => {
    const collage = !isDrawer && !only;
    const show = (k: SettingKey) => !collage && (!only || only === k);
    return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      {!only && (<>
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h1
            style={{
              fontSize: isDrawer ? "1.3rem" : "1.75rem",
              fontWeight: 700,
              color: C.textPrimary,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Set up your assistant
          </h1>
          {!isDrawer && <LiveSiteStatus />}
          {isDrawer && (
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.08)",
                color: C.textSecondary,
              }}
            >
              Side View
            </span>
          )}
        </div>

        {/* Save Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
          }}
        >
          {dirty && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                color: C.warning,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: C.warning,
                }}
              />
              Unsaved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              backgroundColor: "var(--text-primary)",
              color: "var(--bg-card)",
              border: "none",
              borderRadius: 8,
              padding: "0.55rem 1.25rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
              transition: "all 0.15s ease",
              fontFamily: "inherit",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* The assistant was seen on a website: the owner confirms it first */}
      <WebsiteConfirmBanner />

      {/* Products found automatically on the owner's website: offer Shop mode
          (not when the saved role already shows products). */}
      {savedRole !== "shop" && savedRole !== "all" && (
      <ShopSuggestionBanner
        onAccepted={() => {
          setRole("shop");
          setSavedRole("shop");
          setWidgetKey((k) => k + 1);
          setToast("Shop mode is on");
          setTimeout(() => setToast(""), 3000);
        }}
      />
      )}
      </>)}

      {/* Everything at a glance: each tile opens its setting in the side panel */}
      {collage && (
        <AssistantCollage
          roles={ROLES}
          role={role}
          onRoleChange={(key) => {
            setRole(key);
            setDirty(true);
          }}
          themeColor={themeColor}
          supportContact={supportContact}
          calendarLink={calendarLink}
          rules={rules}
          maxRules={maxRules}
          isSuperAdmin={isSuperAdmin}
          onOpen={setOpenSetting}
          locked={{
            colour: !planHas("custom_branding"),
            booking: !planHas("cal_booking"),
          }}
        />
      )}

      {/* Card 1: Role Selection & Chat Colour */}
      {(show("role") || show("colour")) && (
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* Assistant Role */}
        {show("role") && (
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.88rem",
              fontWeight: 600,
              color: C.textPrimary,
              marginBottom: "0.85rem",
            }}
          >
            What should your assistant do?
          </label>

          {/* 4 Compact Role Tabs */}
          <div
            className="role-tabs-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {ROLES.map((r) => {
              const active = role === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setRole(r.key);
                    setDirty(true);
                  }}
                  style={{
                    cursor: "pointer",
                    borderRadius: 8,
                    padding: "0.65rem 0.5rem",
                    textAlign: "center",
                    backgroundColor: C.bgCard,
                    border: active
                      ? `1.5px solid ${C.textPrimary}`
                      : `1px solid ${C.border}`,
                    boxShadow: active ? "0 1px 3px rgba(15, 23, 42, 0.10)" : "none",
                    color: active ? C.textPrimary : C.textSecondary,
                    fontSize: "0.82rem",
                    fontWeight: active ? 600 : 500,
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Dynamic Role Description */}
          <p
            style={{
              fontSize: "0.8rem",
              color: C.textSecondary,
              marginTop: "0.75rem",
              marginBottom: 0,
              lineHeight: 1.45,
            }}
          >
            {selectedRole.desc}
          </p>
        </div>
        )}

        {/* Divider */}
        {show("role") && show("colour") && <div style={{ height: 1, backgroundColor: C.border }} />}

        {/* Chat colour: match the website, or choose a colour */}
        {show("colour") && (
        <ChatColourPicker
          value={themeColor}
          onChange={(hex) => {
            setThemeColor(hex);
            setDirty(true);
          }}
        />
        )}
      </section>
      )}

      {/* Shop mode: how visitors reach a person */}
      {show("support") && (role === "shop" || role === "all") && (
        <section
          style={{
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "1.5rem",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "0.88rem",
              fontWeight: 600,
              color: C.textPrimary,
              marginBottom: "0.35rem",
            }}
          >
            Support contact <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={supportContact}
            maxLength={500}
            onChange={(e) => {
              setSupportContact(e.target.value);
              setDirty(true);
            }}
            placeholder="e.g. WhatsApp +91 98765 43210 or support@yourshop.com"
            style={{
              width: "100%",
              backgroundColor: C.bgSurface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "0.65rem 0.85rem",
              fontSize: "0.85rem",
              color: C.textPrimary,
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <p style={{ color: C.textMuted, fontSize: "0.75rem", marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
            Shared when a customer needs a person (damaged item, refund, complaint). Leave it empty and the
            assistant will take the customer&apos;s name, email and problem instead. You&apos;ll find them on the Leads page.
          </p>
        </section>
      )}

      {/* Shop mode: import the store's products */}
      {show("products") && (role === "shop" || role === "all") && <ShopProductsCard wide={only === "products"} />}

      {/* Card 2: Tell us what to change (Natural Language Custom Rules) */}
      {show("rules") && (
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div>
          <div
            style={{
              marginBottom: "0.35rem",
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: C.textPrimary,
                margin: 0,
              }}
            >
              Tell us what to change
            </h2>
          </div>
          <p
            style={{
              fontSize: "0.8rem",
              color: C.textSecondary,
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            Give your assistant clear, simple rules. We&apos;ll turn your request into a live rule.
          </p>
        </div>

        {/* Input & Add Button */}
        <div>
          <div
            style={{
              display: "flex",
              gap: "0.65rem",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={ruleInstructionInput}
              onChange={(e) => {
                setRuleInstructionInput(e.target.value);
                if (ruleError) setRuleError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddRule();
                }
              }}
              placeholder="e.g. Don't talk about pricing"
              disabled={addingRule || rules.length >= maxRules}
              style={{
                flex: 1,
                backgroundColor: C.bgSurface,
                border: `1px solid ${ruleError ? C.error : C.border}`,
                borderRadius: 8,
                padding: "0.65rem 0.85rem",
                fontSize: "0.85rem",
                color: C.textPrimary,
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => handleAddRule()}
              disabled={addingRule || !ruleInstructionInput.trim() || rules.length >= maxRules}
              style={{
                backgroundColor:
                  addingRule || !ruleInstructionInput.trim() || rules.length >= maxRules
                    ? C.bgHover
                    : C.accent,
                color:
                  addingRule || !ruleInstructionInput.trim() || rules.length >= maxRules
                    ? C.textMuted
                    : "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "0.65rem 1.35rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor:
                  addingRule || !ruleInstructionInput.trim() || rules.length >= maxRules
                    ? "default"
                    : "pointer",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              {addingRule ? "Synthesizing…" : "Add"}
            </button>
          </div>

          {/* Example Chips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginTop: "0.65rem",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: C.textMuted,
                fontWeight: 500,
              }}
            >
              Examples:
            </span>
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setRuleInstructionInput(chip);
                  if (ruleError) setRuleError("");
                }}
                disabled={addingRule || rules.length >= maxRules}
                style={{
                  backgroundColor: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  padding: "0.22rem 0.65rem",
                  fontSize: "0.75rem",
                  color: C.textSecondary,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.color = C.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.color = C.textSecondary;
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Rule Error Notice */}
          {ruleError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "0.75rem",
                padding: "0.55rem 0.85rem",
                borderRadius: 8,
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: `1px solid ${C.error}`,
                color: C.error,
                fontSize: "0.78rem",
              }}
            >
              <span>{ruleError}</span>
              <button
                type="button"
                onClick={() => setRuleError("")}
                style={{
                  background: "none",
                  border: "none",
                  color: C.error,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Max Rules Quota Warning */}
          {rules.length >= maxRules && (
            <div
              style={{
                marginTop: "0.65rem",
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "#b45309",
                fontSize: "0.75rem",
              }}
            >
              Rule quota reached ({maxRules}/{maxRules}). Delete or deactivate an existing rule to add more.
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: C.border }} />

        {/* Your Custom Rules Section */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.85rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3
                style={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: C.textPrimary,
                  margin: 0,
                }}
              >
                Your custom rules
              </h3>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: C.textMuted,
                  backgroundColor: C.bgSurface,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${C.border}`,
                }}
              >
                {rules.length}/{maxRules}
              </span>
            </div>

            {hasUnappliedChanges && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "#d97706",
                  backgroundColor: "rgba(245, 158, 11, 0.12)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "#f59e0b",
                  }}
                />
                Not applied yet
              </span>
            )}
          </div>

          {/* Rules List */}
          {rulesLoading ? (
            <div
              style={{
                color: C.textMuted,
                fontSize: "0.8rem",
                padding: "1rem 0",
                textAlign: "center",
              }}
            >
              Loading rules…
            </div>
          ) : rules.length === 0 ? (
            <div
              style={{
                padding: "1.5rem 1rem",
                textAlign: "center",
                backgroundColor: C.bgSurface,
                borderRadius: 8,
                border: `1px dashed ${C.border}`,
                color: C.textMuted,
                fontSize: "0.82rem",
              }}
            >
              No custom rules yet. Tell us what to change above to create your first rule.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {rules.map((r) => {
                const isEditing = editingRuleId === r.id;
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: "0.75rem 0.9rem",
                      backgroundColor: C.bgSurface,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    {isEditing ? (
                      /* Inline Edit Mode */
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        <textarea
                          value={editingRuleText}
                          onChange={(e) => setEditingRuleText(e.target.value)}
                          rows={2}
                          style={{
                            width: "100%",
                            backgroundColor: C.bgCard,
                            border: `1px solid ${C.accent}`,
                            borderRadius: 6,
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.82rem",
                            color: C.textPrimary,
                            outline: "none",
                            fontFamily: "inherit",
                            resize: "vertical",
                            boxSizing: "border-box",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "0.5rem",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRuleId(null);
                              setEditingRuleText("");
                            }}
                            disabled={savingEditRule}
                            style={{
                              background: "none",
                              border: `1px solid ${C.border}`,
                              borderRadius: 6,
                              padding: "0.3rem 0.75rem",
                              fontSize: "0.75rem",
                              color: C.textSecondary,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(r.id)}
                            disabled={savingEditRule || !editingRuleText.trim()}
                            style={{
                              backgroundColor: C.accent,
                              border: "none",
                              borderRadius: 6,
                              padding: "0.3rem 0.85rem",
                              fontSize: "0.75rem",
                              color: "#ffffff",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {savingEditRule ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "0.85rem",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.45rem",
                              flexWrap: "wrap",
                              marginBottom: 4,
                            }}
                          >
                            {!r.is_applied && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  color: "#d97706",
                                  backgroundColor: "rgba(245, 158, 11, 0.14)",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                Not applied yet
                              </span>
                            )}
                            {r.category && r.category !== "general" && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  color: C.textMuted,
                                  backgroundColor: C.bgCard,
                                  border: `1px solid ${C.border}`,
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  textTransform: "capitalize",
                                }}
                              >
                                {r.category}
                              </span>
                            )}
                          </div>
                          <p
                            style={{
                              fontSize: "0.83rem",
                              color: r.is_active ? C.textPrimary : C.textMuted,
                              textDecoration: r.is_active ? "none" : "line-through",
                              margin: 0,
                              lineHeight: 1.45,
                              wordBreak: "break-word",
                            }}
                          >
                            {r.instruction_text}
                          </p>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            flexShrink: 0,
                          }}
                        >
                          {/* Toggle Active / Inactive */}
                          <button
                            type="button"
                            onClick={() => handleToggleRule(r)}
                            disabled={togglingRuleId === r.id}
                            title={r.is_active ? "Click to deactivate rule" : "Click to activate rule"}
                            style={{
                              backgroundColor: r.is_active
                                ? "rgba(16, 185, 129, 0.12)"
                                : "rgba(156, 163, 175, 0.14)",
                              border: `1px solid ${r.is_active ? C.success : C.border}`,
                              color: r.is_active ? C.success : C.textMuted,
                              borderRadius: 6,
                              padding: "0.22rem 0.55rem",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {togglingRuleId === r.id ? "…" : r.is_active ? "Active" : "Inactive"}
                          </button>

                          {/* Edit Rule */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(r)}
                            title="Edit rule text"
                            style={{
                              background: "none",
                              border: `1px solid ${C.border}`,
                              borderRadius: 6,
                              padding: "0.22rem 0.55rem",
                              fontSize: "0.72rem",
                              color: C.textSecondary,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Edit
                          </button>

                          {/* Delete Rule */}
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(r.id)}
                            disabled={deletingRuleId === r.id}
                            title="Delete rule"
                            style={{
                              background: "none",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: 6,
                              padding: "0.22rem 0.55rem",
                              fontSize: "0.72rem",
                              color: C.error,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {deletingRuleId === r.id ? "…" : "Delete"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Apply Changes Section (Prominently shown when hasUnappliedChanges is true) */}
        {hasUnappliedChanges && (
          <div
            style={{
              padding: "1rem 1.15rem",
              borderRadius: 10,
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.85rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "1.2rem" }}>⚡</span>
              <div>
                <div style={{ fontSize: "0.84rem", fontWeight: 700, color: C.textPrimary }}>
                  Unapplied changes pending
                </div>
                <div style={{ fontSize: "0.74rem", color: C.textSecondary, marginTop: 2 }}>
                  Click Apply changes to compile rules into the live assistant.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleApplyChanges(false)}
              disabled={applyingChanges}
              style={{
                backgroundColor: "#f59e0b",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "0.55rem 1.35rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: applyingChanges ? "default" : "pointer",
                opacity: applyingChanges ? 0.6 : 1,
                fontFamily: "inherit",
                boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)",
                transition: "all 0.15s ease",
              }}
            >
              {applyingChanges ? "Applying changes…" : "Apply changes"}
            </button>
          </div>
        )}

        {applyError && (
          <div
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: 6,
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${C.error}`,
              color: C.error,
              fontSize: "0.78rem",
            }}
          >
            {applyError}
          </div>
        )}
      </section>
      )}

      {/* Card 3: Booking Link & More Options (booking parts not used by shops).
          A shop with nothing else to show here gets no empty box. */}
      {show("booking") && (role !== "shop" || isSuperAdmin) && (
      <section
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {role !== "shop" && (
        <>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.88rem",
              fontWeight: 600,
              color: C.textPrimary,
              marginBottom: "0.35rem",
            }}
          >
            Booking link <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={calendarLink}
            onChange={(e) => {
              setCalendarLink(e.target.value);
              setDirty(true);
              if (calError) setCalError("");
            }}
            placeholder="https://cal.com/your-business/demo"
            style={{
              width: "100%",
              backgroundColor: C.bgSurface,
              border: `1px solid ${calError ? C.error : C.border}`,
              borderRadius: 8,
              padding: "0.65rem 0.85rem",
              fontSize: "0.85rem",
              color: C.textPrimary,
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          {calError ? (
            <p
              style={{
                color: C.error,
                fontSize: "0.75rem",
                marginTop: 6,
                marginBottom: 0,
              }}
            >
              {calError}
            </p>
          ) : (
            <p
              style={{
                color: C.textMuted,
                fontSize: "0.75rem",
                marginTop: 6,
                marginBottom: 0,
              }}
            >
              Your Cal.com booking page. The assistant shares it when someone wants to book.
            </p>
          )}
        </div>

        {/* Collapsible: More booking options */}
        <div>
          <button
            type="button"
            onClick={() => setShowBookingOptions((prev) => !prev)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: C.textPrimary,
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "inherit",
            }}
          >
            {showBookingOptions ? "Hide booking options ▴" : "More booking options ▾"}
          </button>

          {showBookingOptions && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1.1rem",
                borderRadius: 10,
                backgroundColor: C.bgSurface,
                border: `1px solid ${C.border}`,
              }}
            >
              <h3
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: C.textPrimary,
                  margin: "0 0 4px 0",
                }}
              >
                Book automatically
              </h3>
              <p
                style={{
                  color: C.textMuted,
                  fontSize: "0.75rem",
                  lineHeight: 1.45,
                  margin: "0 0 1rem 0",
                }}
              >
                Let the assistant check your free times and make the booking itself. Needs a Cal.com API key.
              </p>

              {/* Feedback Message */}
              {(calCredMessage || calCredError) && (
                <div
                  style={{
                    border: `1px solid ${calCredError ? C.error : C.success}`,
                    backgroundColor: calCredError
                      ? "rgba(239, 68, 68, 0.12)"
                      : "rgba(16, 185, 129, 0.12)",
                    color: calCredError ? C.error : C.success,
                    borderRadius: 8,
                    padding: "0.55rem 0.75rem",
                    fontSize: "0.78rem",
                    marginBottom: "0.85rem",
                  }}
                >
                  {calCredError || calCredMessage}
                </div>
              )}

              {/* Connected Status Card */}
              {calCredLoading ? (
                <div style={{ color: C.textMuted, fontSize: "0.78rem", padding: "0.5rem 0" }}>
                  Loading Cal.com credentials…
                </div>
              ) : activeCred ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: 8,
                    backgroundColor: C.bgCard,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          color: C.textPrimary,
                          fontSize: "0.85rem",
                          fontWeight: 700,
                        }}
                      >
                        {activeCred.name || "Primary Booking"}
                      </span>
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "0.15rem 0.5rem",
                          backgroundColor: "rgba(16, 185, 129, 0.14)",
                          color: C.success,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                        }}
                      >
                        Connected
                      </span>
                    </div>
                    <p
                      style={{
                        color: C.textMuted,
                        fontSize: "0.72rem",
                        margin: 0,
                      }}
                    >
                      Key ending {activeCred.api_key.slice(-4)} · Event {activeCred.event_type_id}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={disconnectCal}
                    disabled={calCredActionId === -1}
                    style={{
                      backgroundColor: "transparent",
                      color: C.error,
                      border: `1px solid ${C.error}`,
                      borderRadius: 6,
                      padding: "0.45rem 0.85rem",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: calCredActionId === -1 ? "default" : "pointer",
                      opacity: calCredActionId === -1 ? 0.55 : 1,
                      fontFamily: "inherit",
                    }}
                  >
                    {calCredActionId === -1 ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ) : (
                /* Connect Form */
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.65rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: C.textPrimary,
                          marginBottom: 4,
                        }}
                      >
                        Cal.com API key
                      </label>
                      <input
                        type="password"
                        value={calCredApiKey}
                        onChange={(e) => setCalCredApiKey(e.target.value)}
                        placeholder="cal_live_…"
                        style={{
                          width: "100%",
                          backgroundColor: C.bgCard,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          padding: "0.55rem 0.75rem",
                          fontSize: "0.8rem",
                          color: C.textPrimary,
                          outline: "none",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: C.textPrimary,
                          marginBottom: 4,
                        }}
                      >
                        Event type ID
                      </label>
                      <input
                        type="text"
                        value={calCredEventTypeId}
                        onChange={(e) => setCalCredEventTypeId(e.target.value)}
                        placeholder="1234567"
                        style={{
                          width: "100%",
                          backgroundColor: C.bgCard,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          padding: "0.55rem 0.75rem",
                          fontSize: "0.8rem",
                          color: C.textPrimary,
                          outline: "none",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={addCalCredential}
                      disabled={calCredSubmitting}
                      style={{
                        backgroundColor: C.accent,
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 6,
                        padding: "0.55rem 1.1rem",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: calCredSubmitting ? "default" : "pointer",
                        opacity: calCredSubmitting ? 0.6 : 1,
                        fontFamily: "inherit",
                      }}
                    >
                      {calCredSubmitting ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-credential list */}
              {calCredentials.length > 1 && (
                <div style={{ marginTop: "1rem", borderTop: `1px solid ${C.border}`, paddingTop: "0.85rem" }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: C.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    All Connected Credentials
                  </span>
                  <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {calCredentials.map((cred) => (
                      <div
                        key={cred.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.5rem 0.75rem",
                          borderRadius: 6,
                          backgroundColor: C.bgCard,
                          border: `1px solid ${cred.is_active ? C.accent : C.border}`,
                          fontSize: "0.75rem",
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, color: C.textPrimary }}>
                            {cred.name}
                          </span>
                          <span style={{ color: C.textMuted, marginLeft: 8 }}>
                            ID: {cred.event_type_id}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          {!cred.is_active && (
                            <button
                              type="button"
                              onClick={() => activateCalCredential(cred.id)}
                              style={{
                                background: "none",
                                border: "none",
                                color: C.success,
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: "0.72rem",
                              }}
                            >
                              Activate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCalCredential(cred.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: C.error,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: "0.72rem",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}

        {/* Collapsible: Advanced Settings (Platform Super Admin Only) */}
        {isSuperAdmin && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedSettings((prev) => !prev)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: C.textSecondary,
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "inherit",
              }}
            >
              {showAdvancedSettings ? "Hide advanced settings ▴" : "Advanced Settings ▾"}
            </button>

            {showAdvancedSettings && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1.1rem",
                  borderRadius: 10,
                  backgroundColor: C.bgSurface,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <h3
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: C.textPrimary,
                            margin: 0,
                          }}
                        >
                          Core System Prompt
                        </h3>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            color: "#8b5cf6",
                            backgroundColor: "rgba(139, 92, 246, 0.12)",
                            padding: "1px 6px",
                            borderRadius: 4,
                          }}
                        >
                          Super Admin Only
                        </span>
                      </div>
                      <p
                        style={{
                          color: C.textMuted,
                          fontSize: "0.75rem",
                          margin: "4px 0 0 0",
                        }}
                      >
                        Platform-level assembled prompt. Manual edits will lock the prompt and prevent automatic rule compilation.
                      </p>
                    </div>
                  </div>

                  {/* Super Admin Lock Banner */}
                  {isCustomizedByAdmin && (
                    <div
                      style={{
                        marginBottom: "0.85rem",
                        padding: "0.75rem 0.9rem",
                        borderRadius: 8,
                        backgroundColor: "rgba(245, 158, 11, 0.1)",
                        border: "1px solid rgba(245, 158, 11, 0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.65rem",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#d97706" }}>
                          ⚠️ Prompt Locked by Super Admin
                        </div>
                        <div style={{ fontSize: "0.72rem", color: C.textSecondary, marginTop: 2 }}>
                          Automated rule updates and knowledge base refreshes will not overwrite manual prompt edits.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetToPlatformManaged}
                        disabled={resettingPrompt}
                        style={{
                          backgroundColor: "transparent",
                          color: "#d97706",
                          border: "1px solid #d97706",
                          borderRadius: 6,
                          padding: "0.35rem 0.75rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: resettingPrompt ? "default" : "pointer",
                          opacity: resettingPrompt ? 0.6 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        {resettingPrompt ? "Resetting…" : "Reset to Platform Managed"}
                      </button>
                    </div>
                  )}

                  <textarea
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value);
                      setPromptDirty(true);
                    }}
                    rows={12}
                    style={{
                      width: "100%",
                      backgroundColor: C.bgCard,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "0.85rem",
                      fontSize: "0.78rem",
                      lineHeight: 1.6,
                      color: C.textPrimary,
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      boxSizing: "border-box",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginTop: "0.85rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: C.textMuted,
                      }}
                    >
                      Saving manual prompt changes locks the configuration from automatic overwrites.
                    </span>

                    <button
                      type="button"
                      onClick={saveSystemPrompt}
                      disabled={savingPrompt}
                      style={{
                        backgroundColor: promptDirty ? C.accent : "transparent",
                        color: promptDirty ? "#ffffff" : C.textSecondary,
                        border: `1px solid ${promptDirty ? C.accent : C.border}`,
                        borderRadius: 6,
                        padding: "0.45rem 1rem",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: savingPrompt ? "default" : "pointer",
                        opacity: savingPrompt ? 0.6 : 1,
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {savingPrompt ? "Saving Prompt…" : "Save System Prompt"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      )}
    </div>
    );
  };

  const SETTING_TITLES: Record<SettingKey, string> = {
    role: "What it does",
    colour: "Chat colour",
    support: "Support contact",
    products: "Products",
    rules: "Rules",
    booking: role === "shop" ? "Advanced" : "Booking link",
  };

  const SETTING_HINTS: Record<SettingKey, string> = {
    role: "The job your assistant does on your website",
    colour: "How the chat looks on your website",
    support: "Shared when a visitor needs a person",
    products: "What your assistant can recommend to shoppers",
    rules: "Plain-word rules for how your assistant replies",
    booking: role === "shop" ? "Platform and prompt options" : "Where visitors book a call with you",
  };

  // One setting, opened from a collage tile, in a pop-up in the centre
  const renderSettingPanel = () =>
    openSetting && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={SETTING_TITLES[openSetting]}
        style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      >
        <div
          onClick={() => setOpenSetting(null)}
          style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.32)", backdropFilter: "blur(2px)" }}
        />
        <div
          className="ryx-setting-panel"
          style={{
            position: "relative",
            width: openSetting === "products" ? "min(1200px, 100%)" : "min(760px, 100%)",
            maxHeight: "min(860px, calc(100vh - 48px))",
            background: C.bg,
            borderRadius: 20,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
            display: "flex",
            flexDirection: "column",
            animation: "ryxPop .18s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1.15rem 1.5rem",
              borderBottom: `1px solid ${C.border}`,
              background: C.bgCard,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 650, letterSpacing: "-0.01em", color: C.textPrimary }}>
                {SETTING_TITLES[openSetting]}
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "0.8rem", color: C.textMuted }}>{SETTING_HINTS[openSetting]}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpenSetting(null)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bgCard,
                color: C.textSecondary,
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.4rem" }}>
            {renderConfigurationForms(false, openSetting)}
          </div>
          <style>{`@keyframes ryxPop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }`}</style>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.6rem",
              padding: "0.9rem 1.4rem",
              borderTop: `1px solid ${C.border}`,
              background: C.bgCard,
            }}
          >
            {dirty ? (
              <span style={{ marginRight: "auto", fontSize: "0.8rem", fontWeight: 600, color: C.warning }}>
                Unsaved changes
              </span>
            ) : openSetting === "products" ? (
              <span style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.78rem", color: C.textMuted }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                Products refresh automatically every day
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setOpenSetting(null)}
              style={{
                padding: "0.62rem 1.35rem",
                borderRadius: 10,
                border: dirty ? `1px solid ${C.border}` : "1px solid #0f172a",
                background: dirty ? C.bgCard : "#0f172a",
                color: dirty ? C.textPrimary : "#fff",
                boxShadow: dirty ? "none" : "0 4px 12px rgba(15,23,42,.18)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Done
            </button>
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await save();
                  setOpenSetting(null);
                }}
                style={{
                  padding: "0.6rem 1.15rem",
                  borderRadius: 9,
                  border: "none",
                  background: C.accent,
                  color: "#fff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  fontFamily: "inherit",
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1360,
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "2rem 2rem 5rem 2rem",
        backgroundColor: C.bg,
        minHeight: "100vh",
        transition: "max-width 0.35s ease",
      }}
    >
      {/* Expired / Inactive Notice Banner */}
      {subStatus && !subStatus.is_active && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1.1rem 1.35rem",
            borderRadius: 12,
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background:
              "linear-gradient(90deg, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0.04) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            boxShadow: "0 4px 20px rgba(239, 68, 68, 0.08)",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
                flexShrink: 0,
              }}
            >
              ⚠️
            </div>
            <div>
              <div
                style={{
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                }}
              >
                {subStatus.subscription_status === "trial"
                  ? "3-Day Free Trial Expired — Live Widget Paused"
                  : "Subscription Inactive — Live Widget Paused"}
              </div>
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.82rem",
                  marginTop: "0.2rem",
                }}
              >
                Your custom bot theme and configurations are saved, but live
                customer widget embedding is paused. Upgrade to reactivate
                public widget deployment.
              </div>
            </div>
          </div>
          <Link
            href="/workspace/billing"
            style={{
              padding: "0.55rem 1.1rem",
              background: "#ef4444",
              color: "#ffffff",
              borderRadius: 8,
              fontSize: "0.82rem",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 2px 10px rgba(239, 68, 68, 0.4)",
            }}
          >
            Upgrade Plan Now →
          </Link>
        </div>
      )}

      {/* Top Control Bar for the Expanded Testing Workspace */}
      {isChatExpanded && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.85rem 1.25rem",
            backgroundColor: C.bgCard,
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            gap: "1rem",
            animation: "workspaceFadeIn 0.35s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              type="button"
              onClick={() => setShowConfigDrawerInExpanded((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: showConfigDrawerInExpanded
                  ? C.accentDim
                  : C.bgSurface,
                color: showConfigDrawerInExpanded ? C.accent : C.textPrimary,
                border: `1px solid ${showConfigDrawerInExpanded ? C.accent : C.border}`,
                borderRadius: 8,
                padding: "0.5rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
            >
              <span>⚙</span>
              <span>{showConfigDrawerInExpanded ? "Hide Settings" : "Assistant Settings"}</span>
            </button>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.78rem",
                color: hasUnappliedChanges ? C.warning : C.success,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: hasUnappliedChanges ? C.warning : C.success,
                }}
              />
              {hasUnappliedChanges ? "Draft Preview Active" : "Live Testing Active"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            {dirty && (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{
                  backgroundColor: "var(--text-primary)",
                  color: "var(--bg-card)",
                  border: "none",
                  borderRadius: 8,
                  padding: "0.5rem 1.15rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            )}

            <button
              type="button"
              onClick={handleResetTesting}
              title="Reset conversation and return to idle preview"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                color: C.textSecondary,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "0.5rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
                e.currentTarget.style.color = C.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                e.currentTarget.style.color = C.textSecondary;
              }}
            >
              <span>↺</span>
              <span>Reset Preview</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Layout Grid */}
      <div
        className={`agent-setup-grid ${isChatExpanded ? "expanded-view" : "idle-view"}`}
        style={{
          display: "flex",
          gap: isChatExpanded ? "1.5rem" : "2.25rem",
          alignItems: "flex-start",
          width: "100%",
          transition: "all 0.35s ease",
        }}
      >
        {/* Left Column: Configuration Forms */}
        {/* In idle mode: takes natural flex width. In expanded mode: shows only when drawer toggled */}
        {(!isChatExpanded || showConfigDrawerInExpanded) && (
          <div
            className="config-column"
            style={{
              flex: isChatExpanded ? "0 0 440px" : "1 1 0%",
              width: isChatExpanded ? 440 : "auto",
              minWidth: isChatExpanded ? 440 : 360,
              maxWidth: isChatExpanded ? 440 : "none",
              maxHeight: isChatExpanded ? "calc(100vh - 120px)" : "none",
              overflowY: isChatExpanded ? "auto" : "visible",
              backgroundColor: isChatExpanded ? C.bgSurface : "transparent",
              borderRadius: isChatExpanded ? 16 : 0,
              border: isChatExpanded ? `1px solid ${C.border}` : "none",
              padding: isChatExpanded ? "1.25rem" : 0,
              boxShadow: isChatExpanded ? "0 10px 30px rgba(0,0,0,0.25)" : "none",
              transition: "all 0.35s ease",
            }}
          >
            {renderConfigurationForms(isChatExpanded)}
          </div>
        )}

        {/* Right Column: Chatbot Workspace */}
        {/* In idle mode: 460px width. In expanded mode: 100% full width */}
        <div
          className="desktop-test-chat-col"
          style={{
            flex: isChatExpanded ? "1 1 100%" : "0 0 460px",
            width: isChatExpanded ? "100%" : 460,
            minWidth: 0,
            position: isChatExpanded ? "relative" : "sticky",
            top: isChatExpanded ? 0 : "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            transition: "all 0.35s ease",
          }}
        >
          {/* Header row: Test chat title + Ready indicator (Idle Mode Only) */}
          {!isChatExpanded && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 4px",
              }}
            >
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: C.textPrimary,
                }}
              >
                Test chat
              </span>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: hasUnappliedChanges ? C.warning : C.success,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: hasUnappliedChanges ? C.warning : C.success,
                  }}
                />
                {hasUnappliedChanges
                  ? "Draft changes active in preview"
                  : "Ready · updates when you save"}
              </div>
            </div>
          )}

          {/* Persistent ChatbotPreview - Never remounts on state transition */}
          <ChatbotPreview
            key={`preview_${widgetKey}_${chatResetKey}`}
            isShop={savedRole === "shop" || savedRole === "all"}
            themeColor={previewColor}
            tenantName={tenantName}
            tenantSlug={tenantSlug}
            isExpanded={isChatExpanded}
            onExpandChange={(exp: boolean) => setIsChatExpanded(exp)}
            onReset={handleResetTesting}
            isSubscriptionActive={subStatus?.is_active ?? true}
            useDraft={hasUnappliedChanges}
          />
        </div>
      </div>

      {/* Mobile Fixed Bottom Action Bar */}
      <div
        className="mobile-bottom-bar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0.75rem 1rem",
          backgroundColor: C.bgCard,
          borderTop: `1px solid ${C.border}`,
          display: "none",
          alignItems: "center",
          gap: "0.75rem",
          zIndex: 40,
          boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileChatOpen(true)}
          style={{
            flex: 1,
            backgroundColor: C.bgSurface,
            color: C.textPrimary,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "0.65rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Test chat
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            backgroundColor: "var(--text-primary)",
            color: "var(--bg-card)",
            border: "none",
            borderRadius: 8,
            padding: "0.65rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Mobile Fullscreen Test Chat Modal */}
      {renderSettingPanel()}

      {mobileChatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: C.bg,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Mobile Modal Header */}
          <div
            style={{
              padding: "0.85rem 1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`,
              backgroundColor: C.bgCard,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  color: C.textPrimary,
                }}
              >
                Test chat
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: C.success,
                }}
              >
                ● Ready
              </span>
            </div>

            <button
              type="button"
              onClick={() => setMobileChatOpen(false)}
              aria-label="Close test chat"
              style={{
                background: "none",
                border: "none",
                fontSize: "1.25rem",
                color: C.textMuted,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Modal Content */}
          <div
            style={{
              flex: 1,
              position: "relative",
              overflowY: "auto",
              padding: "0.75rem",
            }}
          >
            <ChatbotPreview
              isShop={savedRole === "shop" || savedRole === "all"}
              themeColor={previewColor}
              tenantName={tenantName}
              tenantSlug={tenantSlug}
              isExpanded={isChatExpanded}
              onExpandChange={(exp: boolean) => setIsChatExpanded(exp)}
              onReset={handleResetTesting}
              isSubscriptionActive={subStatus?.is_active ?? true}
              useDraft={hasUnappliedChanges}
            />
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 70,
            backgroundColor:
              toast.toLowerCase().includes("fail") ||
              toast.toLowerCase().includes("error") ||
              toast.toLowerCase().includes("fix")
                ? C.error
                : C.success,
            color: "#ffffff",
            borderRadius: 8,
            padding: "0.65rem 1.25rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Cal.com Confirmation Dialogs */}
      <ConfirmDialog
        open={calDialogOpen && calDialogType === "remove"}
        eyebrow="Remove Credential"
        title="Remove Cal.com Credential?"
        description="This credential will be permanently removed. You can add it again later if needed."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => {
          setCalDialogOpen(false);
          setCalDialogType(null);
          setCalDialogCredId(null);
        }}
        onConfirm={confirmRemoveCalCredential}
      />
      <ConfirmDialog
        open={calDialogOpen && calDialogType === "disconnect"}
        eyebrow="Disconnect Service"
        title="Disconnect Cal.com?"
        description="All Cal.com credentials will be removed from this tenant. You can reconnect and re-add credentials later."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => {
          setCalDialogOpen(false);
          setCalDialogType(null);
        }}
        onConfirm={confirmDisconnectCal}
      />

      {/* Super Admin Override Confirmation Dialog */}
      <ConfirmDialog
        open={showSuperAdminOverrideModal}
        eyebrow="Super Admin Override"
        title="Override Super Admin Customization?"
        description="A platform Super Admin has previously customized the system prompt for this assistant. Applying changes now will overwrite the manual prompt and restore platform-managed rules. Do you want to force apply?"
        confirmLabel="Force Apply Changes"
        cancelLabel="Cancel"
        tone="warning"
        busy={applyingChanges}
        onCancel={() => setShowSuperAdminOverrideModal(false)}
        onConfirm={async () => {
          setShowSuperAdminOverrideModal(false);
          await handleApplyChanges(true);
        }}
      />

      {/* Responsive & Animation Styles */}
      <style jsx>{`
        @keyframes workspaceFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (max-width: 900px) {
          .desktop-test-chat-col {
            display: none !important;
          }
          .mobile-bottom-bar {
            display: flex !important;
          }
          .agent-setup-grid {
            flex-direction: column !important;
          }
          .role-tabs-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
