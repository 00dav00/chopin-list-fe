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
      return Promise.resolve(makeJsonResponse({}, 200));
    }
    return Promise.resolve(handler());
  });

describe("App", () => {
  let App: typeof import("./App.svelte").default;

  beforeEach(() => {
    vi.resetModules();
    setRoute("/dashboard");
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
});
