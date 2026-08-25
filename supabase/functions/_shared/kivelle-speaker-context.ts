import type { SupabaseClient } from "@supabase/supabase-js";
import { speakerContextIsolationViolations } from "../../../packages/together-domain/src/index.ts";
import {
  buildKivelleConversationContext,
  type KivelleConversationContext,
} from "./kivelle-conversation-context.ts";
import { resolveCompanionPresence } from "./together-schedule.ts";
import { AppError } from "./types.ts";

type Row = Record<string, any>;
export type SpeakerContextInput = {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  conversation: Row;
  speakerCharacterInstanceId: string;
  userMessage: string;
  correlationId?: string;
  now?: Date;
  attachments?: Row[];
  sceneSessionId?: string;
  sceneContext?: Row;
};

/**
 * Reuses a context that was already built for the conversation's anchor
 * companion. This is intentionally strict: it is only valid when the loaded
 * instance is the selected speaker and all speaker-private fields still point
 * at that same instance.
 */
export function bindPreparedSpeakerContext(input: {
  instance: Row;
  context: KivelleConversationContext;
  speakerCharacterInstanceId: string;
}): { instance: Row; context: KivelleConversationContext } {
  const instanceId = String(input.instance.id ?? "");
  if (!instanceId || instanceId !== input.speakerCharacterInstanceId) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Prepared speaker context does not belong to the selected companion.",
      500,
    );
  }
  const template = input.instance.together_character_templates ?? {};
  const context = {
    ...input.context,
    speakerPrivateContextOwnerId: instanceId,
    characterVoiceOwnerId: instanceId,
    sceneSpeakerDirective: {
      characterInstanceId: instanceId,
      name: String(
        template.name ?? input.context.character?.name ?? "Companion",
      ),
    },
  } as KivelleConversationContext;
  assertSpeakerPrivateContext(context, instanceId);
  return { instance: input.instance, context };
}

/**
 * The only supported boundary for generating a non-anchor companion turn.
 * It deliberately rebuilds every private source from the selected instance;
 * callers cannot pass an already-compiled character context to be mutated.
 */
export async function buildIsolatedSpeakerContext(
  input: SpeakerContextInput,
): Promise<
  {
    instance: Row;
    context: KivelleConversationContext;
    witnessedFromSequence: number;
  }
> {
  const now = input.now ?? new Date();
  const { data: instance, error } = await input.db.from(
    "together_character_instances",
  ).select("*,together_character_templates(*),together_character_versions(*)")
    .eq("id", input.speakerCharacterInstanceId).eq("user_id", input.userId).eq(
      "continuity_id",
      input.continuityId,
    ).maybeSingle();
  if (error || !instance) {
    throw new AppError(
      "SCENE_NO_LONGER_AVAILABLE",
      "That character is no longer part of this conversation.",
      409,
    );
  }
  let witnessedFromSequence = 1;
  let visibleSceneFromSequence: number | undefined;
  let participantGroupSummary = "";
  if (input.conversation.kind === "group") {
    const { data: participant } = await input.db.from(
      "together_conversation_participants",
    ).select("witnessed_from_sequence,metadata").eq(
      "conversation_id",
      input.conversation.id,
    ).eq("character_instance_id", input.speakerCharacterInstanceId).is(
      "left_at",
      null,
    ).order("joined_at", { ascending: false }).limit(1).maybeSingle();
    if (!participant) {
      throw new AppError(
        "CONFLICT",
        "That character is no longer in this group.",
        409,
      );
    }
    witnessedFromSequence = Math.max(
      1,
      Number(participant.witnessed_from_sequence ?? 1),
    );
    participantGroupSummary =
      typeof participant.metadata?.groupSummary === "string"
        ? participant.metadata.groupSummary
        : "";
  } else if (input.sceneSessionId) {
    const { data: participant } = await input.db.from(
      "together_scene_participants",
    ).select("witnessed_from_sequence").eq(
      "scene_session_id",
      input.sceneSessionId,
    ).eq("character_instance_id", input.speakerCharacterInstanceId).is(
      "left_at",
      null,
    ).maybeSingle();
    if (!participant) {
      throw new AppError(
        "SCENE_NO_LONGER_AVAILABLE",
        "That character is no longer part of this scene.",
        409,
      );
    }
    visibleSceneFromSequence = Math.max(
      1,
      Number(participant.witnessed_from_sequence ?? 1),
    );
  }
  const presence = await resolveCompanionPresence({
    db: input.db,
    userId: input.userId,
    characterInstanceId: input.speakerCharacterInstanceId,
    now,
    ensure: false,
  }).catch(() => null);
  const lifeRun = presence
    ? {
      state: {
        locationId: presence.locationId,
        location: presence.placeContext?.location.name ?? "Current place",
        activity: presence.activity,
        mood: presence.mood,
        energy: presence.energy,
        availability: presence.availability,
        interruptibility: presence.interruptibility,
      },
      stateSource: presence.source,
      presence,
      activeEvent: null,
      events: [],
    }
    : {
      state: {
        locationId: instance.current_location_id ?? null,
        location: "Current place",
        activity: instance.current_activity ?? "Having some unstructured time",
        mood: instance.current_mood ?? "present",
        energy: instance.current_energy ?? "medium",
        availability: "available",
        interruptibility: instance.current_interruptibility ?? "open",
      },
      stateSource: instance.current_presence_source ?? "character_state",
      presence: null,
      activeEvent: null,
      events: [],
    };
  const sceneContext = input.sceneContext
    ? {
      ...input.sceneContext,
      characterInstanceId: input.speakerCharacterInstanceId,
    }
    : undefined;
  const isPersistentGroup = input.conversation.kind === "group";
  const baseMetadata = { ...(input.conversation.metadata ?? {}) };
  // Persistent groups use the participant's own attributed summary. The global
  // conversation summary may contain turns from before a late participant joined.
  if (isPersistentGroup) {
    delete baseMetadata.activeScene;
    delete baseMetadata.scene;
  }
  const conversation = {
    ...input.conversation,
    ...(isPersistentGroup
      ? {
        summary: participantGroupSummary,
        summary_through: participantGroupSummary
          ? input.conversation.summary_through
          : null,
      }
      : {}),
    metadata: sceneContext
      ? { ...baseMetadata, activeScene: sceneContext }
      : baseMetadata,
  };
  const context = await buildKivelleConversationContext({
    db: input.db,
    userId: input.userId,
    instance,
    conversation,
    userMessage: input.userMessage,
    lifeRun,
    attachments: input.attachments ?? [],
    now,
    visibleHistoryFromSequence: witnessedFromSequence,
    forceRemoteInteraction: isPersistentGroup,
    ...(input.sceneSessionId
      ? {
        visibleSceneSessionId: input.sceneSessionId,
        visibleSceneFromSequence,
      }
      : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  });
  const template = instance.together_character_templates ?? {};
  return {
    instance,
    context: {
      ...context,
      speakerPrivateContextOwnerId: input.speakerCharacterInstanceId,
      characterVoiceOwnerId: input.speakerCharacterInstanceId,
      sceneSpeakerDirective: {
        characterInstanceId: input.speakerCharacterInstanceId,
        name: String(template.name ?? "Companion"),
      },
    } as KivelleConversationContext,
    witnessedFromSequence,
  };
}

export function assertSpeakerPrivateContext(
  context: Record<string, any>,
  speakerCharacterInstanceId: string,
): void {
  const violations = speakerContextIsolationViolations(
    context,
    speakerCharacterInstanceId,
  );
  if (violations.length) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Speaker context isolation failed (${violations.join(", ")}).`,
      500,
    );
  }
}
