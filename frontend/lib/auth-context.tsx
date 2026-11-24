"use client";

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
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadProfile = useCallback(async (): Promise<User> => {
    const payload = await api.get<unknown>("/auth/me");
    return normalizeUser(payload);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const refreshed = await refreshAccessToken();
      if (!active) return;
      if (!refreshed) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const profile = await loadProfile();
        if (!active) return;
        setUser(profile);
        setStatus("authenticated");
      } catch {
        if (active) setStatus("unauthenticated");
      }
    })();
    return () => {
      active = false;
    };
  }, [loadProfile]);

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
      if (!token) {
        throw new Error("The server did not return an access token.");
      }
      setAccessToken(token);

      let profile: User;
      try {
        profile = await loadProfile();
      } catch {
        throw new Error("Unable to load your profile.");
      }
      setUser(profile);
      setStatus("authenticated");
      return profile;
    },
    [loadProfile],
  );

  const register = useCallback(async (payload: RegisterPayload) => {
    await api.post<unknown>("/auth/register", payload, { skipAuth: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<unknown>("/auth/logout");
    } catch {
      clearSession();
      return;
    }
    clearSession();
  }, [clearSession]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      clearSession();
      return false;
    }
    try {
      const profile = await loadProfile();
      setUser(profile);
      setStatus("authenticated");
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [clearSession, loadProfile]);

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
