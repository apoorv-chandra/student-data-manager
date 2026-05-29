import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: "teacher" | "superadmin";
  isActive: boolean;
  googleSheetUrl?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  requiresPasswordChange: boolean;
  login: (token: string, user: AuthUser, requiresChange: boolean) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "@auth_token";
const USER_KEY = "@auth_user";
const PWD_CHANGE_KEY = "@requires_pwd_change";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  useEffect(() => {
    let currentToken: string | null = null;
    setAuthTokenGetter(() => currentToken);

    async function restore() {
      try {
        const [storedToken, storedUser, storedPwdChange] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(PWD_CHANGE_KEY),
        ]);
        if (storedToken && storedUser) {
          const parsed = JSON.parse(storedUser) as AuthUser;
          currentToken = storedToken;
          setAuthTokenGetter(() => currentToken);
          setToken(storedToken);
          setUser(parsed);
          setRequiresPasswordChange(storedPwdChange === "true");
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, []);

  const login = useCallback(async (newToken: string, newUser: AuthUser, requiresChange: boolean) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, newToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser)),
      AsyncStorage.setItem(PWD_CHANGE_KEY, String(requiresChange)),
    ]);
    setAuthTokenGetter(() => newToken);
    setToken(newToken);
    setUser(newUser);
    setRequiresPasswordChange(requiresChange);
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(PWD_CHANGE_KEY),
    ]);
    setAuthTokenGetter(() => null);
    setToken(null);
    setUser(null);
    setRequiresPasswordChange(false);
  }, []);

  const updateUser = useCallback((updated: AuthUser) => {
    setUser(updated);
    AsyncStorage.setItem(USER_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const markPasswordChanged = useCallback(() => {
    setRequiresPasswordChange(false);
    AsyncStorage.setItem(PWD_CHANGE_KEY, "false").catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, requiresPasswordChange, login, logout, updateUser, markPasswordChanged }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
