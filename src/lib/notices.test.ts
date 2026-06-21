import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
  notices,
  notify,
  dismiss,
  clearNotices,
  pauseTimer,
  resumeTimer,
} from "./notices";

const messages = () => get(notices).map((notice) => notice.message);

describe("notices store", () => {
  beforeEach(() => {
    clearNotices();
    // Evictions log to telemetry; silence it in tests.
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    clearNotices();
    vi.restoreAllMocks();
  });

  it("adds an error notice with a 5s default auto-dismiss and returns its id", () => {
    const id = notify({ message: "Boom" });
    const current = get(notices);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(id);
    expect(current[0].severity).toBe("error");
    expect(current[0].autoDismissMs).toBe(5000);
  });

  it("defaults warnings to persistent (no auto-dismiss)", () => {
    notify({ message: "Heads up", severity: "warning" });
    expect(get(notices)[0].autoDismissMs).toBeNull();
  });

  it("honours an explicit autoDismissMs override", () => {
    notify({ message: "Custom", severity: "error", autoDismissMs: null });
    expect(get(notices)[0].autoDismissMs).toBeNull();
  });

  it("de-dups identical message+severity instead of stacking", () => {
    const first = notify({ message: "Same" });
    const second = notify({ message: "Same" });
    expect(second).toBe(first);
    expect(get(notices)).toHaveLength(1);
  });

  it("treats same message with different severity as distinct", () => {
    notify({ message: "Same" });
    notify({ message: "Same", severity: "warning" });
    expect(get(notices)).toHaveLength(2);
  });

  it("caps at 3, evicting the oldest auto-dismissible notice first", () => {
    notify({ message: "w1", severity: "warning" }); // persistent, oldest
    notify({ message: "e1" });
    notify({ message: "e2" });
    notify({ message: "e3" }); // overflow → evicts e1 (oldest auto-dismissible)
    expect(messages()).toEqual(["w1", "e2", "e3"]);
  });

  it("caps at 3, evicting the oldest overall when all are persistent", () => {
    notify({ message: "w1", severity: "warning" });
    notify({ message: "w2", severity: "warning" });
    notify({ message: "w3", severity: "warning" });
    notify({ message: "w4", severity: "warning" });
    expect(messages()).toEqual(["w2", "w3", "w4"]);
  });

  it("dismiss removes a single notice by id", () => {
    const id = notify({ message: "Gone soon" });
    notify({ message: "Stays" });
    dismiss(id);
    expect(messages()).toEqual(["Stays"]);
  });

  it("clearNotices empties the store", () => {
    notify({ message: "a" });
    notify({ message: "b", severity: "warning" });
    clearNotices();
    expect(get(notices)).toHaveLength(0);
  });

  describe("auto-dismiss timers", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("auto-dismisses an error after its window elapses", () => {
      notify({ message: "Temporary" });
      expect(get(notices)).toHaveLength(1);
      vi.advanceTimersByTime(5000);
      expect(get(notices)).toHaveLength(0);
    });

    it("never auto-dismisses a persistent warning", () => {
      notify({ message: "Sticky", severity: "warning" });
      vi.advanceTimersByTime(60000);
      expect(get(notices)).toHaveLength(1);
    });

    it("refreshes the timer on a de-duped re-notify", () => {
      notify({ message: "Repeat" });
      vi.advanceTimersByTime(3000);
      notify({ message: "Repeat" }); // refresh → restart 5s window
      vi.advanceTimersByTime(3000); // 6s since first, 3s since refresh
      expect(get(notices)).toHaveLength(1);
      vi.advanceTimersByTime(2000); // now 5s since refresh
      expect(get(notices)).toHaveLength(0);
    });

    it("pauseTimer halts auto-dismiss; resumeTimer restarts it", () => {
      const id = notify({ message: "Hovered" });
      pauseTimer(id);
      vi.advanceTimersByTime(10000);
      expect(get(notices)).toHaveLength(1);
      resumeTimer(id);
      vi.advanceTimersByTime(5000);
      expect(get(notices)).toHaveLength(0);
    });
  });
});
