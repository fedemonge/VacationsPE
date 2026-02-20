"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserRole } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";

interface AuthState {
  authenticated: boolean;
  email: string;
  role: UserRole;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  email: "",
  role: "USUARIO",
  loading: true,
  login: async () => false,
  logout: async () => {},
  hasAccess: () => false,
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
          });
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });
  }, []);

  const login = useCallback(async (email: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.authenticated) {
        setState({
          authenticated: true,
          email: data.email,
          role: data.role,
          loading: false,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setState({
      authenticated: false,
      email: "",
      role: "USUARIO",
      loading: false,
    });
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
    <AuthContext.Provider value={{ ...state, login, logout, hasAccess }}>
      {children}
    </AuthContext.Provider>
  );
}
