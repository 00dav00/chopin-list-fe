import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActiveUsers from "./ActiveUsers.svelte";
import { authStore } from "../stores/auth";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    listConfirmedUsers: vi.fn(),
    unconfirmUser: vi.fn(),
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

describe("ActiveUsers route", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiMock.listConfirmedUsers.mockReset();
    apiMock.unconfirmUser.mockReset();
  });

  it("redirects non-admin users to dashboard", async () => {
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });

    render(ActiveUsers);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
    expect(apiMock.listConfirmedUsers).not.toHaveBeenCalled();
  });

  it("loads and renders active users for admins", async () => {
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
    apiMock.listConfirmedUsers.mockResolvedValue([
      {
        id: "active-1",
        email: "active@example.com",
        name: "Active User",
        avatar_url: null,
        approved: true,
        created_at: "2026-01-03T00:00:00Z",
        last_login_at: null,
      },
    ]);

    render(ActiveUsers);

    expect(await screen.findByText("Active User")).toBeTruthy();
    expect(screen.getByText(/active@example.com/)).toBeTruthy();
    expect(apiMock.listConfirmedUsers).toHaveBeenCalledTimes(1);
  });

  it("unconfirms an active user and removes it from the list", async () => {
    const user = userEvent.setup();
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
    apiMock.listConfirmedUsers.mockResolvedValue([
      {
        id: "active-1",
        email: "active@example.com",
        name: "Active User",
        avatar_url: null,
        approved: true,
        created_at: "2026-01-03T00:00:00Z",
        last_login_at: null,
      },
    ]);
    apiMock.unconfirmUser.mockResolvedValue({
      id: "active-1",
      email: "active@example.com",
      name: "Active User",
      avatar_url: null,
      approved: false,
      created_at: "2026-01-03T00:00:00Z",
      last_login_at: null,
    });

    render(ActiveUsers);

    await user.click(await screen.findByRole("button", { name: "Unconfirm" }));

    await waitFor(() => {
      expect(apiMock.unconfirmUser).toHaveBeenCalledWith("active-1");
    });
    await waitFor(() => {
      expect(screen.queryByText("Active User")).toBeNull();
    });
  });
});
