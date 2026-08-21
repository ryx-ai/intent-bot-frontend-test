"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { api, ApiError } from "./api";

export interface UserInfo {
  email?: string;
  name?: string;
  picture?: string;
  auth_provider?: string;
  role?: string;
  tenant?: {
    id: number;
    slug: string;
    name: string;
  } | null;
}

/**
 * Auth hook — provides login, signup, google auth, logout, and redirect helpers.
 * JWT tokens are managed via httponly cookies by the backend.
 */
export function useAuth() {
  const router = useRouter();

  const handleAuthSuccess = useCallback(
    async () => {
      const me = await api.get<UserInfo>("/api/auth/me");
      router.push(
        me.role === "super_admin"
          ? "/workspace/admin/tenants"
          : "/workspace/dashboard"
      );
      return me;
    },
    [router]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ status: string }>("/api/auth/login", {
        email,
        password,
      });
      if (res.status !== "success") {
        throw new ApiError("Login did not succeed", 500);
      }
      await handleAuthSuccess();
      return res;
    },
    [handleAuthSuccess]
  );

  const signup = useCallback(
    async (fullName: string, email: string, password: string) => {
      const res = await api.post<{ status: string }>("/api/auth/signup", {
        full_name: fullName,
        email,
        password,
      });
      if (res.status !== "success") {
        throw new ApiError("Registration did not succeed", 500);
      }
      await handleAuthSuccess();
      return res;
    },
    [handleAuthSuccess]
  );

  const googleAuth = useCallback(
    async (credential: string) => {
      const res = await api.post<{ status: string }>("/api/auth/google", {
        credential,
      });
      if (res.status !== "success") {
        throw new ApiError("Google authentication did not succeed", 500);
      }
      await handleAuthSuccess();
      return res;
    },
    [handleAuthSuccess]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
      router.push("/");
    } catch (err) {
      console.error("Logout failed", err);
      alert("Logout failed. Please check your connection and try again.");
    }
  }, [router]);

  return { login, signup, googleAuth, logout };
}

