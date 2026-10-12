import axios from "axios";

const DEV_API_URL =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000";
const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? DEV_API_URL : "/_/backend");

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

let refreshRequest: Promise<string> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) throw new Error("No refresh token");

      if (!refreshRequest) {
        refreshRequest = axios
          .post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 15_000 })
          .then(({ data }) => {
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("refresh_token", data.refresh_token);
            return data.access_token as string;
          })
          .finally(() => {
            refreshRequest = null;
          });
      }

      const accessToken = await refreshRequest;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      localStorage.clear();
      if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.location.assign("/login");
      }
      return Promise.reject(error);
    }
  }
);

export default api;
