import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PendingUsers from "./PendingUsers.svelte";
import { authStore } from "../stores/auth";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    listPendingUsers: vi.fn(),
  },
  TestApiError: class extends Error {
    status: number;
    detail?: string;

    constructor(status: number, message = "API request failed", detail?: string) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  },
}));

vi.mock("svelte-spa-router", () => ({
  push: pushMock,
}));

vi.mock("../lib/api", () => ({
  ApiError: TestApiError,
  api: apiMock,
  setAuthTokenGetter: vi.fn(),
}));

describe("PendingUsers route", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiMock.listPendingUsers.mockReset();
  });

  it("redirects non-admin users to dashboard", async () => {
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });

    render(PendingUsers);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
    expect(apiMock.listPendingUsers).not.toHaveBeenCalled();
  });

  it("loads and renders pending users for admins", async () => {
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
    apiMock.listPendingUsers.mockResolvedValue([
      {
        id: "pending-1",
        email: "pending@example.com",
        name: "Pending User",
        avatar_url: null,
        approved: false,
        created_at: "2026-01-03T00:00:00Z",
        last_login_at: null,
      },
    ]);

    render(PendingUsers);

    expect(await screen.findByText("Pending User")).toBeTruthy();
    expect(screen.getByText("pending@example.com")).toBeTruthy();
    expect(apiMock.listPendingUsers).toHaveBeenCalledTimes(1);
  });

  it("shows API errors", async () => {
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
    apiMock.listPendingUsers.mockRejectedValue(
      new TestApiError(500, "API request failed", "Backend unavailable")
    );

    render(PendingUsers);

    expect(await screen.findByText("Backend unavailable")).toBeTruthy();
  });
});
