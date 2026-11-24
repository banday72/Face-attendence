"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, refreshAccessToken, setAccessToken } from "@/lib/api";
import { isRecord, normalizeUser, pick } from "@/lib/normalize";
import type { RegisterPayload, Role, User } from "@/lib/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  hasRole: (roles: Role[]) => boolean;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    let active = true;
    if (status === "authenticated") return;
    if (pathname === "/login" || pathname === "/register") {
      setStatus("unauthenticated");
      return () => {
        active = false;
      };
    }
    void (async () => {
      const refreshedUser = await refreshAccessToken();
      if (!active) return;
      if (!refreshedUser) {
        setStatus("unauthenticated");
        return;
      }
      setUser(refreshedUser);
      setStatus("authenticated");
    })();
    return () => {
      active = false;
    };
  }, [pathname, status]);

  useEffect(() => {
    window.addEventListener("auth:unauthorized", clearSession);
    return () => window.removeEventListener("auth:unauthorized", clearSession);
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const payload = await api.post<unknown>(
        "/auth/login",
        { email, password },
        { skipAuth: true },
      );
      const envelope = isRecord(payload) ? payload : {};
      const token = pick(envelope, ["access_token", "accessToken", "token"]);
      if (!token || !isRecord(envelope.user)) {
        throw new Error("The server did not return a complete session.");
      }
      const profile = normalizeUser(envelope.user);
      setAccessToken(token);
      setUser(profile);
      setStatus("authenticated");
      return profile;
    },
    [],
  );

  const register = useCallback(async (payload: RegisterPayload) => {
    await api.post<unknown>("/auth/register", payload, { skipAuth: true });
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    void api
      .post<unknown>("/auth/logout", undefined, { keepalive: true })
      .catch(() => undefined);
  }, [clearSession]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const refreshedUser = await refreshAccessToken();
    if (!refreshedUser) {
      clearSession();
      return false;
    }
    setUser(refreshedUser);
    setStatus("authenticated");
    return true;
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      logout,
      refresh,
      hasRole: (roles: Role[]) => (user ? roles.includes(user.role) : false),
      updateUser: setUser,
    }),
    [user, status, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
