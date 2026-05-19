import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRoute, waitForRoute } from "./test/utils/router";

const { initGoogleSignInMock } = vi.hoisted(() => ({
  initGoogleSignInMock: vi.fn(),
}));

vi.mock("./lib/auth", () => ({
  initGoogleSignIn: initGoogleSignInMock,
}));

const makeJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const getPathname = (input: RequestInfo | URL) => {
  const raw = input.toString();
  return new URL(raw, "http://localhost").pathname;
};

const makeFetch = (handlers: Record<string, () => Response>) =>
  vi.fn((input: RequestInfo | URL) => {
    const path = getPathname(input);
    const handler = handlers[path];
    if (!handler) {
      return Promise.resolve(makeJsonResponse({}, 200));
    }
    return Promise.resolve(handler());
  });

describe("App", () => {
  let App: typeof import("./App.svelte").default;

  beforeEach(() => {
    vi.resetModules();
    setRoute("/dashboard");
    initGoogleSignInMock.mockReset();
    initGoogleSignInMock.mockReturnValue(() => {});
  });

  it("redirects unauthenticated users to /login", async () => {
    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    await waitForRoute("/login");
    expect(await screen.findByRole("heading", { name: "Shoplist" })).toBeTruthy();
  });

  it("redirects to /login and shows auth notice when a 401 occurs", async () => {
    setRoute("/dashboard");
    localStorage.setItem("auth_token", "token-123");
    localStorage.setItem("auth_expiry", String(Date.now() + 60_000));

    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/me": () =>
          makeJsonResponse({
            id: "user-1",
            created_at: "2026-01-01T00:00:00Z",
          }),
        "/me/": () =>
          makeJsonResponse({
            id: "user-1",
            created_at: "2026-01-01T00:00:00Z",
          }),
        "/me/dashboard": () => makeJsonResponse({ detail: "Unauthorized" }, 401),
        "/me/dashboard/": () => makeJsonResponse({ detail: "Unauthorized" }, 401),
      })
    );

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    await waitForRoute("/login");
    expect(
      await screen.findByText("Authentication failed. Please sign in again.")
    ).toBeTruthy();
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("shows pending-approval notice on Login when bootstrapAuth /me returns 403", async () => {
    setRoute("/dashboard");
    localStorage.setItem("auth_token", "token-123");
    localStorage.setItem("auth_expiry", String(Date.now() + 60_000));

    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/me": () =>
          makeJsonResponse({ detail: "Account pending approval." }, 403),
        "/me/dashboard": () =>
          makeJsonResponse({ detail: "Account pending approval." }, 403),
      })
    );

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    await waitForRoute("/login");
    expect(await screen.findByText("Account pending approval")).toBeTruthy();
    expect(
      await screen.findByText(/Your account has been registered/)
    ).toBeTruthy();
    expect(sessionStorage.getItem("auth_pending_approval")).toBe("true");
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("shows pending-approval notice after fresh Google sign-in returns 403", async () => {
    setRoute("/login");

    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/me": () =>
          makeJsonResponse({ detail: "Account pending approval." }, 403),
        "/me/dashboard": () =>
          makeJsonResponse({ detail: "Account pending approval." }, 403),
      })
    );

    initGoogleSignInMock.mockImplementation(
      (_elementId: string, onSuccess: (token: string) => void) => {
        queueMicrotask(() => onSuccess("jwt-token"));
        return () => {};
      }
    );

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    expect(
      await screen.findByText(/Your account has been registered/)
    ).toBeTruthy();
    expect(sessionStorage.getItem("auth_pending_approval")).toBe("true");
  });
});
