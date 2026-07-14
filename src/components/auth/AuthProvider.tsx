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
import { trackFunnelEvent } from "@/lib/analytics/funnel";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  signIn: (input: {
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signUp: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
};

const STORAGE_KEY = "scalesystems.auth.user";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.email || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStoredUser());
    setReady(true);
  }, []);

  const persist = useCallback((next: AuthUser | null) => {
    setUser(next);
    if (typeof window === "undefined") return;
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      trackFunnelEvent({ event: "auth_signin_submit" });
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          user?: AuthUser;
        };
        if (!response.ok || !payload.success || !payload.user) {
          trackFunnelEvent({
            event: "auth_failure",
            metadata: { mode: "signin" },
          });
          return { ok: false, error: payload.error ?? "Sign in failed." };
        }
        persist(payload.user);
        trackFunnelEvent({ event: "auth_success", metadata: { mode: "signin" } });
        return { ok: true };
      } catch {
        trackFunnelEvent({
          event: "auth_failure",
          metadata: { mode: "signin" },
        });
        return { ok: false, error: "Network error during sign in." };
      }
    },
    [persist]
  );

  const signUp = useCallback(
    async (input: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => {
      trackFunnelEvent({ event: "auth_signup_submit" });
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${input.firstName} ${input.lastName}`.trim(),
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            password: input.password,
          }),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          user?: AuthUser;
        };
        if (!response.ok || !payload.success || !payload.user) {
          trackFunnelEvent({
            event: "auth_failure",
            metadata: { mode: "signup" },
          });
          return { ok: false, error: payload.error ?? "Sign up failed." };
        }
        persist(payload.user);
        trackFunnelEvent({ event: "auth_success", metadata: { mode: "signup" } });
        return { ok: true };
      } catch {
        trackFunnelEvent({
          event: "auth_failure",
          metadata: { mode: "signup" },
        });
        return { ok: false, error: "Network error during sign up." };
      }
    },
    [persist]
  );

  const signOut = useCallback(() => {
    persist(null);
  }, [persist]);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut }),
    [user, ready, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
