"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { api } from "./api";

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
      if (res.status === "success") {
        router.push("/workspace");
      }
      return res;
    },
    [router]
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    router.push("/");
  }, [router]);

  return { login, logout };
}
