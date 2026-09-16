import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";

export async function supportRecoveryContext(
  db: SupabaseClient,
  ticketId: string,
) {
  const ticket = await db.from("together_support_tickets").select(
    "id,user_id,conversation_id,metadata,ticket_number",
  ).eq("id", ticketId).maybeSingle();
  if (ticket.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Case diagnostics could not be loaded.",
      500,
      true,
    );
  }
  if (!ticket.data) {
    throw new AppError("NOT_FOUND", "That support case is unavailable.", 404);
  }
  const owner = ticket.data.user_id, metadata = ticket.data.metadata ?? {};
  const mediaId = typeof metadata.mediaId === "string"
    ? metadata.mediaId
    : null;
  const [media, jobs, credits, emails, chat, actions] = await Promise.all([
    mediaId
      ? db.from("together_generated_media").select(
        "id,media_type,status,provider,failure_code,created_at,updated_at,continuity_id",
      ).eq("id", mediaId).eq("user_id", owner).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    mediaId
      ? db.from("together_media_provider_jobs").select(
        "id,status,provider,model,submitted_at,provider_completed_at,finalized_at,failure_code,created_at,updated_at",
      ).eq("generated_media_id", mediaId).eq("user_id", owner).order(
        "created_at",
        { ascending: false },
      ).limit(10)
      : Promise.resolve({ data: [], error: null }),
    db.from("together_credit_ledger").select(
      "id,event_type,permanent_delta,subscription_delta,reference_type,reference_id,created_at",
    ).eq("user_id", owner).order("created_at", { ascending: false }).limit(20),
    db.from("together_email_outbox").select(
      "id,kind,status,attempts,error_code,created_at,sent_at",
    ).eq("user_id", owner).eq(
      "payload->>ticketNumber",
      String(ticket.data.ticket_number),
    ).order("created_at", { ascending: false }).limit(20),
    ticket.data.conversation_id
      ? db.from("together_conversations").select(
        "id,continuity_id,user_archived_at,restore_until",
      ).eq("id", ticket.data.conversation_id).eq("user_id", owner).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("together_ops_recovery_actions").select(
      "id,action,target_id,outcome,reason,created_at",
    ).eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(
      20,
    ),
  ]);
  if (
    [media, jobs, credits, emails, chat, actions].some((result) => result.error)
  ) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Some case diagnostics are unavailable. Refresh before taking action.",
      500,
      true,
    );
  }
  return {
    media: media.data,
    providerJobs: jobs.data ?? [],
    recentAccountCredits: credits.data ?? [],
    emailDelivery: emails.data ?? [],
    conversation: chat.data,
    actions: actions.data ?? [],
    diagnostics: metadata.diagnostics ?? null,
    purchaseReference: metadata.purchaseReference ?? null,
  };
}

export function recoveryError(message: string): AppError {
  const messages: Record<string, string> = {
    RECOVERY_REQUEST_CONFLICT:
      "This recovery request was already used with different details.",
    RECOVERY_TARGET_MISMATCH:
      "The target must be linked to this customer’s support case.",
    RECOVERY_TARGET_UNAVAILABLE:
      "The account or requested item is no longer available.",
    RECOVERY_ARCHIVE_EXPIRED:
      "This chat is not within its retained recovery window.",
    RECOVERY_OUTPUT_UNAVAILABLE:
      "A ready, stored output is required. No generation was started.",
    RECOVERY_MEDIA_NOT_ACTIVE:
      "This request is no longer processing. Refresh its diagnostics.",
    RECOVERY_POLL_UNAVAILABLE:
      "The provider request is already being checked or is not eligible for polling.",
  };
  const code = Object.keys(messages).find((code) => message.includes(code));
  return code ? new AppError("CONFLICT", messages[code]!, 409) : new AppError(
    "INTERNAL_ERROR",
    "Recovery could not be confirmed. Retry the same action to check its outcome.",
    500,
    true,
  );
}
