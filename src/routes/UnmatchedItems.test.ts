import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { clearNotices, notices } from "../lib/notices";
import UnmatchedItems from "./UnmatchedItems.svelte";
import { authStore } from "../stores/auth";
import { makeGroup, makeUnmatchedEntry } from "../test/utils/factories";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    listUnmatchedItems: vi.fn(),
    createGroupFromUnmatched: vi.fn(),
    dismissUnmatchedItem: vi.fn(),
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

vi.mock("svelte-spa-router", () => ({ push: pushMock }));
vi.mock("../lib/api", () => ({
  ApiError: TestApiError,
  api: apiMock,
  setAuthTokenGetter: vi.fn(),
}));

const card = makeUnmatchedEntry({ id: "e1", name: "birthday card", count: 3 });
const tahini = makeUnmatchedEntry({ id: "e2", name: "tahini", count: 1 });

const signIn = (admin = true) =>
  authStore.set({
    token: "token",
    expiry: Date.now() + 10_000,
    user: {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      avatar_url: null,
      admin,
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    } as never,
    ready: true,
  });

const entryNames = () =>
  [...document.querySelectorAll(".unmatched-name")].map((node) => node.textContent?.trim());
const noticeMessages = () => get(notices).map((notice) => notice.message);

describe("UnmatchedItems route", () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    pushMock.mockReset();
    clearNotices();
    signIn();
  });

  it("redirects non-admins to the dashboard", async () => {
    signIn(false);

    render(UnmatchedItems);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(apiMock.listUnmatchedItems).not.toHaveBeenCalled();
  });

  it("lists names with how often they were sent", async () => {
    apiMock.listUnmatchedItems.mockResolvedValue([card, tahini]);

    render(UnmatchedItems);

    await waitFor(() => expect(entryNames()).toEqual(["birthday card", "tahini"]));
    expect(screen.getByText(/Sent 3 times/)).toBeTruthy();
    expect(screen.getByText(/Sent 1 time ·/)).toBeTruthy();
  });

  it("shows an empty state", async () => {
    apiMock.listUnmatchedItems.mockResolvedValue([]);

    render(UnmatchedItems);

    expect(await screen.findByText("Nothing to review")).toBeTruthy();
  });

  it("creates a group from a name, pre-filled and editable", async () => {
    // Covers AE4.
    const user = userEvent.setup();
    apiMock.listUnmatchedItems.mockResolvedValue([card, tahini]);
    apiMock.createGroupFromUnmatched.mockResolvedValue(
      makeGroup({ id: "g9", name: "Cards & gifts" })
    );
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Create a group from birthday card" }));
    const input = screen.getByLabelText("Group name") as HTMLInputElement;
    expect(input.value).toBe("birthday card");
    await user.clear(input);
    await user.type(input, "Cards & gifts");
    await user.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(entryNames()).toEqual(["tahini"]));
    expect(apiMock.createGroupFromUnmatched).toHaveBeenCalledWith("e1", { name: "Cards & gifts" });
    expect(noticeMessages()).toEqual(['Added the group "Cards & gifts".']);
  });

  it("keeps the form open with the reason when the name is taken", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems.mockResolvedValue([card]);
    apiMock.createGroupFromUnmatched.mockRejectedValue(
      new TestApiError(409, "x", "A group with this name already exists.")
    );
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Create a group from birthday card" }));
    await user.click(screen.getByRole("button", { name: "Create group" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "A group with this name already exists."
    );
    expect(screen.getByLabelText("Group name")).toBeTruthy();
    expect(entryNames()).toEqual(["birthday card"]);
  });

  it("dismisses a name after confirming", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems.mockResolvedValue([card, tahini]);
    apiMock.dismissUnmatchedItem.mockResolvedValue(null);
    render(UnmatchedItems);

    await user.click((await screen.findAllByRole("button", { name: "Dismiss" }))[1]);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Dismiss" })
    );

    await waitFor(() => expect(entryNames()).toEqual(["birthday card"]));
    expect(apiMock.dismissUnmatchedItem).toHaveBeenCalledWith("e2");
  });

  it("refreshes the list when another admin already handled the name", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems
      .mockResolvedValueOnce([card, tahini])
      .mockResolvedValue([tahini]);
    apiMock.createGroupFromUnmatched.mockRejectedValue(new TestApiError(404, "x", "Not found."));
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Create a group from birthday card" }));
    await user.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(entryNames()).toEqual(["tahini"]));
    expect(noticeMessages()).toEqual(["Someone already handled that item."]);
  });

  it("shows a load failure with a working retry", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems
      .mockRejectedValueOnce(new TestApiError(500, "x", "Server error"))
      .mockResolvedValue([card]);
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(entryNames()).toEqual(["birthday card"]));
  });

  it("trims a long shared name to the 60 characters a group name allows", async () => {
    const user = userEvent.setup();
    const long = makeUnmatchedEntry({ id: "e9", name: "x".repeat(120) });
    apiMock.listUnmatchedItems.mockResolvedValue([long]);
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: `Create a group from ${"x".repeat(120)}` }));

    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("x".repeat(60));
  });

  it("reports a failed create and keeps the form open", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems.mockResolvedValue([card]);
    apiMock.createGroupFromUnmatched.mockRejectedValue(new TestApiError(500));
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Create a group from birthday card" }));
    await user.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() =>
      expect(noticeMessages()).toEqual(["Couldn't create the group. Try again."])
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Group name")).toBeTruthy();
  });

  it("refreshes when a dismissed name was already handled", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems
      .mockResolvedValueOnce([card, tahini])
      .mockResolvedValue([card]);
    apiMock.dismissUnmatchedItem.mockRejectedValue(new TestApiError(404));
    render(UnmatchedItems);

    await user.click((await screen.findAllByRole("button", { name: "Dismiss" }))[1]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(entryNames()).toEqual(["birthday card"]));
    expect(noticeMessages()).toEqual(["Someone already handled that item."]);
  });

  it("reports a failed dismiss and keeps the name", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems.mockResolvedValue([card]);
    apiMock.dismissUnmatchedItem.mockRejectedValue(new TestApiError(500));
    render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(noticeMessages()).toEqual(["Couldn't dismiss that item. Try again."])
    );
    expect(entryNames()).toEqual(["birthday card"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("raises no notice on the next page if a create fails after leaving", async () => {
    const user = userEvent.setup();
    apiMock.listUnmatchedItems.mockResolvedValue([card]);
    let fail!: (err: unknown) => void;
    apiMock.createGroupFromUnmatched.mockReturnValue(new Promise((_r, reject) => (fail = reject)));
    const { unmount } = render(UnmatchedItems);

    await user.click(await screen.findByRole("button", { name: "Create a group from birthday card" }));
    await user.click(screen.getByRole("button", { name: "Create group" }));
    unmount();
    fail(new TestApiError(500));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(noticeMessages()).toEqual([]);
  });
});
