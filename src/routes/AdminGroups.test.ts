import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { clearNotices, notices } from "../lib/notices";
import AdminGroups from "./AdminGroups.svelte";
import { authStore } from "../stores/auth";
import { OTHER_GROUP, makeGroup } from "../test/utils/factories";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    listGroups: vi.fn(),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
    reorderGroups: vi.fn(),
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

const dairy = makeGroup({ id: "g1", name: "Dairy", position: 0 });
const fruit = makeGroup({ id: "g2", name: "Fruit", position: 1 });

const signInAdmin = (admin = true) =>
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

const groupNames = () =>
  [...document.querySelectorAll(".group-name")].map((node) => node.textContent?.trim());
const noticeMessages = () => get(notices).map((notice) => notice.message);

describe("AdminGroups route", () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    pushMock.mockReset();
    clearNotices();
    signInAdmin();
  });

  it("redirects non-admins to the dashboard", async () => {
    signInAdmin(false);

    render(AdminGroups);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(apiMock.listGroups).not.toHaveBeenCalled();
  });

  it("lists groups in order with Other last and without controls", async () => {
    apiMock.listGroups.mockResolvedValue([dairy, fruit, OTHER_GROUP]);

    render(AdminGroups);

    await waitFor(() => expect(groupNames()).toEqual(["Dairy", "Fruit", "Other"]));
    const otherRow = screen.getByText("Other").closest("li") as HTMLElement;
    expect(within(otherRow).queryAllByRole("button")).toEqual([]);
    expect((screen.getByRole("button", { name: "Move Dairy up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Fruit down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an empty state when only Other exists", async () => {
    apiMock.listGroups.mockResolvedValue([OTHER_GROUP]);

    render(AdminGroups);

    expect(await screen.findByText("No groups yet. Add the first one below.")).toBeTruthy();
  });

  it("adds a group at the end, above Other", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, OTHER_GROUP]);
    apiMock.createGroup.mockResolvedValue(makeGroup({ id: "g3", name: "Bakery", position: 1 }));
    render(AdminGroups);

    await user.type(await screen.findByLabelText("New group name"), "Bakery");
    await user.click(screen.getByRole("button", { name: "Add group" }));

    await waitFor(() => expect(groupNames()).toEqual(["Dairy", "Bakery", "Other"]));
    expect(apiMock.createGroup).toHaveBeenCalledWith({ name: "Bakery" });
  });

  it("shows a taken name inline and keeps what was typed", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, OTHER_GROUP]);
    apiMock.createGroup.mockRejectedValue(
      new TestApiError(409, "x", "A group with this name already exists.")
    );
    render(AdminGroups);

    const input = (await screen.findByLabelText("New group name")) as HTMLInputElement;
    await user.type(input, "dairy");
    await user.click(screen.getByRole("button", { name: "Add group" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "A group with this name already exists."
    );
    expect(input.value).toBe("dairy");
    expect(noticeMessages()).toEqual([]);
  });

  it("moves a group up and saves the full order", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, fruit, OTHER_GROUP]);
    apiMock.reorderGroups.mockResolvedValue([
      { ...fruit, position: 0 },
      { ...dairy, position: 1 },
      OTHER_GROUP,
    ]);
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Move Fruit up" }));

    expect(apiMock.reorderGroups).toHaveBeenCalledWith(["g2", "g1"]);
    await waitFor(() => expect(groupNames()).toEqual(["Fruit", "Dairy", "Other"]));
  });

  it("puts the order back and says so when a move fails", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, fruit, OTHER_GROUP]);
    apiMock.reorderGroups.mockRejectedValue(new TestApiError(500));
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Move Fruit up" }));

    await waitFor(() =>
      expect(noticeMessages()).toEqual([
        "Couldn't save the new order — the groups are back to how they were.",
      ])
    );
    expect(groupNames()).toEqual(["Dairy", "Fruit", "Other"]);
  });

  it("renames a group inline", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, OTHER_GROUP]);
    apiMock.renameGroup.mockResolvedValue({ ...dairy, name: "Dairy & eggs" });
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("New name for Dairy");
    await user.clear(input);
    await user.type(input, "Dairy & eggs");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(groupNames()).toEqual(["Dairy & eggs", "Other"]));
    expect(apiMock.renameGroup).toHaveBeenCalledWith("g1", { name: "Dairy & eggs" });
  });

  it("keeps the group unchanged when a rename fails", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, OTHER_GROUP]);
    apiMock.renameGroup.mockRejectedValue(new TestApiError(500));
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Rename" }));
    await user.type(screen.getByLabelText("New name for Dairy"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(noticeMessages()).toEqual(["Couldn't rename the group. Try again."])
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(groupNames()).toEqual(["Dairy", "Other"]);
  });

  it("deletes a group after confirming", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, fruit, OTHER_GROUP]);
    apiMock.deleteGroup.mockResolvedValue(null);
    render(AdminGroups);

    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
    await user.click(screen.getByRole("button", { name: "Delete group" }));

    await waitFor(() => expect(groupNames()).toEqual(["Fruit", "Other"]));
    expect(apiMock.deleteGroup).toHaveBeenCalledWith("g1");
  });

  it("keeps the group when a delete fails", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, OTHER_GROUP]);
    apiMock.deleteGroup.mockRejectedValue(new TestApiError(500));
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete group" }));

    await waitFor(() =>
      expect(noticeMessages()).toEqual(["Couldn't delete the group. Try again."])
    );
    expect(groupNames()).toEqual(["Dairy", "Other"]);
  });

  it("shows a load failure with a working retry", async () => {
    const user = userEvent.setup();
    apiMock.listGroups
      .mockRejectedValueOnce(new TestApiError(500, "x", "Server error"))
      .mockResolvedValue([dairy, OTHER_GROUP]);
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(groupNames()).toEqual(["Dairy", "Other"]));
  });

  it("shows a refused rename inline and keeps the form open", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, OTHER_GROUP]);
    apiMock.renameGroup.mockRejectedValue(
      new TestApiError(422, "x", '"Other" is built in and cannot be used as a group name.')
    );
    render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("New name for Dairy");
    await user.clear(input);
    await user.type(input, "Other");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      '"Other" is built in and cannot be used as a group name.'
    );
    expect(screen.getByLabelText("New name for Dairy")).toBeTruthy();
    expect(noticeMessages()).toEqual([]);
  });

  it.each([
    ["a move", 400, async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole("button", { name: "Move Fruit up" }));
    }],
    ["a delete", 404, async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
      await user.click(screen.getByRole("button", { name: "Delete group" }));
    }],
    ["a rename", 404, async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click((await screen.findAllByRole("button", { name: "Rename" }))[0]);
      await user.type(screen.getByLabelText("New name for Dairy"), "!");
      await user.click(screen.getByRole("button", { name: "Save" }));
    }],
  ])("reloads the latest groups when %s hits another admin's change", async (_label, status, act) => {
    const user = userEvent.setup();
    const bakery = makeGroup({ id: "g3", name: "Bakery", position: 0 });
    apiMock.listGroups
      .mockResolvedValueOnce([dairy, fruit, OTHER_GROUP])
      .mockResolvedValue([bakery, fruit, OTHER_GROUP]);
    apiMock.reorderGroups.mockRejectedValue(new TestApiError(status));
    apiMock.deleteGroup.mockRejectedValue(new TestApiError(status));
    apiMock.renameGroup.mockRejectedValue(new TestApiError(status));
    render(AdminGroups);

    await act(user);

    await waitFor(() => expect(groupNames()).toEqual(["Bakery", "Fruit", "Other"]));
    expect(noticeMessages()).toEqual(["Someone else changed the groups. Here's the latest list."]);
  });

  it("locks Save on a rename while a move is still saving", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, fruit, OTHER_GROUP]);
    apiMock.reorderGroups.mockReturnValue(new Promise(() => {}));
    render(AdminGroups);

    await user.click((await screen.findAllByRole("button", { name: "Rename" }))[0]);
    await user.click(screen.getByRole("button", { name: "Move Fruit up" }));

    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("raises no notice on the next page if a save fails after leaving", async () => {
    const user = userEvent.setup();
    apiMock.listGroups.mockResolvedValue([dairy, fruit, OTHER_GROUP]);
    let fail!: (err: unknown) => void;
    apiMock.reorderGroups.mockReturnValue(new Promise((_r, reject) => (fail = reject)));
    const { unmount } = render(AdminGroups);

    await user.click(await screen.findByRole("button", { name: "Move Fruit up" }));
    unmount();
    fail(new TestApiError(500));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(noticeMessages()).toEqual([]);
  });
});
