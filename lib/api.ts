/**
 * Centralized API utility for communicating with the FastAPI backend.
 * All API calls go through this module for consistent error handling.
 */

// Always use relative paths for dashboard API calls to route through Vercel's same-origin proxy rewrites
const BASE_URL = "";

interface ApiOptions extends RequestInit {
  json?: unknown;
}

function formatErrorDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const anyItem = item as Record<string, unknown>;
          if (typeof anyItem.msg === "string") {
            return anyItem.msg.replace(/^Value error,\s*/i, "");
          }
          if (typeof anyItem.message === "string") {
            return anyItem.message.replace(/^Value error,\s*/i, "");
          }
        }
        return "";
      })
      .filter(Boolean);
    return parts.length ? parts.join(" ") : "Please check the details and try again.";
  }
  if (typeof value === "object") {
    const anyVal = value as Record<string, unknown>;
    if (typeof anyVal.msg === "string") return anyVal.msg.replace(/^Value error,\s*/i, "");
    if (typeof anyVal.message === "string") return anyVal.message.replace(/^Value error,\s*/i, "");
  }
  return String(value);
}

class ApiError extends Error {
  status: number;
  detail?: string;
  rawDetail?: unknown;
  constructor(message: string, status: number, detail?: string, rawDetail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.rawDetail = rawDetail;
  }
}

// Skip the global 401/403 → login redirect for the auth endpoints (where 401/403 has
// specific in-page meaning) and when we're already sitting on the login page.
function maybeRedirectOnAuthError(endpoint: string, status: number, detail?: string) {
  if (
    (status === 401 || (status === 403 && (detail === "tenant_suspended" || detail === "tenant_deleted"))) &&
    typeof window !== "undefined" &&
    !endpoint.startsWith("/api/auth/login") &&
    !endpoint.startsWith("/api/auth/logout") &&
    !endpoint.startsWith("/api/auth/google") &&
    !endpoint.startsWith("/api/auth/forgot-password") &&
    !endpoint.startsWith("/api/auth/reset-password") &&
    window.location.pathname !== "/" &&
    window.location.pathname !== "/reset-password"
  ) {
    window.location.href = detail === "tenant_suspended" ? "/?error=suspended" : "/";
  }
}

async function fetchWithCreds(
  endpoint: string,
  options: ApiOptions = {},
): Promise<Response> {
  const { json, headers: customHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };
  let body = rest.body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  return fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    headers,
    body,
    credentials: "include", // Send httponly cookies
  });
}

async function request<T = unknown>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const res = await fetchWithCreds(endpoint, options);

  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    let detail: string | undefined;
    let message = "Unknown error";

    if (contentType?.includes("application/json")) {
      try {
        const errorBody = await res.json();
        const rawDetail = errorBody.detail ?? errorBody.error ?? errorBody.message;
        const formatted = formatErrorDetail(rawDetail);
        detail = formatted || (typeof rawDetail === "string" ? rawDetail : undefined);
        message = detail || message;
      } catch {
        message = await res.text().catch(() => "Unknown error");
      }
    } else {
      message = await res.text().catch(() => "Unknown error");
    }

    maybeRedirectOnAuthError(endpoint, res.status, detail);

    throw new ApiError(message, res.status, detail);
  }

  // Handle empty responses (204, etc.)
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return {} as T;
}

// ── Faster page switches ─────────────────────────────────────
// The backend is far away (each request ~0.5 s from India), and most pages
// ask for the same few things (account, plan, settings). So:
//   1. identical GETs that are already on their way share one request;
//   2. a few slow-changing answers are remembered for a short time.
// Any change (POST/PUT/PATCH/DELETE) forgets everything remembered, so a
// save is always followed by fresh data. Endpoints that pages poll for live
// progress (website reading, health checks, product imports) are never
// remembered.
const REMEMBERED: [RegExp, number][] = [
  [/^\/api\/auth\/me$/, 30_000],
  [/^\/api\/payments\/subscription-status$/, 30_000],
  [/^\/api\/payments\/plans$/, 30_000],
  [/^\/api\/config\/bot$/, 30_000],
  [/^\/api\/config\/rules$/, 30_000],
  [/^\/api\/config\/cal\/list$/, 30_000],
  [/^\/api\/config\/widget-status$/, 30_000],
  [/^\/api\/metrics\/config$/, 30_000],
  [/^\/api\/analytics\/app-performance$/, 30_000],
  [/^\/api\/knowledge\/website-suggestions$/, 30_000],
  // Polled every 3 s during a product import: remember only briefly, so a
  // page can start it early without hiding import progress.
  [/^\/api\/shop\/store$/, 4_000],
];
const inFlight = new Map<string, Promise<unknown>>();
const remembered = new Map<string, { at: number; data: unknown }>();

function copy<T>(data: T): T {
  // Callers may change what they get back; keep the remembered copy clean.
  try {
    return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

function forgetRemembered() {
  remembered.clear();
}

async function cachedGet<T>(endpoint: string): Promise<T> {
  const ttl = REMEMBERED.find(([re]) => re.test(endpoint))?.[1] ?? 0;
  const canRemember = ttl > 0;
  if (canRemember) {
    const hit = remembered.get(endpoint);
    if (hit && Date.now() - hit.at < ttl) return copy(hit.data as T);
  }
  const pending = inFlight.get(endpoint);
  if (pending) return copy((await pending) as T);

  const p = request<T>(endpoint);
  inFlight.set(endpoint, p);
  try {
    const data = await p;
    if (canRemember) remembered.set(endpoint, { at: Date.now(), data: copy(data) });
    return copy(data);
  } finally {
    inFlight.delete(endpoint);
  }
}

function changing<T>(run: () => Promise<T>): Promise<T> {
  forgetRemembered();
  return run().finally(forgetRemembered);
}

// ── Convenience methods ──────────────────────────────────────

export const api = {
  get: <T = unknown>(endpoint: string) => cachedGet<T>(endpoint),

  /** Start loading something a page will need soon (fire and forget). */
  prefetch: (...endpoints: string[]) => {
    for (const e of endpoints) void cachedGet(e).catch(() => {});
  },

  post: <T = unknown>(endpoint: string, data?: unknown) =>
    changing(() => request<T>(endpoint, { method: "POST", json: data })),

  patch: <T = unknown>(endpoint: string, data?: unknown) =>
    changing(() => request<T>(endpoint, { method: "PATCH", json: data })),

  put: <T = unknown>(endpoint: string, data?: unknown) =>
    changing(() => request<T>(endpoint, { method: "PUT", json: data })),

  delete: <T = unknown>(endpoint: string) =>
    changing(() => request<T>(endpoint, { method: "DELETE" })),

  // Multipart upload — body is set directly so the browser writes the
  // correct boundary header. Routes through the same `request()` so it
  // inherits the global 401 redirect, ApiError, and credential handling.
  postFormData: <T = unknown>(endpoint: string, formData: FormData) =>
    changing(() => request<T>(endpoint, { method: "POST", body: formData })),

  // Multipart upload that returns the raw Response. Use when the caller needs
  // the body as Blob/stream (e.g. file conversion endpoints) rather than JSON.
  // Still applies BASE_URL prefix, credentials, and the global 401 redirect.
  postFormDataRaw: async (
    endpoint: string,
    formData: FormData,
  ): Promise<Response> => {
    const res = await fetchWithCreds(endpoint, {
      method: "POST",
      body: formData,
    });
    maybeRedirectOnAuthError(endpoint, res.status);
    return res;
  },

  // File download helper — returns Blob for CSV/JSON/PDF exports.
  // Still applies BASE_URL prefix, credentials, and the global 401 redirect.
  getBlob: async (endpoint: string): Promise<Blob> => {
    const res = await fetchWithCreds(endpoint);
    if (!res.ok) {
      maybeRedirectOnAuthError(endpoint, res.status);
      let msg = "Download failed";
      try {
        const err = await res.json();
        const raw = err.detail ?? err.error ?? err.message;
        msg = formatErrorDetail(raw) || msg;
      } catch {
        // non-json response
      }
      throw new ApiError(msg, res.status);
    }
    return res.blob();
  },
};

export { ApiError };
