import type { Message } from "../types";
import { messageRewriteVersion } from '@together/domain/src/message-rewrite';

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
      // Cached pages may arrive after a rewrite/restore. Never restore an older
      // revision, even when the newly revised reply is shorter.
      if(existing.id===message.id&&messageRewriteVersion(existing)>messageRewriteVersion(message))continue;
      // A late component update or restored optimistic cache must never
      // downgrade an already-persisted row back to pending/failed. This race is
      // common when switching chats while the stream's canonical user row is
      // arriving. Server identity and state always win.
      result[index] = message.id.startsWith("local-") && !existing.id.startsWith("local-")
        ? existing
        : existing.id === message.id
          ? { ...existing, ...message }
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
