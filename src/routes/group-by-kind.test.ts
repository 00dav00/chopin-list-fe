import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { clearNotices, notices } from "../lib/notices";
import ListDetail from "./ListDetail.svelte";
import TemplateDetail from "./TemplateDetail.svelte";
import {
  makeItem,
  makeList,
  makeTemplateDetail,
  makeTemplateItem,
} from "../test/utils/factories";
import { authStore } from "../stores/auth";

const { apiMock, TestApiError } = vi.hoisted(() => ({
  apiMock: {
    getList: vi.fn(),
    listItems: vi.fn(),
    getListWithEtag: vi.fn(),
    groupListItems: vi.fn(),
    groupTemplateItems: vi.fn(),
    sendGroupingRun: vi.fn(),
    createItem: vi.fn(),
    toggleItem: vi.fn(),
    getTemplate: vi.fn(),
    createTemplateItem: vi.fn(),
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

vi.mock("svelte-spa-router", () => ({ push: vi.fn() }));
vi.mock("../lib/api", () => ({
  ApiError: TestApiError,
  api: apiMock,
  setAuthTokenGetter: vi.fn(),
}));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const listId = "list-1";
const item = (id: string, name: string, sort_order: number, purchased = false) =>
  makeItem({ id, name, sort_order, purchased, list_id: listId });

const seedList = (items = [item("i1", "Milk", 0), item("i2", "Apples", 1), item("i3", "Birthday card", 2)]) => {
  apiMock.getList.mockResolvedValue(makeList({ id: listId }));
  apiMock.listItems.mockResolvedValue(items);
  apiMock.getListWithEtag.mockResolvedValue({ status: 304, etag: null });
};

// Item names only: open dialogs also carry level-3 titles.
const headings = () =>
  screen
    .getAllByRole("heading", { level: 3 })
    .filter((node) => !node.closest(".modal"))
    .map((node) => node.textContent?.trim());

const noticeMessages = () => get(notices).map((notice) => notice.message);

const groupButton = () => screen.findByRole("button", { name: /Group by kind|Grouping/ });

describe("Group by kind on a list", () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    clearNotices();
    authStore.set({ token: null, expiry: null, user: null, ready: true });
  });

  it("applies the server's order without showing groups", async () => {
    // Covers AE1.
    const user = userEvent.setup();
    seedList();
    apiMock.groupListItems.mockResolvedValue({
      items: [item("i2", "Apples", 0), item("i1", "Milk", 1), item("i3", "Birthday card", 2)],
      run_id: null,
      unmatched: [],
    });
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());

    await waitFor(() => expect(headings()).toEqual(["Apples", "Milk", "Birthday card"]));
    expect(apiMock.groupListItems).toHaveBeenCalledWith(listId);
    expect(screen.queryByText(/Dairy|Fruit|Other/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers to send unmatched names and sends only on confirm", async () => {
    // Covers AE8 (decline) and the confirm path.
    const user = userEvent.setup();
    seedList();
    apiMock.groupListItems.mockResolvedValue({
      items: [item("i2", "Apples", 0), item("i1", "Milk", 1), item("i3", "Birthday card", 2)],
      run_id: "run-7",
      unmatched: [{ item_id: "i3", name: "Birthday card" }],
    });
    apiMock.sendGroupingRun.mockResolvedValue({ sent: true });
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Birthday card");

    await user.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(apiMock.sendGroupingRun).not.toHaveBeenCalled();

    await user.click(await groupButton());
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Send to admins" }));
    await waitFor(() => expect(apiMock.sendGroupingRun).toHaveBeenCalledWith("run-7"));
    expect(apiMock.sendGroupingRun).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(noticeMessages()).toContain("Sent to the admins. Thanks!");
  });

  it("keeps the list as it was and asks to retry when grouping fails", async () => {
    // Covers AE5.
    const user = userEvent.setup();
    seedList();
    apiMock.groupListItems.mockRejectedValue(new TestApiError(503, "x", "down"));
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());

    await waitFor(() =>
      expect(noticeMessages()).toEqual(["Couldn't group right now. Try again in a moment."])
    );
    expect(headings()).toEqual(["Milk", "Apples", "Birthday card"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the server's reason when grouping isn't set up", async () => {
    const user = userEvent.setup();
    seedList();
    const detail = "Grouping is not set up yet: no groups are configured.";
    apiMock.groupListItems.mockRejectedValue(new TestApiError(409, "x", detail));
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());

    await waitFor(() => expect(noticeMessages()).toEqual([detail]));
  });

  it("shows a spinner and locks reordering while the model works", async () => {
    const user = userEvent.setup();
    seedList();
    const pending = deferred<unknown>();
    apiMock.groupListItems.mockReturnValue(pending.promise);
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());

    const busy = screen.getByRole("button", { name: /Grouping/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    const gaps = screen.getAllByRole("button", { name: /^Insert here/ });
    expect(gaps.every((gap) => (gap as HTMLButtonElement).disabled)).toBe(true);
    await user.click(busy);
    expect(apiMock.groupListItems).toHaveBeenCalledTimes(1);

    const refetchesBefore = apiMock.getListWithEtag.mock.calls.length;
    pending.resolve({ items: [item("i2", "Apples", 0), item("i1", "Milk", 1), item("i3", "Birthday card", 2)], run_id: null, unmatched: [] });

    await waitFor(() => expect(headings()).toEqual(["Apples", "Milk", "Birthday card"]));
    // One refetch reconciles adds or ticks the server's re-read missed.
    await waitFor(() =>
      expect(apiMock.getListWithEtag.mock.calls.length).toBe(refetchesBefore + 1)
    );
    expect(((await groupButton()) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps an item added during the wait, after the grouped items", async () => {
    // Covers AE9 on this device: an add that lands while grouping runs.
    const user = userEvent.setup();
    seedList();
    const pending = deferred<unknown>();
    apiMock.groupListItems.mockReturnValue(pending.promise);
    apiMock.createItem.mockImplementation(async (_listId, payload) =>
      item("i4", payload.name, payload.sort_order)
    );
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(await screen.findByPlaceholderText("Item name"), "Eggs");
    await user.click(screen.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(headings()).toContain("Eggs"));
    // Sorts after anything grouping can write (0..N-1).
    expect(apiMock.createItem.mock.calls[0][1].sort_order).toBeGreaterThan(3);

    pending.resolve({
      items: [item("i2", "Apples", 0), item("i1", "Milk", 1), item("i3", "Birthday card", 2)],
      run_id: null,
      unmatched: [],
    });

    await waitFor(() =>
      expect(headings()).toEqual(["Apples", "Milk", "Birthday card", "Eggs"])
    );
  });

  it("keeps the grouped order when an earlier add finishes after it", async () => {
    const user = userEvent.setup();
    seedList();
    const create = deferred<unknown>();
    apiMock.createItem.mockReturnValue(create.promise);
    apiMock.groupListItems.mockResolvedValue({
      items: [item("i2", "Apples", 0), item("i1", "Milk", 1), item("i3", "Birthday card", 2)],
      run_id: null,
      unmatched: [],
    });
    render(ListDetail, { props: { params: { listId } } });

    await user.click(await screen.findByRole("button", { name: "Add item" }));
    await user.type(await screen.findByPlaceholderText("Item name"), "Eggs");
    await user.click(screen.getByRole("button", { name: "Create item" }));
    await user.click(await groupButton());
    await waitFor(() => expect(headings()).toEqual(["Apples", "Milk", "Birthday card"]));

    create.resolve(item("i4", "Eggs", 4));

    await waitFor(() =>
      expect(headings()).toEqual(["Apples", "Milk", "Birthday card", "Eggs"])
    );
  });

  it("is disabled with only bought items and hidden on a completed list", async () => {
    seedList([item("i1", "Bread", 0, true)]);
    const { unmount } = render(ListDetail, { props: { params: { listId } } });

    expect(((await groupButton()) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    apiMock.getList.mockResolvedValue(makeList({ id: listId, completed: true }));
    apiMock.listItems.mockResolvedValue([item("i1", "Milk", 0)]);
    render(ListDetail, { props: { params: { listId } } });

    await screen.findByText("This list is completed and read-only.");
    expect(screen.queryByRole("button", { name: /Group by kind/ })).toBeNull();
  });

  it("raises no notice on the next page if grouping fails after leaving", async () => {
    // Notices are global, so a late failure would land on whatever page is open.
    const user = userEvent.setup();
    seedList();
    const pending = deferred<unknown>();
    apiMock.groupListItems.mockReturnValue(pending.promise);
    const { unmount } = render(ListDetail, { props: { params: { listId } } });

    await user.click(await groupButton());
    unmount();
    pending.reject(new TestApiError(503));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(noticeMessages()).toEqual([]);
  });
});

describe("Group by kind on a list: overlapping events", () => {
  const grouped = () => [item("i2", "Apples", 0), item("i1", "Milk", 1), item("i3", "Birthday card", 2)];

  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    clearNotices();
    authStore.set({ token: null, expiry: null, user: null, ready: true });
  });

  it("drops a refetch held back during the wait instead of undoing the grouping", async () => {
    const user = userEvent.setup();
    seedList();
    const pending = deferred<unknown>();
    apiMock.groupListItems.mockReturnValue(pending.promise);
    render(ListDetail, { props: { params: { listId } } });
    await user.click(await groupButton());
    await screen.findByRole("button", { name: /Grouping/ });

    // Set up only now: clicking can itself fire a focus refetch before the wait.
    // The refetch during the wait sees the old order; the one after says "unchanged".
    apiMock.getListWithEtag.mockReset();
    apiMock.getListWithEtag
      .mockResolvedValueOnce({ status: 200, etag: 'W/"1"', list: makeList({ id: listId }) })
      .mockResolvedValue({ status: 304, etag: 'W/"2"' });
    const itemFetches = apiMock.listItems.mock.calls.length;
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(apiMock.listItems).toHaveBeenCalledTimes(itemFetches + 1));
    // Let the stale payload land in the held-back buffer before grouping answers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending.resolve({ items: grouped(), run_id: null, unmatched: [] });

    await waitFor(() => expect(apiMock.getListWithEtag).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // A stale order hides in page state until the next change rebuilds the
    // list from it, so tick an item and check the rest keep the grouped order.
    apiMock.toggleItem.mockResolvedValue(item("i3", "Birthday card", 2, true));
    await user.click(screen.getByRole("checkbox", { name: "Purchased Birthday card" }));
    await waitFor(() => expect(apiMock.toggleItem).toHaveBeenCalledWith("i3"));
    await waitFor(() => expect(headings()).toEqual(["Apples", "Milk"]));
  });

  it("frees the next list when the shopper switches lists mid-grouping", async () => {
    const user = userEvent.setup();
    seedList();
    const pending = deferred<unknown>();
    apiMock.groupListItems.mockReturnValue(pending.promise);
    const { component } = render(ListDetail, { props: { params: { listId } } });
    await user.click(await groupButton());

    apiMock.getList.mockResolvedValue(makeList({ id: "list-2", name: "Party" }));
    apiMock.listItems.mockResolvedValue([makeItem({ id: "j1", name: "Cups", list_id: "list-2" })]);
    await component.$set({ params: { listId: "list-2" } });
    await waitFor(() => expect(headings()).toEqual(["Cups"]));

    const button = (await screen.findByRole("button", { name: "Group by kind" })) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    pending.resolve({
      items: grouped(),
      run_id: "run-old",
      unmatched: [{ item_id: "i3", name: "Birthday card" }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(headings()).toEqual(["Cups"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes an open unmatched dialog when the shopper switches lists", async () => {
    const user = userEvent.setup();
    seedList();
    apiMock.groupListItems.mockResolvedValue({
      items: grouped(),
      run_id: "run-1",
      unmatched: [{ item_id: "i3", name: "Birthday card" }],
    });
    const { component } = render(ListDetail, { props: { params: { listId } } });
    await user.click(await groupButton());
    await screen.findByRole("dialog");

    apiMock.getList.mockResolvedValue(makeList({ id: "list-2", name: "Party" }));
    apiMock.listItems.mockResolvedValue([]);
    await component.$set({ params: { listId: "list-2" } });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does nothing after a successful grouping finishes off the page", async () => {
    const user = userEvent.setup();
    seedList();
    const pending = deferred<unknown>();
    apiMock.groupListItems.mockReturnValue(pending.promise);
    const { unmount } = render(ListDetail, { props: { params: { listId } } });
    await user.click(await groupButton());
    const refetches = apiMock.getListWithEtag.mock.calls.length;

    unmount();
    pending.resolve({
      items: grouped(),
      run_id: "run-1",
      unmatched: [{ item_id: "i3", name: "Birthday card" }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiMock.getListWithEtag.mock.calls.length).toBe(refetches);
    expect(noticeMessages()).toEqual([]);
  });
});

describe("Group by kind on a template", () => {
  const templateId = "tpl-1";
  const tItem = (id: string, name: string, sort_order: number) =>
    makeTemplateItem({ id, name, sort_order, template_id: templateId });

  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    clearNotices();
    authStore.set({ token: null, expiry: null, user: null, ready: true });
  });

  it("groups the template and offers unmatched names, with no refetch", async () => {
    const user = userEvent.setup();
    apiMock.getTemplate.mockResolvedValue(
      makeTemplateDetail({
        id: templateId,
        items: [tItem("t1", "Milk", 0), tItem("t2", "Card", 1), tItem("t3", "Apples", 2)],
      })
    );
    apiMock.groupTemplateItems.mockResolvedValue({
      items: [tItem("t3", "Apples", 0), tItem("t1", "Milk", 1), tItem("t2", "Card", 2)],
      run_id: "run-3",
      unmatched: [{ item_id: "t2", name: "Card" }],
    });
    render(TemplateDetail, { props: { params: { templateId } } });

    await user.click(await groupButton());

    await waitFor(() => expect(headings()).toEqual(["Apples", "Milk", "Card"]));
    expect(apiMock.groupTemplateItems).toHaveBeenCalledWith(templateId);
    expect((await screen.findByRole("dialog")).textContent).toContain("Card");
    expect(apiMock.getListWithEtag).not.toHaveBeenCalled();
  });

  it("keeps an item added during the wait, after the grouped items", async () => {
    const user = userEvent.setup();
    apiMock.getTemplate.mockResolvedValue(
      makeTemplateDetail({
        id: templateId,
        items: [tItem("t1", "Milk", 0), tItem("t2", "Apples", 1)],
      })
    );
    const pending = deferred<unknown>();
    apiMock.groupTemplateItems.mockReturnValue(pending.promise);
    apiMock.createTemplateItem.mockImplementation(async (_id, payload) =>
      tItem("t3", payload.name, payload.sort_order)
    );
    render(TemplateDetail, { props: { params: { templateId } } });

    await user.click(await groupButton());
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(await screen.findByPlaceholderText("Item name"), "Eggs");
    await user.click(screen.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(headings()).toContain("Eggs"));
    expect(apiMock.createTemplateItem.mock.calls[0][1].sort_order).toBeGreaterThan(2);

    pending.resolve({
      items: [tItem("t2", "Apples", 0), tItem("t1", "Milk", 1)],
      run_id: null,
      unmatched: [],
    });

    await waitFor(() => expect(headings()).toEqual(["Apples", "Milk", "Eggs"]));
  });

  it("is disabled on an empty template", async () => {
    apiMock.getTemplate.mockResolvedValue(makeTemplateDetail({ id: templateId, items: [] }));
    render(TemplateDetail, { props: { params: { templateId } } });

    expect(((await groupButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks to retry when grouping fails", async () => {
    const user = userEvent.setup();
    apiMock.getTemplate.mockResolvedValue(
      makeTemplateDetail({ id: templateId, items: [tItem("t1", "Milk", 0)] })
    );
    apiMock.groupTemplateItems.mockRejectedValue(new TestApiError(503));
    render(TemplateDetail, { props: { params: { templateId } } });

    await user.click(await groupButton());

    await waitFor(() =>
      expect(noticeMessages()).toEqual(["Couldn't group right now. Try again in a moment."])
    );
    expect(headings()).toEqual(["Milk"]);
  });
});
