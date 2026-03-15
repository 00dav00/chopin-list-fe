import type {
  UserOut,
  ListOut,
  ListCreate,
  ListUpdate,
  ItemOut,
  ItemCreate,
  ItemUpdate,
  TemplateOut,
  TemplateDetailOut,
  TemplateCreate,
  TemplateUpdate,
  TemplateItemOut,
  TemplateItemCreate,
  TemplateItemUpdate,
  CreateListFromTemplate,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

type TokenGetter = () => string | null;
let getToken: TokenGetter = () => null;
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export const setAuthTokenGetter = (fn: TokenGetter) => {
  getToken = fn;
};

export const setUnauthorizedHandler = (fn: UnauthorizedHandler | null) => {
  onUnauthorized = fn;
};

async function fetchJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 204) {
    return null as T;
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      onUnauthorized?.();
    }

    const detail =
      (payload as { detail?: string; message?: string } | null)?.detail ||
      (payload as { detail?: string; message?: string } | null)?.message ||
      res.statusText;
    throw new ApiError(res.status, "API request failed", detail);
  }

  return payload as T;
}

export const api = {
  getMe: () => fetchJson<UserOut>("/me"),

  listLists: () => fetchJson<ListOut[]>("/lists"),
  listCompletedLists: () => fetchJson<ListOut[]>("/lists/completed"),
  createList: (payload: ListCreate) =>
    fetchJson<ListOut>("/lists", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getList: (listId: string) => fetchJson<ListOut>(`/lists/${listId}`),
  completeList: (listId: string) =>
    fetchJson<ListOut>(`/lists/${listId}/complete`, {
      method: "POST",
    }),
  activateList: (listId: string) =>
    fetchJson<ListOut>(`/lists/${listId}/activate`, {
      method: "POST",
    }),
  updateList: (listId: string, payload: ListUpdate) =>
    fetchJson<ListOut>(`/lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteList: (listId: string) =>
    fetchJson<null>(`/lists/${listId}`, { method: "DELETE" }),

  listItems: (listId: string) =>
    fetchJson<ItemOut[]>(`/lists/${listId}/items`),
  createItem: (listId: string, payload: ItemCreate) =>
    fetchJson<ItemOut>(`/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateItem: (itemId: string, payload: ItemUpdate) =>
    fetchJson<ItemOut>(`/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  toggleItem: (itemId: string) =>
    fetchJson<ItemOut>(`/items/${itemId}/toggle`, { method: "POST" }),
  deleteItem: (itemId: string) =>
    fetchJson<null>(`/items/${itemId}`, { method: "DELETE" }),
  reorderListItems: (listId: string, itemIds: string[]) =>
    fetchJson<ItemOut[]>(`/lists/${listId}/items/reorder`, {
      method: "POST",
      body: JSON.stringify({ item_ids: itemIds }),
    }),

  listTemplates: () => fetchJson<TemplateOut[]>("/templates"),
  createTemplate: (payload: TemplateCreate) =>
    fetchJson<TemplateDetailOut>("/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTemplate: (templateId: string) =>
    fetchJson<TemplateDetailOut>(`/templates/${templateId}`),
  updateTemplate: (templateId: string, payload: TemplateUpdate) =>
    fetchJson<TemplateOut>(`/templates/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTemplate: (templateId: string) =>
    fetchJson<null>(`/templates/${templateId}`, { method: "DELETE" }),

  listTemplateItems: (templateId: string) =>
    fetchJson<TemplateItemOut[]>(`/templates/${templateId}/items`),
  createTemplateItem: (templateId: string, payload: TemplateItemCreate) =>
    fetchJson<TemplateItemOut>(`/templates/${templateId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTemplateItem: (
    templateId: string,
    itemId: string,
    payload: TemplateItemUpdate
  ) =>
    fetchJson<TemplateItemOut>(`/templates/${templateId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTemplateItem: (templateId: string, itemId: string) =>
    fetchJson<null>(`/templates/${templateId}/items/${itemId}`, {
      method: "DELETE",
    }),

  createListFromTemplate: (
    templateId: string,
    payload: CreateListFromTemplate
  ) =>
    fetchJson<ListOut>(`/templates/${templateId}/create-list`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
