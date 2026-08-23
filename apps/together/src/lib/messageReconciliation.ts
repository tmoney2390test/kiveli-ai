import type { Message } from "../types";

/**
 * Reconciles optimistic, realtime, replayed, and canonical message copies.
 * Server IDs win, while request/response keys prevent the same logical message
 * from surviving under two different local identities.
 */
export function reconcileMessages(
  current: Message[],
  incoming: Message[],
  removeIds: string[] = [],
): Message[] {
  const removed = new Set(removeIds);
  const result = current.filter((message) => !removed.has(message.id));
  for (const message of incoming) {
    const index = result.findIndex((candidate) => sameLogicalMessage(candidate, message));
    if (index >= 0) {
      const existing = result[index]!;
      result[index] = message.id.startsWith("local-") && !existing.id.startsWith("local-")
        ? { ...existing, delivery_status: message.delivery_status }
        : message;
    }
    else result.push(message);
  }
  return result.sort(compareMessages);
}

export function sameLogicalMessage(left: Message, right: Message): boolean {
  if (left.id === right.id) return true;
  if (left.conversation_id !== right.conversation_id || left.role !== right.role) return false;
  if (left.client_request_id && right.client_request_id) {
    return left.client_request_id === right.client_request_id;
  }
  if (left.response_key && right.response_key) {
    return left.response_key === right.response_key;
  }
  return false;
}

function compareMessages(left: Message, right: Message): number {
  const leftSequence = left.conversation_sequence;
  const rightSequence = right.conversation_sequence;
  if (leftSequence != null && rightSequence != null && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  const time = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  return time || left.id.localeCompare(right.id);
}
