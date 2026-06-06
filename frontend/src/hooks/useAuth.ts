import { useState } from "react";
import api from "../utils/api";
import { saveTokens, clearTokens, getStoredUser, AuthUser } from "../utils/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(email: string, password: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      saveTokens(data.access_token, data.refresh_token);
      const storedUser = getStoredUser();
      setUser(storedUser);
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Login failed. Check your credentials.";
      setError(msg);
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
      // Step 1: Register the user
      await api.post("/auth/register", { email, password, role });
      
      // Step 2: Immediately log them in
      const { data } = await api.post("/auth/login", { email, password });
      saveTokens(data.access_token, data.refresh_token);
      const storedUser = getStoredUser();
      setUser(storedUser);
      
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Registration failed.";
      setError(msg);
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
