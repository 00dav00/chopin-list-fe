import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ListDetailLive from "./ListDetailLive.svelte";
import { authStore } from "../stores/auth";
import { makeItem, makeList } from "../test/utils/factories";

const { pushMock, apiMock, connectMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    getList: vi.fn(),
    listItems: vi.fn(),
  },
  connectMock: vi.fn(),
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

vi.mock("../lib/realtime", () => ({
  connectLiveListSocket: connectMock,
}));

describe("ListDetailLive route", () => {
  beforeEach(() => {
    pushMock.mockReset();
    connectMock.mockReset();
    apiMock.getList.mockReset();
    apiMock.listItems.mockReset();
    connectMock.mockReturnValue({ close: vi.fn() });
  });

  it("redirects non-admin users to the classic list page", async () => {
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });

    render(ListDetailLive, { props: { params: { listId: "list-1" } } });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/lists/list-1");
    });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("refreshes list and items when a live event arrives", async () => {
    authStore.set({
      token: "token-abc",
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

    apiMock.getList
      .mockResolvedValueOnce(makeList({ id: "list-1", name: "Weekly" }))
      .mockResolvedValueOnce(makeList({ id: "list-1", name: "Weekly" }));
    apiMock.listItems
      .mockResolvedValueOnce([
        makeItem({ id: "item-1", list_id: "list-1", name: "Milk", sort_order: 0 }),
      ])
      .mockResolvedValueOnce([
        makeItem({ id: "item-1", list_id: "list-1", name: "Milk", sort_order: 0 }),
        makeItem({ id: "item-2", list_id: "list-1", name: "Bread", sort_order: 1 }),
      ]);

    render(ListDetailLive, { props: { params: { listId: "list-1" } } });

    await screen.findByText("Milk");
    expect(connectMock).toHaveBeenCalledTimes(1);

    const connectArgs = connectMock.mock.calls[0]?.[0] as {
      onEvent: () => void;
    };
    connectArgs.onEvent();

    await screen.findByText("Bread");
    expect(apiMock.getList).toHaveBeenCalledTimes(2);
    expect(apiMock.listItems).toHaveBeenCalledTimes(2);
  });
});
