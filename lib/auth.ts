"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { api, ApiError } from "./api";

interface UserInfo {
  role?: string;
}

/**
 * Auth hook — provides login, logout, and redirect helpers.
 * JWT tokens are managed via httponly cookies by the backend.
 */
export function useAuth() {
  const router = useRouter();

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ status: string }>("/api/auth/login", {
        email,
        password,
      });
      // Treat any non-"success" body as a failure so the caller's catch runs
      // (otherwise the login page would show "Access Granted" without ever
      // navigating).
      if (res.status !== "success") {
        throw new ApiError("Login did not succeed", 500);
      }
      const me = await api.get<UserInfo>("/api/auth/me");
      router.push(
        me.role === "super_admin"
          ? "/workspace/admin/tenants"
          : "/workspace/dashboard"
      );
      return res;
    },
    [router]
  );

  const logout = useCallback(async () => {
    // If the server call fails, the auth cookie is httponly — the client
    // can't clear it. Pretending to log out would be a lie (a stolen device
    // would still be authenticated). Surface the error and stay put so the
    // user can retry.
    try {
      await api.post("/api/auth/logout");
      router.push("/");
    } catch (err) {
      console.error("Logout failed", err);
      alert("Logout failed. Please check your connection and try again.");
    }
  }, [router]);

  return { login, logout };
}
