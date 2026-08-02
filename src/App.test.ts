import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRoute, setRoute, waitForRoute } from "./test/utils/router";

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

  // -------------------------------------------------------------------------
  // Deep-links from the new-user notification email must survive the login
  // round-trip. Store-level unit tests live in src/stores/auth.test.ts; these
  // drive the real redirect guard, because the guard is where the pop happens
  // and a sign-in-callback-level test would pass even if the pop were dead code.
  // -------------------------------------------------------------------------

  // Responses resolve after a few real milliseconds rather than instantly.
  // This is load-bearing, not incidental: with an immediately-resolved fetch
  // the competing post-auth navigations land in a favourable order and these
  // tests pass against a deep-link return that is actually broken in a browser.
  // A realistic hop reproduces the order a real network produces.
  const NETWORK_MS = 15;

  /** Let every pending navigation land, so a transient route can't pass as final. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, NETWORK_MS * 5));

  const respond = (payload: unknown) =>
    vi.fn((input: RequestInfo | URL) => {
      const path = getPathname(input);
      // Collection endpoints must answer with arrays; the shared makeFetch
      // fallback returns {}, which crashes an {#each} in whichever route
      // mounts and takes the pending redirect down with it.
      const body =
        path === "/me" || path === "/me/"
          ? payload
          : path === "/me/dashboard"
            ? {
                active_list_count: 0,
                completed_list_count: 0,
                templates_count: 0,
                last_created_lists: [],
                last_created_templates: [],
              }
            : [];
      return new Promise<Response>((resolve) =>
        setTimeout(() => resolve(makeJsonResponse(body)), NETWORK_MS)
      );
    });

  const signInReturning = (fetchImpl: ReturnType<typeof respond>) => {
    vi.stubGlobal("fetch", fetchImpl);
    initGoogleSignInMock.mockImplementation(
      (_elementId: string, onSuccess: (token: string) => void) => {
        queueMicrotask(() => onSuccess("jwt-token"));
        return () => {};
      }
    );
  };

  const signInSucceedsAs = (payload: unknown) => signInReturning(respond(payload));

  it("returns a signed-out admin to the emailed pending-users link after sign-in", async () => {
    localStorage.clear();
    sessionStorage.clear();
    setRoute("/admin/pending-users");
    signInSucceedsAs({
      id: "user-1",
      admin: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    // Bounced to login first...
    await waitForRoute("/login");
    // ...then back to where the email pointed, not the default landing page.
    await waitForRoute("/admin/pending-users");

    // And it must *stay* there. waitForRoute is satisfied by a momentary match,
    // so on its own it passes even when the admin route immediately bounces
    // back out -- which is exactly what happens if we navigate before the
    // profile has loaded, since PendingUsers redirects a non-admin to
    // /dashboard and a null user reads as non-admin.
    await settle();
    expect(getRoute()).toBe("/admin/pending-users");
    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });

  it("discards the emailed return path when sign-in ends in pending approval", async () => {
    localStorage.clear();
    sessionStorage.clear();
    setRoute("/admin/pending-users");
    signInReturning(
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () =>
                resolve(
                  makeJsonResponse({ detail: "Account pending approval." }, 403)
                ),
              NETWORK_MS
            )
          )
      )
    );

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    expect(
      await screen.findByText(/Your account has been registered/)
    ).toBeTruthy();
    // Settle before asserting: a rejected sign-in must also not drift off
    // /login afterwards.
    await settle();
    expect(getRoute()).toBe("/login");
    // The post-auth arm requires a loaded profile, which a 403 never produces,
    // so nothing consumes the stash. Left behind it would fire at an unrelated
    // later sign-in in this tab, and approval is a multi-day wait.
    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });

  it("still lands on the dashboard for a route outside the return allowlist", async () => {
    localStorage.clear();
    sessionStorage.clear();
    setRoute("/lists");
    signInSucceedsAs({
      id: "user-1",
      created_at: "2026-01-01T00:00:00Z",
    });

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    await waitForRoute("/login");
    // The allowlist has one entry, so every other deep-link behaves exactly as
    // it did before this feature: no return path, default destination.
    await waitForRoute("/dashboard");

    // This is the only *positive* coverage that an ordinary, non-deep-link
    // sign-in reaches the dashboard -- the majority path. Login.test.ts now
    // asserts `push` was NOT called with "/dashboard", which passes vacuously
    // if anything upstream breaks, so the outcome has to be pinned here.
    // Settled, not merely observed: waitForRoute resolves on a momentary match.
    await settle();
    expect(getRoute()).toBe("/dashboard");
    expect(sessionStorage.getItem("auth_return_to")).toBeNull();
  });
});
