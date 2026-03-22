import { beforeEach, describe, expect, it, vi } from "vitest";

describe("realtime client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds the v2 live websocket path", async () => {
    const realtime = await import("./realtime");
    const url = realtime.buildLiveSocketUrl("list-1", "token-123");

    expect(url).toContain("/v2/live/lists/list-1/ws");
    expect(url).toContain("token=token-123");
  });

  it("forwards list.changed events and reports status", async () => {
    type Handler = (event?: any) => void;
    class FakeWebSocket {
      static instances: FakeWebSocket[] = [];
      handlers = new Map<string, Handler[]>();

      constructor(public url: string) {
        FakeWebSocket.instances.push(this);
      }

      addEventListener(type: string, callback: Handler) {
        const handlers = this.handlers.get(type) || [];
        handlers.push(callback);
        this.handlers.set(type, handlers);
      }

      close() {
        this.emit("close");
      }

      emit(type: string, event: any = {}) {
        for (const callback of this.handlers.get(type) || []) {
          callback(event);
        }
      }
    }

    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const realtime = await import("./realtime");
    const onEvent = vi.fn();
    const onStatus = vi.fn();

    const connection = realtime.connectLiveListSocket({
      listId: "list-2",
      token: "token-abc",
      onEvent,
      onStatusChange: onStatus,
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toContain("/v2/live/lists/list-2/ws");

    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        type: "list.changed",
        list_id: "list-2",
        operation: "update",
      }),
    });
    connection.close();

    expect(onStatus).toHaveBeenNthCalledWith(1, "connecting");
    expect(onStatus).toHaveBeenNthCalledWith(2, "open");
    expect(onStatus).toHaveBeenLastCalledWith("closed");
    expect(onEvent).toHaveBeenCalledWith({
      type: "list.changed",
      list_id: "list-2",
      operation: "update",
    });
  });
});
