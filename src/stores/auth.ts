import { get, writable } from "svelte/store";
import { api, setAuthTokenGetter } from "../lib/api";
import type { UserOut } from "../lib/types";

const TOKEN_KEY = "auth_token";
const EXPIRY_KEY = "auth_expiry";
const NOTICE_KEY = "auth_notice";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

export const saveToken = (token: string) => {
  const expiry = Date.now() + WEEK_MS;
  writeStoredAuth(token, expiry);
  clearAuthNotice();
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
  } catch {
    clearStoredAuth();
    authStore.set({
      token: null,
      expiry: null,
      user: null,
      ready: true,
    });
  }
};
