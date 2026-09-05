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
      expect.any(Function),
      expect.any(Function)
    );
  });

  // Post-auth navigation moved out of this component. App.svelte's guard fires
  // the moment saveToken flips isAuthed, while the getMe() below is still in
  // flight, so a push here landed afterwards and overwrote it. Harmless while
  // both targets were /dashboard; it broke emailed deep-links.
  it("saves token and loads the profile on Google success, leaving routing to the app guard", async () => {
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
    expect(pushMock).not.toHaveBeenCalledWith("/dashboard");
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

  it("shows login error when Google sign-in container is missing", async () => {
    initGoogleSignInMock.mockImplementation(
      (
        _elementId: string,
        _onSuccess: (token: string) => void,
        onError: (message: string) => void
      ) => {
        onError("Sign-in container not found.");
        return () => {};
      }
    );

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    expect(await screen.findByText("Sign-in container not found.")).toBeTruthy();
  });

  it("shows timeout copy and a Reload page button when GIS load times out", async () => {
    initGoogleSignInMock.mockImplementation(
      (
        _elementId: string,
        _onSuccess: (token: string) => void,
        _onError: (message: string) => void,
        onTimeout?: () => void
      ) => {
        onTimeout?.();
        return () => {};
      }
    );

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    expect(
      await screen.findByText(
        "Google sign-in didn't load. Reload the page to try again."
      )
    ).toBeTruthy();
    const reloadButton = await screen.findByRole("button", { name: "Reload page" });
    expect(reloadButton).toBeTruthy();
    expect(reloadButton.className).toContain("ghost");
  });

  // --- pending-approval persistence ---

  it("shows the pending-approval box on mount when the flag is set in sessionStorage", async () => {
    sessionStorage.setItem("auth_pending_approval", "true");

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    expect(await screen.findByText("Account pending approval")).toBeTruthy();
  });

  it("does not show the pending-approval box on mount when the flag is not set", async () => {
    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    // Wait for the component to settle (auth notice check), then assert absence
    await screen.findByRole("main");
    expect(screen.queryByText("Account pending approval")).toBeNull();
  });

  it("clears the pending flag after a successful sign-in", async () => {
    sessionStorage.setItem("auth_pending_approval", "true");

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
      expect(sessionStorage.getItem("auth_pending_approval")).toBeNull();
    });
    // See the note above: routing is the app guard's job, not this component's.
    expect(pushMock).not.toHaveBeenCalledWith("/dashboard");
  });

  it("shows pending-approval box and persists the flag when /me returns 403", async () => {
    const { ApiError } = await import("../lib/api");
    vi.spyOn(apiModule.api, "getMe").mockRejectedValue(
      new ApiError(403, "API request failed", "Forbidden")
    );

    initGoogleSignInMock.mockImplementation(
      (_elementId: string, onSuccess: (token: string) => void) => {
        onSuccess("jwt-token");
        return () => {};
      }
    );

    const module = await import("./Login.svelte");
    Login = module.default;

    render(Login);

    expect(await screen.findByText("Account pending approval")).toBeTruthy();
    expect(sessionStorage.getItem("auth_pending_approval")).toBe("true");
    expect(pushMock).not.toHaveBeenCalledWith("/dashboard");
  });
});
