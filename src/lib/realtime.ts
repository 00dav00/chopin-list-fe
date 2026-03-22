import type { LiveListEvent } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export type RealtimeStatus = "connecting" | "open" | "closed" | "error";

export type RealtimeConnection = {
  close: () => void;
};

type ConnectOptions = {
  listId: string;
  token: string;
  onEvent: (event: LiveListEvent) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
  onError?: (error: Event) => void;
};

const toWsBaseUrl = (rawBaseUrl: string) => {
  if (!rawBaseUrl) {
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/^http/i, "ws");
    }
    return "ws://localhost";
  }
  return rawBaseUrl.replace(/^http/i, "ws");
};

export const buildLiveSocketUrl = (listId: string, token: string) => {
  const wsBase = toWsBaseUrl(API_BASE_URL).replace(/\/+$/, "");
  return `${wsBase}/v2/live/lists/${encodeURIComponent(listId)}/ws?token=${encodeURIComponent(token)}`;
};

export const connectLiveListSocket = ({
  listId,
  token,
  onEvent,
  onStatusChange,
  onError,
}: ConnectOptions): RealtimeConnection => {
  onStatusChange?.("connecting");
  const socket = new WebSocket(buildLiveSocketUrl(listId, token));

  socket.addEventListener("open", () => {
    onStatusChange?.("open");
  });

  socket.addEventListener("message", (event) => {
    const parsed = JSON.parse(String(event.data)) as LiveListEvent | { type: string };
    if (parsed.type === "list.changed") {
      onEvent(parsed);
    }
  });

  socket.addEventListener("error", (event) => {
    onStatusChange?.("error");
    onError?.(event);
  });

  socket.addEventListener("close", () => {
    onStatusChange?.("closed");
  });

  return {
    close: () => {
      socket.close();
    },
  };
};
