import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, initGoogleSignInMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  initGoogleSignInMock: vi.fn(),
}));

vi.mock("svelte-spa-router", () => ({
  push: pushMock,
}));

vi.mock("../lib/auth", () => ({
  initGoogleSignIn: initGoogleSignInMock,
}));

describe("Login route", () => {
  let Login: typeof import("./Login.svelte").default;
  let apiModule: typeof import("../lib/api");

  beforeEach(async () => {
    vi.resetModules();
    pushMock.mockReset();
    initGoogleSignInMock.mockReset();
    initGoogleSignInMock.mockReturnValue(() => {});
    apiModule = await import("../lib/api");
    vi.spyOn(apiModule.api, "getMe").mockResolvedValue({
      id: "user-1",
      admin: false,
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("hydrates and displays persisted auth notice", async () => {
    sessionStorage.setItem("auth_notice", "Authentication failed. Please sign in again.");

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    expect(
      await screen.findByText("Authentication failed. Please sign in again.")
    ).toBeTruthy();
    expect(initGoogleSignInMock).toHaveBeenCalledWith(
      "google-signin",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("saves token and routes to /dashboard on Google success", async () => {
    initGoogleSignInMock.mockImplementation(
      (_elementId: string, onSuccess: (token: string) => void) => {
        onSuccess("jwt-token");
        return () => {};
      }
    );

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    await waitFor(() => {
      expect(localStorage.getItem("auth_token")).toBe("jwt-token");
    });
    await waitFor(() => {
      expect(apiModule.api.getMe).toHaveBeenCalled();
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("clears token and shows error when /me fails after sign-in", async () => {
    vi.spyOn(apiModule.api, "getMe").mockRejectedValue(new Error("Boom"));
    initGoogleSignInMock.mockImplementation(
      (_elementId: string, onSuccess: (token: string) => void) => {
        onSuccess("jwt-token");
        return () => {};
      }
    );

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    await waitFor(() => {
      expect(localStorage.getItem("auth_token")).toBeNull();
    });
    expect(await screen.findByText("Sign in failed.")).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalledWith("/dashboard");
  });

  it("shows login error when Google sign-in initialization fails", async () => {
    initGoogleSignInMock.mockImplementation(
      (
        _elementId: string,
        _onSuccess: (token: string) => void,
        onError: (message: string) => void
      ) => {
        onError("Google sign-in script not loaded.");
        return () => {};
      }
    );

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    expect(await screen.findByText("Google sign-in script not loaded.")).toBeTruthy();
  });
});
