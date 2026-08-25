import { z } from "zod";
import {
  boundedGroupSocialDelta,
  classifyGroupSocialEvent,
  compileIntimacyStance,
  isLocationPlanDismissalCoolingDown,
  LOCATION_PLAN_DISMISSAL_COOLDOWN_MS,
  matchAssistantLocationPlan,
  type DialogueContentMode,
  extractMemoryCandidates,
  resolveGroupPhotoSubjects,
  type GroupSpeakerCandidate,
  type GroupTurnAction,
  type PlannableLocationMention,
  planGroupContinuation,
  planGroupTurn,
} from "../../../packages/together-domain/src/index.ts";
import { parseBody } from "../_shared/body.ts";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { corsHeaders, errorResponse } from "../_shared/http.ts";
import { activeContinuity } from "../_shared/together-continuity.ts";
import {
  activeGroupParticipants,
  normalizeGroupSettings,
  requireGroupChatAccess,
  requireOwnedGroupConversation,
} from "../_shared/kivelle-group-chat.ts";
import { refineAmbiguousGroupPlan } from "../_shared/kivelle-group-director.ts";
import {
  assertSpeakerPrivateContext,
  buildIsolatedSpeakerContext,
} from "../_shared/kivelle-speaker-context.ts";
import {
  ConfiguredDialogueProvider,
  ConfiguredEmbeddingProvider,
  ConfiguredModerationProvider,
  type DialogueRunOptions,
} from "../_shared/together-ai.ts";
import { resolveDialogueRouting } from "../_shared/kivelle-ai-routing.ts";
import { conversationDialogueContentMode } from "../_shared/conversation-content-mode.ts";
import { enforceExplicitDialogueAllowance } from "../_shared/kivelle-subscription.ts";
import { track } from "../_shared/together.ts";
import { createMediaOffer } from "../_shared/together-media-offers.ts";
import { classifyPhotoRequest } from "../_shared/together-media.ts";
import { AppError } from "../_shared/types.ts";
import { waitUntil } from "../_shared/background.ts";
import { consolidateConversationEpisodes } from "../_shared/kivelle-conversation-episodes.ts";
import { attachAuthoredDepthContext } from "../_shared/kivelle-authored-depth-context.ts";
import {
  activateConversationTurn,
  beginConversationTurn,
  type ConversationTurnLease,
  finishConversationTurn,
  touchConversationTurn,
} from "../_shared/together-dialogue-turns.ts";
import { writeConversationEvent } from "../_shared/together-plans.ts";
import {
  assertChatRequestId,
  chatRequestFingerprint,
  claimChatUserMessage,
  findExistingChatRequest,
  normalizeChatMessage,
} from "../_shared/chat-message-hardening.ts";

const schema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().max(4000).default(""),
  attachmentIds: z.array(z.string().uuid()).max(4).refine((ids) => new Set(ids).size === ids.length, "The same attachment cannot be sent twice.").default([]),
  clientRequestId: z.string().uuid(),
  mentionedCharacterInstanceIds: z.array(z.string().uuid()).max(5).refine((ids) => new Set(ids).size === ids.length, "A companion can only be mentioned once.").default([]),
  photoSubjectCharacterInstanceIds: z.array(z.string().uuid()).max(2).refine((ids) => new Set(ids).size === ids.length, "A photo subject can only be selected once.").default([]),
  replyToMessageId: z.string().uuid().optional(),
  manualSpeakerInstanceId: z.string().uuid().optional(),
  letThemTalk: z.boolean().default(false),
}).refine(
  (value) => value.message.length > 0 || value.attachmentIds.length > 0,
  { message: "Write a message or attach a photo." },
);
const dialogue = new ConfiguredDialogueProvider(),
  episodeEmbeddings = new ConfiguredEmbeddingProvider(),
  moderation = new ConfiguredModerationProvider(),
  encoder = new TextEncoder();

Deno.serve(async (request) => {
  const correlationId = request.headers.get("x-correlation-id") ??
    crypto.randomUUID();
  let turnLease: ConversationTurnLease | null = null, turnDb: any = null;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    const { user, db } = await authenticated(request);
    turnDb = db;
    const input = await parseBody(request, schema);
    const requestId = assertChatRequestId(input.clientRequestId);
    const normalizedMessage = normalizeChatMessage(input.message);
    const continuity = await activeContinuity(db, user.id);
    const subscription = await requireGroupChatAccess(db, user.id);
    const conversation = await requireOwnedGroupConversation(db, {
      userId: user.id,
      continuityId: continuity.id,
      conversationId: input.conversationId,
    });
    const roster = await activeGroupParticipants(db, {
      userId: user.id,
      continuityId: continuity.id,
      conversationId: conversation.id,
    });
    if (roster.length < 2) {
      throw new AppError(
        "CONFLICT",
        "This group needs at least two active companions.",
        409,
      );
    }
    const rosterIds = new Set(
      roster.map((row) => String(row.character_instance_id)),
    );
    const anchor = String(roster[0]!.character_instance_id);
    if (input.mentionedCharacterInstanceIds.some((id) => !rosterIds.has(id))) {
      throw new AppError(
        "VALIDATION_FAILED",
        "A mentioned companion is no longer in this group.",
        422,
      );
    }
    if (input.photoSubjectCharacterInstanceIds.some((id) => !rosterIds.has(id))) {
      throw new AppError(
        "VALIDATION_FAILED",
        "A selected photo companion is no longer in this group.",
        422,
      );
    }
    if (
      input.manualSpeakerInstanceId &&
      !rosterIds.has(input.manualSpeakerInstanceId)
    ) {
      throw new AppError(
        "VALIDATION_FAILED",
        "That companion is no longer in this group.",
        422,
      );
    }
    const messageText = normalizedMessage || "[Photo]";
    const requestFingerprint = await chatRequestFingerprint({
      conversationId: conversation.id,
      message: normalizedMessage,
      attachmentIds: [...input.attachmentIds].sort(),
      mentionedCharacterInstanceIds: [...input.mentionedCharacterInstanceIds].sort(),
      photoSubjectCharacterInstanceIds: [...input.photoSubjectCharacterInstanceIds].sort(),
      replyToMessageId: input.replyToMessageId ?? null,
      manualSpeakerInstanceId: input.manualSpeakerInstanceId ?? null,
      letThemTalk: input.letThemTalk,
    });
    const existingUserMessage = await findExistingChatRequest(db, {
      userId: user.id,
      conversationId: conversation.id,
      requestId,
      fingerprint: requestFingerprint,
      expectedContent: messageText,
      characterInstanceId: anchor,
    });
    if (existingUserMessage) {
      const { data: existingTurn } = await db.from("together_dialogue_turns")
        .select("*").eq("source_message_id", existingUserMessage.id).maybeSingle();
      const { data: existingMessages } = existingTurn
        ? await db.from("together_messages").select("*").eq("user_id",user.id).eq(
          "dialogue_turn_id",
          existingTurn.id,
        ).order("conversation_sequence")
        : ({ data: [] } as any);
      if ((existingMessages?.length ?? 0) > 0 || existingTurn?.state === "completed" || existingTurn?.state === "yielded") {
        if (existingTurn?.state !== "planning" && existingTurn?.state !== "generating") {
          return completedReplay(correlationId, existingTurn, existingMessages ?? []);
        }
      }
      if (existingTurn?.state === "planning" || existingTurn?.state === "generating") {
        const replay = await waitForCompletedGroupTurn(db,user.id,existingTurn.id);
        if(replay)return completedReplay(correlationId,replay.turn,replay.messages);
        throw new AppError("PROVIDER_TIMEOUT","The group is still finishing that reply. Reconnect in a moment.",503,true);
      }
    }
    let attachments: Record<string, any>[] = [];
    if (input.attachmentIds.length) {
      let attachmentQuery = db.from("together_conversation_attachments").select("*").in("id", input.attachmentIds)
        .eq("user_id", user.id).eq("continuity_id", continuity.id).eq("conversation_id", conversation.id)
        .eq("kind", "image").eq("upload_status", "uploaded");
      attachmentQuery = existingUserMessage
        ? attachmentQuery.eq("message_id", existingUserMessage.id)
        : attachmentQuery.is("message_id", null);
      const attachmentResult = await attachmentQuery;
      attachments = attachmentResult.data ?? [];
      if (attachmentResult.error || attachments.length !== input.attachmentIds.length) {
        throw new AppError("VALIDATION_FAILED", "One of those photos is no longer available to send.", 422);
      }
    }
    if (!existingUserMessage) await enforceRateLimit(db, user.id, "together_dialogue", 80, 3600);
    let replyTargetId: string | undefined;
    if (input.replyToMessageId) {
      const { data: reply } = await db.from("together_messages").select(
        "speaker_character_instance_id,character_instance_id",
      ).eq("id", input.replyToMessageId).eq("conversation_id", conversation.id)
        .maybeSingle();
      if (!reply) {
        throw new AppError(
          "NOT_FOUND",
          "That replied-to message is unavailable.",
          404,
        );
      }
      replyTargetId = String(
        reply.speaker_character_instance_id ?? reply.character_instance_id ??
          "",
      ) || undefined;
      if (replyTargetId && !rosterIds.has(replyTargetId)) {
        replyTargetId = undefined;
      }
    }
    turnLease = await beginConversationTurn(db, {
      userId: user.id,
      continuityId: continuity.id,
      conversationId: conversation.id,
      requestId,
      kind: "group",
      supersedeGenerating: true,
      leaseSeconds: 240,
    });
    if (!turnLease.acquired) {
      throw new AppError(
        "CONFLICT",
        turnLease.requestId === requestId
          ? "That group turn is still finishing."
          : "The group is preparing another message. Try again in a moment.",
        409,
        true,
      );
    }
    if (existingUserMessage) {
      await enforceRateLimit(db, user.id, "together_dialogue_retry", 12, 3600);
    }
    if (turnLease.interruptedCount) {
      await track(db, user.id, "group_turn_interrupted", {
        conversationId: conversation.id,
        interruptedTurnCount: turnLease.interruptedCount,
      });
    }
    const userClaim = existingUserMessage
      ? { message: existingUserMessage, created: false }
      : await claimChatUserMessage(db, {
        userId: user.id,
        continuityId: continuity.id,
        conversationId: conversation.id,
        characterInstanceId: anchor,
        content: messageText,
        requestId,
        attachmentIds: input.attachmentIds,
        replyToMessageId: input.replyToMessageId,
        mentionedCharacterInstanceIds: input.mentionedCharacterInstanceIds,
        providerMetadata: {
          source: "group_chat",
          mentions: input.mentionedCharacterInstanceIds,
          replyToMessageId: input.replyToMessageId ?? null,
          requestFingerprint,
          requestAttachmentIds: [...input.attachmentIds].sort(),
        },
      });
    const userMessage = userClaim.message;
    if (userClaim.created && attachments.length) {
      await track(db, user.id, "user_photo_sent", {
        attachmentCount: attachments.length,
        groupChat: true,
      });
    }
    const [recent, signals] = await Promise.all([
      db.from("together_messages").select(
        "speaker_character_instance_id,character_instance_id",
      ).eq("conversation_id", conversation.id).eq("role", "assistant").order(
        "conversation_sequence",
        { ascending: false },
      ).limit(12),
      loadGroupDirectorSignals(db, user.id, continuity.id, roster),
    ]);
    const recentIds = (recent.data ?? []).map((row: any) =>
      String(row.speaker_character_instance_id ?? row.character_instance_id)
    );
    const candidates = groupCandidates(roster, recentIds, messageText, signals);
    const settings = normalizeGroupSettings(conversation.metadata);
    const photoIntent = classifyPhotoRequest(messageText),
      requestedPhotoSpeaker = input.photoSubjectCharacterInstanceIds[0] ??
        input.manualSpeakerInstanceId,
      basePlan = planGroupTurn({
        message: messageText,
        candidates,
        mentionedCharacterInstanceIds: input.mentionedCharacterInstanceIds,
        replyToCharacterInstanceId: replyTargetId,
        manualSpeakerInstanceId: requestedPhotoSpeaker,
        energy: settings.energy,
        letThemTalk: input.letThemTalk,
      });
    const directed = await refineAmbiguousGroupPlan({
      plan: basePlan,
      message: messageText,
      candidates,
      usageScope: {
        db,
        userId: user.id,
        continuityId: continuity.id,
        conversationId: conversation.id,
        subscriptionTier: subscription.tier,
        correlationId,
        metadata: { groupChat: true },
      },
    });
    if (input.photoSubjectCharacterInstanceIds.length && !photoIntent.requested) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Describe the photo you want the group to send.",
        422,
      );
    }
    const photoSubjects = photoIntent.requested && directed.plan.actions[0]
      ? resolveGroupPhotoSubjects({
        text: messageText,
        participants: roster.map((row: any) => ({
          characterInstanceId: String(row.character_instance_id),
          name: String(
            row.together_character_instances?.together_character_templates
              ?.name ?? "Companion",
          ),
        })),
        mentionedCharacterInstanceIds: input.mentionedCharacterInstanceIds,
        explicitSubjectCharacterInstanceIds:
          input.photoSubjectCharacterInstanceIds,
        fallbackSpeakerCharacterInstanceId:
          directed.plan.actions[0].characterInstanceId,
        maxSubjects: 2,
      })
      : null;
    if (photoSubjects && !photoSubjects.ok) {
      throw new AppError("VALIDATION_FAILED", photoSubjects.message, 422);
    }
    const plan = photoIntent.requested && photoSubjects?.ok &&
        directed.plan.actions[0]
      ? {
        ...directed.plan,
        actions: [{
          ...directed.plan.actions[0],
          type: "message" as const,
          intent: "media_offer",
          reasonCodes: [
            ...directed.plan.actions[0].reasonCodes,
            photoSubjects.subjectCharacterInstanceIds.length > 1
              ? "group_photo_media_offer"
              : "single_subject_media_offer",
          ],
        }],
        continuationBudget: 0,
      }
      : directed.plan;
    const turn = await activateConversationTurn(db, turnLease, {
      sourceMessageId: String(userMessage.id),
      plannedActions: plan.actions,
      metadata: {
        energy: settings.energy,
        responseMode: settings.responseMode,
        letThemTalk: input.letThemTalk,
        reasonCodes: plan.reasonCodes,
      },
      leaseSeconds: 240,
    });
    await track(db, user.id, "group_message_sent", {
      conversationId: conversation.id,
      participantCount: roster.length,
      mode: settings.responseMode,
      energy: settings.energy,
    });
    await track(db, user.id, "group_director_planned", {
      conversationId: conversation.id,
      participantCount: roster.length,
      mode: settings.responseMode,
      energy: settings.energy,
      replyCount: plan.actions.filter((action) =>
        action.type === "message"
      ).length,
      reactionCount: plan.actions.filter((action) =>
        action.type === "reaction"
      ).length,
      directorUsed: plan.directorUsed,
      reasonCode: plan.reasonCodes[0],
    });
    if (input.manualSpeakerInstanceId) {
      await track(db, user.id, "group_manual_speaker_selected", {
        conversationId: conversation.id,
        characterInstanceId: input.manualSpeakerInstanceId,
      });
    }
    if (input.letThemTalk) {
      await track(db, user.id, "group_let_them_talk_started", {
        conversationId: conversation.id,
        participantCount: roster.length,
        energy: settings.energy,
      });
    }
    return groupStream({
      db,
      userId: user.id,
      continuityId: continuity.id,
      conversation,
      roster,
      input,
      userMessage,
      turn,
      turnLease,
      plan,
      photoIntent,
      photoSubjectCharacterInstanceIds: photoSubjects?.ok
        ? photoSubjects.subjectCharacterInstanceIds
        : [],
      settings,
      subscription,
      correlationId,
    });
  } catch (error) {
    if (turnLease?.acquired && turnDb) {
      await finishConversationTurn(turnDb, turnLease, "failed", {
        errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      });
    }
    return errorResponse(error, correlationId);
  }
});

function groupStream(input: any): Response {
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          open = false;
        }
      };
      const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 4000);
      try {
        emit({
          type: "turn_started",
          turnId: input.turn.id,
          sourceMessage: input.userMessage,
          actions: input.plan.actions.length,
        });
        let lastMessage = input.userMessage,
          latestSpeakerId = "",
          replyCount = 0,
          reactionCount = 0,
          continuationIndex = 0;
        const actualActions: GroupTurnAction[] = [];
        const usedInitialActionIds = new Set<string>();
        let action: GroupTurnAction | null =
          (input.plan.actions as GroupTurnAction[])[0] ?? null;
        while (action) {
          if (!await touchConversationTurn(input.db, input.turnLease, 240)) {
            emit({ type: "turn_cancelled", turnId: input.turn.id });
            return;
          }
          const { data: liveTurn } = await input.db.from(
            "together_dialogue_turns",
          ).select("state,version").eq("id", input.turn.id).maybeSingle();
          if (
            liveTurn?.state !== "generating" ||
            Number(liveTurn.version) !== Number(input.turn.version)
          ) {
            emit({ type: "turn_cancelled", turnId: input.turn.id });
            return;
          }
          const liveRoster = await activeGroupParticipants(input.db, {
            userId: input.userId,
            continuityId: input.continuityId,
            conversationId: input.conversation.id,
          });
          const participant = liveRoster.find((row: any) =>
            String(row.character_instance_id) === action!.characterInstanceId
          );
          if (!participant) {
            emit({ type: "turn_cancelled", turnId: input.turn.id });
            return;
          }
          const instance = participant.together_character_instances ?? {},
            template = instance.together_character_templates ?? {};
          const speakerName = String(template.name ?? "Companion");
          usedInitialActionIds.add(action.id);
          actualActions.push(action);
          if (action.type === "reaction") {
            const { data: reactionId } = await input.db.rpc(
              "kivelle_commit_group_reaction",
              {
                p_turn_id: input.turn.id,
                p_version: input.turn.version,
                p_speaker_character_instance_id: action.characterInstanceId,
                p_message_id: lastMessage.id,
                p_reaction: action.reaction ?? "👀",
                p_metadata: { reasonCodes: action.reasonCodes },
              },
            );
            if (!reactionId) {
              emit({ type: "turn_cancelled", turnId: input.turn.id });
              return;
            }
            const { data: reaction } = await input.db.from(
              "together_message_reactions",
            ).select("*").eq("id", reactionId).single();
            reactionCount += 1;
            emit({ type: "reaction_added", reaction });
            await track(input.db, input.userId, "group_character_reacted", {
              conversationId: input.conversation.id,
              characterInstanceId: action.characterInstanceId,
              reasonCode: action.reasonCodes[0],
            });
            break;
          }
          if (action.intent !== "media_offer") {
            emit({
              type: "speaker_typing",
              characterInstanceId: action.characterInstanceId,
              speakerName,
            });
            emit({
              type: "message_started",
              characterInstanceId: action.characterInstanceId,
              speakerName,
            });
          }
          const selected = await buildIsolatedSpeakerContext({
            db: input.db,
            userId: input.userId,
            continuityId: input.continuityId,
            conversation: input.conversation,
            speakerCharacterInstanceId: action.characterInstanceId,
            userMessage: String(
              input.userMessage.content ?? input.input.message,
            ),
            attachments: input.userMessage.together_conversation_attachments ??
              [],
            correlationId: input.correlationId,
          });
          const context: any = selected.context;
          assertSpeakerPrivateContext(context, action.characterInstanceId);
          context.sceneSpeakerDirective = {
            characterInstanceId: action.characterInstanceId,
            name: speakerName,
          };
          context.groupContext = {
            conversationId: input.conversation.id,
            title: input.conversation.title,
            participants: liveRoster.map((row: any) => ({
              characterInstanceId: String(row.character_instance_id),
              name: String(
                row.together_character_instances?.together_character_templates
                  ?.name ?? "Companion",
              ),
            })),
            energy: input.settings.energy,
            action,
          };
          const activeGroupPlan = context.currentScene.activePlan;
          const groupIsTogether = Boolean(
            activeGroupPlan &&
            activeGroupPlan.sourceConversationId === input.conversation.id &&
            activeGroupPlan.status === "active" &&
            !activeGroupPlan.planAwaitingUser &&
            activeGroupPlan.participantInstanceIds?.includes(
              action.characterInstanceId,
            ),
          );
          context.currentScene = {
            ...context.currentScene,
            interactionMode: groupIsTogether ? "co_present" : "remote",
            entryReason: groupIsTogether ? "shared_plan" : "direct_chat",
            sceneBehavior: {
              acknowledgeArrival: false,
              activityAwareness: groupIsTogether,
              departurePressure: groupIsTogether
                ? context.currentScene.sceneBehavior.departurePressure
                : false,
            },
          };
          const { data: profile } = await input.db.from("together_profiles")
            .select("age_verified_at,content_preferences").eq(
              "user_id",
              input.userId,
            ).maybeSingle();
          const requestedMode = conversationDialogueContentMode(
            profile,
            input.conversation,
          ) as DialogueContentMode;
          const canonicalUserText = String(
            input.userMessage.content ?? input.input.message,
          );
          const inputSafety = await moderation.check(canonicalUserText, {
            db: input.db,
            userId: input.userId,
            continuityId: input.continuityId,
            conversationId: input.conversation.id,
            characterInstanceId: action.characterInstanceId,
            subscriptionTier: input.subscription.tier,
            contentMode: requestedMode,
            correlationId: input.correlationId,
            metadata: { direction: "input", groupChat: true },
          });
          const routeInput = {
            message: canonicalUserText,
            recentTurns: (context.recent ?? []).slice(-8).map((row: any) => ({
              role: row.role,
              content: row.content,
            })),
            requestedMode,
            ageVerified: Boolean(profile?.age_verified_at),
            characterAge: Number(context.character?.age ?? 0) || null,
            relationshipAllowsExplicit:
              context.relationship?.romance_enabled !== false &&
              context.relationship?.romance_path_status !== "friends_only",
            photoRequest: action.intent === "media_offer",
            moderation: inputSafety,
          };
          let route = resolveDialogueRouting(routeInput);
          if (route.hardBlocked) {
            const boundary = `I'm not going to take this conversation there.`;
            const committed = await commitMessage(input, action, boundary, {
              provider: "deterministic",
              model: "kivelle-boundary",
              routeReason: route.reason,
              contentMode: route.resolvedMode,
              speakerName,
              speakerSlug: template.slug,
              directorReasonCodes: action.reasonCodes,
            });
            const saved=committed?.message;
            if (!saved) {
              emit({ type: "turn_cancelled", turnId: input.turn.id });
              return;
            }
            lastMessage = saved;
            replyCount += 1;
            emit({ type: "message_completed", message: saved });
            break;
          }
          if (action.intent === "media_offer") {
            const committed = await commitMessage(input, action, "[Photo]", {
              provider: "kivelle-media",
              mediaOnly: true,
              speakerName,
              speakerSlug: template.slug,
              directorReasonCodes: action.reasonCodes,
              groupEnergy: input.settings.energy,
            });
            const saved=committed?.message;
            if (!saved) {
              emit({ type: "turn_cancelled", turnId: input.turn.id });
              return;
            }
            const firstName = speakerName.trim().split(/\s+/)[0] || speakerName;
            const photoSubjectIds = input.photoSubjectCharacterInstanceIds
              .length
              ? input.photoSubjectCharacterInstanceIds
              : [action.characterInstanceId];
            const offer = await createMediaOffer(input.db, {
              userId: input.userId,
              characterInstanceId: photoSubjectIds[0],
              subjectCharacterInstanceIds: photoSubjectIds,
              source: "user_request",
              conversationId: input.conversation.id,
              messageId: String(saved.id),
              offerKey: `group_request:${
                String(input.userMessage.id)
              }:${photoSubjectIds.join(":")}`,
              title: "Picture request",
              companionMessage: photoSubjectIds.length > 1
                ? `${firstName} wants to send you a picture of them together`
                : `${firstName} wants to send you a picture`,
              contentLevel: input.photoIntent.requestedContentLevel ??
                "standard",
              shotType: input.photoIntent.shotPreference ?? "selfie",
              previewMetadata: {
                requestText: canonicalUserText.slice(0, 400),
                groupChat: true,
                senderCharacterInstanceId: action.characterInstanceId,
                subjectCharacterInstanceIds: photoSubjectIds,
              },
            });
            if (!offer) {
              throw new AppError(
                "CONFLICT",
                "Photo generation is turned off in your media settings.",
                409,
              );
            }
            lastMessage = saved;
            latestSpeakerId = action.characterInstanceId;
            replyCount += 1;
            emit({ type: "message_completed", message: saved });
            emit({ type: "media_offer_created", offer });
            if(committed.created)await track(input.db, input.userId, "group_character_spoke", {
              conversationId: input.conversation.id,
              characterInstanceId: action.characterInstanceId,
              reasonCode: photoSubjectIds.length > 1
                ? "group_photo_media_offer"
                : "single_subject_media_offer",
              subjectCount: photoSubjectIds.length,
            });
            break;
          }
          if (route.provider === "xai") {
            await enforceExplicitDialogueAllowance(
              input.db,
              input.userId,
              input.subscription.capabilities,
            );
          }
          context.contentMode = route.resolvedMode;
          context.dialogueRouting = {
            provider: route.provider,
            reason: route.reason,
            classification: route.classification,
            requestedMode: route.requestedMode,
            contentMode: route.resolvedMode,
            explicit: route.explicit,
          };
          context.intimacyStance = compileIntimacyStance({
            message: canonicalUserText,
            recentTurns: context.recent ?? [],
            relationship: { ...context.relationship, spiceLevel: context.character?.spice_level, personality: context.character?.personality_config },
            personality: context.character?.personality_config,
            interactionMode: String(context.currentScene?.interactionMode ?? "remote"),
            availability: String(context.currentScene?.interruptibility ?? context.currentScene?.availability ?? "open"),
            requestedMode,
          });
          await attachAuthoredDepthContext({
            db: input.db,
            userId: input.userId,
            continuityId: input.continuityId,
            conversationId: input.conversation.id,
            characterInstanceId: action.characterInstanceId,
            characterVersionId: String(selected.instance.character_version_id ?? ""),
            context,
          });
          const usageScope = {
            db: input.db,
            userId: input.userId,
            continuityId: input.continuityId,
            conversationId: input.conversation.id,
            characterInstanceId: action.characterInstanceId,
            subscriptionTier: input.subscription.tier,
            routeReason: route.reason,
            contentMode: route.resolvedMode,
            correlationId: input.correlationId,
            metadata: { groupChat: true, turnId: input.turn.id },
          };
          const options: DialogueRunOptions = {
            route,
            usageScope,
            operation: route.provider === "xai"
              ? "group_dialogue_xai"
              : "group_dialogue",
          };
          const generated = await dialogue.generate(context, options);
          if (!generated.text.trim()) break;
          const outputSafety = await moderation.check(generated.text, {
            ...usageScope,
            metadata: { direction: "output", groupChat: true },
          });
          const text = outputSafety.allowed
            ? generated.text
            : `Let's change the subject.`;
          const committed = await commitMessage(input, action, text, {
            ...generated.metadata,
            speakerName,
            speakerSlug: template.slug,
            directorReasonCodes: action.reasonCodes,
            groupEnergy: input.settings.energy,
          });
          const saved=committed?.message;
          if (!saved) {
            emit({ type: "turn_cancelled", turnId: input.turn.id });
            return;
          }
          lastMessage = saved;
          latestSpeakerId = action.characterInstanceId;
          replyCount += 1;
          emit({ type: "message_completed", message: saved });
          if(!committed.created)break;
          await maybeCreateGroupLocationPlanCandidate(input.db, {
            userId: input.userId,
            conversationId: input.conversation.id,
            characterInstanceId: action.characterInstanceId,
            assistantMessageId: String(saved.id),
            assistantText: text,
            context,
          }).catch((error) => console.error(JSON.stringify({
            level: "warn",
            operation: "group_location_plan_candidate",
            conversationId: input.conversation.id,
            code: error instanceof Error ? error.name : "unknown_error",
          })));
          if (action.intent === "answer_user") {
            await recordDirectedGroupRelationshipTurn(input.db, {
              userId: input.userId,
              continuityId: input.continuityId,
              characterInstanceId: action.characterInstanceId,
            });
          }
          await applyDetectedGroupSocialEvent(input.db, {
            userId: input.userId,
            continuityId: input.continuityId,
            speakerId: action.characterInstanceId,
            addresseeInstanceIds: action.addresseeInstanceIds,
            text,
            roster: liveRoster,
            conversationId: input.conversation.id,
          });
          await track(input.db, input.userId, "group_character_spoke", {
            conversationId: input.conversation.id,
            characterInstanceId: action.characterInstanceId,
            reasonCode: action.reasonCodes[0],
          });
          if (continuationIndex >= Number(input.plan.continuationBudget ?? 0)) {
            break;
          }
          const [recent, signals] = await Promise.all([
            input.db.from("together_messages").select(
              "speaker_character_instance_id,character_instance_id",
            ).eq("conversation_id", input.conversation.id).eq(
              "role",
              "assistant",
            ).order("conversation_sequence", { ascending: false }).limit(12),
            loadGroupDirectorSignals(
              input.db,
              input.userId,
              input.continuityId,
              liveRoster,
            ),
          ]);
          const recentIds = (recent.data ?? []).map((row: any) =>
            String(
              row.speaker_character_instance_id ?? row.character_instance_id,
            )
          );
          const next = planGroupContinuation({
            originatingMessage: String(
              input.userMessage.content ?? input.input.message,
            ),
            latestMessage: String(lastMessage.content ?? ""),
            latestSpeakerCharacterInstanceId: latestSpeakerId,
            candidates: groupCandidates(
              liveRoster,
              recentIds,
              String(lastMessage.content ?? ""),
              signals,
            ),
            alreadySpokeCharacterInstanceIds: actualActions.filter((item) =>
              item.type === "message"
            ).map((item) => item.characterInstanceId),
            preferredActions: (input.plan.actions as GroupTurnAction[]).slice(1)
              .filter((item) => !usedInitialActionIds.has(item.id)),
            energy: input.settings.energy,
            letThemTalk: Boolean(input.input.letThemTalk),
            continuationIndex: continuationIndex + 1,
          });
          if (!next) break;
          continuationIndex += 1;
          const nextActions = [...actualActions, next];
          const { data: stillLive } = await input.db.from(
            "together_dialogue_turns",
          ).update({
            planned_actions: nextActions,
            updated_at: new Date().toISOString(),
          }).eq("id", input.turn.id).eq("state", "generating").eq(
            "version",
            input.turn.version,
          ).select("id").maybeSingle();
          if (!stillLive) {
            emit({ type: "turn_cancelled", turnId: input.turn.id });
            return;
          }
          action = next;
        }
        const finished = await finishConversationTurn(
          input.db,
          input.turnLease,
          "completed",
        );
        if (!finished) {
          emit({ type: "turn_cancelled", turnId: input.turn.id });
          return;
        }
        await persistWitnessedGroupMemories(input.db, {
          userId: input.userId,
          continuityId: input.continuityId,
          conversationId: input.conversation.id,
          sourceMessage: input.userMessage,
          participants: input.roster,
        });
        await updateAttributedGroupSummary(
          input.db,
          input.conversation.id,
          input.userId,
        );
        waitUntil(consolidateConversationEpisodes({
          db:input.db,userId:input.userId,conversationId:input.conversation.id,
          embed:(text)=>episodeEmbeddings.embed(text,{db:input.db,userId:input.userId,continuityId:input.continuityId,conversationId:input.conversation.id,purpose:"group_conversation_episode"}),
        }).catch((error)=>console.warn(JSON.stringify({level:"warn",operation:"group_episode_consolidation",conversationId:input.conversation.id,message:error instanceof Error?error.message:"unknown_error"}))));
        await track(input.db, input.userId, "group_turn_yielded", {
          conversationId: input.conversation.id,
          replyCount,
          reactionCount,
        });
        if (input.input.letThemTalk) {
          await track(input.db, input.userId, "group_let_them_talk_completed", {
            conversationId: input.conversation.id,
            replyCount,
            reactionCount,
          });
        }
        emit({
          type: "turn_yielded",
          turnId: input.turn.id,
          replyCount,
          reactionCount,
        });
      } catch (error) {
        await finishConversationTurn(input.db, input.turnLease, "failed", {
          errorCode: error instanceof AppError
            ? error.code
            : "PROVIDER_UNAVAILABLE",
        });
        const safe = error instanceof AppError ? error : new AppError(
          "PROVIDER_UNAVAILABLE",
          "The group needs a moment before replying.",
          503,
          true,
        );
        emit({
          type: "error",
          error: {
            code: safe.code,
            message: safe.message,
            retryable: safe.retryable,
          },
        });
      } finally {
        clearInterval(heartbeat);
        if (open) {
          controller.close();
          open = false;
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Correlation-ID": input.correlationId,
    },
  });
}

async function maybeCreateGroupLocationPlanCandidate(db: any, input: {
  userId: string;
  conversationId: string;
  characterInstanceId: string;
  assistantMessageId: string;
  assistantText: string;
  context: Record<string, any>;
}) {
  const activePlan = input.context.currentScene?.activePlan;
  if (activePlan?.sourceConversationId === input.conversationId &&
    ["scheduled", "active"].includes(String(activePlan.status))) return null;
  const worldId = String(
    input.context.place?.world?.id ?? input.context.location?.world_id ?? "",
  );
  if (!worldId) return null;
  let locations: PlannableLocationMention[] = (input.context.planningCatalog ?? [])
    .map((item: Record<string, any>) => ({
      id: String(item.id),
      worldId: String(item.worldId),
      worldSlug: String(item.worldSlug ?? input.context.place?.world?.slug ?? ""),
      name: String(item.name),
      slug: String(item.slug),
      category: String(item.category),
      activities: (item.activities ?? []).map(String),
      dateTypes: (item.dateTypes ?? []).map(String),
      aliases: (item.aliases ?? []).map(String),
      private: item.privacy === "private",
    }));
  if (!locations.length) {
    const { data, error } = await db.from("together_locations").select(
      "id,world_id,name,slug,category,possible_activities,metadata,together_worlds(slug)",
    ).eq("world_id", worldId);
    if (error) return null;
    locations = (data ?? []).map((item: Record<string, any>) => ({
      id: String(item.id),
      worldId: String(item.world_id),
      worldSlug: String(item.together_worlds?.slug ?? input.context.place?.world?.slug ?? ""),
      name: String(item.name),
      slug: String(item.slug),
      category: String(item.category),
      activities: (item.possible_activities ?? []).map(String),
      dateTypes: (item.metadata?.date_types ?? []).map(String),
      aliases: (item.metadata?.aliases ?? []).map(String),
      private: item.metadata?.private === true,
    }));
  }
  const currentLocationId = String(input.context.currentScene?.locationId ?? "");
  const match = matchAssistantLocationPlan(input.assistantText, locations, {
    excludeLocationIds: currentLocationId ? [currentLocationId] : [],
  });
  if (!match) return null;
  const { data: pending } = await db.from("together_conversation_actions")
    .select("id,payload").eq("user_id", input.userId).eq(
      "conversation_id",
      input.conversationId,
    ).eq("status", "pending").limit(20);
  if ((pending ?? []).some((item: Record<string, any>) =>
    String(item.payload?.locationId ?? "") === match.locationId
  )) return null;
  const now = new Date();
  const { data: dismissals } = await db.from("together_conversation_actions")
    .select("payload,updated_at").eq("user_id", input.userId).eq(
      "conversation_id",
      input.conversationId,
    ).eq("candidate_type", "plan_create").eq("status", "dismissed").gte(
      "updated_at",
      new Date(now.getTime() - LOCATION_PLAN_DISMISSAL_COOLDOWN_MS).toISOString(),
    ).order("updated_at", { ascending: false }).limit(20);
  if (isLocationPlanDismissalCoolingDown(match.locationId, dismissals ?? [], now)) {
    return null;
  }
  const payload = {
    activityIntent: match.activityLabel,
    activityKey: match.activityKey,
    locationId: match.locationId,
    location: match.locationName,
    locationSlug: match.locationSlug,
    worldSlug: match.worldSlug,
    title: match.title,
    trigger: "assistant_location_mention",
    reasoningCode: "assistant_location_mention",
    matchedPhrase: match.matchedPhrase,
    requiresConfirmation: true,
    groupPlan: true,
  };
  const { data: created, error: createError } = await db.from(
    "together_conversation_actions",
  ).insert({
    user_id: input.userId,
    character_instance_id: input.characterInstanceId,
    conversation_id: input.conversationId,
    assistant_message_id: input.assistantMessageId,
    candidate_type: "plan_create",
    status: "pending",
    payload,
    confidence: .96,
    expires_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    updated_at: now.toISOString(),
  }).select("*").maybeSingle();
  if (createError || !created) return null;
  await writeConversationEvent(db, {
    userId: input.userId,
    characterInstanceId: input.characterInstanceId,
    conversationId: input.conversationId,
    eventType: "plan_proposed",
    entityType: "conversation_action",
    entityId: created.id,
    metadata: { ...payload, candidateType: "plan_create", resolution: "pending" },
  });
  await track(db, input.userId, "plan_proposal_created", {
    type: "plan_create",
    conversationId: input.conversationId,
    source: "group_chat_location_mention",
  });
  return created;
}

async function commitMessage(
  input: any,
  action: GroupTurnAction,
  content: string,
  metadata: Record<string, unknown>,
) {
  const { data } = await input.db.rpc("kivelle_commit_group_message_v2", {
    p_turn_id: input.turn.id,
    p_version: input.turn.version,
    p_speaker_character_instance_id: action.characterInstanceId,
    p_content: content,
    p_provider_metadata: { ...metadata, groupActionId: action.id },
  });
  const committed=Array.isArray(data)?data[0]:data;
  if (!committed?.message_id) return null;
  const { data: message } = await input.db.from("together_messages").select("*").eq(
    "id",
    committed.message_id,
  ).single();
  return message?{message,created:committed.created===true}:null;
}
type GroupDirectorSignals = {
  relationships: Map<string, any>;
  social: Map<string, { affinity: number; tension: number }>;
};
async function loadGroupDirectorSignals(
  db: any,
  userId: string,
  continuityId: string,
  roster: any[],
): Promise<GroupDirectorSignals> {
  const ids = roster.map((row) => String(row.character_instance_id));
  const [relationships, socialRows] = await Promise.all([
    db.from("together_relationship_states").select(
      "character_instance_id,affinity,familiarity,trust,comfort,conflict",
    ).eq("user_id", userId).eq("continuity_id", continuityId).in(
      "character_instance_id",
      ids,
    ),
    db.from("together_character_social_states").select(
      "character_a_instance_id,character_b_instance_id,affinity,tension",
    ).eq("user_id", userId).eq("continuity_id", continuityId),
  ]);
  const relationshipMap = new Map<string, any>(
      (relationships.data ?? []).map((
        row: any,
      ) => [String(row.character_instance_id), row]),
    ),
    social = new Map<string, { affinity: number; tension: number }>();
  for (const id of ids) {
    const relevant = (socialRows.data ?? []).filter((row: any) =>
      String(row.character_a_instance_id) === id ||
      String(row.character_b_instance_id) === id
    );
    social.set(id, {
      affinity: relevant.length
        ? average(relevant.map((row: any) => Number(row.affinity ?? 50))) / 100
        : .5,
      tension: relevant.length
        ? average(relevant.map((row: any) => Number(row.tension ?? 0))) / 100
        : 0,
    });
  }
  return { relationships: relationshipMap, social };
}
function groupCandidates(
  roster: any[],
  recentSpeakerIds: string[],
  message = "",
  signals: GroupDirectorSignals = {
    relationships: new Map(),
    social: new Map(),
  },
): GroupSpeakerCandidate[] {
  const terms = message.normalize("NFKC").toLocaleLowerCase().split(
    /[^\p{L}\p{N}]+/u,
  ).filter((term) => term.length >= 4);
  return roster.map((participant) => {
    const instance = participant.together_character_instances ?? {},
      template = instance.together_character_templates ?? {},
      version = instance.together_character_versions ?? {},
      personality = version.personality_config ?? {},
      id = String(instance.id),
      relationship = signals.relationships.get(id) ?? {},
      social = signals.social.get(id) ?? { affinity: .5, tension: 0 },
      activity = String(instance.current_activity ?? ""),
      interruptibility = String(instance.current_interruptibility ?? "open"),
      busy = /\b(?:work|meeting|shift|appointment|driving|asleep|sleeping)\b/i
        .test(activity);
    const recentSpeakerCount = recentSpeakerIds.filter((speakerId) =>
      speakerId === id
    ).length;
    let consecutiveSpeakerCount = 0;
    for (const speakerId of recentSpeakerIds) {
      if (speakerId !== id) break;
      consecutiveSpeakerCount += 1;
    }
    const knowledgeText = `${template.name ?? ""} ${
        template.occupation ?? ""
      } ${template.archetype ?? ""} ${
        (template.tags ?? []).join?.(" ") ?? ""
      } ${activity}`.toLocaleLowerCase(),
      matches = terms.filter((term) => knowledgeText.includes(term)).length;
    return {
      characterInstanceId: id,
      name: String(template.name ?? "Companion"),
      available: !["unavailable", "sleeping"].includes(interruptibility) &&
        !/\b(?:asleep|sleeping)\b/i.test(activity),
      socialEnergy: Math.max(
        0,
        Math.min(
          1,
          Number(personality.social_energy ?? personality.extraversion ?? .5) -
            (busy ? .2 : 0),
        ),
      ),
      directness: Number(personality.directness ?? .5),
      knowledgeRelevance: Math.min(1, .35 + matches * .18),
      relationshipRelevance: Math.min(
        1,
        (Number(relationship.trust ?? 0) +
          Number(relationship.familiarity ?? 0) +
          Number(relationship.comfort ?? 0)) / 300,
      ),
      affinityWithUser: Math.min(1, Number(relationship.affinity ?? 50) / 100),
      affinityWithOthers: social.affinity,
      tensionWithOthers: social.tension,
      recentSpeakerCount,
      consecutiveSpeakerCount,
    };
  });
}
function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 50;
}
async function persistWitnessedGroupMemories(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    conversationId: string;
    sourceMessage: any;
    participants: any[];
  },
) {
  const candidates = extractMemoryCandidates(
    String(input.sourceMessage.content ?? ""),
  ).filter((candidate: any) => candidate.confidence >= .8);
  if (!candidates.length) return;
  const { data: active } = await db.from("together_conversation_participants")
    .select(
      "character_instance_id,witnessed_from_sequence,witnessed_to_sequence",
    ).eq("conversation_id", input.conversationId).is("left_at", null).lte(
      "witnessed_from_sequence",
      Number(input.sourceMessage.conversation_sequence),
    );
  const recipients = (active ?? []).filter((participant: any) =>
    participant.witnessed_to_sequence == null ||
    Number(participant.witnessed_to_sequence) >=
      Number(input.sourceMessage.conversation_sequence)
  );
  const rows = recipients.flatMap((participant: any) =>
    candidates.map((candidate: any) => ({
      user_id: input.userId,
      continuity_id: input.continuityId,
      character_instance_id: String(participant.character_instance_id),
      memory_type: candidate.memoryType,
      canonical_text: candidate.canonicalText,
      dedupe_key: candidate.dedupeKey,
      subject_key: candidate.dedupeKey,
      importance: candidate.importance,
      confidence: candidate.confidence,
      sensitivity_category: candidate.sensitivityCategory ?? "none",
      source_message_id: input.sourceMessage.id,
      status: "active",
      pinned: false,
      visibility: "group_visible",
      group_conversation_id: input.conversationId,
      learned_conversation_sequence: input.sourceMessage.conversation_sequence,
      metadata: {
        ...(candidate.metadata ?? {}),
        learnedInGroup: true,
        conversationId: input.conversationId,
      },
    }))
  );
  if (rows.length) {
    await db.from("together_memories").upsert(rows, {
      onConflict: "character_instance_id,dedupe_key",
    });
  }
}
async function updateAttributedGroupSummary(
  db: any,
  conversationId: string,
  userId: string,
) {
  const [{ data }, { data: participants }] = await Promise.all([
    db.from("together_messages").select(
      "role,content,speaker_character_instance_id,character_instance_id,provider_metadata,conversation_sequence",
    ).eq("conversation_id", conversationId).order("conversation_sequence", {
      ascending: false,
    }).limit(30),
    db.from("together_conversation_participants").select(
      "id,witnessed_from_sequence,witnessed_to_sequence,metadata",
    ).eq("conversation_id", conversationId).eq("user_id", userId).is(
      "left_at",
      null,
    ),
  ]);
  if (!data?.length) return;
  const chronological = data.reverse(),
    format = (message: any) =>
      message.role === "user"
        ? `USER: ${String(message.content).slice(0, 260)}`
        : `${String(message.provider_metadata?.speakerName ?? "COMPANION")} [${
          String(
            message.speaker_character_instance_id ??
              message.character_instance_id,
          )
        }]: ${String(message.content).slice(0, 260)}`,
    lines = chronological.map(format),
    now = new Date().toISOString();
  await db.from("together_conversations").update({
    summary: `Participant-attributed recent group state:\n${lines.join("\n")}`
      .slice(-7000),
    summary_message_count: data.length,
    summary_through: now,
    summary_through_sequence: Math.max(...chronological.map((message: any) => Number(message.conversation_sequence ?? 0))),
    updated_at: now,
  }).eq("id", conversationId).eq("user_id", userId);
  await Promise.all((participants ?? []).map((participant: any) => {
    const witnessed = chronological.filter((message: any) =>
      Number(message.conversation_sequence ?? 0) >=
        Number(participant.witnessed_from_sequence ?? 1) &&
      (participant.witnessed_to_sequence == null ||
        Number(message.conversation_sequence ?? 0) <=
          Number(participant.witnessed_to_sequence))
    );
    const groupSummary = `Participant-attributed witnessed group state:\n${
      witnessed.map(format).join("\n")
    }`.slice(-7000);
    return db.from("together_conversation_participants").update({
      metadata: {
        ...(participant.metadata ?? {}),
        groupSummary,
        summaryThroughSequence: witnessed.at(-1)?.conversation_sequence ?? null,
      },
      updated_at: now,
    }).eq("id", participant.id).eq("user_id", userId).is("left_at", null);
  }));
}
async function recordDirectedGroupRelationshipTurn(
  db: any,
  input: { userId: string; continuityId: string; characterInstanceId: string },
) {
  const { data: relationship } = await db.from("together_relationship_states")
    .select("interaction_turn_count,conversation_count").eq(
      "user_id",
      input.userId,
    ).eq("continuity_id", input.continuityId).eq(
      "character_instance_id",
      input.characterInstanceId,
    ).maybeSingle();
  if (!relationship) return;
  await db.from("together_relationship_states").update({
    interaction_turn_count: Number(relationship.interaction_turn_count ?? 0) +
      1,
    conversation_count: Number(relationship.conversation_count ?? 0) + 1,
    last_interaction_quality: "casual",
    updated_at: new Date().toISOString(),
  }).eq("user_id", input.userId).eq("continuity_id", input.continuityId).eq(
    "character_instance_id",
    input.characterInstanceId,
  );
}
async function applyDetectedGroupSocialEvent(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    speakerId: string;
    addresseeInstanceIds: string[];
    text: string;
    roster: any[];
    conversationId: string;
  },
) {
  const lower = input.text.toLocaleLowerCase(),
    event = classifyGroupSocialEvent(input.text);
  if (!event) return;
  const target = input.roster.find((row: any) =>
    String(row.character_instance_id) !== input.speakerId &&
    (input.addresseeInstanceIds.includes(String(row.character_instance_id)) ||
      lower.includes(
        String(
          row.together_character_instances?.together_character_templates
            ?.name ?? "",
        ).split(" ")[0]?.toLocaleLowerCase() ?? "",
      ))
  );
  if (!target) return;
  const targetId = String(target.character_instance_id),
    a = input.speakerId < targetId ? input.speakerId : targetId,
    b = input.speakerId < targetId ? targetId : input.speakerId,
    { data: existing } = await db.from("together_character_social_states")
      .select("*").eq("continuity_id", input.continuityId).eq(
        "character_a_instance_id",
        a,
      ).eq("character_b_instance_id", b).maybeSingle(),
    delta = boundedGroupSocialDelta(event, .6, .8),
    now = new Date().toISOString();
  const row = {
    user_id: input.userId,
    continuity_id: input.continuityId,
    character_a_instance_id: a,
    character_b_instance_id: b,
    relationship_type: existing?.relationship_type ?? "acquaintance",
    familiarity: Math.max(
      0,
      Math.min(100, Number(existing?.familiarity ?? 0) + delta.familiarity),
    ),
    affinity: Math.max(
      0,
      Math.min(100, Number(existing?.affinity ?? 0) + delta.affinity),
    ),
    tension: Math.max(
      0,
      Math.min(100, Number(existing?.tension ?? 0) + delta.tension),
    ),
    recent_direction: delta.affinity > 0
      ? "warming"
      : delta.tension > 0
      ? "strained"
      : "steady",
    metadata: {
      ...(existing?.metadata ?? {}),
      lastGroupConversationId: input.conversationId,
      lastSemanticEvent: event,
      lastSemanticEventAt: now,
    },
    updated_at: now,
  };
  if (existing) {
    await db.from("together_character_social_states").update(row).eq(
      "id",
      existing.id,
    ).eq("user_id", input.userId);
  } else {await db.from("together_character_social_states").insert({
      ...row,
      created_at: now,
    });}
}
function completedReplay(
  correlationId: string,
  turn: any,
  messages: any[],
): Response {
  const payload = [
    { type: "turn_started", turnId: turn?.id, replayed: true },
    ...messages.map((message) => ({ type: "message_completed", message })),
    { type: "turn_yielded", turnId: turn?.id, replayed: true },
  ];
  return new Response(
    payload.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Correlation-ID": correlationId,
      },
    },
  );
}

async function waitForCompletedGroupTurn(db:any,userId:string,turnId:string,timeoutMs=20_000):Promise<{turn:any;messages:any[]}|null>{
  const deadline=Date.now()+timeoutMs;
  do{
    const{data:turn}=await db.from("together_dialogue_turns").select("*").eq("id",turnId).eq("user_id",userId).maybeSingle();
    if(!turn)return null;
    if(["completed","yielded","failed","cancelled"].includes(String(turn.state))){
      const{data:messages}=await db.from("together_messages").select("*").eq("user_id",userId).eq("dialogue_turn_id",turnId).order("conversation_sequence");
      if(turn.state==="completed"||turn.state==="yielded"||(messages?.length??0)>0)return{turn,messages:messages??[]};
      return null;
    }
    if(Date.now()>=deadline)break;
    await new Promise((resolve)=>setTimeout(resolve,500));
  }while(Date.now()<deadline);
  return null;
}
