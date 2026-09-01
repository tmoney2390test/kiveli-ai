import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type KivelleSubscriptionState,
  resolveSubscriptionState,
} from "./kivelle-subscription.ts";
import { AppError } from "./types.ts";

export async function requireGroupChatAccess(
  db: SupabaseClient,
  userId: string,
): Promise<KivelleSubscriptionState> {
  const subscription = await resolveSubscriptionState(db, userId);
  if (!subscription.entitlementKeys.includes("group_chat")) {
    throw new AppError(
      "PLAN_LIMIT_REACHED",
      "Group chats are available with Kivelle+ and Kivelle Max.",
      403,
    );
  }
  return subscription;
}

export async function requireOwnedGroupConversation(
  db: SupabaseClient,
  input: { userId: string; continuityId: string; conversationId: string },
) {
  const { data, error } = await db.from("together_conversations").select("*")
    .eq("id", input.conversationId).eq("user_id", input.userId).eq(
      "continuity_id",
      input.continuityId,
    ).eq("kind", "group").is("archived_at", null).maybeSingle();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "That group could not be loaded.",
      500,
      true,
    );
  }
  if (!data) throw new AppError("NOT_FOUND", "That group is unavailable.", 404);
  return data as Record<string, any>;
}

export async function activeGroupParticipants(
  db: SupabaseClient,
  input: { userId: string; continuityId: string; conversationId: string },
) {
  const { data, error } = await db.from("together_conversation_participants")
    .select(
      "*,together_character_instances(*,together_character_templates(*),together_character_versions(portrait_asset_key,visual_identity,personality_config,communication_style,boundaries))",
    ).eq("conversation_id", input.conversationId).eq("user_id", input.userId)
    .eq("continuity_id", input.continuityId).is("left_at", null).order(
      "joined_at",
    );
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The group roster could not be loaded.",
      500,
      true,
    );
  }
  return (data ?? []) as Record<string, any>[];
}

export function normalizeGroupSettings(
  metadata: unknown,
): {
  responseMode: "automatic" | "choose_speaker";
  energy: "quiet" | "balanced" | "lively";
  notificationMode: "all" | "mentions" | "muted";
} {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Record<string, any>
      : {};
  const settings =
    record.groupSettings && typeof record.groupSettings === "object"
      ? record.groupSettings as Record<string, any>
      : {};
  return {
    responseMode: settings.responseMode === "choose_speaker"
      ? "choose_speaker"
      : "automatic",
    energy: settings.energy === "quiet" || settings.energy === "lively"
      ? settings.energy
      : "balanced",
    notificationMode: settings.notificationMode === "mentions" ||
        settings.notificationMode === "muted"
      ? settings.notificationMode
      : "all",
  };
}

export function groupNotificationAllowsPush(
  metadata: unknown,
  mentionsUser = false,
): boolean {
  const mode = normalizeGroupSettings(metadata).notificationMode;
  return mode === "all" || (mode === "mentions" && mentionsUser);
}
