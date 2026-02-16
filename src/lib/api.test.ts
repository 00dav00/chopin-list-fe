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
});
