import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { reconcileMessages, sameLogicalMessage } from "./messageReconciliation";

const message = (input: Partial<Message> & Pick<Message, "id" | "role">): Message => ({
  conversation_id: "conversation-1",
  content: "hello",
  delivery_status: "complete",
  created_at: "2026-08-23T12:00:00.000Z",
  ...input,
});

describe("message reconciliation", () => {
  it("replaces an optimistic row with its canonical request row", () => {
    const optimistic = message({ id: "local-1", role: "user", client_request_id: "request-1", delivery_status: "pending" });
    const canonical = message({ id: "server-1", role: "user", client_request_id: "request-1" });
    expect(reconcileMessages([optimistic], [canonical])).toEqual([canonical]);
  });

  it("never replaces a canonical server row with a late optimistic copy", () => {
    const canonical = message({ id: "server-1", role: "user", client_request_id: "request-1" });
    const optimistic = message({ id: "local-1", role: "user", client_request_id: "request-1", delivery_status: "complete" });
    expect(reconcileMessages([canonical], [optimistic])[0]?.id).toBe("server-1");
  });

  it("deduplicates replayed assistant responses by server response key", () => {
    const first = message({ id: "assistant-1", role: "assistant", response_key: "direct:request-1:primary" });
    const replay = message({ id: "assistant-1", role: "assistant", response_key: "direct:request-1:primary" });
    expect(reconcileMessages([first], [replay])).toHaveLength(1);
    expect(sameLogicalMessage(first, replay)).toBe(true);
  });

  it("does not merge messages from different conversations", () => {
    const left = message({ id: "local-1", role: "user", client_request_id: "request-1" });
    const right = message({ id: "server-1", role: "user", client_request_id: "request-1", conversation_id: "conversation-2" });
    expect(reconcileMessages([left], [right])).toHaveLength(2);
  });

  it("orders group messages by canonical sequence when timestamps tie", () => {
    const second = message({ id: "assistant-2", role: "assistant", conversation_sequence: 2 });
    const first = message({ id: "assistant-1", role: "assistant", conversation_sequence: 1 });
    expect(reconcileMessages([second], [first]).map((item) => item.id)).toEqual(["assistant-1", "assistant-2"]);
  });

  it("does not erase a fast reply when an older focus refresh finishes late", () => {
    const earlier = message({ id: "server-1", role: "assistant", content: "Earlier" });
    const fastReply = message({
      id: "assistant-fast",
      role: "assistant",
      content: "Already delivered",
      created_at: "2026-08-23T12:00:02.000Z",
      response_key: "direct:request-fast:primary",
    });
    const staleFocusPage = [earlier];

    expect(reconcileMessages([earlier, fastReply], staleFocusPage).map((item) => item.id))
      .toEqual(["server-1", "assistant-fast"]);
  });
});
