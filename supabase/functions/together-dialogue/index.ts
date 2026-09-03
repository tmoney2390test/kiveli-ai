import { z } from "zod";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { parseBody } from "../_shared/body.ts";
import { corsHeaders, errorResponse } from "../_shared/http.ts";
import { AppError } from "../_shared/types.ts";
import {
  ConfiguredConversationAnalysisProvider,
  ConfiguredDialogueProvider,
  ConfiguredEmbeddingProvider,
  ConfiguredModerationProvider,
  type ConversationActionCandidate,
  type DialogueRunMetadata,
  type DialogueRunOptions,
} from "../_shared/together-ai.ts";
import {
  mergeConversationSummary,
  relationshipMetrics,
  track,
} from "../_shared/together.ts";
import {
  applyConversationEngagement,
  applyInteractionProposal,
  boundedGroupSocialDelta,
  chatLanguageSafetyBoundary,
  classifyUserAuthoredMediaSafety,
  classifyConversationQuery,
  type ChemistrySignal,
  classifyGroupSocialEvent,
  compileIntimacyStance,
  detectFlirtSignal,
  hasSexualDialogueLanguage,
  isDialogueHardBlocked,
  evolveCharacterUserView,
  type GroupSpeakerCandidate,
  type GroupTurnAction,
  isContradictoryAcceptedIntimacyRefusal,
  isDurableUserMemory,
  isLocationPlanDismissalCoolingDown,
  lifeTriggerForConversationTurn,
  LOCATION_PLAN_DISMISSAL_COOLDOWN_MS,
  matchAssistantLocationPlan,
  MESSAGE_CHARACTER_LIMIT,
  messageCharacterLimitError,
  normalizeChatLanguage,
  PHOTO_ONLY_MESSAGE_CONTENT,
  resolveProductionSafePhotoRequest,
  planGroupContinuation,
  planGroupTurn,
  type PlannableLocationMention,
  type RelationshipState,
  scoreConversationEngagement,
  shouldPersistLifeStateForConversationTurn,
  type SpiceLevel,
  updateChemistry,
} from "../../../packages/together-domain/src/index.ts";
import { runLifeSimulation } from "../_shared/together-life.ts";
import { buildKivelleConversationContext } from "../_shared/kivelle-conversation-context.ts";
import {
  acknowledgeConversationScene,
  getActiveConversation,
  mergeConversationSceneMetadata,
  resolveActiveConversationScene,
} from "../_shared/together-conversation.ts";
import { classifyPhotoRequest } from "../_shared/together-media.ts";
import { waitUntil } from "../_shared/background.ts";
import { createMediaOffer } from "../_shared/together-media-offers.ts";
import { writeConversationEvent } from "../_shared/together-plans.ts";
import { activeContinuity } from "../_shared/together-continuity.ts";
import {
  extendScheduleForConversation,
  resolveCompanionPresence,
} from "../_shared/together-schedule.ts";
import { markMentionedMemories } from "../_shared/kivelle-memory.ts";
import { consolidateConversationEpisodes } from "../_shared/kivelle-conversation-episodes.ts";
import {
  deriveEmotionalResidue,
  upsertEmotionalResidue,
} from "../_shared/kivelle-emotional-residue.ts";
import { recordChatPlaceOpinions } from "../_shared/kivelle-place-perspective.ts";
import type { PlaceContext } from "../_shared/together-place.ts";
import { resolveDialogueRouting } from "../_shared/kivelle-ai-routing.ts";
import { sharedSceneGenerationContext,type DialogueGenerationContext } from "../_shared/kivelle-chat-generation.ts";
import type {
  DialogueContentMode,
  DialogueRoutingDecision,
} from "../../../packages/together-domain/src/index.ts";
import { enforcePhotoSharingEntitlement } from "../_shared/kivelle-subscription.ts";
import {
  assertSpeakerPrivateContext,
  bindPreparedSpeakerContext,
  buildIsolatedSpeakerContext,
} from "../_shared/kivelle-speaker-context.ts";
import {
  conversationAdultMediaAuthorized,
  requestedConversationDialogueContentMode,
} from "../_shared/conversation-content-mode.ts";
import {
  privateAdultTextTelemetry,
  privateDialoguePolicyMetadata,
  resolvePrivateDialoguePolicy,
} from "../_shared/private-adult-text-policy.ts";
import {
  derivePhotoOfferContext,
  type PhotoOfferContext,
} from "../_shared/together-photo-offer-context.ts";
import {
  activateConversationTurn,
  beginConversationTurn,
  type ConversationTurnLease,
  finishConversationTurn,
  finishTurnWithResponse,
  touchConversationTurn,
} from "../_shared/together-dialogue-turns.ts";
import { attachAuthoredDepthContext } from "../_shared/kivelle-authored-depth-context.ts";
import {
  assertChatRequestId,
  chatRequestFingerprint,
  claimChatUserMessage,
  commitDirectAssistantMessage,
  directResponseKey,
  findExistingChatRequest,
  normalizeChatMessage,
} from "../_shared/chat-message-hardening.ts";
import {
  moderationContextTail,
  takeModerationSegments,
} from "../_shared/adult-dialogue-stream.ts";
import { resolveAdultAccess } from "../_shared/web-adult-access.ts";
import { isSafePolicy } from "../_shared/content-projection.ts";
import { deriveSafeRelationalSummary } from "../_shared/safe-relational-context.ts";

const schema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().max(MESSAGE_CHARACTER_LIMIT, messageCharacterLimitError())
    .default(""),
  attachmentIds: z.array(z.string().uuid()).max(1).refine(
    (ids) => new Set(ids).size === ids.length,
    "The same attachment cannot be sent twice.",
  ).default([]),
  clientRequestId: z.string().uuid(),
  characterInstanceId: z.string().uuid(),
  focusPlanId: z.string().uuid().optional(),
  sceneActionId: z.string().uuid().optional(),
  messageAction: z.enum(["continue"]).optional(),
  anchorMessageId: z.string().uuid().optional(),
  autoDialogueSuggestionId: z.string().min(8).max(120).optional(),
  autoDialogueSuggestionSource: z.enum([
    "openai",
    "gemini",
    "deterministic",
    "client_fallback",
  ]).optional(),
  autoDialogueSuggestionEdited: z.boolean().optional(),
  autoDialogueSuggestionIntent: z.enum([
    "answer",
    "repair",
    "support",
    "celebrate",
    "flirt",
    "follow_up",
    "coordinate_plan",
    "advance_scene",
    "close_scene",
    "engage_group",
    "curious",
  ]).optional(),
  autoDialogueSuggestionPreference: z.enum([
    "natural",
    "shorter",
    "detailed",
    "romantic",
    "assertive",
  ]).optional(),
  entryContext: z.object({
    entryReason: z.literal("user_drop_in"),
    locationId: z.string().uuid(),
    scheduleEventId: z.string().uuid().optional(),
  }).optional(),
}).refine(
  (value) => value.message.trim().length > 0 || value.attachmentIds.length > 0,
  { message: "Write a message or attach a photo." },
).superRefine((value,ctx)=>{
  if(value.messageAction==='continue'&&!value.anchorMessageId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['anchorMessageId'],message:'Choose the companion message to continue.'});
  if(!value.messageAction&&value.anchorMessageId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['messageAction'],message:'That message action is invalid.'});
});
const dialogue = new ConfiguredDialogueProvider();
const moderation = new ConfiguredModerationProvider();
const embeddings = new ConfiguredEmbeddingProvider();
const analysis = new ConfiguredConversationAnalysisProvider();
const encoder = new TextEncoder();

Deno.serve(async (request) => {
  const correlationId = request.headers.get("x-correlation-id") ??
    crypto.randomUUID();
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    const { user, db } = await authenticated(request);
    const adultAccess=await resolveAdultAccess(request,user,db);
    const input = await parseBody(request, schema);
    return streamPreparedDialogue(correlationId, async () => {
      let turnLease: ConversationTurnLease | null = null;
      try {
        const continuity = await activeContinuity(db, user.id);
        const { data: conversation } = await db.from("together_conversations")
          .select(
            "*,together_character_instances!inner(*,together_character_templates(*),together_character_versions(*))",
          ).eq("id", input.conversationId).eq("user_id", user.id).eq(
            "continuity_id",
            continuity.id,
          ).eq("character_instance_id", input.characterInstanceId)
          .maybeSingle();
        if (!conversation) {
          throw new AppError(
            "NOT_FOUND",
            "That conversation is unavailable.",
            404,
          );
        }
        const directParticipant=conversation.together_character_instances as Record<string,any>;
        const projectionPolicy=resolvePrivateDialoguePolicy({access:adultAccess,requestedMode:'explicit',conversationMode:'direct',participants:[directParticipant],safetyAllowed:true});
        const authorizedPrivateAdultText=projectionPolicy.rollout.generationAllowed;
        const chatLanguage=normalizeChatLanguage(conversation.metadata?.chatPreferences?.chatLanguage);
        const userText = normalizeChatMessage(input.message);
        const isContinuation=input.messageAction==='continue';
        let continuationAnchor:Record<string,any>|null=null;
        if(isContinuation){
          let latestQuery=db.from('together_messages').select('id,role,content,delivery_status,provider_metadata,speaker_character_instance_id,character_instance_id,conversation_sequence,created_at,content_rating,visibility_scope').eq('user_id',user.id).eq('conversation_id',conversation.id);
          if(!authorizedPrivateAdultText)latestQuery=latestQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
          const{data:latestRows,error:latestError}=await latestQuery.order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(20);
          if(latestError)throw new AppError('INTERNAL_ERROR','That message could not be continued.',500,true);
          const latestVisible=(latestRows??[]).find((row)=>row.provider_metadata?.uiHidden!==true);
          if(!latestVisible||latestVisible.id!==input.anchorMessageId||latestVisible.role!=='assistant'||latestVisible.delivery_status!=='complete')throw new AppError('CONFLICT','That reply is no longer the latest message. Continue from the newest reply instead.',409);
          continuationAnchor=latestVisible;
        }
        const requestId = assertChatRequestId(input.clientRequestId);
        const contextText = (isContinuation?String(continuationAnchor?.content??''):userText) ||
          "The user shared an image without a caption.";
        const photoIntent = classifyPhotoRequest(isContinuation?'':contextText);
        const activeConversation = await getActiveConversation(
          db,
          user.id,
          input.characterInstanceId,
        );
        if (
          conversation.archived_at || activeConversation?.id !== conversation.id
        ) {
          throw new AppError(
            "CONVERSATION_ARCHIVED",
            "This conversation is no longer active.",
            409,
            true,
          );
        }
        const requestFingerprint = await chatRequestFingerprint({
          conversationId: input.conversationId,
          characterInstanceId: input.characterInstanceId,
          message: contextText,
          attachmentIds: [...input.attachmentIds].sort(),
          focusPlanId: input.focusPlanId ?? null,
          sceneActionId: input.sceneActionId ?? null,
          entryContext: input.entryContext ?? null,
          messageAction: input.messageAction ?? null,
          anchorMessageId: input.anchorMessageId ?? null,
        });
        const persistedContent = userText || "[Photo]";
        const existingUserMessage = await findExistingChatRequest(db, {
          userId: user.id,
          conversationId: input.conversationId,
          requestId,
          fingerprint: requestFingerprint,
          expectedContent: persistedContent,
          characterInstanceId: input.characterInstanceId,
        });
        const responseKey = directResponseKey(requestId);
        if (existingUserMessage) {
          const replay = await waitForAssistantReply(
            db,
            user.id,
            input.conversationId,
            responseKey,
            0,
          );
          if (replay) {
            const visibleReplay=projectReplyForAccess(replay,authorizedPrivateAdultText);
            const mediaOffer =visibleReplay===replay?await replayMediaOffer(
              db,
              user.id,
              input.conversationId,
              visibleReplay,
            ):null;
            return streamText(
              String(visibleReplay.content ?? ""),
              visibleReplay,
              correlationId,
              [],
              null,
              undefined,
              mediaOffer,
            );
          }
        }

        let attachments: Record<string, any>[] = [];
        if (input.attachmentIds.length) {
          await enforcePhotoSharingEntitlement(db, user.id);
          let attachmentQuery = db.from("together_conversation_attachments")
            .select("*").in("id", input.attachmentIds).eq("user_id", user.id)
            .eq("continuity_id", continuity.id).eq(
              "conversation_id",
              input.conversationId,
            ).eq("kind", "image").eq("upload_status", "uploaded").eq("analysis_status", "ready");
          attachmentQuery = existingUserMessage
            ? attachmentQuery.eq("message_id", existingUserMessage.id)
            : attachmentQuery.is("message_id", null);
          const attachmentResult = await attachmentQuery;
          attachments = attachmentResult.data ?? [];
          if (
            attachmentResult.error ||
            attachments.length !== input.attachmentIds.length
          ) {
            throw new AppError(
              "VALIDATION_FAILED",
              "One of those photos is no longer available to send.",
              422,
            );
          }
        }

        if (!existingUserMessage) {
          await enforceRateLimit(db, user.id, "together_dialogue", 80, 3600);
        }
        turnLease = await beginConversationTurn(db, {
          userId: user.id,
          continuityId: continuity.id,
          conversationId: input.conversationId,
          requestId,
          kind: "direct",
        });
        if (!turnLease.acquired) {
          if (existingUserMessage && turnLease.requestId === requestId) {
            const replay = await waitForAssistantReply(
              db,
              user.id,
              input.conversationId,
              responseKey,
            );
            if (replay) {
              const visibleReplay=projectReplyForAccess(replay,authorizedPrivateAdultText);
              const mediaOffer =visibleReplay===replay?await replayMediaOffer(
                db,
                user.id,
                input.conversationId,
                visibleReplay,
              ):null;
              return streamText(
                String(visibleReplay.content ?? ""),
                visibleReplay,
                correlationId,
                [],
                null,
                undefined,
                mediaOffer,
              );
            }
            throw new AppError(
              "PROVIDER_TIMEOUT",
              "Your companion is still finishing that reply. Reconnect in a moment.",
              503,
              true,
            );
          }
          throw new AppError(
            "CONFLICT",
            "This conversation is already finishing another message. Try again in a moment.",
            409,
            true,
          );
        }
        if (existingUserMessage) {
          await enforceRateLimit(
            db,
            user.id,
            "together_dialogue_retry",
            12,
            3600,
          );
        }
        const leased = (response: Response) =>
          finishTurnWithResponse(db, turnLease!, response);
        if (input.focusPlanId) {
          const { data: focusedPlan } = await db.from("together_shared_plans")
            .select("id").eq("id", input.focusPlanId).eq("user_id", user.id)
            .contains("participant_instance_ids", [input.characterInstanceId])
            .maybeSingle();
          if (focusedPlan) {
            const focus = {
              type: "plan",
              planId: focusedPlan.id,
              updatedAt: new Date().toISOString(),
            };
            conversation.metadata = { ...(conversation.metadata ?? {}), focus };
            await db.from("together_conversations").update({
              metadata: conversation.metadata,
            }).eq("id", conversation.id).eq("user_id", user.id);
          }
        }

        const instanceAtRequest = conversation
          .together_character_instances as Record<string, any>;
        const usageBase = {
          db,
          userId: user.id,
          continuityId: continuity.id,
          conversationId: input.conversationId,
          characterInstanceId: input.characterInstanceId,
          correlationId,
        };
        let recentRoutingQuery=db.from("together_messages").select("role,content").eq("conversation_id",input.conversationId);
        if(!authorizedPrivateAdultText)recentRoutingQuery=recentRoutingQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
        const [
          { data: profile },
          { data: recentRoutingRows },
          { data: routingRelationship },
          inputSafety,
        ] = await Promise.all([
          db.from("together_profiles").select(
            "age_verified_at,content_preferences",
          ).eq("user_id", user.id).maybeSingle(),
          recentRoutingQuery.order("created_at", { ascending: false }).limit(4),
          db.from("together_relationship_states").select(
            "romance_enabled,romance_path_status",
          ).eq("user_id", user.id).eq(
            "character_instance_id",
            input.characterInstanceId,
          ).maybeSingle(),
          moderation.check(contextText, {
            ...usageBase,
            metadata: { direction: "input" },
          }),
        ]);
        const storedRequestedMode=requestedConversationDialogueContentMode(profile,conversation);
        let dialoguePolicy=resolvePrivateDialoguePolicy({
          access:adultAccess,
          requestedMode:storedRequestedMode,
          conversationMode:'direct',
          participants:[instanceAtRequest],
          safetyAllowed:!isDialogueHardBlocked({message:contextText,moderation:inputSafety}),
        });
        let requestedMode=dialoguePolicy.effectiveMode;
        const photoSafety=photoIntent.requested
          ?classifyUserAuthoredMediaSafety({text:contextText,requestedContentLevel:photoIntent.requestedContentLevel,moderation:inputSafety})
          :null;
        if(storedRequestedMode==='explicit')await track(db,user.id,'private_adult_text_policy_decision',privateAdultTextTelemetry({policy:dialoguePolicy,access:adultAccess,conversationMode:'direct'}));
        const relationshipAllowsExplicit =
          routingRelationship?.romance_enabled !== false &&
          routingRelationship?.romance_path_status !== "friends_only";
        let route = resolveDialogueRouting({
          message: contextText,
          recentTurns: [...(recentRoutingRows ?? [])].reverse(),
          requestedMode,
          ageVerified: adultAccess.adult_eligible,
          adultAuthorized:dialoguePolicy.rollout.generationAllowed,
          characterAge: Number(
            instanceAtRequest.together_character_templates?.age ??
              instanceAtRequest.together_character_versions?.age ?? 0,
          ) || null,
          relationshipAllowsExplicit,
          photoRequest: photoIntent.requested,
          photoAdultRequest: ['suggestive','mature','explicit'].includes(String(photoIntent.requestedContentLevel??'')),
          photoSafetyBlocked: photoSafety?.allowed===false,
          moderation: inputSafety,
        });
        const characterName = String(
          (conversation.together_character_instances as Record<string, any>)
            .together_character_templates?.name ?? "Companion",
        );
        const scriptedBoundary = boundaryResponseForRoute(characterName, route,chatLanguage,contextText);
        if (scriptedBoundary) {
          const boundary = scriptedBoundary;
          const boundaryClaim = existingUserMessage
            ? { message: existingUserMessage, created: false }
            : await claimChatUserMessage(db, {
              userId: user.id,
              continuityId: continuity.id,
              conversationId: input.conversationId,
              characterInstanceId: input.characterInstanceId,
              content: boundary.storeOriginal
                ? persistedContent
                : "[Message withheld by safety controls]",
              requestId,
              attachmentIds: input.attachmentIds,
              providerMetadata: {
                chatLanguage,
                requestFingerprint,
                requestAttachmentIds: [...input.attachmentIds].sort(),
                safety_redirected: true,
                ...safeMessagePolicy('safe'),
                ...(input.autoDialogueSuggestionId
                  ? {
                    autoDialogueSuggestionId: input.autoDialogueSuggestionId,
                    autoDialogueSuggestionSource:
                      input.autoDialogueSuggestionSource ?? "unknown",
                    autoDialogueSuggestionEdited:
                      input.autoDialogueSuggestionEdited === true,
                    autoDialogueSuggestionIntent:
                      input.autoDialogueSuggestionIntent ?? "unknown",
                    autoDialogueSuggestionPreference:
                      input.autoDialogueSuggestionPreference ?? "natural",
                  }
                  : {}),
              },
            });
          const boundaryUserMessage = boundaryClaim.message;
          await activateConversationTurn(db, turnLease, {
            sourceMessageId: String(boundaryUserMessage.id),
          });
          const boundaryCommit = await commitDirectAssistantMessage(db, {
            turnId: turnLease.id,
            leaseToken: turnLease.token,
            speakerCharacterInstanceId: input.characterInstanceId,
            content: boundary.text,
            responseKey,
            providerMetadata: {
              provider: "scripted-boundary",
              safety_category: boundary.category,
              chatLanguage,
              ...safeMessagePolicy('safe'),
            },
          });
          const boundaryMessage = boundaryCommit.message;
          if (boundaryCommit.created) {
            await db.from("together_safety_events").insert({
              user_id: user.id,
              character_instance_id: input.characterInstanceId,
              direction: "input",
              categories: [
                ...new Set([...inputSafety.categories,...(photoSafety&&!photoSafety.allowed?[`media/${photoSafety.reasonCode}`]:[]), boundary.category]),
              ],
              action: "redirected",
            });
            await db.from("together_conversations").update({
              last_message_at: boundaryMessage.created_at,
              updated_at: boundaryMessage.created_at,
              kind: conversation.kind === "first_meeting"
                ? "direct"
                : conversation.kind,
            }).eq("id", input.conversationId).eq("user_id", user.id);
            await acknowledgeArrival(
              db,
              user.id,
              conversation,
              String(boundaryMessage.created_at),
            );
            await track(db, user.id, "message_sent", {
              characterInstanceId: input.characterInstanceId,
              safetyRedirected: true,
            });
            await track(db, user.id, "character_response_received", {
              characterInstanceId: input.characterInstanceId,
              safetyRedirected: true,
            });
          }
          return leased(
            streamText(boundary.text, boundaryMessage, correlationId),
          );
        }

        const userClaim = existingUserMessage
          ? { message: existingUserMessage, created: false }
          : await claimChatUserMessage(db, {
            userId: user.id,
            continuityId: continuity.id,
            conversationId: input.conversationId,
            characterInstanceId: input.characterInstanceId,
            content: persistedContent,
            requestId,
            attachmentIds: input.attachmentIds,
            providerMetadata: {
              chatLanguage,
              requestFingerprint,
              requestAttachmentIds: [...input.attachmentIds].sort(),
              ...userMessagePolicy(route),
              ...privateDialoguePolicyMetadata({policy:dialoguePolicy,access:adultAccess,conversationMode:'direct',providerRoute:route.provider}),
              ...(isContinuation?{messageAction:'continue',anchorMessageId:input.anchorMessageId,uiHidden:true}:{}),
              ...(input.autoDialogueSuggestionId
                ? {
                  autoDialogueSuggestionId: input.autoDialogueSuggestionId,
                  autoDialogueSuggestionSource:
                    input.autoDialogueSuggestionSource ?? "unknown",
                  autoDialogueSuggestionEdited:
                    input.autoDialogueSuggestionEdited === true,
                  autoDialogueSuggestionIntent:
                    input.autoDialogueSuggestionIntent ?? "unknown",
                  autoDialogueSuggestionPreference:
                    input.autoDialogueSuggestionPreference ?? "natural",
                }
                : {}),
            },
          });
        const userMessage = userClaim.message;
        await activateConversationTurn(db, turnLease, {
          sourceMessageId: String(userMessage.id),
        });
        if (userClaim.created && input.autoDialogueSuggestionId) {
          await track(db, user.id, "auto_dialogue_suggestion_sent", {
            characterInstanceId: input.characterInstanceId,
            conversationId: input.conversationId,
            suggestionId: input.autoDialogueSuggestionId,
            source: input.autoDialogueSuggestionSource,
            edited: input.autoDialogueSuggestionEdited === true,
            intent: input.autoDialogueSuggestionIntent,
            preference: input.autoDialogueSuggestionPreference,
          });
        }
        if (userClaim.created && attachments.length) {
          await track(db, user.id, "user_photo_sent", {
            attachmentCount: attachments.length,
            characterInstanceId: input.characterInstanceId,
          });
        }

        if (photoIntent.requested&&!isContinuation) {
          const fastPathStartedAt = performance.now();
          const photoContext = derivePhotoOfferContext({
            instance: instanceAtRequest,
            conversation,
            now: new Date(),
          });
          if (photoContext.currentScene.sceneSessionId) {
            await recordSceneMessage(db, {
              userId: user.id,
              continuityId: continuity.id,
              sceneId: photoContext.currentScene.sceneSessionId,
              message: userMessage,
              role: "user",
            });
          }
          const response = await photoOnlyResponse({
            db,
            userId: user.id,
            input,
            conversation,
            userMessage,
            context: photoContext,
            correlationId,
            turnLease,
            responseKey,
            adultPipelineAuthorized: conversationAdultMediaAuthorized(
              storedRequestedMode,
              adultAccess.authorized_web_adult,
            ),
            inputModerationApproved:photoSafety?.allowed===true,
          });
          deferPhotoRequestHousekeeping({
            db,
            userId: user.id,
            input,
            conversation,
            instance: instanceAtRequest,
            context: photoContext,
            correlationId,
          });
          console.log(JSON.stringify({
            level: "info",
            correlationId,
            operation: "photo_offer_fast_path",
            durationMs: Math.round(performance.now() - fastPathStartedAt),
            contextSource: photoContext.resolutionSource,
          }));
          return leased(response);
        }

        const instance = instanceAtRequest;
        const now = new Date();
        const synchronousLifeRequired = Boolean(
          input.entryContext || input.sceneActionId || input.focusPlanId,
        );
        const preflightStartedAt = performance.now();
        const lifeStartedAt = performance.now();
        const lifePromise = (synchronousLifeRequired
          ? runLifeSimulation({
            db,
            userId: user.id,
            characterInstanceId: input.characterInstanceId,
            now,
            evaluateProactive: false,
            persistCharacterState: shouldPersistLifeStateForConversationTurn({
              photoRequested: photoIntent.requested,
            }),
            trigger: lifeTriggerForConversationTurn({
              photoRequested: photoIntent.requested,
            }),
          }).catch((error) => {
            console.error(
              JSON.stringify({
                level: "error",
                correlationId,
                operation: "lazy_conversation_simulation",
                message: error instanceof Error
                  ? error.message
                  : "unknown_error",
              }),
            );
            return fallbackLifeRun(instance);
          })
          : fastConversationLifeRun(
            db,
            user.id,
            input.characterInstanceId,
            instance,
            now,
          )).then((value) => ({
            value,
            durationMs: Math.round(performance.now() - lifeStartedAt),
          }));
        const sceneStartedAt = performance.now();
        const scenePromise = resolveActiveConversationScene({
          db,
          userId: user.id,
          conversation,
          characterInstanceId: input.characterInstanceId,
          now,
        }).then((value) => ({
          value,
          durationMs: Math.round(performance.now() - sceneStartedAt),
        }));
        const semanticStartedAt = performance.now();
        const semanticPromise = (async () => {
          const semanticIntent=classifyConversationQuery(contextText);
          const queryEmbedding = semanticRecallNeeded(contextText)
            ? await embeddings.embed(contextText, {
              ...usageBase,
              purpose: "memory_query",
            })
            : null;
          const recallThreshold=semanticIntent==='memory_overview' ? .48 : semanticIntent==='history' ? .54 : (semanticIntent==='location'||semanticIntent==='story') ? .58 : .60;
          const result = queryEmbedding
            ? await db.rpc("kivelle_match_memories_for_projection", {
              p_user_id: user.id,
              p_character_instance_id: input.characterInstanceId,
              p_embedding: queryEmbedding,
              p_limit: 12,
              p_min_similarity: recallThreshold,
              p_include_restricted: adultAccess.authorized_web_adult,
              p_include_private_adult_text: authorizedPrivateAdultText,
            })
            : { data: [], error: null };
          return {
            queryEmbedding,
            result,
            durationMs: Math.round(performance.now() - semanticStartedAt),
          };
        })();
        const [lifePhase, scenePhase, semantic] = await Promise.all([
          lifePromise,
          scenePromise,
          semanticPromise,
        ]);
        const lifeRun = lifePhase.value, sceneResolution = scenePhase.value;
        const lifeDurationMs = lifePhase.durationMs,
          sceneDurationMs = scenePhase.durationMs;
        if (!synchronousLifeRequired && lifeSimulationIsStale(instance, now)) {
          waitUntil(
            runLifeSimulation({
              db,
              userId: user.id,
              characterInstanceId: input.characterInstanceId,
              now,
              evaluateProactive: false,
              persistCharacterState: false,
              trigger: "conversation_continued",
            }).catch((error) =>
              console.warn(
                JSON.stringify({
                  level: "warn",
                  correlationId,
                  operation: "background_conversation_simulation",
                  message: error instanceof Error
                    ? error.message
                    : "unknown_error",
                }),
              )
            ),
          );
        }
        const presence =
          (((lifeRun as Record<string, unknown>).presence) ?? {}) as Record<
            string,
            any
          >;
        if (sceneResolution.expired) {
          conversation.metadata = mergeConversationSceneMetadata(
            (conversation.metadata ?? {}) as Record<string, any>,
            null,
          );
          await db.from("together_conversations").update({
            metadata: conversation.metadata,
            updated_at: now.toISOString(),
          }).eq("id", conversation.id).eq("user_id", user.id);
          await track(db, user.id, "scene_expired", {
            characterInstanceId: input.characterInstanceId,
          });
        } else if (sceneResolution.scene) {
          conversation.metadata = mergeConversationSceneMetadata(
            (conversation.metadata ?? {}) as Record<string, any>,
            sceneResolution.scene,
          );
        }
        const activeScene =
          (conversation.metadata?.activeScene ?? {}) as Record<string, any>;
        deferScheduleExtension({
          db,
          userId: user.id,
          characterInstanceId: input.characterInstanceId,
          conversationId: input.conversationId,
          scheduleEventId: typeof activeScene.scheduleEventId === "string"
            ? activeScene.scheduleEventId
            : undefined,
          now,
          correlationId,
        });
        // runLifeSimulation may have moved the character after the conversation
        // query loaded its nested instance. Carry its freshly resolved passive
        // state forward so a pre-simulation row can never reclaim present reality.
        const freshLifeState =
          (((lifeRun as Record<string, unknown>).state) ?? {}) as Record<
            string,
            any
          >;
        const currentInstance = {
          ...instance,
          current_location_id: freshLifeState.locationId ??
            instance.current_location_id,
          current_activity: freshLifeState.activity ??
            instance.current_activity,
          current_mood: freshLifeState.mood ?? instance.current_mood,
          current_energy: freshLifeState.energy ?? instance.current_energy,
          current_interruptibility: freshLifeState.interruptibility ??
            presence.interruptibility ?? instance.current_interruptibility,
          current_presence_source:
            (lifeRun as Record<string, unknown>).stateSource ??
              instance.current_presence_source,
        };
        const contextStartedAt = performance.now();
        let dialogueContext = await buildKivelleConversationContext({
          db,
          userId: user.id,
          instance: currentInstance,
          conversation,
          userMessage: contextText,
          lifeRun,
          semanticRows: semantic.result.data ?? [],
          semanticQueryEmbedding: semantic.queryEmbedding,
          attachments,
          now,
          correlationId,
          authorizedWebAdult:adultAccess.authorized_web_adult,
          authorizedPrivateAdultText,
          conversationSceneResolution: sceneResolution,
        });
        (dialogueContext as Record<string,unknown>).contentAccess={authorizedWebAdult:adultAccess.authorized_web_adult,authorizedPrivateAdultText};
        if(isContinuation){
          dialogueContext.userMessage='';
          (dialogueContext as Record<string,unknown>).continuationRequest={anchorMessageId:input.anchorMessageId,anchorSpeakerCharacterInstanceId:String(continuationAnchor?.speaker_character_instance_id??continuationAnchor?.character_instance_id??input.characterInstanceId)};
        }
        const contextDurationMs = Math.round(
          performance.now() - contextStartedAt,
        );
        console.log(JSON.stringify({
          level: "info",
          correlationId,
          operation: "dialogue_preflight",
          lifeDurationMs,
          sceneDurationMs,
          semanticDurationMs: semantic.durationMs,
          contextDurationMs,
          totalPreflightMs: Math.round(performance.now() - preflightStartedAt),
          semanticRecall: Boolean(semantic.queryEmbedding),
          queryIntent: dialogueContext.queryIntent,
        }));
        (dialogueContext as Record<string, unknown>).conversation =
          conversation;
        (dialogueContext as Record<string, unknown>).conversationId = String(
          conversation.id,
        );
        dialogueContext.photoRequest = photoIntent.requested;
        if (input.sceneActionId) {
          const { data: sceneAction } = await db.from("together_scene_actions")
            .select("*,together_scene_sessions!inner(conversation_id)").eq(
              "id",
              input.sceneActionId,
            ).eq("user_id", user.id).eq("continuity_id", continuity.id).eq(
              "character_instance_id",
              input.characterInstanceId,
            ).not("completed_at", "is", null).maybeSingle();
          if (
            !sceneAction ||
            sceneAction.together_scene_sessions?.conversation_id !==
              conversation.id
          ) {
            throw new AppError(
              "ACTION_NOT_AVAILABLE",
              "That shared action is no longer available.",
              409,
            );
          }
          (dialogueContext as Record<string, unknown>).sceneAction = {
            id: sceneAction.id,
            key: sceneAction.interaction_key,
            label: String(
              sceneAction.result?.label ??
                sceneAction.payload?.candidate?.label ??
                sceneAction.interaction_key,
            ).replace(/_/g, " "),
            decision: sceneAction.decision_status ??
              sceneAction.result?.decision ?? "accepted",
            requestedInteractionKey: sceneAction.requested_interaction_key ??
              sceneAction.interaction_key,
            resolvedInteractionKey: sceneAction.resolved_interaction_key ??
              null,
            result: sceneAction.result,
            location: dialogueContext.place?.path ??
              dialogueContext.currentScene.location,
          };
        }
        if (dialogueContext.currentScene.sceneSessionId&&!isContinuation&&!route.explicit) {
          await recordSceneMessage(db, {
            userId: user.id,
            continuityId: continuity.id,
            sceneId: dialogueContext.currentScene.sceneSessionId,
            message: userMessage,
            role: "user",
          });
        }
        const sceneCandidates = sharedSceneGroupCandidates(dialogueContext);
        const scenePlan = planGroupTurn({
          message: contextText,
          candidates: sceneCandidates,
          energy: "balanced",
        });
        const sceneMessageActions = scenePlan.actions.filter((action) =>
          action.type === "message"
        ).slice(0, 2);
        const primaryAction: GroupTurnAction = isContinuation?{
          id:`${String(continuationAnchor?.speaker_character_instance_id??continuationAnchor?.character_instance_id??input.characterInstanceId)}:continue`,
          type:'message',
          characterInstanceId:String(continuationAnchor?.speaker_character_instance_id??continuationAnchor?.character_instance_id??input.characterInstanceId),
          addresseeInstanceIds:[],intent:'answer_user',reasonCodes:['user_continue_action'],priority:1,
        }:sceneMessageActions[0] ?? {
          id: `${input.characterInstanceId}:scene-fallback`,
          type: "message",
          characterInstanceId: input.characterInstanceId,
          addresseeInstanceIds: [],
          intent: "answer_user",
          reasonCodes: ["primary_scene_fallback"],
          priority: 1,
        };
        const remainingSceneActions = (isContinuation?[]:scenePlan.actions.filter((action) =>
          action.id !== primaryAction.id
        )).slice(0, 2);
        const primarySpeakerId = primaryAction.characterInstanceId;
        const speakerContextStartedAt = performance.now();
        const selected = primarySpeakerId === input.characterInstanceId
          ? bindPreparedSpeakerContext({
            instance: currentInstance,
            context: dialogueContext,
            speakerCharacterInstanceId: primarySpeakerId,
          })
          : await dialogueSpeaker(
            db,
            user.id,
            continuity.id,
            primarySpeakerId,
            dialogueContext,
          );
        console.log(JSON.stringify({
          level: "info",
          correlationId,
          operation: "dialogue_speaker_context",
          speakerCharacterInstanceId: primarySpeakerId,
          reusedPreparedContext: primarySpeakerId === input.characterInstanceId,
          durationMs: Math.round(performance.now() - speakerContextStartedAt),
        }));
        dialogueContext = selected.context;
        (dialogueContext as Record<string, unknown>).sceneFloorAction =
          primaryAction;
        // Shared-scene directing can select a different speaker from the active
        // companion. Re-evaluate age, boundaries, and provider eligibility against
        // the character who will actually speak so routing can never inherit the
        // wrong participant's permissions.
        dialoguePolicy=resolvePrivateDialoguePolicy({access:adultAccess,requestedMode:storedRequestedMode,conversationMode:'direct',participants:[selected.instance],safetyAllowed:!isDialogueHardBlocked({message:contextText,moderation:inputSafety})});
        requestedMode=dialoguePolicy.effectiveMode;
        const selectedRouteInput = {
          message: contextText,
          recentTurns: [...(recentRoutingRows ?? [])].reverse(),
          requestedMode,
          ageVerified: adultAccess.adult_eligible,
          adultAuthorized:dialoguePolicy.rollout.generationAllowed,
          characterAge: Number(dialogueContext.character?.age ?? 0) || null,
          relationshipAllowsExplicit:
            dialogueContext.relationship?.romance_enabled !== false &&
            dialogueContext.relationship?.romance_path_status !==
              "friends_only",
          photoRequest: photoIntent.requested,
          moderation: inputSafety,
        };
        route = resolveDialogueRouting(selectedRouteInput);
        const selectedSpeakerName = String(
          dialogueContext.character?.name ?? "Companion",
        );
        const selectedSpeakerBoundary = boundaryResponseForRoute(
          selectedSpeakerName,
          route,
          dialogueContext.chatLanguage,
          dialogueContext.userMessage,
        );
        if (selectedSpeakerBoundary) {
          if (!await touchConversationTurn(db, turnLease)) {
            throw new AppError(
              "CONFLICT",
              "A newer message took the conversational floor.",
              409,
              true,
            );
          }
          const boundaryCommit = await commitDirectAssistantMessage(db, {
            turnId: turnLease.id,
            leaseToken: turnLease.token,
            speakerCharacterInstanceId: primarySpeakerId,
            content: selectedSpeakerBoundary.text,
            responseKey,
            providerMetadata: {
              provider: "scripted-boundary",
              safety_category: selectedSpeakerBoundary.category,
              speakerName: selectedSpeakerName,
              speakerSlug: dialogueContext.character?.slug,
              chatLanguage:normalizeChatLanguage(dialogueContext.chatLanguage),
              ...safeMessagePolicy('safe'),
            },
          });
          const boundaryMessage = boundaryCommit.message;
          if (boundaryCommit.created) {
            if (dialogueContext.currentScene.sceneSessionId) {
              await recordSceneMessage(db, {
                userId: user.id,
                continuityId: continuity.id,
                sceneId: dialogueContext.currentScene.sceneSessionId,
                message: boundaryMessage,
                role: "character",
                characterInstanceId: primarySpeakerId,
              });
            }
            await db.from("together_safety_events").insert({
              user_id: user.id,
              character_instance_id: primarySpeakerId,
              direction: "input",
              categories: [
                ...new Set([
                  ...inputSafety.categories,
                  selectedSpeakerBoundary.category,
                ]),
              ],
              action: "redirected",
            });
            await db.from("together_conversations").update({
              last_message_at: boundaryMessage.created_at,
              updated_at: boundaryMessage.created_at,
              kind: conversation.kind === "first_meeting"
                ? "direct"
                : conversation.kind,
            }).eq("id", input.conversationId).eq("user_id", user.id);
            await acknowledgeArrival(
              db,
              user.id,
              conversation,
              String(boundaryMessage.created_at),
            );
            await track(db, user.id, "message_sent", {
              characterInstanceId: input.characterInstanceId,
              safetyRedirected: true,
            });
            await track(db, user.id, "character_response_received", {
              characterInstanceId: primarySpeakerId,
              safetyRedirected: true,
            });
          }
          return leased(
            streamText(
              selectedSpeakerBoundary.text,
              boundaryMessage,
              correlationId,
            ),
          );
        }
        dialogueContext.contentMode = route.resolvedMode;
        (dialogueContext as Record<string, unknown>).dialogueRouting = {
          provider: route.provider,
          reason: route.reason,
          classification: route.classification,
          requestedMode: route.requestedMode,
          contentMode: route.resolvedMode,
          explicit: route.explicit,
        };
        attachIntimacyStance(dialogueContext);
        await attachAuthoredDepthContext({
          db,
          userId: user.id,
          continuityId: continuity.id,
          conversationId: input.conversationId,
          characterInstanceId: primarySpeakerId,
          characterVersionId: String(
            selected.instance.character_version_id ?? "",
          ),
          context: dialogueContext,
          now,
        });
        const relationshipResult = { data: dialogueContext.relationship };
        const characterTemplate = dialogueContext.character;
        const runOptions = dialogueRunOptions(route, {
          ...usageBase,
          characterInstanceId: primarySpeakerId,
          subscriptionTier: dialogueContext.subscription?.tier,
          routeReason: route.reason,
          contentMode: route.resolvedMode,
        }, undefined, sceneCandidates.length > 1, sceneCandidates.length > 1 ? sharedSceneGenerationContext('primary',sceneCandidates.length) : undefined);
        if (route.provider !== "deterministic") {
          return leased(streamDialogue({
            db,
            user,
            input,
            conversation,
            instance: selected.instance,
            relationship: relationshipResult.data,
            userMessage,
            context: dialogueContext,
            correlationId,
            primarySpeakerId,
            remainingSpeakerActions: remainingSceneActions,
            sceneCandidates,
            continuationBudget: scenePlan.continuationBudget,
            runOptions,
            ageVerified: Boolean(profile?.age_verified_at),
            requestedMode,
            turnLease,
          }));
        }
        const generated = await dialogue.generate(dialogueContext, runOptions);
        const outputSafety = await moderation.check(generated.text, {
          ...usageBase,
          characterInstanceId: primarySpeakerId,
          metadata: { direction: "output" },
        });
        const safeText = outputSafety.allowed
          ? generated.text
          : outputBoundaryResponse(
            String(characterTemplate.name ?? "Companion"),
            dialogueContext.chatLanguage,
            dialogueContext.userMessage,
          );
        if (!outputSafety.allowed) {
          await db.from("together_safety_events").insert({
            user_id: user.id,
            character_instance_id: input.characterInstanceId,
            direction: "output",
            categories: outputSafety.categories,
            action: "replaced",
          });
        }
        if (!await touchConversationTurn(db, turnLease)) {
          throw new AppError(
            "CONFLICT",
            "A newer message took the conversational floor.",
            409,
            true,
          );
        }
        const assistantCommit = await commitDirectAssistantMessage(db, {
          turnId: turnLease.id,
          leaseToken: turnLease.token,
          speakerCharacterInstanceId: primarySpeakerId,
          content: safeText,
          responseKey,
          providerMetadata: {
            ...generated.metadata,
            ...intimacyProviderMetadata(dialogueContext),
            ...handoffProviderMetadata(dialogueContext),
            chatLanguage:normalizeChatLanguage(dialogueContext.chatLanguage),
            speakerName: characterTemplate.name,
            speakerSlug: characterTemplate.slug,
            directorUsed: dialogueContext.director?.used === true,
            ...(isContinuation?{continuationOfMessageId:input.anchorMessageId}:{}),
            ...(outputSafety.allowed?assistantMessagePolicy(route):safeMessagePolicy('safe')),
            ...privateDialoguePolicyMetadata({policy:dialoguePolicy,access:adultAccess,conversationMode:'direct',safetyDisposition:outputSafety.allowed?'allowed':'redirected',providerRoute:route.provider}),
          },
        });
        const assistantMessage = assistantCommit.message;
        let additional: {
          messages: Record<string, unknown>[];
          reactions: Record<string, unknown>[];
        } = { messages: [], reactions: [] };
        if (assistantCommit.created) {
          if (dialogueContext.currentScene.sceneSessionId&&!route.explicit) {
            await recordSceneMessage(db, {
              userId: user.id,
              continuityId: continuity.id,
              sceneId: dialogueContext.currentScene.sceneSessionId,
              message: assistantMessage,
              role: "character",
              characterInstanceId: primarySpeakerId,
            });
          }
          if(!isContinuation&&route.explicit)scheduleConversationEffects(()=>recordAdultSafeContext(db,user.id,input.conversationId,String(assistantMessage.created_at),String(userMessage.content??''),String(assistantMessage.content??'')),correlationId);
          if(!isContinuation&&!route.explicit)scheduleConversationEffects(async () => {
            await safelyApplyConversationEffects(
              db,
              user.id,
              primarySpeakerId,
              input.conversationId,
              userMessage.id,
              String(assistantMessage.id),
              userText,
              safeText,
              relationshipResult.data,
              String(selected.instance.relationship_stage),
              dialogueContext,
              correlationId,
            );
            if (dialogueContext.currentScene.sceneSessionId) {
              await copyWitnessedUserMemories(db, {
                userId: user.id,
                continuityId: continuity.id,
                sceneId: dialogueContext.currentScene.sceneSessionId,
                userMessageId: String(userMessage.id),
                sourceCharacterInstanceId: primarySpeakerId,
              });
            }
          }, correlationId);
          await db.from("together_conversations").update({
            last_message_at: assistantMessage.created_at,
            updated_at: assistantMessage.created_at,
            kind: conversation.kind === "first_meeting"
              ? "direct"
              : conversation.kind,
          }).eq("id", input.conversationId).eq("user_id", user.id);
          await acknowledgeArrival(
            db,
            user.id,
            conversation,
            String(assistantMessage.created_at),
          );
          await track(db, user.id, "message_sent", {
            characterInstanceId: input.characterInstanceId,
          });
          await track(db, user.id, "character_response_received", {
            characterInstanceId: input.characterInstanceId,
          });
          if(!route.explicit)additional = await generateAdditionalSceneReplies(db, {
            userId: user.id,
            continuityId: continuity.id,
            conversationId: input.conversationId,
            userMessageId: String(userMessage.id),
            userText,
            baseContext: dialogueContext,
            remainingSpeakerActions: remainingSceneActions,
            sceneCandidates,
            continuationBudget: scenePlan.continuationBudget,
            primaryReply: safeText,
            primaryMessageId: String(assistantMessage.id),
            sceneId: dialogueContext.currentScene.sceneSessionId,
            ageVerified: Boolean(profile?.age_verified_at),
            requestedMode,
            correlationId,
          });
        }
        return leased(
          streamText(
            safeText,
            {
              ...assistantMessage,
              together_message_reactions: additional.reactions,
            },
            correlationId,
            additional.messages,
          ),
        );
      } catch (error) {
        if (turnLease?.acquired) {
          await finishConversationTurn(db, turnLease, "failed", {
            errorCode: error instanceof AppError
              ? error.code
              : "INTERNAL_ERROR",
          });
        }
        return errorResponse(error, correlationId);
      }
    });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
});

function streamPreparedDialogue(
  correlationId: string,
  prepare: () => Promise<Response>,
): Response {
  let connectionOpen = true;
  const stream = new ReadableStream({
    async start(controller) {
      const preparationStartedAt = Date.now();
      const enqueue = (chunk: Uint8Array): boolean => {
        if (!connectionOpen) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          connectionOpen = false;
          return false;
        }
      };
      const emit = (data: Record<string, unknown>): boolean =>
        enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      emit({
        type: "start",
        messageId: crypto.randomUUID(),
        phase: "preparing",
      });
      const heartbeat = setInterval(
        () => void emit({ type: "heartbeat", phase: "preparing" }),
        4_000,
      );
      try {
        const response = await prepare();
        console.log(
          JSON.stringify({
            level: "info",
            correlationId,
            operation: "dialogue_prepared",
            durationMs: Date.now() - preparationStartedAt,
            status: response.status,
          }),
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as
            | Record<string, any>
            | null;
          const responseError = payload?.error ?? {};
          emit({
            type: "error",
            error: {
              code: String(responseError.code ?? "INTERNAL_ERROR"),
              message: String(
                responseError.message ??
                  "Your companion needs a moment before replying.",
              ),
              retryable: responseError.retryable !== false,
            },
          });
          return;
        }
        if (!response.body) {
          throw new AppError(
            "PROVIDER_UNAVAILABLE",
            "Your companion needs a moment before replying.",
            503,
            true,
          );
        }
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) enqueue(value);
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            correlationId,
            operation: "prepare_dialogue_stream",
            message: error instanceof Error
              ? error.message
              : "Unknown preparation error",
          }),
        );
        const appError = error instanceof AppError ? error : new AppError(
          "PROVIDER_UNAVAILABLE",
          "Your companion needs a moment before replying.",
          503,
          true,
        );
        emit({
          type: "error",
          error: {
            code: appError.code,
            message: appError.message,
            retryable: appError.retryable,
          },
        });
      } finally {
        clearInterval(heartbeat);
        if (connectionOpen) {
          try {
            controller.close();
          } catch {
            connectionOpen = false;
          }
        }
      }
    },
    cancel() {
      connectionOpen = false;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Correlation-ID": correlationId,
    },
  });
}

function streamText(
  content: string,
  message: Record<string, unknown>,
  correlationId: string,
  additionalMessages: Record<string, unknown>[] = [],
  generatedMedia: Record<string, unknown> | null = null,
  photoRequestError?: PhotoRequestError,
  mediaOffer?: Record<string, unknown> | null,
): Response {
  const startFrame=`data: ${JSON.stringify({type:"start",messageId:message.id})}\n\n`;
  const doneFrame=`data: ${JSON.stringify({type:"done",message,additionalMessages,generatedMedia,...(photoRequestError?{photoRequestError}:{}),...(mediaOffer?{mediaOffer}:{})})}\n\n`;
  const headers={
    ...corsHeaders,
    "Content-Type":"text/event-stream",
    "Cache-Control":"no-cache, no-transform",
    "X-Accel-Buffering":"no",
    "X-Correlation-ID":correlationId,
  };
  // Photo-only turns contain no tokens. Sending their start and terminal events
  // together prevents edge proxies from flushing the first tiny chunk while
  // dropping the equally small completion chunk.
  if(!content||content===PHOTO_ONLY_MESSAGE_CONTENT)return new Response(startFrame+doneFrame,{status:200,headers});
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(startFrame));
      const streamedContent = content === PHOTO_ONLY_MESSAGE_CONTENT
        ? ""
        : content;
      const parts = streamedContent.match(/\S+\s*/g) ?? [];
      for (const token of parts) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "token", token })}\n\n`,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      controller.enqueue(encoder.encode(doneFrame));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers,
  });
}

async function waitForAssistantReply(
  db: any,
  userId: string,
  conversationId: string,
  responseKey: string,
  timeoutMs = 20_000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    const { data } = await db.from("together_messages").select("*").eq(
      "user_id",
      userId,
    ).eq("conversation_id", conversationId).eq("role", "assistant").eq(
      "response_key",
      responseKey,
    ).maybeSingle();
    if (data) return data as Record<string, unknown>;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  return null;
}

async function replayMediaOffer(
  db: any,
  userId: string,
  conversationId: string,
  message: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const metadata = message.provider_metadata &&
      typeof message.provider_metadata === "object" &&
      !Array.isArray(message.provider_metadata)
    ? message.provider_metadata as Record<string, unknown>
    : {};
  if (
    message.content !== PHOTO_ONLY_MESSAGE_CONTENT &&
    metadata.mediaOnly !== true
  ) return null;
  const { data, error } = await db.from("together_media_offers").select("*").eq(
    "user_id",
    userId,
  ).eq("conversation_id", conversationId).eq("message_id", String(message.id))
    .in("status", ["pending", "accepted", "failed"]).order("created_at", {
      ascending: false,
    }).limit(1).maybeSingle();
  if (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "replay_photo_offer",
        message: error.message ?? "query_failed",
      }),
    );
    return null;
  }
  return data ?? null;
}

function fallbackLifeRun(instance: Record<string, any>) {
  return {
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
}

async function fastConversationLifeRun(
  db: any,
  userId: string,
  characterInstanceId: string,
  instance: Record<string, any>,
  now: Date,
) {
  try {
    const presence = await resolveCompanionPresence({
      db,
      userId,
      characterInstanceId,
      now,
      ensure: false,
    });
    if (!presence) return fallbackLifeRun(instance);
    return {
      state: {
        locationId: presence.locationId,
        location: presence.placeContext?.location.name ?? "Current place",
        activity: presence.activity,
        mood: presence.mood ?? instance.current_mood ?? "present",
        energy: presence.energy ?? instance.current_energy ?? "medium",
        availability: presence.availability,
        interruptibility: presence.interruptibility,
      },
      stateSource: presence.source,
      presence,
      activeEvent: null,
      events: [],
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "fast_conversation_presence",
        message: error instanceof Error ? error.message : "unknown_error",
      }),
    );
    return fallbackLifeRun(instance);
  }
}

function lifeSimulationIsStale(
  instance: Record<string, any>,
  now: Date,
): boolean {
  const simulatedAt = new Date(String(instance.last_simulated_at ?? 0))
    .getTime();
  return !Number.isFinite(simulatedAt) ||
    now.getTime() - simulatedAt > 5 * 60_000;
}

function deferScheduleExtension(
  input: {
    db: any;
    userId: string;
    characterInstanceId: string;
    conversationId: string;
    scheduleEventId?: string;
    now: Date;
    correlationId: string;
  },
): void {
  if (!input.scheduleEventId) return;
  waitUntil(
    extendScheduleForConversation({
      db: input.db,
      userId: input.userId,
      characterInstanceId: input.characterInstanceId,
      conversationId: input.conversationId,
      scheduleEventId: input.scheduleEventId,
      now: input.now,
    }).then(async (extended) => {
      if (extended) {
        await track(
          input.db,
          input.userId,
          "scene_extended_past_schedule_boundary",
          {
            characterInstanceId: input.characterInstanceId,
            scheduleEventId: input.scheduleEventId,
          },
        );
      }
    }).catch((error) =>
      console.warn(
        JSON.stringify({
          level: "warn",
          correlationId: input.correlationId,
          operation: "background_scene_extension",
          message: error instanceof Error ? error.message : "unknown_error",
        }),
      )
    ),
  );
}

function deferPhotoRequestHousekeeping(
  input: {
    db: any;
    userId: string;
    input: z.infer<typeof schema>;
    conversation: Record<string, any>;
    instance: Record<string, any>;
    context: PhotoOfferContext;
    correlationId: string;
  },
): void {
  const now = new Date();
  const tasks: Promise<unknown>[] = [];
  if (lifeSimulationIsStale(input.instance, now)) {
    tasks.push(
      runLifeSimulation({
        db: input.db,
        userId: input.userId,
        characterInstanceId: input.input.characterInstanceId,
        now,
        evaluateProactive: false,
        persistCharacterState: false,
        trigger: "conversation_continued",
      }).catch((error) =>
        console.warn(
          JSON.stringify({
            level: "warn",
            correlationId: input.correlationId,
            operation: "background_photo_life_simulation",
            message: error instanceof Error ? error.message : "unknown_error",
          }),
        )
      ),
    );
  }
  const scheduleEventId = input.context.currentScene.scheduleEventId;
  if (scheduleEventId) {
    tasks.push(
      extendScheduleForConversation({
        db: input.db,
        userId: input.userId,
        characterInstanceId: input.input.characterInstanceId,
        conversationId: input.input.conversationId,
        scheduleEventId,
        now,
      }).then(async (extended) => {
        if (extended) {
          await track(
            input.db,
            input.userId,
            "scene_extended_past_schedule_boundary",
            {
              characterInstanceId: input.input.characterInstanceId,
              scheduleEventId,
            },
          );
        }
      }).catch((error) =>
        console.warn(
          JSON.stringify({
            level: "warn",
            correlationId: input.correlationId,
            operation: "background_photo_scene_extension",
            message: error instanceof Error ? error.message : "unknown_error",
          }),
        )
      ),
    );
  }
  if (tasks.length) waitUntil(Promise.all(tasks));
}

function semanticRecallNeeded(message: string): boolean {
  const intent=classifyConversationQuery(message);
  return ['memory_overview','history','location','story'].includes(intent)||/\b(?:remember|forgot|remind me|what was|what did we|who is|when did|where did|last time|before|our first|used to|history|you told me|i told you)\b/i.test(message);
}

function boundaryResponseForRoute(
  characterName: string,
  route: DialogueRoutingDecision,
  language:unknown='en',
  sourceText?:unknown,
): { text: string; storeOriginal: boolean; category: string } | null {
  if (route.reason === "safety_block") {
    return {
      text:localizedSafetyBoundary(characterName,language,sourceText),
      storeOriginal: false,
      category: "hard_safety_block",
    };
  }
  return null;
}

function dialogueRunOptions(
  route: DialogueRoutingDecision,
  usageScope: DialogueRunOptions["usageScope"],
  operation?: string,
  sharedSceneParticipant = false,
  generationContext?: DialogueGenerationContext,
): DialogueRunOptions {
  return {
    route,
    usageScope,
    generationContext:generationContext??{mode:'direct',speakerRole:'primary',activeSpeakerCount:1},
    ...(operation ? { operation } : {}),
    ...(sharedSceneParticipant ? { sharedSceneParticipant: true } : {}),
  };
}

function safeMessagePolicy(rating:'safe'|'suggestive'='safe'):Record<string,unknown>{return{contentRating:rating,visibilityScope:'all',moderationVersion:'web-adult-v1'};}
function projectReplyForAccess(message:Record<string,any>,authorized:boolean):Record<string,any>{if(authorized||isSafePolicy(message))return message;return{id:`bridge-${String(message.id)}`,conversation_id:message.conversation_id,role:'system',content:'Private exchange\n\nA portion of this conversation is unavailable in this app.',delivery_status:'complete',moderation_status:'approved',content_rating:'safe',visibility_scope:'all',moderation_version:'safe-bridge-v1',created_at:message.created_at,updated_at:message.updated_at,provider_metadata:{systemEvent:'restricted_bridge'}};}
function userMessagePolicy(route:DialogueRoutingDecision):Record<string,unknown>{
  const adult=route.explicit&&(route.classification==='adult_intimacy'||route.classification==='explicit_adult');
  return adult?{contentRating:'explicit',visibilityScope:'all',moderationVersion:'private-adult-text-v1',adultAuthorized:true,safeBridge:'You and your companion shared a more intimate moment and grew closer.'}:safeMessagePolicy(route.resolvedMode==='standard'?'safe':'suggestive');
}
function assistantMessagePolicy(route:DialogueRoutingDecision):Record<string,unknown>{
  return route.explicit?{contentRating:'explicit',visibilityScope:'all',moderationVersion:'private-adult-text-v1',adultAuthorized:true,safeBridge:'You and your companion shared a more intimate moment and grew closer.'}:safeMessagePolicy(route.resolvedMode==='standard'?'safe':'suggestive');
}

async function recordAdultSafeContext(db:any,userId:string,conversationId:string,at:string,userText:string,assistantText:string):Promise<void>{
  const{data}=await db.from('together_conversations').select('canonical_context,safe_context').eq('id',conversationId).eq('user_id',userId).maybeSingle();
  if(!data)return;
  const priorCanonical=String(data.canonical_context?.summary??'').trim(),priorSafe=String(data.safe_context?.summary??'').trim(),bridge=await deriveSafeRelationalSummary({analysis,moderation,userText,assistantText,usageScope:{db,userId,conversationId,contentMode:'explicit',metadata:{pipeline:'safe_relational_summary'}}});
  const exchange=`USER: ${userText.trim()}\nCOMPANION: ${assistantText.trim()}`.trim(),canonicalSummary=[priorCanonical,exchange].filter(Boolean).join('\n\n').slice(-4_000),safeSummary=(priorSafe.endsWith(bridge)?priorSafe:[priorSafe,bridge].filter(Boolean).join('\n\n')).slice(-2_000);
  await db.from('together_conversations').update({
    canonical_context:{...(data.canonical_context??{}),summary:canonicalSummary,lastAdultExchangeAt:at,projectionVersion:'private-adult-text-v1'},
    safe_context:{...(data.safe_context??{}),summary:safeSummary,relationshipDevelopment:bridge,updatedAt:at,projectionVersion:'private-adult-text-v1'},
    updated_at:at,
  }).eq('id',conversationId).eq('user_id',userId);
}
function normalizeContentMode(value: unknown): DialogueContentMode {
  return value === "romance" || value === "mature" || value === "explicit"
    ? value
    : "standard";
}
function outputBoundaryResponse(characterName: string,language:unknown='en',sourceText?:unknown): string {
  return localizedSafetyBoundary(characterName,language,sourceText);
}

function localizedSafetyBoundary(characterName:string,language:unknown,sourceText?:unknown):string{
  return chatLanguageSafetyBoundary(characterName,language,sourceText);
}

async function photoOnlyResponse(input: {
  db: any;
  userId: string;
  input: z.infer<typeof schema>;
  conversation: Record<string, any>;
  userMessage: Record<string, any>;
  context: PhotoOfferContext;
  correlationId: string;
  turnLease: ConversationTurnLease;
  responseKey: string;
  adultPipelineAuthorized:boolean;
  inputModerationApproved:boolean;
}): Promise<Response> {
  const character = input.context.character ?? {};
  const deliveryCommit = await commitDirectAssistantMessage(input.db, {
    turnId: input.turnLease.id,
    leaseToken: input.turnLease.token,
    speakerCharacterInstanceId: input.input.characterInstanceId,
    content: PHOTO_ONLY_MESSAGE_CONTENT,
    responseKey: input.responseKey,
    providerMetadata: {
      provider: "kivelle-media",
      mediaOnly: true,
      chatLanguage:normalizeChatLanguage(input.conversation.metadata?.chatPreferences?.chatLanguage),
      speakerName: character.name,
      speakerSlug: character.slug,
    },
  });
  const deliveryMessage = deliveryCommit.message;

  const [prepared] = deliveryCommit.created
    ? await Promise.all([
      safelyCreateConversationPhotoOffer(
        input.db,
        input.userId,
        input.input,
        input.userMessage,
        String(deliveryMessage.id),
        input.correlationId,
        input.context,
        input.adultPipelineAuthorized,
        input.inputModerationApproved,
      ),
      input.db.from("together_conversations").update({
        last_message_at: deliveryMessage.created_at,
        updated_at: deliveryMessage.created_at,
        kind: input.conversation.kind === "first_meeting"
          ? "direct"
          : input.conversation.kind,
      }).eq("id", input.input.conversationId),
      acknowledgeArrival(
        input.db,
        input.userId,
        input.conversation,
        String(input.userMessage.created_at),
      ),
      track(input.db, input.userId, "message_sent", {
        characterInstanceId: input.input.characterInstanceId,
        photoRequest: true,
        mediaOnly: true,
      }),
    ])
    : [{
      offer: await replayMediaOffer(
        input.db,
        input.userId,
        input.input.conversationId,
        deliveryMessage,
      ),
      error: undefined,
    }];
  return streamText(
    "",
    deliveryMessage,
    input.correlationId,
    [],
    null,
    prepared.error,
    prepared.offer,
  );
}

function streamDialogue({
  db,
  user,
  input,
  conversation,
  instance,
  relationship,
  userMessage,
  context,
  correlationId,
  primarySpeakerId,
  remainingSpeakerActions,
  sceneCandidates,
  continuationBudget,
  runOptions,
  ageVerified,
  requestedMode,
  turnLease,
}: {
  db: any;
  user: { id: string };
  input: z.infer<typeof schema>;
  conversation: Record<string, unknown>;
  instance: Record<string, unknown>;
  relationship: Record<string, unknown>;
  userMessage: Record<string, unknown>;
  context: Parameters<ConfiguredDialogueProvider["generate"]>[0];
  correlationId: string;
  primarySpeakerId: string;
  remainingSpeakerActions: GroupTurnAction[];
  sceneCandidates: GroupSpeakerCandidate[];
  continuationBudget: number;
  runOptions: DialogueRunOptions;
  ageVerified: boolean;
  requestedMode: DialogueContentMode;
  turnLease: ConversationTurnLease;
}): Response {
  let connectionOpen = true;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>): boolean => {
        if (!connectionOpen) return false;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
          return true;
        } catch {
          connectionOpen = false;
          return false;
        }
      };
      const heartbeat = setInterval(
        () => void emit({ type: "heartbeat" }),
        4_000,
      );
      try {
        emit({ type: "start", messageId: crypto.randomUUID() });
        let content = "";
        let runMetadata: DialogueRunMetadata | undefined;
        const bufferedAdult =
          runOptions.route.classification === "adult_intimacy" ||
          runOptions.route.classification === "explicit_adult";
        if (bufferedAdult) {
          let pending = "",
            approved = "",
            blockedCategories: string[] | null = null,
            needsRepair = false;
          const approveAndEmit = async (segment: string): Promise<boolean> => {
            const candidate = approved + segment;
            if (!runOptions.route.explicit&&hasSexualDialogueLanguage(candidate)) {
              blockedCategories = ["production_sexual_content_ceiling"];
              return false;
            }
            if (
              runOptions.route.provider === "xai" &&
              context.intimacyStance?.shouldReciprocate === true &&
              isContradictoryAcceptedIntimacyRefusal(candidate)
            ) {
              needsRepair = true;
              return false;
            }
            const outputSafety = await moderation.check(
              `${moderationContextTail(approved)}${segment}`,
              {
                ...runOptions.usageScope,
                characterInstanceId: primarySpeakerId,
                metadata: {
                  direction: "output_segment",
                  safetyGatedStream: true,
                },
              },
            );
            if (!outputSafety.allowed) {
              blockedCategories = outputSafety.categories;
              return false;
            }
            approved += segment;
            content += segment;
            emit({ type: "token", token: segment });
            return true;
          };
          providerLoop: for await (
            const event of dialogue.stream(context, runOptions)
          ) {
            if (event.type === "complete") {
              runMetadata = event.metadata;
              continue;
            }
            pending += event.token;
            const extracted = takeModerationSegments(pending);
            pending = extracted.remainder;
            for (const segment of extracted.segments) {
              if (!await approveAndEmit(segment)) break providerLoop;
            }
          }
          if (!needsRepair && !blockedCategories) {
            const extracted = takeModerationSegments(pending, { flush: true });
            for (const segment of extracted.segments) {
              if (!await approveAndEmit(segment)) break;
            }
          }
          if (needsRepair) {
            const repairContext = {
              ...context,
              dialogueRouting: {
                ...(context.dialogueRouting ?? {}),
                responseRepair: "accepted_intimacy_contradiction",
              },
            };
            const repaired = await dialogue.generate(repairContext, {
              ...runOptions,
              operation: `${
                runOptions.operation ?? "dialogue_xai"
              }_stream_repair`,
            });
            const repairSafety = await moderation.check(repaired.text, {
              ...runOptions.usageScope,
              characterInstanceId: primarySpeakerId,
              metadata: { direction: "output_repair", safetyGatedStream: true },
            });
            runMetadata = { ...repaired.metadata, fallback: true };
            if (
              repairSafety.allowed &&
              !isContradictoryAcceptedIntimacyRefusal(repaired.text)
            ) {
              content = approved + repaired.text;
              emit({ type: "token", token: repaired.text });
            } else {blockedCategories = repairSafety.categories.length
                ? repairSafety.categories
                : ["contradictory_intimacy_refusal"];}
          }
          if (blockedCategories) {
            const boundary = `${content.trim() ? "\n\n" : ""}${
              outputBoundaryResponse(
                String(context.character?.name ?? "Companion"),
                context.chatLanguage,
                context.userMessage,
              )
            }`;
            content += boundary;
            emit({ type: "token", token: boundary });
            await db.from("together_safety_events").insert({
              user_id: user.id,
              character_instance_id: primarySpeakerId,
              direction: "output",
              categories: blockedCategories,
              action: "replaced",
            });
          }
        } else {
          for await (const event of dialogue.stream(context, runOptions)) {
            if (event.type === "complete") {
              runMetadata = event.metadata;
              continue;
            }
            content += event.token;
            emit({ type: "token", token: event.token });
          }
        }
        if (!content.trim()) {
          throw new AppError(
            "PROVIDER_UNAVAILABLE",
            "Your companion needs a moment before replying.",
            503,
            true,
          );
        }
        if (!await touchConversationTurn(db, turnLease)) {
          throw new AppError(
            "CONFLICT",
            "A newer message took the conversational floor.",
            409,
            true,
          );
        }
        const assistantCommit = await commitDirectAssistantMessage(db, {
          turnId: turnLease.id,
          leaseToken: turnLease.token,
          speakerCharacterInstanceId: primarySpeakerId,
          content,
          responseKey: directResponseKey(turnLease.requestId),
          providerMetadata: {
            ...(runMetadata ??
              {
                provider: runOptions.route.provider,
                model: "configured-default",
                routeReason: runOptions.route.reason,
                contentMode: runOptions.route.resolvedMode,
              }),
            ...intimacyProviderMetadata(context),
            ...handoffProviderMetadata(context),
            chatLanguage:normalizeChatLanguage(context.chatLanguage),
            streamed: true,
            speakerName: context.character?.name,
            speakerSlug: context.character?.slug,
            directorUsed: context.director?.used === true,
            ...(input.messageAction==='continue'?{continuationOfMessageId:input.anchorMessageId}:{}),
            ...assistantMessagePolicy(runOptions.route),
          },
        });
        const assistantMessage = assistantCommit.message;
        let additional: {
          messages: Record<string, unknown>[];
          reactions: Record<string, unknown>[];
        } = { messages: [], reactions: [] };
        if (assistantCommit.created) {
          if (context.currentScene?.sceneSessionId&&!runOptions.route.explicit) {
            await recordSceneMessage(db, {
              userId: user.id,
              continuityId: String(instance.continuity_id),
              sceneId: String(context.currentScene.sceneSessionId),
              message: assistantMessage,
              role: "character",
              characterInstanceId: primarySpeakerId,
            });
          }
          if(input.messageAction!=='continue'&&runOptions.route.explicit)scheduleConversationEffects(()=>recordAdultSafeContext(db,user.id,input.conversationId,String(assistantMessage.created_at),String(userMessage.content??''),String(assistantMessage.content??'')),correlationId);
          if(input.messageAction!=='continue'&&!runOptions.route.explicit)scheduleConversationEffects(async () => {
            await safelyApplyConversationEffects(
              db,
              user.id,
              primarySpeakerId,
              input.conversationId,
              String(userMessage.id),
              String(assistantMessage.id),
              String(context.userMessage ?? input.message),
              content,
              relationship,
              String(instance.relationship_stage),
              context,
              correlationId,
            );
            if (context.currentScene?.sceneSessionId) {
              await copyWitnessedUserMemories(db, {
                userId: user.id,
                continuityId: String(instance.continuity_id),
                sceneId: String(context.currentScene.sceneSessionId),
                userMessageId: String(userMessage.id),
                sourceCharacterInstanceId: primarySpeakerId,
              });
            }
          }, correlationId);
          await db.from("together_conversations").update({
            last_message_at: assistantMessage.created_at,
            updated_at: assistantMessage.created_at,
            kind: conversation.kind === "first_meeting"
              ? "direct"
              : conversation.kind,
          }).eq("id", input.conversationId).eq("user_id", user.id);
          await acknowledgeArrival(
            db,
            user.id,
            conversation,
            String(assistantMessage.created_at),
          );
          await track(db, user.id, "message_sent", {
            characterInstanceId: input.characterInstanceId,
          });
          await track(db, user.id, "character_response_received", {
            characterInstanceId: input.characterInstanceId,
          });
          if(!runOptions.route.explicit)additional = await generateAdditionalSceneReplies(db, {
            userId: user.id,
            continuityId: String(instance.continuity_id),
            conversationId: input.conversationId,
            userMessageId: String(userMessage.id),
            userText: String(context.userMessage ?? input.message),
            baseContext: context,
            remainingSpeakerActions,
            sceneCandidates,
            continuationBudget,
            primaryReply: content,
            primaryMessageId: String(assistantMessage.id),
            sceneId: context.currentScene?.sceneSessionId,
            ageVerified,
            requestedMode,
            correlationId,
          });
        }
        emit({
          type: "done",
          message: {
            ...assistantMessage,
            together_message_reactions: additional.reactions,
          },
          additionalMessages: additional.messages,
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            correlationId,
            message: error instanceof Error
              ? error.message
              : "Unknown stream error",
          }),
        );
        const appError = error instanceof AppError ? error : new AppError(
          "PROVIDER_UNAVAILABLE",
          "Your companion needs a moment before replying.",
          503,
          true,
        );
        emit({
          type: "error",
          error: {
            code: appError.code,
            message: appError.message,
            retryable: appError.retryable,
          },
        });
      } finally {
        clearInterval(heartbeat);
        if (connectionOpen) {
          try {
            controller.close();
          } catch {
            connectionOpen = false;
          }
        }
      }
    },
    cancel() {
      connectionOpen = false;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Correlation-ID": correlationId,
    },
  });
}

function scheduleConversationEffects(
  effect: () => Promise<void>,
  correlationId: string,
) {
  waitUntil(
    effect().catch((error) =>
      console.error(
        JSON.stringify({
          level: "error",
          correlationId,
          operation: "background_conversation_effects",
          message: error instanceof Error ? error.message : "unknown_error",
        }),
      )
    ),
  );
}

async function dialogueSpeaker(
  db: any,
  userId: string,
  continuityId: string,
  speakerId: string,
  baseContext: any,
): Promise<{ instance: Record<string, any>; context: any }> {
  const conversationId = String(
    baseContext.conversationId ?? baseContext.conversation?.id ??
      baseContext.currentScene?.conversationId ?? "",
  );
  let conversation = baseContext.conversation as
    | Record<string, any>
    | undefined;
  if (!conversation) {
    const query = conversationId
      ? db.from("together_conversations").select("*").eq("id", conversationId)
      : db.from("together_conversations").select("*").eq("user_id", userId).eq(
        "continuity_id",
        continuityId,
      ).eq(
        "character_instance_id",
        baseContext.sceneSpeakerDirective?.characterInstanceId ?? speakerId,
      ).order("updated_at", { ascending: false }).limit(1);
    const { data } = await query.maybeSingle();
    conversation = data ?? undefined;
  }
  if (!conversation) {
    throw new AppError("NOT_FOUND", "That conversation is unavailable.", 404);
  }
  const sceneSessionId = baseContext.currentScene?.sceneSessionId
    ? String(baseContext.currentScene.sceneSessionId)
    : undefined;
  const selected = await buildIsolatedSpeakerContext({
    db,
    userId,
    continuityId,
    conversation,
    speakerCharacterInstanceId: speakerId,
    userMessage: String(baseContext.userMessage ?? ""),
    sceneSessionId,
    sceneContext: sceneSessionId
      ? { ...baseContext.currentScene, sceneSessionId }
      : undefined,
    authorizedWebAdult:baseContext.contentAccess?.authorizedWebAdult===true,
    authorizedPrivateAdultText:baseContext.contentAccess?.authorizedPrivateAdultText===true,
  });
  const context: any = {
    ...selected.context,
    conversationId: String(conversation.id),
    conversation,
    sceneSpeakerDirective: {
      ...((selected.context as any).sceneSpeakerDirective ?? {}),
      characterInstanceId: speakerId,
    },
  };
  assertSpeakerPrivateContext(context, speakerId);
  return { instance: selected.instance, context };
}

function sharedSceneGroupCandidates(context: any): GroupSpeakerCandidate[] {
  const recent = [...(context.recent ?? [])].filter((turn: any) =>
    turn.role === "assistant"
  ).slice(-12).reverse();
  return (context.sceneParticipants ?? []).map((participant: any) => {
    const id = String(participant.characterInstanceId),
      recentSpeakerCount = recent.filter((turn: any) =>
        String(turn.speakerCharacterInstanceId ?? "") === id
      ).length;
    let consecutiveSpeakerCount = 0;
    for (const turn of recent) {
      if (String(turn.speakerCharacterInstanceId ?? "") !== id) {
        break;
      }
      consecutiveSpeakerCount += 1;
    }
    return {
      characterInstanceId: id,
      name: String(participant.name ?? "Companion"),
      available: true,
      socialEnergy: Number(participant.socialEnergy ?? .5),
      directness: Number(participant.directness ?? .5),
      knowledgeRelevance: Number(participant.relationshipRelevance ?? .5),
      relationshipRelevance: Number(participant.relationshipRelevance ?? .5),
      affinityWithOthers: Number(participant.socialAffinity ?? .5),
      tensionWithOthers: Number(participant.socialTension ?? 0),
      recentSpeakerCount,
      consecutiveSpeakerCount,
    };
  });
}

function attachIntimacyStance(context: any) {
  context.intimacyStance = compileIntimacyStance({
    message: String(context.userMessage ?? ""),
    recentTurns: context.recent ?? [],
    relationship: {
      ...context.relationship,
      spiceLevel: context.character?.spice_level,
      personality: context.character?.personality_config,
    },
    personality: context.character?.personality_config,
    interactionMode: String(context.currentScene?.interactionMode ?? "remote"),
    availability: String(
      context.currentScene?.interruptibility ??
        context.currentScene?.availability ?? "open",
    ),
    requestedMode: normalizeContentMode(
      context.dialogueRouting?.requestedMode ?? context.contentMode,
    ),
  });
}

function intimacyProviderMetadata(context: any): Record<string, unknown> {
  const stance = context.intimacyStance;
  return stance?.active
    ? {
      intimacyOutcome: stance.outcome,
      intimacyDisposition: stance.disposition,
      intimacyInteractionScope: stance.interactionScope,
      intimacyReasonCodes: stance.reasonCodes,
    }
    : {};
}

async function generateAdditionalSceneReplies(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    conversationId: string;
    userMessageId: string;
    userText: string;
    baseContext: any;
    remainingSpeakerActions: GroupTurnAction[];
    sceneCandidates: GroupSpeakerCandidate[];
    continuationBudget: number;
    primaryReply: string;
    primaryMessageId: string;
    sceneId?: string;
    ageVerified: boolean;
    requestedMode: DialogueContentMode;
    correlationId: string;
  },
): Promise<
  { messages: Record<string, unknown>[]; reactions: Record<string, unknown>[] }
> {
  const replies: Record<string, unknown>[] = [],
    reactions: Record<string, unknown>[] = [];
  if (
    !input.sceneId || input.continuationBudget < 1 ||
    !input.remainingSpeakerActions.length
  ) return { messages: replies, reactions };
  const primarySpeakerId = String(
    input.baseContext.sceneSpeakerDirective?.characterInstanceId ?? "",
  );
  const continuation = planGroupContinuation({
    originatingMessage: input.userText,
    latestMessage: input.primaryReply,
    latestSpeakerCharacterInstanceId: primarySpeakerId,
    candidates: input.sceneCandidates,
    alreadySpokeCharacterInstanceIds: [primarySpeakerId],
    preferredActions: input.remainingSpeakerActions,
    energy: "balanced",
    continuationIndex: 1,
  });
  if (!continuation) return { messages: replies, reactions };
  if (continuation.type === "reaction") {
    const reaction = await persistSharedSceneReaction(db, {
      userId: input.userId,
      continuityId: input.continuityId,
      conversationId: input.conversationId,
      sceneId: input.sceneId,
      messageId: input.primaryMessageId,
      reactorCharacterInstanceId: continuation.characterInstanceId,
      reactorName: input.sceneCandidates.find((candidate) =>
        candidate.characterInstanceId === continuation.characterInstanceId
      )?.name ?? "Companion",
      reaction: continuation.reaction ?? "👀",
      reasonCodes: continuation.reasonCodes,
    });
    if (reaction) {
      reactions.push(reaction);
      await track(db, input.userId, "shared_scene_character_reacted", {
        sceneId: input.sceneId,
        characterInstanceId: continuation.characterInstanceId,
        reasonCode: continuation.reasonCodes[0],
      });
    }
    return { messages: replies, reactions };
  }
  for (const speakerId of [continuation.characterInstanceId]) {
    try {
      const selected = await dialogueSpeaker(
        db,
        input.userId,
        input.continuityId,
        speakerId,
        {
          ...input.baseContext,
          sceneSpeakerDirective: { characterInstanceId: speakerId },
        },
      );
      selected.context.sceneFloorAction = continuation;
      if (selected.context.responseBrief) {
        selected.context.responseBrief = {
          ...selected.context.responseBrief,
          shouldAskQuestion: false,
          handoff: {
            mode: "none",
            source: "none",
            reciprocityDebt: Number(
              selected.context.responseBrief.handoff?.reciprocityDebt ?? 0,
            ),
          },
        };
      }
      const routeInput = {
        message: input.userText,
        recentTurns: [...(selected.context.recent ?? [])].slice(-4),
        requestedMode: input.requestedMode,
        ageVerified: input.ageVerified,
        characterAge: Number(selected.context.character?.age ?? 0) || null,
        relationshipAllowsExplicit:
          selected.context.relationship?.romance_enabled !== false &&
          selected.context.relationship?.romance_path_status !== "friends_only",
      };
      let route = resolveDialogueRouting(routeInput);
      if (route.hardBlocked) continue;
      selected.context.contentMode = route.resolvedMode;
      selected.context.dialogueRouting = {
        provider: route.provider,
        reason: route.reason,
        classification: route.classification,
        requestedMode: route.requestedMode,
        contentMode: route.resolvedMode,
        explicit: route.explicit,
      };
      attachIntimacyStance(selected.context);
      await attachAuthoredDepthContext({
        db,
        userId: input.userId,
        continuityId: input.continuityId,
        conversationId: input.conversationId,
        characterInstanceId: speakerId,
        characterVersionId: String(
          selected.instance.character_version_id ?? "",
        ),
        context: selected.context,
      });
      const options = dialogueRunOptions(
        route,
        {
          db,
          userId: input.userId,
          continuityId: input.continuityId,
          conversationId: input.conversationId,
          characterInstanceId: speakerId,
          subscriptionTier: selected.context.subscription?.tier,
          routeReason: route.reason,
          contentMode: route.resolvedMode,
          correlationId: input.correlationId,
        },
        "shared_scene_dialogue",
        true,
        sharedSceneGenerationContext('secondary',input.sceneCandidates.length),
      );
      const generated = await dialogue.generate(selected.context, options);
      if (!generated.text.trim()) continue;
      const safety = await moderation.check(generated.text, {
        ...options.usageScope,
        metadata: { direction: "output", sharedSceneParticipant: true },
      });
      if (!safety.allowed) continue;
      const { data: message } = await db.from("together_messages").insert({
        conversation_id: input.conversationId,
        user_id: input.userId,
        character_instance_id: speakerId,
        speaker_character_instance_id: speakerId,
        role: "assistant",
        content: generated.text,
        delivery_status: "complete",
        provider_metadata: {
          ...generated.metadata,
          ...intimacyProviderMetadata(selected.context),
          ...handoffProviderMetadata(selected.context),
          chatLanguage:normalizeChatLanguage(selected.context.chatLanguage),
          sharedSceneParticipant: true,
          speakerName: selected.context.character?.name,
          speakerSlug: selected.context.character?.slug,
          directorUsed: selected.context.director?.used === true,
        },
      }).select("*").single();
      if (!message) continue;
      await recordSceneMessage(db, {
        userId: input.userId,
        continuityId: input.continuityId,
        sceneId: input.sceneId,
        message,
        role: "character",
        characterInstanceId: speakerId,
      });
      await safelyApplyConversationEffects(
        db,
        input.userId,
        speakerId,
        input.conversationId,
        input.userMessageId,
        String(message.id),
        input.userText,
        generated.text,
        selected.context.relationship,
        String(selected.instance.relationship_stage),
        selected.context,
        input.correlationId,
      );
      if (primarySpeakerId && primarySpeakerId !== speakerId) {
        await recordCharacterSocialInteraction(db, {
          userId: input.userId,
          continuityId: input.continuityId,
          sceneId: input.sceneId,
          characterAInstanceId: primarySpeakerId,
          characterBInstanceId: speakerId,
          text: generated.text,
        });
      }
      await track(db, input.userId, "shared_scene_character_spoke", {
        sceneId: input.sceneId,
        characterInstanceId: speakerId,
      });
      replies.push(message);
    } catch (error) {
      console.warn(
        "Shared-scene participant stayed silent",
        error instanceof Error ? error.message : "unknown_error",
      );
    }
  }
  return { messages: replies, reactions };
}

async function persistSharedSceneReaction(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    conversationId: string;
    sceneId: string;
    messageId: string;
    reactorCharacterInstanceId: string;
    reactorName: string;
    reaction: string;
    reasonCodes: string[];
  },
) {
  const { data, error } = await db.from("together_message_reactions").upsert({
    user_id: input.userId,
    continuity_id: input.continuityId,
    conversation_id: input.conversationId,
    message_id: input.messageId,
    reactor_character_instance_id: input.reactorCharacterInstanceId,
    reaction: input.reaction,
    metadata: {
      source: "shared_scene",
      sceneSessionId: input.sceneId,
      reactorName: input.reactorName,
      reasonCodes: input.reasonCodes,
    },
  }, { onConflict: "message_id,reactor_character_instance_id,reaction" })
    .select("*").single();
  if (error) {
    console.warn("Shared-scene reaction could not be saved", error.message);
    return null;
  }
  return data;
}

async function recordCharacterSocialInteraction(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    sceneId: string;
    characterAInstanceId: string;
    characterBInstanceId: string;
    text: string;
  },
) {
  const a = input.characterAInstanceId < input.characterBInstanceId
      ? input.characterAInstanceId
      : input.characterBInstanceId,
    b = input.characterAInstanceId < input.characterBInstanceId
      ? input.characterBInstanceId
      : input.characterAInstanceId;
  const { data: existing } = await db.from("together_character_social_states")
    .select("*").eq("continuity_id", input.continuityId).eq(
      "character_a_instance_id",
      a,
    ).eq("character_b_instance_id", b).maybeSingle();
  const now = new Date().toISOString(),
    event = classifyGroupSocialEvent(input.text),
    delta = event
      ? boundedGroupSocialDelta(event, .6, .8)
      : { affinity: 0, familiarity: 0, tension: 0 };
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
      : existing?.recent_direction ?? "steady",
    last_shared_scene_at: now,
    metadata: {
      ...(existing?.metadata ?? {}),
      lastSceneId: input.sceneId,
      lastInteractionAt: now,
      ...(event ? { lastSemanticEvent: event, lastSemanticEventAt: now } : {}),
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

async function recordSceneMessage(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    sceneId: string;
    message: Record<string, any>;
    role: "user" | "character";
    characterInstanceId?: string;
  },
) {
  const { data: existing } = await db.from("together_scene_messages").select(
    "id",
  ).eq("message_id", input.message.id).maybeSingle();
  if (existing) return;
  const [{ data: last }, { data: scene }] = await Promise.all([
    db.from("together_scene_messages").select("sequence").eq(
      "scene_session_id",
      input.sceneId,
    ).order("sequence", { ascending: false }).limit(1).maybeSingle(),
    db.from("together_scene_sessions").select("state").eq("id", input.sceneId)
      .eq("user_id", input.userId).maybeSingle(),
  ]);
  const sequence = Number(last?.sequence ?? 0) + 1;
  const { data: participants } = await db.from("together_scene_participants")
    .select(
      "character_instance_id,witnessed_from_sequence,witnessed_to_sequence",
    ).eq("scene_session_id", input.sceneId).lte(
      "witnessed_from_sequence",
      sequence,
    );
  const witnessed = (participants ?? []).filter((item: Record<string, any>) =>
    item.witnessed_to_sequence == null ||
    Number(item.witnessed_to_sequence) >= sequence
  ).map((item: Record<string, any>) => String(item.character_instance_id));
  await db.from("together_messages").update({
    scene_session_id: input.sceneId,
    scene_sequence: sequence,
    speaker_character_instance_id: input.role === "character"
      ? input.characterInstanceId ?? input.message.character_instance_id
      : null,
  }).eq("id", input.message.id).eq("user_id", input.userId);
  const { error } = await db.from("together_scene_messages").insert({
    user_id: input.userId,
    continuity_id: input.continuityId,
    scene_session_id: input.sceneId,
    message_id: input.message.id,
    role: input.role,
    character_instance_id: input.role === "character"
      ? input.characterInstanceId ?? input.message.character_instance_id
      : null,
    sequence,
    witnessed_by_instance_ids: witnessed,
    metadata: { contextVersion: 1 },
  });
  if (error) console.warn("Scene message attribution failed", error.message);
  await db.from("together_scene_sessions").update({
    state: { ...(scene?.state ?? {}), sequence },
    updated_at: new Date().toISOString(),
  }).eq("id", input.sceneId).eq("user_id", input.userId);
}

async function copyWitnessedUserMemories(
  db: any,
  input: {
    userId: string;
    continuityId: string;
    sceneId: string;
    userMessageId: string;
    sourceCharacterInstanceId: string;
  },
) {
  const [{ data: sceneMessage }, { data: sourceMemories }] = await Promise.all([
    db.from("together_scene_messages").select("witnessed_by_instance_ids").eq(
      "scene_session_id",
      input.sceneId,
    ).eq("message_id", input.userMessageId).eq("role", "user").maybeSingle(),
    db.from("together_memories").select("*").eq("user_id", input.userId).eq(
      "character_instance_id",
      input.sourceCharacterInstanceId,
    ).eq("source_message_id", input.userMessageId).eq("status", "active"),
  ]);
  const witnesses = (sceneMessage?.witnessed_by_instance_ids ?? []).map(String)
    .filter((id: string) => id !== input.sourceCharacterInstanceId);
  if (!witnesses.length || !sourceMemories?.length) return;
  const rows = witnesses.flatMap((characterInstanceId: string) =>
    (sourceMemories as Record<string, any>[]).map((memory) => ({
      user_id: input.userId,
      continuity_id: input.continuityId,
      character_instance_id: characterInstanceId,
      memory_type: memory.memory_type,
      canonical_text: memory.canonical_text,
      dedupe_key: memory.dedupe_key,
      subject_key: memory.subject_key,
      importance: memory.importance,
      confidence: memory.confidence,
      pinned: false,
      status: "active",
      sensitivity_category: memory.sensitivity_category,
      source_message_id: input.userMessageId,
      source_type: "message",
      source_id: input.userMessageId,
      learned_via: "direct_user",
      shareability: "private",
      valid_from: memory.valid_from ?? new Date().toISOString(),
      world_id: memory.world_id ?? null,
      location_id: memory.location_id ?? null,
      participant_instance_ids: [input.sourceCharacterInstanceId, ...witnesses],
      context_tags: [
        ...(Array.isArray(memory.context_tags) ? memory.context_tags : []),
        "shared_scene_witness",
      ],
      embedding: memory.embedding ?? null,
      metadata: {
        ...(memory.metadata ?? {}),
        witnessedInSceneId: input.sceneId,
        sourceMemoryId: memory.id,
      },
    }))
  );
  await db.from("together_memories").upsert(rows, {
    onConflict: "character_instance_id,dedupe_key",
    ignoreDuplicates: true,
  });
  await track(db, input.userId, "shared_scene_memory_witnessed", {
    sceneId: input.sceneId,
    witnessCount: witnesses.length,
    memoryCount: sourceMemories.length,
  });
}

async function acknowledgeArrival(
  db: any,
  userId: string,
  conversation: Record<string, any>,
  at: string,
) {
  const result = acknowledgeConversationScene(
    (conversation.metadata ?? {}) as Record<string, any>,
    at,
  );
  if (!result.acknowledged) return;
  conversation.metadata = result.metadata;
  await db.from("together_conversations").update({
    metadata: result.metadata,
    updated_at: at,
  }).eq("id", conversation.id).eq("user_id", userId);
  await track(db, userId, "scene_arrival_acknowledged", {
    characterInstanceId: conversation.character_instance_id,
  });
}

async function safelyApplyConversationEffects(
  db: any,
  userId: string,
  instanceId: string,
  conversationId: string,
  sourceMessageId: string,
  assistantMessageId: string,
  userText: string,
  assistantText: string,
  current: Record<string, unknown>,
  stage: string,
  context: Parameters<ConfiguredDialogueProvider["generate"]>[0],
  correlationId: string,
): Promise<void> {
  try {
    await markDeliveredHandoff(
      db,
      userId,
      instanceId,
      assistantMessageId,
      context,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        correlationId,
        operation: "conversation_handoff_tracking",
        message: error instanceof Error
          ? error.message
          : "Unknown handoff tracking error",
      }),
    );
  }
  try {
    await applyConversationEffects(
      db,
      userId,
      instanceId,
      conversationId,
      sourceMessageId,
      assistantMessageId,
      userText,
      assistantText,
      current,
      stage,
      context,
      correlationId,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        correlationId,
        operation: "together_continuity",
        message: error instanceof Error
          ? error.message
          : "Unknown continuity error",
      }),
    );
  }
}

function handoffProviderMetadata(context: any): Record<string, unknown> {
  const handoff = context?.responseBrief?.handoff;
  if (!handoff || handoff.mode === "none") return {};
  return {
    conversationalHandoff: {
      mode: String(handoff.mode),
      source: String(handoff.source),
      reciprocityDebt: Number(handoff.reciprocityDebt ?? 0),
      ...(handoff.openThreadId
        ? { openThreadId: String(handoff.openThreadId) }
        : {}),
    },
  };
}

async function markDeliveredHandoff(
  db: any,
  userId: string,
  instanceId: string,
  assistantMessageId: string,
  context: any,
): Promise<void> {
  const handoff = context?.responseBrief?.handoff;
  if (!handoff || handoff.mode === "none") return;
  const metadata = {
    mode: String(handoff.mode),
    source: String(handoff.source),
    reciprocityDebt: Number(handoff.reciprocityDebt ?? 0),
    assistantMessageId,
  };
  if (handoff.mode === "earned_followup" && handoff.openThreadId) {
    const now = new Date().toISOString();
    const { data } = await db.from("together_open_threads").update({
      last_followed_up_at: now,
      followup_count: 1,
      updated_at: now,
    }).eq("id", String(handoff.openThreadId)).eq("user_id", userId).eq(
      "character_instance_id",
      instanceId,
    ).is("resolved_at", null).is("last_followed_up_at", null).lt(
      "followup_count",
      1,
    ).select("id").maybeSingle();
    if (data) {
      await track(db, userId, "open_thread_followup_initiated", {
        threadId: data.id,
        ...metadata,
      });
    }
  }
  await track(db, userId, "conversation_handoff_delivered", metadata);
}

type PhotoRequestError = { code: string; message: string; retryable: boolean };

async function safelyCreateConversationPhotoOffer(
  db: any,
  userId: string,
  input: z.infer<typeof schema>,
  userMessage: Record<string, unknown>,
  messageId: string,
  correlationId: string,
  context: PhotoOfferContext,
  adultPipelineAuthorized:boolean,
  inputModerationApproved:boolean,
): Promise<
  { offer: Record<string, unknown> | null; error?: PhotoRequestError }
> {
  try {
    const currentScene = context.currentScene;
    const intent = classifyPhotoRequest(input.message);
    const productionRequest=resolveProductionSafePhotoRequest({requestText:input.message,requestedContentLevel:intent.requestedContentLevel,adultPipelineAuthorized});
    const characterName = String(context.character.name ?? "Your companion")
      .trim();
    const firstName = characterName.split(/\s+/)[0] || characterName;
    const canonicalPresence = {
      locationId: currentScene.locationId,
      activity: currentScene.activity,
      activityKey: currentScene.activityKey,
      mood: currentScene.mood,
      source: currentScene.source,
      resolvedAt: new Date().toISOString(),
    };
    const offer = await createMediaOffer(db, {
      userId,
      characterInstanceId: input.characterInstanceId,
      source: "user_request",
      conversationId: input.conversationId,
      messageId,
      offerKey: `user_request:${String(userMessage.id)}`,
      title: "Picture request",
      companionMessage: `${firstName} wants to send you a picture`,
      contentLevel: productionRequest.contentLevel,
      shotType: intent.shotPreference ?? "selfie",
      ...(currentScene.sceneSessionId
        ? { sceneSessionId: String(currentScene.sceneSessionId) }
        : {}),
      ...(currentScene.sharedPlanId
        ? { sharedPlanId: String(currentScene.sharedPlanId) }
        : {}),
      previewMetadata: {
        clientRequestId: input.clientRequestId,
        requestText: String(productionRequest.requestText??'').slice(0, 400),
        inputModerationApproved,
        productionMediaDowngraded:productionRequest.downgraded,
        productionMediaReason:productionRequest.reasonCode,
        ...(canonicalPresence ? { canonicalPresence } : {}),
        locationName: currentScene.location,
      },
      adultPipelineAuthorized,
    });
    if (!offer) {
      return {
        offer: null,
        error: {
          code: "MEDIA_DISABLED",
          message: "Photo generation is turned off in your media settings.",
          retryable: false,
        },
      };
    }
    return { offer };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        operation: "prepare_conversation_photo_offer",
        correlationId,
        message: error instanceof Error ? error.message : "unknown_error",
      }),
    );
    const safeError = error instanceof AppError
      ? { code: error.code, message: error.message, retryable: error.retryable }
      : {
        code: "MEDIA_REQUEST_FAILED",
        message: "The photo confirmation could not be prepared. Try again.",
        retryable: true,
      };
    await track(db, userId, "contextual_selfie_failed", {
      characterInstanceId: input.characterInstanceId,
      errorCode: safeError.code,
      phase: "confirmation",
    });
    return { offer: null, error: safeError };
  }
}

async function applyConversationEffects(
  db: any,
  userId: string,
  instanceId: string,
  conversationId: string,
  sourceMessageId: string,
  assistantMessageId: string,
  userText: string,
  assistantText: string,
  current: Record<string, unknown>,
  stage: string,
  context: Parameters<ConfiguredDialogueProvider["generate"]>[0],
  correlationId: string,
): Promise<void> {
  const [
    { data: profile },
    { data: existingThreads },
    { data: conversationRow },
    recentTurns,
    { data: instanceRow },
    { data: reflectionRow },
  ] = await Promise.all([
    db.from("together_profiles").select("memory_categories,content_preferences")
      .eq("user_id", userId).maybeSingle(),
    db.from("together_open_threads").select("*").eq("user_id", userId).eq(
      "character_instance_id",
      instanceId,
    ).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).is("resolved_at", null).limit(20),
    db.from("together_conversations").select("metadata").eq("user_id", userId)
      .eq("id", conversationId).maybeSingle(),
    db.from("together_messages").select("content").eq("user_id", userId).eq(
      "conversation_id",
      conversationId,
    ).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).eq("role", "user").gte(
      "created_at",
      new Date(Date.now() - 30 * 60000).toISOString(),
    ).order("created_at", { ascending: false }).limit(12),
    db.from("together_character_instances").select(
      "character_version_id,continuity_id,together_character_templates(spice_level),together_character_versions(personality_config,relationship_config)",
    ).eq("id", instanceId).eq("user_id", userId).maybeSingle(),
    db.from("together_relationship_reflections").select("user_view,metadata")
      .eq("character_instance_id", instanceId).eq("user_id", userId)
      .eq('visibility_scope','all').in('content_rating',['safe','suggestive'])
      .maybeSingle(),
  ]);
  const proposal = await analysis.analyze({
    userMessage: userText,
    assistantMessage: assistantText,
    existingThreads: existingThreads ?? [],
    context,
    usageScope: {
      db,
      userId,
      continuityId: instanceRow?.continuity_id ?? null,
      conversationId,
      characterInstanceId: instanceId,
      subscriptionTier: context.subscription?.tier,
      contentMode: context.contentMode,
      correlationId,
    },
  });
  const assistantLocationCandidate = proposal.actionCandidates.length
    ? null
    : await resolveAssistantLocationPlanCandidate(
      db,
      userId,
      instanceId,
      conversationId,
      assistantText,
      context,
    );
  const conversationActionCandidates = assistantLocationCandidate
    ? [assistantLocationCandidate]
    : proposal.actionCandidates;
  const analysisNow = new Date();
  const characterUserView = evolveCharacterUserView(reflectionRow?.user_view, {
    userMessage: userText,
    assistantMessage: assistantText,
    memoryCandidates: proposal.memoryCandidates,
    sourceMessageId: assistantMessageId,
    now: analysisNow,
  });
  await db.from("together_relationship_reflections").upsert({
    character_instance_id: instanceId,
    user_id: userId,
    continuity_id: instanceRow?.continuity_id ?? null,
    user_view: characterUserView,
    updated_through_message_id: assistantMessageId,
    content_rating:'safe',visibility_scope:'all',moderation_version:'safe-dialogue-v1',
    metadata: {
      ...(reflectionRow?.metadata ?? {}),
      userViewSource: "conversation_evidence",
      userViewVersion: characterUserView.version,
    },
    updated_at: analysisNow.toISOString(),
  }, { onConflict: "character_instance_id" });
  const residue = deriveEmotionalResidue(userText, assistantText);
  const continuityId = context.relationship?.continuity_id ??
    current.continuity_id;
  if (residue && continuityId) {
    await upsertEmotionalResidue({
      db,
      userId,
      continuityId: String(continuityId),
      characterInstanceId: instanceId,
      sourceId: assistantMessageId,
      residue,
      now: analysisNow,
    });
    await track(db, userId, "emotional_residue_created", {
      characterInstanceId: instanceId,
      tone: residue.tone,
    });
  }
  if (
    proposal.mentionedMemoryIds.length || proposal.reinforcedMemoryIds.length
  ) {
    await markMentionedMemories({
      db,
      userId,
      memoryIds: proposal.mentionedMemoryIds,
      reinforcedIds: proposal.reinforcedMemoryIds,
      now: analysisNow,
    });
    if (proposal.mentionedMemoryIds.length) {
      await track(db, userId, "memory_explicitly_mentioned", {
        characterInstanceId: instanceId,
        count: proposal.mentionedMemoryIds.length,
      });
    }
  } else if ((context.memoryContext?.retrievedIds ?? []).length) {
    await track(db, userId, "memory_callback_suppressed", {
      characterInstanceId: instanceId,
      count: context.memoryContext.retrievedIds.length,
    });
  }
  const opinionPlaces = [context.place, ...(context.referencedPlaces ?? [])]
    .filter((item): item is PlaceContext => Boolean(item));
  if (
    proposal.placeOpinionCandidates.length &&
    instanceRow?.character_version_id && instanceRow?.continuity_id &&
    opinionPlaces.length
  ) {
    await recordChatPlaceOpinions({
      db,
      userId,
      continuityId: String(instanceRow.continuity_id),
      characterInstanceId: instanceId,
      characterVersionId: String(instanceRow.character_version_id),
      conversationId,
      assistantMessageId,
      candidates: proposal.placeOpinionCandidates,
      places: opinionPlaces,
      now: analysisNow,
    });
  }
  const enabled = (profile?.memory_categories ?? {}) as Record<string, boolean>;
  const precedingAssistantMessage = [...(context.recent ?? [])].reverse().find((
    turn: Record<string, unknown>,
  ) => turn.role === "assistant")?.content;
  const recentUserMessages = (recentTurns.data ?? []).map((
    turn: Record<string, unknown>,
  ) => String(turn.content ?? "")).reverse();
  if (recentUserMessages.at(-1)?.trim() === userText.trim()) {
    recentUserMessages.pop();
  }
  const engagement = scoreConversationEngagement({
    message: userText,
    ...(precedingAssistantMessage
      ? { precedingAssistantMessage: String(precedingAssistantMessage) }
      : {}),
    recentUserMessages,
    memoryWorthy: proposal.memoryCandidates.length > 0 ||
      proposal.newThreads.length > 0,
    repair: Number(proposal.relationshipChanges.conflict ?? 0) < 0,
  });
  const interactionQuality = engagement.quality;
  const romanceEnabled =
    (profile?.content_preferences as Record<string, unknown> | undefined)
      ?.romanceEnabled !== false;
  const userFlirt = validatedChemistrySignal(
    proposal.chemistry?.userFlirtSignal,
    detectFlirtSignal(userText),
  );
  const characterFlirt = validatedChemistrySignal(
    proposal.chemistry?.characterFlirtSignal,
    detectFlirtSignal(assistantText),
  );
  const romanticSignal = userFlirt.strength >= .35 ||
    characterFlirt.strength >= .35;
  const recentLowSignalTurns =
    (recentTurns.data ?? []).filter((turn: Record<string, unknown>) =>
      scoreConversationEngagement({ message: String(turn.content ?? "") })
        .quality === "trivial"
    ).length;
  const domainCurrent = toDomainRelationship(current, stage, romanceEnabled);
  const relationshipNext = applyInteractionProposal(
    domainCurrent,
    proposal.relationshipChanges,
    interactionQuality,
    { recentLowSignalTurns, romanceEnabled, romanticSignal },
  );
  const engagedNext = applyConversationEngagement(relationshipNext, engagement);
  const template = instanceRow?.together_character_templates as
    | Record<string, unknown>
    | null;
  const version = instanceRow?.together_character_versions as
    | Record<string, unknown>
    | null;
  const storedChatPreferences = conversationRow?.metadata?.chatPreferences;
  const chatPreferences =
    storedChatPreferences && typeof storedChatPreferences === "object" &&
      !Array.isArray(storedChatPreferences)
      ? storedChatPreferences as Record<string, unknown>
      : {};
  const spiceLevel = normalizeSpiceLevel(
    context.subscription?.tier !== "free"
      ? chatPreferences.spiceLevel ?? template?.spice_level
      : template?.spice_level,
  );
  const personality = (version?.personality_config ?? {}) as Record<
    string,
    unknown
  >;
  const chemistry = updateChemistry({
    state: engagedNext,
    spiceLevel,
    userSignal: userFlirt,
    characterSignal: characterFlirt,
    personality,
    contextFit: chemistryContextFit(context.currentScene),
    now: analysisNow,
  });
  const domainNext = {
    ...engagedNext,
    chemistryHeat: chemistry.chemistryHeat,
    physicalTension: chemistry.physicalTension,
    userFlirtSignals: chemistry.userFlirtSignals,
    characterFlirtSignals: chemistry.characterFlirtSignals,
    mutualFlirtSignals: chemistry.mutualFlirtSignals,
    attractionAcknowledged: chemistry.attractionAcknowledged,
    ...(chemistry.lastChemistryChangeAt
      ? { lastChemistryChangeAt: chemistry.lastChemistryChangeAt }
      : {}),
    ...(chemistry.lastFlirtSignalAt
      ? { lastFlirtSignalAt: chemistry.lastFlirtSignalAt }
      : {}),
  };
  const next = Object.fromEntries(
    relationshipMetrics.map((metric) => [metric, domainNext[metric]]),
  );
  const conversationCount =
    Number(current.interaction_turn_count ?? current.conversation_count ?? 0) +
    1;
  const meaningfulCount = Number(current.meaningful_interaction_count ?? 0) +
    (engagement.relationshipSignificant ? 1 : 0);
  const totalDirection = relationshipMetrics.reduce(
    (sum, metric) =>
      sum + Number(next[metric] ?? 0) - Number(current[metric] ?? 0),
    0,
  );
  const recentDirection = totalDirection > 1
    ? "improving"
    : totalDirection < -1
    ? "strained"
    : "steady";
  await db.from("together_relationship_states").update({
    ...next,
    conversation_count: conversationCount,
    interaction_turn_count: conversationCount,
    meaningful_interaction_count: meaningfulCount,
    engagement_score: domainNext.engagementScore,
    genuine_back_and_forth_turns: domainNext.genuineBackAndForthTurns,
    trivial_engagement_score: domainNext.trivialEngagementScore,
    chemistry_heat: chemistry.chemistryHeat,
    physical_tension: chemistry.physicalTension,
    user_flirt_signals: chemistry.userFlirtSignals,
    character_flirt_signals: chemistry.characterFlirtSignals,
    mutual_flirt_signals: chemistry.mutualFlirtSignals,
    attraction_acknowledged: chemistry.attractionAcknowledged,
    last_chemistry_change_at: chemistry.lastChemistryChangeAt ??
      current.last_chemistry_change_at ?? null,
    last_flirt_signal_at: chemistry.lastFlirtSignalAt ??
      current.last_flirt_signal_at ?? null,
    last_interaction_quality: interactionQuality,
    last_relationship_delta: Object.fromEntries(
      relationshipMetrics.map((
        metric,
      ) => [metric, Number(next[metric] ?? 0) - Number(current[metric] ?? 0)]),
    ),
    recent_direction: recentDirection,
    updated_at: new Date().toISOString(),
  }).eq("character_instance_id", instanceId);
  await db.from("together_character_instances").update({
    updated_at: new Date().toISOString(),
  }).eq("id", instanceId);
  for (const candidate of proposal.memoryCandidates) {
    if (enabled[candidate.memory_type] === false) continue;
    if (
      !isDurableUserMemory({
        memoryType: candidate.memory_type,
        canonicalText: candidate.canonical_text,
      })
    ) continue;
    const embedding = await embeddings.embed(candidate.canonical_text, {
      db,
      userId,
      conversationId,
      characterInstanceId: instanceId,
      subscriptionTier: context.subscription?.tier,
      correlationId,
      purpose: "memory_write",
    });
    const { data: sameSubject } = await db.from("together_memories").select("*")
      .eq("user_id", userId).eq("character_instance_id", instanceId).eq(
        "subject_key",
        candidate.subject_key,
      ).eq("status", "active").order("pinned", { ascending: false }).order(
        "updated_at",
        { ascending: false },
      ).limit(10);
    const { data: exact } = sameSubject?.length
      ? { data: null }
      : await db.from("together_memories").select("*").eq(
        "character_instance_id",
        instanceId,
      ).eq("dedupe_key", candidate.dedupe_key).maybeSingle();
    const existing = (sameSubject ?? []).find((item: Record<string, unknown>) =>
      item.dedupe_key === candidate.dedupe_key
    ) ?? sameSubject?.[0] ?? exact;
    if (existing) {
      const sameFact = existing.dedupe_key === candidate.dedupe_key;
      const now = new Date().toISOString();
      if (sameFact) {
        await db.from("together_memories").update({
          importance: Math.max(
            Number(existing.importance),
            candidate.importance,
          ),
          confidence: Math.min(
            1,
            Math.max(Number(existing.confidence), candidate.confidence) + .02,
          ),
          embedding: embedding ?? existing.embedding,
          source_message_id: sourceMessageId,
          source_type: "message",
          source_id: sourceMessageId,
          learned_via: "direct_user",
          reinforcement_count: Number(existing.reinforcement_count ?? 0) + 1,
          updated_at: now,
        }).eq("id", existing.id);
      } else {
        await db.from("together_memories").update({
          status: "superseded",
          valid_to: now,
          updated_at: now,
        }).eq("id", existing.id).eq("status", "active");
        await db.from("together_memories").update({
          status: "superseded",
          valid_to: now,
          updated_at: now,
        }).eq("user_id", userId).eq("character_instance_id", instanceId).eq(
          "subject_key",
          candidate.subject_key,
        ).eq("status", "active").neq("id", existing.id);
        const { data: created } = await db.from("together_memories").insert({
          user_id: userId,
          character_instance_id: instanceId,
          ...candidate,
          source_message_id: sourceMessageId,
          source_type: "message",
          source_id: sourceMessageId,
          learned_via: "direct_user",
          shareability: "private",
          valid_from: now,
          supersedes_memory_id: existing.id,
          embedding,
          status: "active",
        }).select("id").maybeSingle();
        if (created) {
          await track(db, userId, "memory_corrected", {
            memoryId: created.id,
            characterInstanceId: instanceId,
          });
        }
      }
    } else {
      const { data, error } = await db.from("together_memories").insert({
        user_id: userId,
        character_instance_id: instanceId,
        ...candidate,
        source_message_id: sourceMessageId,
        source_type: "message",
        source_id: sourceMessageId,
        learned_via: "direct_user",
        shareability: "private",
        valid_from: new Date().toISOString(),
        embedding,
        status: "active",
      }).select("id").single();
      if (!error && data) {
        await track(db, userId, "memory_created", {
          memoryId: data.id,
          type: candidate.memory_type,
        });
      }
    }
  }
  if (enabled.open_thread !== false) {
    for (const thread of proposal.newThreads) {
      const { data: existing } = await db.from("together_open_threads").select(
        "id",
      ).eq("user_id", userId).eq("character_instance_id", instanceId).eq(
        "dedupe_key",
        thread.dedupe_key,
      ).is("resolved_at", null).maybeSingle();
      if (existing) continue;
      const { data } = await db.from("together_open_threads").insert({
        user_id: userId,
        character_instance_id: instanceId,
        ...thread,
        source_message_id: sourceMessageId,
      }).select("id").single();
      if (data) {
        await track(db, userId, "open_thread_created", { threadId: data.id });
      }
    }
  }
  for (const threadId of proposal.resolvedThreadIds) {
    const now = new Date().toISOString();
    const { data: resolved } = await db.from("together_open_threads").update({
      resolved_at: now,
      follow_up_eligible: false,
      resolution_message_id: sourceMessageId,
      updated_at: now,
    }).eq("id", threadId).eq("user_id", userId).eq(
      "character_instance_id",
      instanceId,
    ).is("resolved_at", null).select("id").maybeSingle();
    if (resolved) await track(db, userId, "open_thread_resolved", { threadId });
  }
  await db.from("together_conversation_actions").update({
    status: "expired",
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("conversation_id", conversationId).eq(
    "status",
    "pending",
  ).lt("expires_at", new Date().toISOString());
  for (const candidate of conversationActionCandidates) {
    const { data: created } = await db.from("together_conversation_actions")
      .insert({
        user_id: userId,
        character_instance_id: instanceId,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        candidate_type: candidate.type,
        status: "pending",
        payload: candidate.payload,
        confidence: candidate.confidence,
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        updated_at: new Date().toISOString(),
      }).select("*").maybeSingle();
    if (created) {
      await writeConversationEvent(db, {
        userId,
        characterInstanceId: instanceId,
        conversationId,
        eventType: "plan_proposed",
        entityType: "conversation_action",
        entityId: created.id,
        metadata: {
          ...candidate.payload,
          candidateType: candidate.type,
          resolution: "pending",
        },
      });
      await track(db, userId, "plan_proposal_created", {
        type: candidate.type,
        conversationId,
        source: "chat_natural_language",
      });
    }
  }
  const actionFocus = conversationActionCandidates.find((item) =>
    item.payload.planId || item.payload.locationId
  );
  const focusEntity = proposal.referencedEntities[0];
  const focus = actionFocus?.payload.planId
    ? {
      type: "plan",
      planId: actionFocus.payload.planId,
      updatedAt: new Date().toISOString(),
      sourceMessageId,
    }
    : actionFocus?.payload.locationId
    ? {
      type: "location",
      locationId: actionFocus.payload.locationId,
      label: actionFocus.payload.location,
      updatedAt: new Date().toISOString(),
      sourceMessageId,
    }
    : focusEntity
    ? {
      type: "entity",
      label: focusEntity,
      updatedAt: new Date().toISOString(),
      sourceMessageId,
    }
    : context.activeStory
    ? {
      type: "story",
      label: String(context.activeStory.title),
      updatedAt: new Date().toISOString(),
      sourceMessageId,
    }
    : null;
  if (focus) {
    await db.from("together_conversations").update({
      metadata: { ...(conversationRow?.metadata ?? {}), focus },
    }).eq("user_id", userId).eq("id", conversationId);
  }
  await updateConversationSummary(
    db,
    userId,
    conversationId,
    conversationCount,
  );
  // The relationship-state trigger invokes the canonical SQL evaluator. Do not
  // create milestones through a second compatibility path here.
}

async function resolveAssistantLocationPlanCandidate(
  db: any,
  userId: string,
  characterInstanceId: string,
  conversationId: string,
  assistantText: string,
  context: Parameters<ConfiguredDialogueProvider["generate"]>[0],
): Promise<ConversationActionCandidate | null> {
  let locations: PlannableLocationMention[] = (context.planningCatalog ?? [])
    .map((item) => ({
      id: String(item.id),
      worldId: item.worldId,
      worldSlug: item.worldSlug,
      name: String(item.name),
      slug: String(item.slug),
      category: String(item.category),
      activities: (item.activities ?? []).map(String),
      dateTypes: (item.dateTypes ?? []).map(String),
      aliases: (item.aliases ?? []).map(String),
      private: item.privacy === "private",
    }));
  if (!locations.length) {
    const worldId = String(
      context.place?.world.id ?? context.location?.world_id ?? "",
    );
    if (!worldId) return null;
    const { data, error } = await db.from("together_locations").select(
      "id,world_id,name,slug,category,possible_activities,metadata",
    ).eq("world_id", worldId);
    if (error) return null;
    locations = (data ?? []).map((item: Record<string, any>) => ({
      id: String(item.id),
      worldId: String(item.world_id),
      worldSlug: String(context.place?.world.slug ?? ""),
      name: String(item.name),
      slug: String(item.slug),
      category: String(item.category),
      activities: (item.possible_activities ?? []).map(String),
      dateTypes: (item.metadata?.date_types ?? []).map(String),
      aliases: (item.metadata?.aliases ?? []).map(String),
      private: item.metadata?.private === true,
    }));
  }
  const currentLocationId = String(context.currentScene?.locationId ?? "");
  const match = matchAssistantLocationPlan(assistantText, locations, {
    excludeLocationIds: currentLocationId ? [currentLocationId] : [],
  });
  if (!match) return null;
  const { data: pending } = await db.from("together_conversation_actions")
    .select("id,payload").eq("user_id", userId).eq(
      "conversation_id",
      conversationId,
    ).eq("status", "pending").limit(20);
  if (
    (pending ?? []).some((item: Record<string, any>) =>
      String(item.payload?.locationId ?? "") === match.locationId
    )
  ) return null;
  const now = new Date(),
    cooldownStart = new Date(
      now.getTime() - LOCATION_PLAN_DISMISSAL_COOLDOWN_MS,
    ).toISOString();
  const { data: dismissals } = await db.from("together_conversation_actions")
    .select("payload,updated_at").eq("user_id", userId).eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("candidate_type", "plan_create").eq("status", "dismissed").gte(
      "updated_at",
      cooldownStart,
    ).order("updated_at", { ascending: false }).limit(20);
  if (
    isLocationPlanDismissalCoolingDown(match.locationId, dismissals ?? [], now)
  ) return null;
  return {
    type: "plan_create",
    confidence: .96,
    payload: {
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
    },
  };
}

async function collectDialogueDelta(
  db: any,
  userId: string,
  characterInstanceId: string,
  conversationId: string,
) {
  const [
    character,
    relationship,
    conversation,
    memories,
    openThreads,
    milestones,
    actions,
    events,
    plans,
    dates,
    lifeEvents,
    stories,
    relationshipPlaces,
  ] = await Promise.all([
    db.from("together_character_instances").select(
      "*,together_character_templates(*),together_character_versions(*)",
    ).eq("id", characterInstanceId).eq("user_id", userId).maybeSingle(),
    db.from("together_relationship_states").select("*").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId).maybeSingle(),
    db.from("together_conversations").select("*").eq("id", conversationId).eq(
      "user_id",
      userId,
    ).maybeSingle(),
    db.from("together_memories").select("*").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId).eq("status", "active").order("pinned", {
      ascending: false,
    }).order("updated_at", { ascending: false }).limit(100),
    db.from("together_open_threads").select("*").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId).is("resolved_at", null).limit(30),
    db.from("together_relationship_milestones").select("*").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId).eq("status", "pending"),
    db.from("together_conversation_actions").select("*").eq(
      "conversation_id",
      conversationId,
    ).eq("character_instance_id", characterInstanceId).eq("user_id", userId).eq(
      "status",
      "pending",
    ),
    db.from("together_conversation_events").select("*").eq(
      "conversation_id",
      conversationId,
    ).eq("character_instance_id", characterInstanceId).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(30),
    db.from("together_shared_plans").select("*").contains(
      "participant_instance_ids",
      [characterInstanceId],
    ).eq("user_id", userId).in("status", ["proposed", "scheduled", "active"])
      .order("starts_at").limit(20),
    db.from("together_date_sessions").select("*,together_date_templates(*)").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId).in("status", [
      "unlocked",
      "upcoming",
      "active",
      "deferred",
    ]),
    db.from("together_life_events").select("*").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId).order("starts_at", { ascending: false }).limit(20),
    db.from("together_story_arc_instances").select(
      "*,together_story_arc_templates(*)",
    ).eq("character_instance_id", characterInstanceId).eq("user_id", userId).eq(
      "status",
      "active",
    ),
    db.from("together_relationship_places").select("*").eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("user_id", userId),
  ]);
  return {
    characterInstanceId,
    character: character.data,
    relationship: relationship.data,
    conversation: conversation.data,
    memories: memories.data ?? [],
    openThreads: openThreads.data ?? [],
    relationshipMilestones: milestones.data ?? [],
    conversationActions: actions.data ?? [],
    conversationEvents: events.data ?? [],
    sharedPlans: plans.data ?? [],
    dates: dates.data ?? [],
    lifeEvents: lifeEvents.data ?? [],
    storyArcs: stories.data ?? [],
    relationshipPlaces: relationshipPlaces.data ?? [],
  };
}

function toDomainRelationship(
  state: Record<string, unknown>,
  stage: string,
  romanceEnabled: boolean,
): RelationshipState {
  return {
    stage: stage as RelationshipState["stage"],
    trust: Number(state.trust ?? 0),
    comfort: Number(state.comfort ?? 0),
    attraction: Number(state.attraction ?? 0),
    affinity: Number(state.affinity ?? 0),
    familiarity: Number(state.familiarity ?? 0),
    respect: Number(state.respect ?? 0),
    conflict: Number(state.conflict ?? 0),
    romantic_interest: Number(state.romantic_interest ?? 0),
    commitment: Number(state.commitment ?? 0),
    conversationCount: Number(
      state.interaction_turn_count ?? state.conversation_count ?? 0,
    ),
    conversationSessionCount: Number(state.conversation_session_count ?? 1),
    meaningfulInteractionCount: Number(state.meaningful_interaction_count ?? 0),
    engagementScore: Number(state.engagement_score ?? 0),
    genuineBackAndForthTurns: Number(state.genuine_back_and_forth_turns ?? 0),
    trivialEngagementScore: Number(state.trivial_engagement_score ?? 0),
    chemistryHeat: Number(state.chemistry_heat ?? 0),
    physicalTension: Number(state.physical_tension ?? 0),
    userFlirtSignals: Number(state.user_flirt_signals ?? 0),
    characterFlirtSignals: Number(state.character_flirt_signals ?? 0),
    mutualFlirtSignals: Number(state.mutual_flirt_signals ?? 0),
    attractionAcknowledged: Boolean(state.attraction_acknowledged),
    ...(state.last_chemistry_change_at
      ? { lastChemistryChangeAt: String(state.last_chemistry_change_at) }
      : {}),
    ...(state.last_flirt_signal_at
      ? { lastFlirtSignalAt: String(state.last_flirt_signal_at) }
      : {}),
    activeMajorConflict: Boolean(state.active_major_conflict),
    romanceEnabled,
    romancePathStatus: String(
      state.romance_path_status ?? "open",
    ) as RelationshipState["romancePathStatus"],
  };
}

function normalizeSpiceLevel(value: unknown): SpiceLevel {
  const level = Number(value);
  return level === 1 || level === 3 ? level : 2;
}
function validatedChemistrySignal(
  value: unknown,
  fallback: ChemistrySignal,
): ChemistrySignal {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const strength = Math.max(0, Math.min(1, value));
  return strength > fallback.strength
    ? {
      strength,
      kind: strength >= .8
        ? "attraction"
        : strength >= .5
        ? "teasing"
        : "interest",
      reasonCodes: ["analysis_signal"],
    }
    : fallback;
}
function chemistryContextFit(
  scene: Record<string, unknown> | undefined,
): number {
  const activity = String(scene?.activity ?? "").toLowerCase(),
    interruptibility = String(
      scene?.interruptibility ?? scene?.availability ?? "open",
    );
  if (
    interruptibility === "busy" || interruptibility === "unavailable" ||
    /\b(work|meeting|sleep|driving|appointment|casework)\b/.test(activity)
  ) return .2;
  if (
    /\b(date|drinks|karaoke|dancing|dinner|rooftop|walk|music)\b/.test(activity)
  ) return .85;
  return interruptibility === "limited" ? .45 : .65;
}

async function updateConversationSummary(
  db: any,
  userId: string,
  conversationId: string,
  conversationCount: number,
): Promise<void> {
  if (conversationCount !== 1 && conversationCount % 4 !== 0) return;
  const { data: conversation } = await db.from("together_conversations").select(
    "summary,summary_through,summary_through_sequence,summary_message_count",
  ).eq("id", conversationId).eq("user_id", userId).maybeSingle();
  let query = db.from("together_messages").select("id,role,content,created_at,conversation_sequence")
    .eq("user_id", userId).eq("conversation_id", conversationId)
    .order("conversation_sequence", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true }).limit(80);
  if (conversation?.summary_through_sequence) {
    query = query.gt("conversation_sequence", conversation.summary_through_sequence);
  } else if (conversation?.summary_through) {
    query = query.gt("created_at", conversation.summary_through);
  }
  const { data: messages, error } = await query;
  if (error) return;
  if (messages?.length) {
    const previous = String(conversation?.summary ?? "").trim();
    const summary = mergeConversationSummary(previous, messages);
    const through = messages.at(-1)?.created_at ?? new Date().toISOString();
    const throughSequence = Number(messages.at(-1)?.conversation_sequence ?? conversation?.summary_through_sequence ?? 0) || null;
    await db.from("together_conversations").update({
      summary,
      summary_through: through,
      summary_through_sequence: throughSequence,
      summary_message_count: Number(conversation?.summary_message_count ?? 0) + messages.length,
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId).eq("user_id", userId).is("archived_at", null);
  }
  await consolidateConversationEpisodes({
    db,userId,conversationId,
    embed:(text)=>embeddings.embed(text,{db,userId,conversationId,purpose:"conversation_episode"}),
  });
}
