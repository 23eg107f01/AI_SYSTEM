import { createContext, ReactNode, useContext, useState } from "react";
import api from "../utils/api";
import { saveTokens, clearTokens, getStoredUser, AuthUser } from "../utils/auth";
import { getApiErrorMessage } from "../utils/errorMessages";

interface AuthContextValue {
  user: AuthUser | null;
  error: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, role?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadCurrentUser(): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>("/auth/me");
    setUser(data);
    return data;
  }

  async function login(email: string, password: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      saveTokens(data.access_token, data.refresh_token);
      await loadCurrentUser();
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Login failed. Check your credentials."));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function register(
    email: string,
    password: string,
    role = "customer"
  ): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/register", { email, password, role });

      const { data } = await api.post("/auth/login", { email, password });
      saveTokens(data.access_token, data.refresh_token);
      await loadCurrentUser();

      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Registration failed."));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore logout API errors — still clear tokens locally
    }
    clearTokens();
    setUser(null);
  }

  return { user, error, loading, login, register, logout };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={useAuthState()}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
