export type SseDrainResult<T> = {
  events: T[];
  remainder: string;
};

/**
 * Drains JSON Server-Sent Events without assuming a particular newline style.
 * Browsers and edge proxies may deliver LF or CRLF framing, and may coalesce
 * several events into one response chunk. Keeping this parser independent of
 * chunk boundaries prevents a terminal `done` event from being stranded.
 */
export function drainJsonSseEvents<T>(buffer: string, flush = false): SseDrainResult<T> {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = flush ? "" : blocks.pop() ?? "";
  const events: T[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    const payload = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!payload) continue;
    events.push(JSON.parse(payload) as T);
  }

  return { events, remainder };
}
