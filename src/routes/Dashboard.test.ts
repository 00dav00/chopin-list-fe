import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard.svelte";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock("svelte-spa-router", () => ({
  push: pushMock,
}));

describe("Dashboard route", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("loads and renders dashboard summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            list_count: 3,
            templates_count: 7,
            last_created_lists: [
              {
                id: "list-1",
                name: "Weekly groceries",
                created_at: "2026-01-02T00:00:00Z",
                updated_at: "2026-01-02T00:00:00Z",
              },
            ],
            last_created_templates: [
              {
                id: "template-1",
                name: "Weekly basics",
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

    expect(await screen.findByText("3")).toBeTruthy();
    expect(await screen.findByText("7")).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Open lists" })).getAttribute("href")).toBe(
      "#/lists"
    );
    expect(
      (await screen.findByRole("link", { name: "Open templates" })).getAttribute("href")
    ).toBe("#/templates");
    expect(await screen.findByText("Weekly groceries")).toBeTruthy();
    expect(await screen.findByText("Weekly basics")).toBeTruthy();
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
            list_count: 0,
            templates_count: 1,
            last_created_lists: [],
            last_created_templates: [
              {
                id: "template-1",
                name: "Weekly basics",
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
});
