import { ApiError } from "./api";

export const getApiErrorMessage = (
  err: unknown,
  fallback: string
): string | null => {
  if (err instanceof ApiError) {
    if (err.status === 401) return null;
    return err.detail || err.message;
  }
  return fallback;
};
