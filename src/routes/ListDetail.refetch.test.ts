import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ListDetail from "./ListDetail.svelte";
import { makeItem, makeList } from "../test/utils/factories";
import { authStore } from "../stores/auth";
import type { UserOut } from "../lib/types";

const { apiMock, TestApiError, pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    getMe: vi.fn(),
    getList: vi.fn(),
    getListWithEtag: vi.fn(),
    listItems: vi.fn(),
    completeList: vi.fn(),
    activateList: vi.fn(),
    updateList: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    toggleItem: vi.fn(),
    deleteItem: vi.fn(),
    reorderListItems: vi.fn(),
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

const listId = "list-1";
const baseList = makeList({ id: listId, name: "Groceries" });
const baseItem = makeItem({ id: "item-1", list_id: listId, name: "Milk" });

const seedInitialLoad = (overrides: { items?: ReturnType<typeof makeItem>[] } = {}) => {
  apiMock.getList.mockResolvedValue(baseList);
  apiMock.listItems.mockResolvedValue(overrides.items ?? [baseItem]);
};

const renderListDetail = async () => {
  const user: UserOut = {
    id: "user-1",
    email: "u@example.com",
    name: "U",
    admin: false,
    created_at: "",
  };
  authStore.set({
    token: "tok",
    expiry: Date.now() + 60_000,
    user,
    ready: true,
  });
  const view = render(ListDetail, { params: { listId } });
  await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
  return view;
};

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock.getList.mockReset();
  apiMock.getListWithEtag.mockReset();
  apiMock.listItems.mockReset();
  apiMock.updateItem.mockReset();
  apiMock.reorderListItems.mockReset();
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ListDetail visibility-gated refetch", () => {
  it("hidden tab → no background fetch on visibilitychange", async () => {
    seedInitialLoad();
    await renderListDetail();
    const initialCalls = apiMock.getListWithEtag.mock.calls.length;

    setVisibility("hidden");
    await fireEvent(document, new Event("visibilitychange"));

    // Drain microtasks
    await Promise.resolve();
    expect(apiMock.getListWithEtag.mock.calls.length).toBe(initialCalls);
  });

  it("visible tab → background fetch with cache: 'no-store' and If-None-Match header", async () => {
    seedInitialLoad();
    apiMock.getListWithEtag.mockResolvedValue({
      status: 200,
      etag: 'W/"1700000000000"',
      list: baseList,
    });
    await renderListDetail();

    // First refetch: lastEtag is null → If-None-Match arg is null
    setVisibility("visible");
    await fireEvent(document, new Event("visibilitychange"));
    await waitFor(() =>
      expect(apiMock.getListWithEtag).toHaveBeenCalledWith(
        listId,
        null,
        expect.any(AbortSignal)
      )
    );

    // The api wrapper is responsible for cache: 'no-store' — verified by
    // the dedicated api.test.ts suite. Here we additionally verify the
    // captured ETag is sent on the next refetch.
    apiMock.getListWithEtag.mockClear();
    apiMock.getListWithEtag.mockResolvedValue({
      status: 304,
      etag: 'W/"1700000000000"',
    });
    await fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(apiMock.getListWithEtag).toHaveBeenCalledWith(
        listId,
        'W/"1700000000000"',
        expect.any(AbortSignal)
      )
    );
  });

  it("304 response is a no-op — no list/items mutation, no banner", async () => {
    seedInitialLoad();
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"1"',
      list: baseList,
    });
    await renderListDetail();

    // Prime lastEtag with a 200
    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalled());

    apiMock.listItems.mockClear();
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 304,
      etag: 'W/"1"',
    });
    await fireEvent(window, new Event("focus"));

    // 304: no items refetch should happen
    await waitFor(() => {
      expect(apiMock.getListWithEtag).toHaveBeenCalledTimes(2);
    });
    expect(apiMock.listItems).not.toHaveBeenCalled();
    expect(screen.queryByText("Offline — please refresh")).toBeNull();
  });

  it("network failure → banner mounts after 5s grace", async () => {
    seedInitialLoad();
    apiMock.getListWithEtag.mockRejectedValue(new Error("network unreachable"));
    await renderListDetail();

    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalled());
    // Before grace elapses: no banner
    expect(screen.queryByText("Offline — please refresh")).toBeNull();

    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() =>
      expect(screen.getByText("Offline — please refresh")).toBeTruthy()
    );
  });

  it("server error (ApiError) does not mount the offline banner", async () => {
    seedInitialLoad();
    apiMock.getListWithEtag.mockRejectedValue(
      new TestApiError(503, "API request failed", "down")
    );
    await renderListDetail();

    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(5_000);
    expect(screen.queryByText("Offline — please refresh")).toBeNull();
  });

  it("banner clears on 200 after mount", async () => {
    seedInitialLoad();
    apiMock.getListWithEtag.mockRejectedValueOnce(new Error("net"));
    await renderListDetail();

    await fireEvent(window, new Event("focus"));
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() =>
      expect(screen.getByText("Offline — please refresh")).toBeTruthy()
    );

    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"2"',
      list: baseList,
    });
    await fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(screen.queryByText("Offline — please refresh")).toBeNull()
    );
  });

  it("banner clears on 304 after mount", async () => {
    seedInitialLoad();
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"1"',
      list: baseList,
    });
    await renderListDetail();
    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalledTimes(1));

    apiMock.getListWithEtag.mockRejectedValueOnce(new Error("net"));
    await fireEvent(window, new Event("focus"));
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() =>
      expect(screen.getByText("Offline — please refresh")).toBeTruthy()
    );

    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 304,
      etag: 'W/"1"',
    });
    await fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(screen.queryByText("Offline — please refresh")).toBeNull()
    );
  });

  it("focused item input defers refetch reconciliation", async () => {
    seedInitialLoad();
    await renderListDetail();

    // Enter inline edit mode (sets editingItemId) — simulates focused input.
    const editButton = screen.getByLabelText("Edit");
    await userEvent.click(editButton);
    expect(screen.getByDisplayValue("Milk")).toBeTruthy();

    // Now a background refetch arrives with an updated list name.
    const updatedList = { ...baseList, name: "Renamed remotely" };
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"2"',
      list: updatedList,
    });
    apiMock.listItems.mockResolvedValueOnce([baseItem]);

    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalled());

    // Reconciler should be deferred — name still shows the old one.
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.queryByText("Renamed remotely")).toBeNull();
  });

  it("dragend resumes the deferred reconciler", async () => {
    seedInitialLoad({ items: [baseItem, makeItem({ id: "item-2", name: "Eggs" })] });
    await renderListDetail();

    // Find a draggable card and start a drag.
    const card = screen.getByText("Milk").closest(".draggable-item");
    if (!(card instanceof HTMLElement)) throw new Error("draggable card not found");

    await fireEvent.dragStart(card);

    // Background refetch arrives mid-drag.
    const updatedList = { ...baseList, name: "Renamed mid-drag" };
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"3"',
      list: updatedList,
    });
    apiMock.listItems.mockResolvedValueOnce([baseItem]);
    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalled());

    // While dragging, name still old.
    expect(screen.getByText("Groceries")).toBeTruthy();

    // Dragend — guard releases.
    await fireEvent.dragEnd(card);
    await waitFor(() =>
      expect(screen.getByText("Renamed mid-drag")).toBeTruthy()
    );
  });

  it("last-write-wins: newer deferred refetch supersedes older deferred refetch", async () => {
    seedInitialLoad();
    await renderListDetail();

    // Enter edit mode → defer.
    const editButton = screen.getByLabelText("Edit");
    await userEvent.click(editButton);
    expect(screen.getByDisplayValue("Milk")).toBeTruthy();

    // First deferred refetch: stale payload.
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"old"',
      list: { ...baseList, name: "Stale name" },
    });
    apiMock.listItems.mockResolvedValueOnce([baseItem]);
    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalledTimes(1));

    // Second deferred refetch: fresher payload.
    apiMock.getListWithEtag.mockResolvedValueOnce({
      status: 200,
      etag: 'W/"new"',
      list: { ...baseList, name: "Fresh name" },
    });
    apiMock.listItems.mockResolvedValueOnce([baseItem]);
    await fireEvent(window, new Event("focus"));
    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalledTimes(2));

    // Cancel edit → guard releases → buffered (most-recent) payload applies.
    const cancelButton = screen.getByText("Cancel");
    await userEvent.click(cancelButton);

    await waitFor(() =>
      expect(screen.getByText("Fresh name")).toBeTruthy()
    );
    expect(screen.queryByText("Stale name")).toBeNull();
  });
});
