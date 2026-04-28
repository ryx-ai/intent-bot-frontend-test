/**
 * Centralized API utility for communicating with the FastAPI backend.
 * All API calls go through this module for consistent error handling.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

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

async function request<T = unknown>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const { json, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  let body = rest.body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    headers,
    body,
    credentials: "include", // Send httponly cookies
  });

  if (!res.ok) {
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
};

export { ApiError };
