/**
 * Centralized API utility for communicating with the FastAPI backend.
 * All API calls go through this module for consistent error handling.
 */

// Always use relative paths for dashboard API calls to route through Vercel's same-origin proxy rewrites
const BASE_URL = "";

interface ApiOptions extends RequestInit {
  json?: unknown;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Skip the global 401 → login redirect for the auth endpoints (where 401 has
// specific in-page meaning) and when we're already sitting on the login page.
function maybeRedirectOn401(endpoint: string, status: number) {
  if (
    status === 401 &&
    typeof window !== "undefined" &&
    !endpoint.startsWith("/api/auth/login") &&
    !endpoint.startsWith("/api/auth/logout") &&
    window.location.pathname !== "/"
  ) {
    window.location.href = "/";
  }
}

async function fetchWithCreds(endpoint: string, options: ApiOptions = {}): Promise<Response> {
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
  options: ApiOptions = {}
): Promise<T> {
  const res = await fetchWithCreds(endpoint, options);

  if (!res.ok) {
    maybeRedirectOn401(endpoint, res.status);
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }

  // Handle empty responses (204, etc.)
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return {} as T;
}

// ── Convenience methods ──────────────────────────────────────

export const api = {
  get: <T = unknown>(endpoint: string) => request<T>(endpoint),

  post: <T = unknown>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: "POST", json: data }),

  patch: <T = unknown>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: "PATCH", json: data }),

  delete: <T = unknown>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),

  // Multipart upload — body is set directly so the browser writes the
  // correct boundary header. Routes through the same `request()` so it
  // inherits the global 401 redirect, ApiError, and credential handling.
  postFormData: <T = unknown>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, { method: "POST", body: formData }),

  // Multipart upload that returns the raw Response. Use when the caller needs
  // the body as Blob/stream (e.g. file conversion endpoints) rather than JSON.
  // Still applies BASE_URL prefix, credentials, and the global 401 redirect.
  postFormDataRaw: async (endpoint: string, formData: FormData): Promise<Response> => {
    const res = await fetchWithCreds(endpoint, { method: "POST", body: formData });
    maybeRedirectOn401(endpoint, res.status);
    return res;
  },
};

export { ApiError };
