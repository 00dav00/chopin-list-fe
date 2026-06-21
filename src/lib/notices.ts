import { get, writable } from "svelte/store";

export type NoticeSeverity = "error" | "warning";

export interface Notice {
  id: string;
  message: string;
  severity: NoticeSeverity;
  // Milliseconds until auto-dismiss, or null to persist until manually closed.
  autoDismissMs: number | null;
}

export interface NotifyOptions {
  message: string;
  severity?: NoticeSeverity;
  autoDismissMs?: number | null;
}

// Tuning knobs — module constants per team convention (constants over env).
const MAX_VISIBLE = 3;
const DEFAULT_AUTO_DISMISS_MS: Record<NoticeSeverity, number | null> = {
  error: 5_000,
  warning: null, // partial-success / actionable: persist until dismissed
};

// Newest notice is last in the array (rendered at the bottom of the stack).
export const notices = writable<Notice[]>([]);

// Auto-dismiss timers keyed by notice id. Kept in module scope (not in the
// store data) so dismiss/clear can cancel them and pauseTimer/resumeTimer can
// drive pause-on-hover from the component without timer handles leaking into
// rendered state.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const clearTimer = (id: string) => {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
};

const startTimer = (id: string, ms: number) => {
  clearTimer(id);
  timers.set(
    id,
    setTimeout(() => dismiss(id), ms)
  );
};

/**
 * Push a notice. Identical message+severity is de-duplicated: the existing
 * notice stays put and its auto-dismiss timer is refreshed instead of stacking
 * a duplicate. At most MAX_VISIBLE notices are kept; on overflow the oldest
 * auto-dismissible notice is evicted first, falling back to the oldest overall
 * when every visible notice is persistent. Returns the notice id.
 */
export const notify = (options: NotifyOptions): string => {
  const severity = options.severity ?? "error";
  const autoDismissMs =
    options.autoDismissMs === undefined
      ? DEFAULT_AUTO_DISMISS_MS[severity]
      : options.autoDismissMs;

  let resultId = "";
  notices.update((current) => {
    const existing = current.find(
      (notice) => notice.message === options.message && notice.severity === severity
    );
    if (existing) {
      resultId = existing.id;
      if (autoDismissMs === null) {
        clearTimer(existing.id);
      } else {
        startTimer(existing.id, autoDismissMs);
      }
      return current;
    }

    const id = crypto.randomUUID();
    resultId = id;
    const next = [...current, { id, message: options.message, severity, autoDismissMs }];

    while (next.length > MAX_VISIBLE) {
      let evictIndex = next.findIndex((notice) => notice.autoDismissMs !== null);
      if (evictIndex === -1) evictIndex = 0;
      const [evicted] = next.splice(evictIndex, 1);
      clearTimer(evicted.id);
      // Evictions are a telemetry signal, not a user-facing event.
      console.info("[notices] evicted notice on overflow", {
        id: evicted.id,
        severity: evicted.severity,
      });
    }

    if (autoDismissMs !== null) startTimer(id, autoDismissMs);
    return next;
  });
  return resultId;
};

export const dismiss = (id: string) => {
  clearTimer(id);
  notices.update((current) => current.filter((notice) => notice.id !== id));
};

export const clearNotices = () => {
  timers.forEach((handle) => clearTimeout(handle));
  timers.clear();
  notices.set([]);
};

// Pause-on-hover support: cancel the running timer; resume restarts the full
// auto-dismiss window (so a notice always lingers at least its full duration
// after the pointer/focus leaves). No-op for persistent notices.
export const pauseTimer = (id: string) => {
  clearTimer(id);
};

export const resumeTimer = (id: string) => {
  if (timers.has(id)) return;
  const notice = get(notices).find((entry) => entry.id === id);
  if (notice && notice.autoDismissMs !== null) {
    startTimer(notice.id, notice.autoDismissMs);
  }
};
