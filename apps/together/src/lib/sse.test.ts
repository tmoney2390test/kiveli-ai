import { describe, expect, it } from "vitest";
import { drainJsonSseEvents } from "./sse";

describe("JSON SSE parsing", () => {
  it("drains coalesced LF-framed events and retains an incomplete tail", () => {
    const result = drainJsonSseEvents<{ type: string }>(
      'data: {"type":"start"}\n\ndata: {"type":"token"}\n\ndata: {"type":"done"}',
    );
    expect(result.events.map((event) => event.type)).toEqual(["start", "token"]);
    expect(result.remainder).toBe('data: {"type":"done"}');
  });

  it("accepts CRLF framing used by proxies", () => {
    const result = drainJsonSseEvents<{ type: string }>(
      'data: {"type":"start"}\r\n\r\ndata: {"type":"done"}\r\n\r\n',
    );
    expect(result.events.map((event) => event.type)).toEqual(["start", "done"]);
    expect(result.remainder).toBe("");
  });

  it("reassembles a CRLF delimiter split across response chunks", () => {
    const first = drainJsonSseEvents<{ type: string }>('data: {"type":"start"}\r');
    const second = drainJsonSseEvents<{ type: string }>(`${first.remainder}\n\r\ndata: {"type":"done"}\r\n\r\n`);
    expect(second.events.map((event) => event.type)).toEqual(["start", "done"]);
  });

  it("flushes a terminal event even when the stream omits its final delimiter", () => {
    const result = drainJsonSseEvents<{ type: string }>('data:{"type":"done"}', true);
    expect(result.events).toEqual([{ type: "done" }]);
    expect(result.remainder).toBe("");
  });

  it("joins multi-line data payloads and ignores comments", () => {
    const result = drainJsonSseEvents<{ value: string }>(
      ': heartbeat\ndata: {"value":\ndata: "ready"}\n\n',
    );
    expect(result.events).toEqual([{ value: "ready" }]);
  });
});
