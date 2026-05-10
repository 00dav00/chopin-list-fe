import { beforeEach, describe, expect, it, vi } from "vitest";

describe("api client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("adds authorization header when token is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"id":"u1","created_at":"2026-01-01T00:00:00Z"}', {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const apiModule = await import("./api");
    apiModule.setAuthTokenGetter(() => "token-123");

    await apiModule.api.getMe();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("sets content-type automatically when request body is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"id":"l1","name":"Groceries","user_id":"u1","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}', {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const apiModule = await import("./api");
    apiModule.setAuthTokenGetter(() => null);

    await apiModule.api.createList({ name: "Groceries" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("returns null for 204 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    );

    const apiModule = await import("./api");
    const result = await apiModule.api.deleteList("list-1");
    expect(result).toBeNull();
  });

  it("returns plain text when response body is not json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
      )
    );

    const apiModule = await import("./api");
    const result = await apiModule.api.getMe();
    expect(result).toBe("ok");
  });

  it("throws ApiError with detail from payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"detail":"List not found"}', { status: 404 })
      )
    );

    const apiModule = await import("./api");

    await expect(apiModule.api.getList("missing")).rejects.toMatchObject({
      status: 404,
      detail: "List not found",
      message: "API request failed",
    });
  });

  it("uses status text when error payload is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", { status: 500, statusText: "Server Error" })
      )
    );

    const apiModule = await import("./api");

    await expect(apiModule.api.getMe()).rejects.toMatchObject({
      status: 500,
      detail: "Server Error",
    });
  });

  it("calls unauthorized handler on 401 and still throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"detail":"Unauthorized"}', { status: 401 })
      )
    );

    const apiModule = await import("./api");
    const unauthorizedHandler = vi.fn();
    apiModule.setUnauthorizedHandler(unauthorizedHandler);

    await expect(apiModule.api.getMe()).rejects.toBeInstanceOf(
      apiModule.ApiError
    );
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it("posts reordered item ids to the list reorder endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const apiModule = await import("./api");
    await apiModule.api.reorderListItems("list-1", ["item-3", "item-1", "item-2"]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/lists/list-1/items/reorder"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ item_ids: ["item-3", "item-1", "item-2"] }),
      })
    );
  });

  it("hits completed list lifecycle endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiModule = await import("./api");
    await apiModule.api.listCompletedLists();
    await apiModule.api.completeList("list-42");
    await apiModule.api.activateList("list-42");

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/lists/completed");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/lists/list-42/complete");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/lists/list-42/activate");
  });

  it("posts reordered item ids to the template reorder endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const apiModule = await import("./api");
    await apiModule.api.reorderTemplateItems("tmpl-1", ["item-c", "item-a", "item-b"]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/templates/tmpl-1/items/reorder"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ item_ids: ["item-c", "item-a", "item-b"] }),
      })
    );
  });

  describe("api.getListWithEtag", () => {
    const listJson = JSON.stringify({
      id: "list-1",
      user_id: "u1",
      name: "Groceries",
      completed: false,
      items_count: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    it("sends Authorization, no If-None-Match when null, and cache no-store on 200", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(listJson, {
          status: 200,
          headers: { ETag: 'W/"1"' },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const apiModule = await import("./api");
      apiModule.setAuthTokenGetter(() => "token-abc");
      const result = await apiModule.api.getListWithEtag("list-1", null);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-abc");
      expect(headers.get("If-None-Match")).toBeNull();
      expect(init.cache).toBe("no-store");
      expect(result).toEqual({
        status: 200,
        etag: 'W/"1"',
        list: expect.objectContaining({ id: "list-1", name: "Groceries" }),
      });
    });

    it("propagates If-None-Match when supplied", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(null, { status: 304, headers: { ETag: 'W/"2"' } })
      );
      vi.stubGlobal("fetch", fetchMock);

      const apiModule = await import("./api");
      const result = await apiModule.api.getListWithEtag("list-1", 'W/"2"');

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.get("If-None-Match")).toBe('W/"2"');
      expect(result).toEqual({ status: 304, etag: 'W/"2"' });
    });

    it("throws ApiError with detail from JSON error body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response('{"detail":"List not found"}', { status: 404 })
        )
      );

      const apiModule = await import("./api");
      await expect(
        apiModule.api.getListWithEtag("missing", null)
      ).rejects.toMatchObject({
        status: 404,
        detail: "List not found",
      });
    });

    it("falls back to status text when error body is empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("", { status: 500, statusText: "Server Error" })
        )
      );

      const apiModule = await import("./api");
      await expect(
        apiModule.api.getListWithEtag("list-1", null)
      ).rejects.toMatchObject({ status: 500, detail: "Server Error" });
    });

    it("calls unauthorized handler on 401 and throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response('{"detail":"Unauthorized"}', { status: 401 })
        )
      );

      const apiModule = await import("./api");
      const handler = vi.fn();
      apiModule.setUnauthorizedHandler(handler);

      await expect(
        apiModule.api.getListWithEtag("list-1", null)
      ).rejects.toBeInstanceOf(apiModule.ApiError);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("aborts when the caller's signal aborts", async () => {
      const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const apiModule = await import("./api");
      const controller = new AbortController();
      const promise = apiModule.api.getListWithEtag("list-1", null, controller.signal);
      controller.abort();
      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  it("hits admin user management endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiModule = await import("./api");
    await apiModule.api.listConfirmedUsers();
    await apiModule.api.unconfirmUser("user-7");
    await apiModule.api.deletePendingUser("user-8");

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/me/admin/confirmed-users");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/me/admin/users/user-7/unconfirm");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/me/admin/users/user-8");
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe("DELETE");
  });
});
