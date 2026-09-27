import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";
import { accountDeletionStarted } from "./kivelle-deleted-account.ts";
import { readRevenueCatAdapterConfig } from "./revenuecat.ts";
import { syncRevenueCatUser } from "./kivelle-revenuecat-sync.ts";
import { type OperationsRole, recordOperationsAudit } from "./kivelle-ops.ts";
import { serverEnv } from "./context.ts";

// Reuses store verification and its account lease/period idempotency. A customer
// reference is diagnostic context only; it is never proof of a purchase.
export async function recoverSupportMembership(
  db: SupabaseClient,
  actorId: string,
  role: OperationsRole,
  input: {
    ticketId: string;
    requestId: string;
    targetId: string;
    reason: string;
  },
) {
  if (role !== "admin") {
    throw new AppError(
      "FORBIDDEN",
      "An administrator must verify membership recovery.",
      403,
    );
  }
  if (input.targetId !== input.ticketId) {
    throw new AppError("CONFLICT", "Verify the selected support case.", 409);
  }
  const { data: ticket, error } = await db.from("together_support_tickets")
    .select("id,user_id,category").eq("id", input.ticketId).maybeSingle();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The support case could not be verified.",
      500,
      true,
    );
  }
  if (
    !ticket || ticket.category !== "billing" ||
    await accountDeletionStarted(db, ticket.user_id)
  ) {
    throw new AppError(
      "CONFLICT",
      "An available billing case is required.",
      409,
    );
  }
  const intent = await db.from("together_ops_recovery_actions").upsert({
    ticket_id: ticket.id,
    actor_id: actorId,
    request_id: input.requestId,
    action: "reconcile_membership",
    target_id: input.targetId,
    reason: input.reason,
    outcome: { status: "pending" },
  }, { onConflict: "actor_id,request_id", ignoreDuplicates: true });
  if (intent.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Recovery intent could not be recorded.",
      500,
      true,
    );
  }
  const prior = await db.from("together_ops_recovery_actions").select(
    "ticket_id,action,target_id,reason,outcome",
  ).eq("actor_id", actorId).eq("request_id", input.requestId).maybeSingle();
  if (prior.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Previous recovery could not be checked.",
      500,
      true,
    );
  }
  if (prior.data) {
    if (
      prior.data.ticket_id !== input.ticketId ||
      prior.data.action !== "reconcile_membership" ||
      prior.data.target_id !== input.targetId ||
      prior.data.reason !== input.reason
    ) {
      throw new AppError(
        "CONFLICT",
        "This recovery request was used with different details.",
        409,
      );
    }
    if (prior.data.outcome?.status !== "pending") return prior.data.outcome;
  }
  const config = readRevenueCatAdapterConfig();
  if (!config.enabled) {
    throw new AppError(
      "BILLING_NOT_CONFIGURED",
      "Store verification is unavailable.",
      503,
      true,
    );
  }
  const audit = {
    actorUserId: actorId,
    actorRole: role,
    targetType: "support_ticket",
    targetId: ticket.id,
    requestId: input.requestId,
    reasonSafe: input.reason,
    metadata: { affectedUserId: ticket.user_id },
  };
  // Persist intent before crossing the provider boundary. If the response is lost,
  // retries verify the same account; the existing billing ledger prevents regrants.
  await recordOperationsAudit(db, {
    ...audit,
    action: "support_membership_verification_started",
  });
  const verified = await syncRevenueCatUser(
    db,
    ticket.user_id,
    {
      id: input.requestId,
      type: "RECONCILE",
      event_timestamp_ms: Date.now(),
      app_user_id: ticket.user_id,
      aliases: [],
      transferred_from: [],
      transferred_to: [],
    },
    config,
    serverEnv("KIVELLE_REVENUECAT_SECRET_API_KEY"),
  );
  const outcome = {
    status: "verified",
    message: verified.verifiedNoPurchase
      ? "The store has no subscription for this account. No manual benefits were added."
      : "Membership was reconciled against the store. Credit packs and store refunds use their separate verification flows.",
  };
  await recordOperationsAudit(db, {
    ...audit,
    action: "support_membership_verification_completed",
    metadata: { ...audit.metadata, ...verified },
  });
  const saved = await db.from("together_ops_recovery_actions").update({
    outcome,
  }).eq("actor_id", actorId).eq("request_id", input.requestId);
  if (saved.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Store verification finished but case recording is unconfirmed. Retry this same action.",
      500,
      true,
    );
  }
  return outcome;
}
