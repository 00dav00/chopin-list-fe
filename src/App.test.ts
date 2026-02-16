import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRoute, waitForRoute } from "./test/utils/router";

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
      return Promise.resolve(new Response("", { status: 404 }));
    }
    return Promise.resolve(handler());
  });

describe("App", () => {
  let App: typeof import("./App.svelte").default;

  beforeEach(() => {
    vi.resetModules();
    setRoute("/lists");
  });

  it("redirects unauthenticated users to /login", async () => {
    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    await waitForRoute("/login");
    expect(await screen.findByRole("heading", { name: "Shoplist" })).toBeTruthy();
  });

  it("redirects authenticated users from /login to /lists", async () => {
    setRoute("/login");
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
        "/lists": () => makeJsonResponse([]),
      })
    );

    const module = await import("./App.svelte");
    App = module.default;

    render(App);

    await waitForRoute("/lists");
    expect(await screen.findByRole("heading", { name: "Your Lists" })).toBeTruthy();
  });

  it("redirects to /login and shows auth notice when a 401 occurs", async () => {
    setRoute("/lists");
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
        "/lists": () => makeJsonResponse({ detail: "Unauthorized" }, 401),
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
});
