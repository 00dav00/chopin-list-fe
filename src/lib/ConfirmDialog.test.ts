import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog.svelte";

describe("ConfirmDialog component", () => {
  it("renders nothing when closed", () => {
    render(ConfirmDialog, { props: { open: false, title: "Delete item?" } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an accessible dialog with title and message when open", () => {
    render(ConfirmDialog, {
      props: { open: true, title: "Delete item?", message: "This cannot be undone." },
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Delete item?")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("emits confirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { component } = render(ConfirmDialog, {
      props: { open: true, title: "Delete item?", confirmLabel: "Delete item" },
    });
    component.$on("confirm", onConfirm);

    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("emits cancel from the cancel button, backdrop click, and Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { component, container } = render(ConfirmDialog, {
      props: { open: true, title: "Delete item?" },
    });
    component.$on("cancel", onCancel);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const backdrop = container.querySelector(".modal-backdrop");
    if (backdrop) await fireEvent.click(backdrop);

    await fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("shows the busy label and blocks confirm/cancel while busy", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { component } = render(ConfirmDialog, {
      props: {
        open: true,
        title: "Delete item?",
        confirmLabel: "Delete item",
        busyLabel: "Deleting...",
        busy: true,
      },
    });
    component.$on("confirm", onConfirm);
    component.$on("cancel", onCancel);

    expect(screen.getByRole("button", { name: "Deleting..." })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Deleting..." }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await fireEvent.keyDown(window, { key: "Escape" });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
