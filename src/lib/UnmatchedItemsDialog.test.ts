import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { clearNotices, notices } from "./notices";
import UnmatchedItemsDialog from "./UnmatchedItemsDialog.svelte";

const { apiMock, TestApiError } = vi.hoisted(() => ({
  apiMock: { sendGroupingRun: vi.fn() },
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

vi.mock("./api", () => ({ ApiError: TestApiError, api: apiMock }));

const unmatched = [
  { item_id: "i1", name: "birthday card" },
  { item_id: "i2", name: "tahini" },
  { item_id: "i3", name: "tahini" },
];

const renderDialog = (runId: string | null = "run-1") => {
  const onClose = vi.fn();
  const result = render(UnmatchedItemsDialog, { props: { runId, unmatched } });
  result.component.$on("close", onClose);
  return { onClose };
};

describe("UnmatchedItemsDialog", () => {
  beforeEach(() => {
    apiMock.sendGroupingRun.mockReset();
    clearNotices();
  });

  it("lists each unmatched name once", () => {
    renderDialog();

    const names = screen.getAllByRole("listitem").map((node) => node.textContent);
    expect(names).toEqual(["birthday card", "tahini"]);
    expect(screen.getByText(/Only the item names are shared/)).toBeTruthy();
  });

  it("stays closed without a run", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends the run once and confirms on success", async () => {
    const user = userEvent.setup();
    apiMock.sendGroupingRun.mockResolvedValue({ sent: true });
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Send to admins" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(apiMock.sendGroupingRun).toHaveBeenCalledTimes(1);
    expect(apiMock.sendGroupingRun).toHaveBeenCalledWith("run-1");
    expect(get(notices).map((n) => [n.message, n.severity])).toEqual([
      ["Sent to the admins. Thanks!", "success"],
    ]);
  });

  it("closes without sending on Not now", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiMock.sendGroupingRun).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and reports a failed send", async () => {
    const user = userEvent.setup();
    apiMock.sendGroupingRun.mockRejectedValue(new TestApiError(500));
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Send to admins" }));

    await waitFor(() =>
      expect(get(notices).map((n) => n.message)).toEqual([
        "Couldn't send them right now. Try again.",
      ])
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send to admins" })).toBeTruthy();
  });
});
