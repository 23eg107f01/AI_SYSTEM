export interface AuthUser {
  id: number;
  email: string;
  role: "customer" | "agent" | "manager" | "admin";
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload) return null;

  // Check expiry
  const exp = payload.exp as number;
  if (exp && Date.now() / 1000 > exp) {
    return null;
  }

  return {
    id: Number(payload.sub),
    email: payload.email as string ?? "",
    role: payload.role as AuthUser["role"],
  };
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export function isRole(user: AuthUser | null, ...roles: AuthUser["role"][]): boolean {
  return user !== null && roles.includes(user.role);
}
