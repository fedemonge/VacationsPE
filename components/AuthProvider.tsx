"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserRole } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";

interface AuthState {
  authenticated: boolean;
  email: string;
  role: UserRole;
  loading: boolean;
  mustChangePassword: boolean;
}

interface LoginResult {
  success: boolean;
  error?: string;
  requiresPassword?: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  hasAccess: (path: string) => boolean;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  email: "",
  role: "USUARIO",
  loading: true,
  mustChangePassword: false,
  login: async () => ({ success: false }),
  logout: async () => {},
  hasAccess: () => false,
  clearMustChangePassword: () => {},
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    email: "",
    role: "USUARIO",
    loading: true,
    mustChangePassword: false,
  });

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setState({
            authenticated: true,
            email: data.email,
            role: data.role,
            loading: false,
            mustChangePassword: data.mustChangePassword || false,
          });
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });
  }, []);

  const login = useCallback(
    async (email: string, password?: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.authenticated) {
          setState({
            authenticated: true,
            email: data.email,
            role: data.role,
            loading: false,
            mustChangePassword: data.mustChangePassword || false,
          });
          return { success: true };
        }
        return {
          success: false,
          error: data.error,
          requiresPassword: data.requiresPassword,
        };
      } catch {
        return { success: false, error: "Error de conexión" };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setState({
      authenticated: false,
      email: "",
      role: "USUARIO",
      loading: false,
      mustChangePassword: false,
    });
    window.location.href = "/sesion-cerrada";
  }, []);

  const clearMustChangePassword = useCallback(() => {
    setState((prev) => ({ ...prev, mustChangePassword: false }));
  }, []);

  const hasAccess = useCallback(
    (path: string): boolean => {
      if (!state.authenticated) return false;
      const allowed = ROLE_PERMISSIONS[state.role];
      return allowed.some((p) => path.startsWith(p));
    },
    [state.authenticated, state.role]
  );

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasAccess, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
