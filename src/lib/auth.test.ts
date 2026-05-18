import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initGoogleSignIn } from "./auth";

const ELEMENT_ID = "google-signin";

const makeStubApi = () => ({
  initialize: vi.fn(),
  renderButton: vi.fn(),
  cancel: vi.fn(),
});

const installGoogleGlobal = (api: ReturnType<typeof makeStubApi> | null) => {
  // jsdom's window is the same object as globalThis here; assign directly so
  // the auth module reads it via window.google?.accounts?.id.
  (window as unknown as { google?: unknown }).google = api
    ? { accounts: { id: api } }
    : undefined;
};

const ensureContainer = () => {
  let el = document.getElementById(ELEMENT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ELEMENT_ID;
    document.body.appendChild(el);
  }
  return el;
};

describe("initGoogleSignIn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ensureContainer();
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
  });

  afterEach(() => {
    vi.useRealTimers();
    installGoogleGlobal(null);
    const el = document.getElementById(ELEMENT_ID);
    if (el) el.remove();
  });

  it("fast-path: initializes synchronously when window.google is already present", () => {
    const api = makeStubApi();
    installGoogleGlobal(api);

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onTimeout = vi.fn();

    const cleanup = initGoogleSignIn(ELEMENT_ID, onSuccess, onError, onTimeout);

    expect(api.initialize).toHaveBeenCalledTimes(1);
    expect(api.renderButton).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    // No timers should have been scheduled on the fast path.
    expect(vi.getTimerCount()).toBe(0);

    cleanup();
  });

  it("poll wins: initializes once GIS appears mid-wait, and onTimeout is not called", () => {
    installGoogleGlobal(null);

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onTimeout = vi.fn();

    const cleanup = initGoogleSignIn(ELEMENT_ID, onSuccess, onError, onTimeout);

    // First poll tick at t=250: still nothing.
    vi.advanceTimersByTime(250);
    expect(onTimeout).not.toHaveBeenCalled();

    // GIS arrives between ticks; next poll at t=500 finds it and initializes.
    const api = makeStubApi();
    installGoogleGlobal(api);
    vi.advanceTimersByTime(250);

    expect(api.initialize).toHaveBeenCalledTimes(1);
    expect(api.renderButton).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();

    // Run the rest of the wait window — neither callback fires again, and the
    // absolute timeout has been cleared (no leftover scheduled timers).
    vi.advanceTimersByTime(2000);
    expect(api.initialize).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    cleanup();
  });

  it("timeout: fires onTimeout exactly once when GIS never appears; onError is not called and initialize is not called", () => {
    installGoogleGlobal(null);

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onTimeout = vi.fn();

    const cleanup = initGoogleSignIn(ELEMENT_ID, onSuccess, onError, onTimeout);

    // Absolute cap = 8 * 250 = 2000ms. Advance past it.
    vi.advanceTimersByTime(2000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    // Advancing further must not re-fire onTimeout (poll + timer should be
    // torn down after the first settle).
    vi.advanceTimersByTime(5000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    cleanup();
  });

  it("teardown: cleanup before settle suppresses both onTimeout and initialize, and no timers remain", () => {
    installGoogleGlobal(null);

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onTimeout = vi.fn();

    const cleanup = initGoogleSignIn(ELEMENT_ID, onSuccess, onError, onTimeout);

    // Run cleanup mid-wait, well before the timeout cap.
    vi.advanceTimersByTime(500);
    cleanup();

    // Now make GIS available and run well past the cap. Neither initialize
    // nor onTimeout should fire because cleanup tore down both channels.
    const api = makeStubApi();
    installGoogleGlobal(api);
    vi.advanceTimersByTime(5000);

    expect(api.initialize).not.toHaveBeenCalled();
    expect(api.renderButton).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
