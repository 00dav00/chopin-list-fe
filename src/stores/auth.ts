import { get, writable } from "svelte/store";
import { api, ApiError, setAuthTokenGetter } from "../lib/api";
import type { UserOut } from "../lib/types";

const TOKEN_KEY = "auth_token";
const EXPIRY_KEY = "auth_expiry";
const NOTICE_KEY = "auth_notice";
const PENDING_KEY = "auth_pending_approval";
const RETURN_TO_KEY = "auth_return_to";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Routes an emailed deep-link may return an admin to after sign-in.
//
// Seeded from the route table in App.svelte -- deliberately NOT from the ticket
// text, which cited `/me/admin/pending-users`. That is the backend API path;
// the FE route carries no `/me` prefix, so seeding from the ticket would mean
// the hash never matches and the return silently no-ops, with nothing failing
// loudly enough to catch it.
//
// A one-entry allowlist rather than a generic internal-path validator: a
// validator accepts *any* internal path, which is general redirect-preservation
// with a guard bolted on, and it carries its own open-redirect reasoning. A
// literal allowlist provably cannot become one, and makes the behaviour change
// on every other route exactly nil. Widening this means adding an entry, not
// rediscovering the mechanism.
const RETURN_TO_ALLOWLIST = ["/admin/pending-users"];

export type AuthState = {
  token: string | null;
  expiry: number | null;
  user: UserOut | null;
  ready: boolean;
};

const initialState: AuthState = {
  token: null,
  expiry: null,
  user: null,
  ready: false,
};

export const authStore = writable<AuthState>(initialState);
export const authNoticeStore = writable<string | null>(null);

setAuthTokenGetter(() => get(authStore).token);

export const setAuthNotice = (message: string) => {
  authNoticeStore.set(message);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(NOTICE_KEY, message);
  }
};

export const clearAuthNotice = () => {
  authNoticeStore.set(null);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(NOTICE_KEY);
  }
};

export const hydrateAuthNotice = () => {
  if (get(authNoticeStore)) {
    return;
  }
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const stored = sessionStorage.getItem(NOTICE_KEY);
  if (stored) {
    authNoticeStore.set(stored);
  }
};

export const setPendingApproval = () => {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PENDING_KEY, "true");
  }
};

export const clearPendingApproval = () => {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(PENDING_KEY);
  }
};

export const isPendingApproval = (): boolean => {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(PENDING_KEY) === "true";
};

const readStoredAuth = () => {
  if (typeof localStorage === "undefined") {
    return { token: null, expiry: null };
  }
  const token = localStorage.getItem(TOKEN_KEY);
  const expiryRaw = localStorage.getItem(EXPIRY_KEY);
  const expiry = expiryRaw ? Number(expiryRaw) : null;
  return { token, expiry: Number.isFinite(expiry) ? expiry : null };
};

const writeStoredAuth = (token: string, expiry: number) => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(expiry));
};

const clearStoredAuth = () => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
};

export const isTokenExpired = (expiry: number | null) => {
  if (!expiry) {
    return true;
  }
  return Date.now() > expiry;
};

/** Remember where an emailed deep-link was headed, before we bounce to login. */
export const captureReturnTo = (path: string) => {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  // Only capture while signed out. An admin who opens the deep-link with a live
  // session is never redirected to login, so a stash made here would sit
  // unclaimed and then fire much later, after an unrelated session expiry.
  const stored = readStoredAuth();
  if (stored.token && !isTokenExpired(stored.expiry)) {
    return;
  }
  if (!RETURN_TO_ALLOWLIST.includes(path)) {
    return;
  }
  sessionStorage.setItem(RETURN_TO_KEY, path);
};

/** Discard a stored return path that will never be consumed.
 *
 * The pop lives only in App.svelte's `isAuthed && $location === "/login"` arm,
 * and a sign-in that ends in 403 never reaches it -- so on the pending-approval
 * path the stash has no consumer at all and simply survives. Approval is a
 * multi-day wait; without this the stale intent fires at some arbitrary later
 * sign-in in the same tab.
 */
export const clearReturnTo = () => {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(RETURN_TO_KEY);
  }
};

/** Consume the stored return path. Read-and-remove: it is used at most once. */
export const takeReturnTo = (): string | null => {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  const path = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return path && RETURN_TO_ALLOWLIST.includes(path) ? path : null;
};

export const saveToken = (token: string) => {
  const expiry = Date.now() + WEEK_MS;
  writeStoredAuth(token, expiry);
  clearAuthNotice();
  clearPendingApproval();
  authStore.update((state) => ({
    ...state,
    token,
    expiry,
  }));
};

export const setCurrentUser = (user: UserOut | null) => {
  authStore.update((state) => ({
    ...state,
    user,
    ready: true,
  }));
};

export const clearToken = () => {
  clearStoredAuth();
  authStore.set({
    token: null,
    expiry: null,
    user: null,
    ready: true,
  });
};

export const bootstrapAuth = async () => {
  const stored = readStoredAuth();
  if (!stored.token || isTokenExpired(stored.expiry)) {
    clearStoredAuth();
    authStore.set({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
    return;
  }

  authStore.set({
    token: stored.token,
    expiry: stored.expiry,
    user: null,
    ready: false,
  });

  try {
    const user = await api.getMe();
    authStore.set({
      token: stored.token,
      expiry: stored.expiry,
      user,
      ready: true,
    });
  } catch (err) {
    clearStoredAuth();
    if (err instanceof ApiError && err.status === 403) {
      setPendingApproval();
    } else {
      clearPendingApproval();
    }
    authStore.set({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
  }
};
