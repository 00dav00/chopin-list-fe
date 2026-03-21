import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthModule = typeof import("./auth");
type ApiModule = typeof import("../lib/api");

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe("auth store", () => {
  let authModule: AuthModule;
  let apiModule: ApiModule;

  beforeEach(async () => {
    vi.resetModules();
    authModule = await import("./auth");
    apiModule = await import("../lib/api");
  });

  it("marks token as expired when expiry is null", () => {
    expect(authModule.isTokenExpired(null)).toBe(true);
  });

  it("compares token expiry with current time", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    expect(authModule.isTokenExpired(1_001)).toBe(false);
    expect(authModule.isTokenExpired(999)).toBe(true);
  });

  it("saveToken writes token and expiry, and clears auth notice", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    authModule.setAuthNotice("Authentication failed.");

    authModule.saveToken("token-abc");

    expect(localStorage.getItem("auth_token")).toBe("token-abc");
    expect(localStorage.getItem("auth_expiry")).toBe(String(10_000 + ONE_WEEK_MS));
    expect(sessionStorage.getItem("auth_notice")).toBeNull();
    expect(get(authModule.authNoticeStore)).toBeNull();
    expect(get(authModule.authStore).token).toBe("token-abc");
  });

  it("clearToken removes stored auth and resets store state", () => {
    authModule.authStore.set({
      token: "token-abc",
      expiry: 12_000,
      user: { id: "user-1", admin: false, created_at: "2026-01-01T00:00:00Z" },
      ready: false,
    });
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", "12000");

    authModule.clearToken();

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_expiry")).toBeNull();
    expect(get(authModule.authStore)).toEqual({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
  });

  it("hydrates auth notice from session storage", () => {
    sessionStorage.setItem("auth_notice", "Please sign in again.");

    authModule.hydrateAuthNotice();

    expect(get(authModule.authNoticeStore)).toBe("Please sign in again.");
  });

  it("bootstrapAuth clears state when token is missing", async () => {
    const getMeSpy = vi.spyOn(apiModule.api, "getMe");

    await authModule.bootstrapAuth();

    expect(getMeSpy).not.toHaveBeenCalled();
    expect(get(authModule.authStore)).toEqual({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
  });

  it("bootstrapAuth clears state when token is expired", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", "4000");
    const getMeSpy = vi.spyOn(apiModule.api, "getMe");

    await authModule.bootstrapAuth();

    expect(getMeSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(get(authModule.authStore).ready).toBe(true);
  });

  it("bootstrapAuth loads user when stored token is valid", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", "15000");
    const user = { id: "user-1", admin: false, created_at: "2026-01-01T00:00:00Z" };
    vi.spyOn(apiModule.api, "getMe").mockResolvedValue(user);

    await authModule.bootstrapAuth();

    expect(get(authModule.authStore)).toEqual({
      token: "token-abc",
      expiry: 15_000,
      user,
      ready: true,
    });
  });

  it("bootstrapAuth clears state when /me request fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", "15000");
    vi.spyOn(apiModule.api, "getMe").mockRejectedValue(new Error("Unauthorized"));

    await authModule.bootstrapAuth();

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(get(authModule.authStore)).toEqual({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
  });
});
