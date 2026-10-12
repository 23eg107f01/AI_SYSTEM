import axios from "axios";

export function getApiStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function getApiErrorMessage(error: unknown, fallback = "We couldn't complete that request. Please try again."): string {
  if (!axios.isAxiosError(error)) return fallback;
  const status = error.response?.status;
  if (!error.response || error.code === "ECONNABORTED" || error.code === "ERR_NETWORK") {
    return "We couldn't reach the support service. Check your connection and try again.";
  }
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested resource could not be found.";
  if (status !== undefined && status >= 500) return "The support service is temporarily unavailable. Please try again.";
  if (status === 408 || status === 429) return "The request took too long or was rate limited. Please try again.";
  return fallback;
}
