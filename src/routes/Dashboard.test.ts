import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard.svelte";
import { authStore } from "../stores/auth";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock("svelte-spa-router", () => ({
  push: pushMock,
}));

describe("Dashboard route", () => {
  beforeEach(() => {
    pushMock.mockReset();
    authStore.set({ token: null, expiry: null, user: null, ready: true });
  });

  it("loads and renders dashboard summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            active_list_count: 3,
            completed_list_count: 2,
            templates_count: 7,
            confirmed_users_count: null,
            pending_users_count: null,
            last_created_lists: [
              {
                id: "list-1",
                name: "Weekly groceries",
                items_count: 5,
                created_at: "2026-01-02T00:00:00Z",
                updated_at: "2026-01-02T00:00:00Z",
              },
            ],
            last_created_templates: [
              {
                id: "template-1",
                name: "Weekly basics",
                items_count: 1,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(Dashboard);

    expect(await screen.findByRole("heading", { name: "Chopin list" })).toBeTruthy();
    expect(screen.queryByText("Quick overview of your lists and templates.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lists" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Templates" })).toBeNull();
    expect(await screen.findByText("3")).toBeTruthy();
    expect(await screen.findByText("2 completed")).toBeTruthy();
    expect(await screen.findByText("7")).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Open lists" })).getAttribute("href")).toBe(
      "#/lists"
    );
    expect(
      (await screen.findByRole("link", { name: "Open templates" })).getAttribute("href")
    ).toBe("#/templates");
    expect(screen.queryByRole("button", { name: "Open lists" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open templates" })).toBeNull();
    expect((await screen.findByText(/Weekly groceries/)).closest("a")?.getAttribute("href")).toBe(
      "#/lists/list-1"
    );
    expect(await screen.findByText(/Weekly groceries \(5 items\)/)).toBeTruthy();
    expect((await screen.findByText(/Weekly basics/)).closest("a")?.getAttribute("href")).toBe(
      "#/templates/template-1"
    );
    expect(await screen.findByText(/Weekly basics \(1 item\)/)).toBeTruthy();
  });

  it("shows api detail message when dashboard request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Dashboard unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
          statusText: "Service Unavailable",
        })
      )
    );

    render(Dashboard);

    expect(await screen.findByText("Dashboard unavailable")).toBeTruthy();
  });

  it("does not render latest lists section when there are none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            active_list_count: 0,
            completed_list_count: 1,
            templates_count: 1,
            confirmed_users_count: null,
            pending_users_count: null,
            last_created_lists: [],
            last_created_templates: [
              {
                id: "template-1",
                name: "Weekly basics",
                items_count: 0,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(Dashboard);

    expect(screen.queryByRole("heading", { name: "Latest lists" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "Latest templates" })).toBeTruthy();
  });

  it("does not render latest templates section when there are none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            active_list_count: 1,
            completed_list_count: 0,
            templates_count: 0,
            confirmed_users_count: null,
            pending_users_count: null,
            last_created_lists: [
              {
                id: "list-1",
                name: "Weekly groceries",
                items_count: 0,
                created_at: "2026-01-02T00:00:00Z",
                updated_at: "2026-01-02T00:00:00Z",
              },
            ],
            last_created_templates: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(Dashboard);

    expect(screen.queryByRole("heading", { name: "Latest templates" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "Latest lists" })).toBeTruthy();
  });

  it("shows active-users card for admins with active and pending counts", async () => {
    authStore.set({
      token: "token",
      expiry: Date.now() + 10_000,
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        avatar_url: null,
        admin: true,
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: "2026-01-01T00:00:00Z",
      },
      ready: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            active_list_count: 1,
            completed_list_count: 0,
            templates_count: 1,
            confirmed_users_count: 5,
            pending_users_count: 2,
            last_created_lists: [],
            last_created_templates: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(Dashboard);

    expect(await screen.findByRole("button", { name: "Active users" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Open active users" })).toBeTruthy();
    expect(await screen.findByText("5 active users")).toBeTruthy();
    expect(await screen.findByText("2 pending users")).toBeTruthy();
  });
});
