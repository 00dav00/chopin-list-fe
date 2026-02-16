import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.clear();
  }
});
