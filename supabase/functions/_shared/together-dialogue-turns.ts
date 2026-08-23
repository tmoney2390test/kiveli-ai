import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";

export type ConversationTurnKind = "direct" | "group" | "shared_scene";
export type ConversationTurnLease = {
  id: string;
  token: string;
  acquired: boolean;
  state: string;
  requestId: string;
  interruptedCount: number;
};

export async function beginConversationTurn(db: SupabaseClient, input: {
  userId: string;
  continuityId: string;
  conversationId: string;
  requestId: string;
  kind: ConversationTurnKind;
  supersedeGenerating?: boolean;
  leaseSeconds?: number;
}): Promise<ConversationTurnLease> {
  const { data, error } = await db.rpc("kivelle_begin_dialogue_turn", {
    p_user_id: input.userId,
    p_continuity_id: input.continuityId,
    p_conversation_id: input.conversationId,
    p_request_id: input.requestId,
    p_turn_kind: input.kind,
    p_supersede_generating: input.supersedeGenerating === true,
    p_lease_seconds: input.leaseSeconds ?? 180,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The conversational floor could not be prepared.",
      500,
      true,
    );
  }
  return {
    id: String(row.turn_id),
    token: String(row.lease_token),
    acquired: row.acquired === true,
    state: String(row.active_state ?? "planning"),
    requestId: String(row.active_request_id ?? input.requestId),
    interruptedCount: Number(row.interrupted_count ?? 0),
  };
}

export async function activateConversationTurn(
  db: SupabaseClient,
  lease: ConversationTurnLease,
  input: {
    sourceMessageId: string;
    plannedActions?: unknown[];
    metadata?: Record<string, unknown>;
    leaseSeconds?: number;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("kivelle_activate_dialogue_turn", {
    p_turn_id: lease.id,
    p_lease_token: lease.token,
    p_source_message_id: input.sourceMessageId,
    p_planned_actions: input.plannedActions ?? null,
    p_metadata: input.metadata ?? null,
    p_lease_seconds: input.leaseSeconds ?? 180,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    throw new AppError(
      "CONFLICT",
      "A newer message took the conversational floor.",
      409,
      true,
    );
  }
  return row as Record<string, unknown>;
}

export async function touchConversationTurn(
  db: SupabaseClient,
  lease: ConversationTurnLease,
  leaseSeconds = 180,
): Promise<boolean> {
  const { data, error } = await db.rpc("kivelle_touch_dialogue_turn", {
    p_turn_id: lease.id,
    p_lease_token: lease.token,
    p_lease_seconds: leaseSeconds,
  });
  return !error && data === true;
}

export async function finishConversationTurn(
  db: SupabaseClient,
  lease: ConversationTurnLease,
  state: "completed" | "yielded" | "cancelled" | "failed" = "completed",
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db.rpc("kivelle_finish_dialogue_turn", {
    p_turn_id: lease.id,
    p_lease_token: lease.token,
    p_state: state,
    p_metadata: metadata ?? null,
  });
  if (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "finish_dialogue_turn",
        turnId: lease.id,
        state,
        errorCode: error.code ?? "rpc_failed",
      }),
    );
  }
  return !error && data === true;
}

/**
 * Keeps the database floor active until the canonical response stream has
 * actually finished. The response body is not buffered and disconnecting the
 * outer client does not release a still-running provider invocation early.
 */
export async function finishTurnWithResponse(
  db: SupabaseClient,
  lease: ConversationTurnLease,
  response: Response,
): Promise<Response> {
  if (!response.body) {
    await finishConversationTurn(
      db,
      lease,
      response.ok ? "completed" : "failed",
    );
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let completed = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            completed = true;
            break;
          }
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
        await finishConversationTurn(
          db,
          lease,
          response.ok && completed ? "completed" : "failed",
        );
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await finishConversationTurn(db, lease, "failed", {
          streamCancelled: true,
        });
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
