import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Notices from "./Notices.svelte";
import { notices, notify, clearNotices } from "./notices";

describe("Notices component", () => {
  beforeEach(() => {
    clearNotices();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    clearNotices();
    vi.restoreAllMocks();
  });

  it("renders a notice's message", async () => {
    render(Notices);
    notify({ message: "Something failed" });
    expect(await screen.findByText("Something failed")).toBeTruthy();
  });

  it("marks error notices with role=alert inside a polite live region", async () => {
    const { container } = render(Notices);
    notify({ message: "Bad thing", severity: "error" });
    await tick();
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Bad thing");
  });

  it("does not give warning notices the assertive alert role", async () => {
    render(Notices);
    notify({ message: "Gentle warning", severity: "warning" });
    await screen.findByText("Gentle warning");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dismisses a notice when its Dismiss button is clicked", async () => {
    render(Notices);
    notify({ message: "Close me" });
    const button = await screen.findByRole("button", { name: "Dismiss" });
    await fireEvent.click(button);
    await waitFor(() => expect(get(notices)).toHaveLength(0));
  });

  it("dismisses the most-recent notice on Escape", async () => {
    render(Notices);
    notify({ message: "first", severity: "warning" });
    notify({ message: "second", severity: "warning" });
    await screen.findByText("second");
    await fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(get(notices).map((n) => n.message)).toEqual(["first"])
    );
  });

  it("renders the stack newest-last", async () => {
    render(Notices);
    notify({ message: "older", severity: "warning" });
    notify({ message: "newer", severity: "warning" });
    await screen.findByText("newer");
    const rendered = screen
      .getAllByText(/older|newer/)
      .map((node) => node.textContent);
    expect(rendered).toEqual(["older", "newer"]);
  });

  it("pauses auto-dismiss while hovered and resumes on leave", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(Notices);
      notify({ message: "Hover me" });
      await tick();
      const noticeEl = container.querySelector(".notice");
      expect(noticeEl).toBeTruthy();

      await fireEvent.mouseEnter(noticeEl as Element);
      vi.advanceTimersByTime(5000);
      expect(get(notices)).toHaveLength(1);

      await fireEvent.mouseLeave(noticeEl as Element);
      vi.advanceTimersByTime(5000);
      expect(get(notices)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
