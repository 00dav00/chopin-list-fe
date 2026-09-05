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

  // --- pending-approval persistence ---

  it("setPendingApproval writes 'true' to sessionStorage[auth_pending_approval]", () => {
    authModule.setPendingApproval();
    expect(sessionStorage.getItem("auth_pending_approval")).toBe("true");
  });

  it("clearPendingApproval removes the key from sessionStorage", () => {
    authModule.setPendingApproval();
    authModule.clearPendingApproval();
    expect(sessionStorage.getItem("auth_pending_approval")).toBeNull();
  });

  it("isPendingApproval returns true when the key is 'true'", () => {
    authModule.setPendingApproval();
    expect(authModule.isPendingApproval()).toBe(true);
  });

  it("isPendingApproval returns false when the key is not set", () => {
    expect(authModule.isPendingApproval()).toBe(false);
  });

  it("isPendingApproval returns false when the key is set to a value other than 'true'", () => {
    sessionStorage.setItem("auth_pending_approval", "yes");
    expect(authModule.isPendingApproval()).toBe(false);
  });

  it("saveToken clears the pending approval flag", () => {
    authModule.setPendingApproval();
    authModule.saveToken("my-token");
    expect(authModule.isPendingApproval()).toBe(false);
  });

  it("bootstrapAuth calls setPendingApproval when /me returns a 403", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", "15000");
    vi.spyOn(apiModule.api, "getMe").mockRejectedValue(
      new apiModule.ApiError(403, "API request failed", "Forbidden")
    );

    await authModule.bootstrapAuth();

    expect(authModule.isPendingApproval()).toBe(true);
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_expiry")).toBeNull();
    expect(get(authModule.authStore)).toEqual({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
  });

  it("bootstrapAuth calls clearPendingApproval when /me returns a non-403 error", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", "15000");
    vi.spyOn(apiModule.api, "getMe").mockRejectedValue(
      new apiModule.ApiError(500, "API request failed", "Server Error")
    );

    // Pre-set the flag to confirm it gets cleared
    authModule.setPendingApproval();
    await authModule.bootstrapAuth();

    expect(authModule.isPendingApproval()).toBe(false);
  });

  // returnTo for emailed deep-links. The redirect-guard integration is covered
  // in src/App.test.ts.

  it("captureReturnTo stores an allowlisted route when signed out", () => {
    authModule.captureReturnTo("/admin/pending-users");

    expect(sessionStorage.getItem("auth_return_to")).toBe(
      "/admin/pending-users"
    );
  });

  it("captureReturnTo ignores routes outside the allowlist", () => {
    authModule.captureReturnTo("/lists");

    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });

  it("captureReturnTo stores nothing when a live session already exists", () => {
    // An admin who opens the deep-link already signed in is never redirected to
    // login, so a stash here would sit unclaimed and then fire much later after
    // an unrelated session expiry.
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", String(60_000));

    authModule.captureReturnTo("/admin/pending-users");

    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });

  it("captureReturnTo still stores when the existing session is expired", () => {
    vi.spyOn(Date, "now").mockReturnValue(60_000);
    localStorage.setItem("auth_token", "token-abc");
    localStorage.setItem("auth_expiry", String(1_000));

    authModule.captureReturnTo("/admin/pending-users");

    expect(sessionStorage.getItem("auth_return_to")).toBe(
      "/admin/pending-users"
    );
  });

  it("takeReturnTo consumes the stored route so it is used at most once", () => {
    authModule.captureReturnTo("/admin/pending-users");

    expect(authModule.takeReturnTo()).toBe("/admin/pending-users");
    expect(authModule.takeReturnTo()).toBeNull();
    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });

  it("clearReturnTo discards a stash that will never be consumed", () => {
    authModule.captureReturnTo("/admin/pending-users");

    authModule.clearReturnTo();

    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });

  it("takeReturnTo rejects and clears a value outside the allowlist", () => {
    // Defence in depth: sessionStorage is writable by any script on the origin,
    // so the allowlist is re-checked on read rather than trusted from write.
    sessionStorage.setItem("auth_return_to", "https://evil.example.com");

    expect(authModule.takeReturnTo()).toBeNull();
    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });
});
