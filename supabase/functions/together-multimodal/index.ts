import { z } from "zod";
import { validateUserImage } from "../../../packages/together-domain/src/multimodal.ts";
import {
  hasSexualDialogueLanguage,
  imageDimensions,
} from "../../../packages/together-domain/src/index.ts";
import { chatLanguageFromMessageMetadata, chatLanguagePreferences, chatLanguagePreviewText, normalizeChatLanguage } from "../../../packages/together-domain/src/chat-language.ts";
import { parseBody } from "../_shared/body.ts";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { json, serve } from "../_shared/http.ts";
import {
  configuredSpeechToTextProvider,
  configuredTextToSpeechProvider,
  configuredVisionProvider,
  normalizeMultimodalPreferences,
  providerCapabilityStatuses,
  resolveCompanionVoiceProfile,
  resolveServerExperienceCapabilities,
} from "../_shared/kivelle-multimodal.ts";
import {
  activeContinuity,
  requireInstanceInActiveContinuity,
} from "../_shared/together-continuity.ts";
import { track } from "../_shared/together.ts";
import { synchronizedGeneratedPhotoPreferences } from "../_shared/together-photo-preferences.ts";
import { AppError } from "../_shared/types.ts";
import { prepareCompanionSpeech } from "../_shared/voice-performance.ts";
import { buildVoiceNoteMediaMutation } from "../_shared/voice-note-media.ts";
import { voiceNotePricing } from "../../../packages/together-domain/src/entitlements.ts";
import { enforcePhotoSharingEntitlement, refundCredits, resolveSubscriptionState, spendCredits } from "../_shared/kivelle-subscription.ts";
import {
  activeVoiceEntitlement,
  recordVoiceNoteUsage,
} from "../_shared/voice-usage.ts";
import { voiceRolloutEligible } from "../_shared/xai-voice.ts";
import {
  chatVoicePreset,
  validateCompanionVoicePreset,
} from "../_shared/companion-voice-selection.ts";
import { isAnimatedChatPhoto, matchesChatPhotoSignature } from "../_shared/chat-photo-policy.ts";
import { chatPhotoByteBucket, chatPhotoEdgeBucket, chatPhotoFailureCode, chatPhotoLatencyBucket, safeChatPhotoTelemetry } from "../_shared/chat-photo-observability.ts";

const uuid = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capabilities") }),
  z.object({
    action: z.literal("preferences"),
    userPhotoUploads: z.boolean(),
    companionVoiceNotes: z.boolean(),
    autoplayVoiceNotes: z.boolean(),
    liveVoiceCalls: z.boolean(),
    generatedPhotos: z.boolean(),
    generatedVideos: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("prepare_user_image"),
    conversationId: uuid,
    characterInstanceId: uuid,
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    width: z.number().int().positive().max(2_048).optional(),
    height: z.number().int().positive().max(2_048).optional(),
    requestId: z.string().trim().min(8).max(120),
  }),
  z.object({ action: z.literal("confirm_user_image"), attachmentId: uuid, caption: z.string().trim().max(4_000).optional() }),
  z.object({ action: z.literal("remove_attachment"), attachmentId: uuid }),
  z.object({ action: z.literal("delete_attachment"), attachmentId: uuid }),
  z.object({
    action: z.literal("voice_note_quote"),
    messageId: uuid,
  }),
  z.object({
    action: z.literal("request_voice_note"),
    messageId: uuid,
    requestId: z.string().trim().min(8).max(120),
  }),
  z.object({
    action: z.literal("preview_voice"),
    conversationId: uuid,
    voicePreset: z.enum(["warm", "bright", "clear", "strong", "balanced"]).nullable(),
    chatLanguage: z.enum(chatLanguagePreferences).optional(),
    requestId: z.string().trim().min(8).max(120),
  }),
  z.object({ action: z.literal("media_status"), mediaId: uuid }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  if (new URL(request.url).searchParams.get("action") === "transcribe_audio") {
    return await transcribeAudio(request, correlationId, user.id, db);
  }
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);
  const [{ data: profile }, { data: entitlement }] = await Promise.all([
    db.from("together_profiles").select("multimodal_preferences,photo_preferences").eq(
      "user_id",
      user.id,
    ).single(),
    db.from("together_entitlements").select("tier,entitlement_keys,expires_at")
      .eq(
        "user_id",
        user.id,
      ).maybeSingle(),
  ]);
  const preferences = normalizeMultimodalPreferences(
    profile?.multimodal_preferences,
  );
  const voiceEntitlement = activeVoiceEntitlement(entitlement);
  const capabilities = resolveServerExperienceCapabilities(
    preferences,
    voiceEntitlement.entitlementKeys,
  );

  if (input.action === "capabilities") {
    return json({ data: capabilities, correlationId }, 200, correlationId);
  }
  if (input.action === "preferences") {
    const next = {
      userPhotoUploads: input.userPhotoUploads,
      companionVoiceNotes: input.companionVoiceNotes,
      autoplayVoiceNotes: input.autoplayVoiceNotes,
      liveVoiceCalls: input.liveVoiceCalls,
      generatedPhotos: input.generatedPhotos,
      generatedVideos: input.generatedVideos,
    };
    const synced=synchronizedGeneratedPhotoPreferences(profile,input.generatedPhotos);
    const { error } = await db.from("together_profiles").update({
      multimodal_preferences: next,
      photo_preferences: synced.photoPreferences,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Media preferences could not be saved.",
        500,
        true,
      );
    }
    await track(db, user.id, "multimodal_preferences_changed");
    return json(
      {
        data: {
          preferences: next,
          ...resolveServerExperienceCapabilities(
            next,
            voiceEntitlement.entitlementKeys,
          ),
        },
        correlationId,
      },
      200,
      correlationId,
    );
  }

  if (input.action === "prepare_user_image") {
    await enforcePhotoSharingEntitlement(db, user.id);
    if (preferences.userPhotoUploads === false) {
      throw new AppError(
        "FORBIDDEN",
        "Photo uploads are turned off in Settings.",
        403,
      );
    }
    await enforceRateLimit(db, user.id, "together_user_photo_upload", 40, 3600);
    await requireInstanceInActiveContinuity(
      db,
      user.id,
      input.characterInstanceId,
    );
    await requireConversation(
      db,
      user.id,
      continuity.id,
      input.conversationId,
      input.characterInstanceId,
    );
    const validation = validateUserImage({
      mimeType: input.mimeType,
      byteSize: input.byteSize,
    });
    if (!validation.valid) {
      throw new AppError("VALIDATION_FAILED", validation.message, 422);
    }
    const { data: duplicate } = await db.from(
      "together_conversation_attachments",
    ).select("*").eq("user_id", user.id).eq(
      "metadata->>requestId",
      input.requestId,
    ).maybeSingle();
    if (duplicate) {
      return json(
        { data: await attachmentPayload(db, duplicate), correlationId },
        200,
        correlationId,
      );
    }
    const attachmentId = crypto.randomUUID();
    const extension = input.mimeType === "image/png"
      ? "png"
      : input.mimeType === "image/webp"
      ? "webp"
      : "jpg";
    const storagePath =
      `${user.id}/attachments/${continuity.id}/${attachmentId}.${extension}`;
    const { data, error } = await db.from("together_conversation_attachments")
      .insert({
        id: attachmentId,
        user_id: user.id,
        continuity_id: continuity.id,
        conversation_id: input.conversationId,
        kind: "image",
        source: "user",
        storage_path: storagePath,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        width: input.width ?? null,
        height: input.height ?? null,
        upload_status: "pending",
        analysis_status: "pending",
        metadata: { requestId: input.requestId, contextVersion: 1 },
      }).select("*").single();
    if (error?.code === "23505") {
      const { data: raced } = await db.from("together_conversation_attachments").select("*").eq("user_id", user.id).eq("metadata->>requestId", input.requestId).maybeSingle();
      if (raced) return json({ data: await attachmentPayload(db, raced), correlationId }, 200, correlationId);
    }
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "That photo could not be prepared.",
        500,
        true,
      );
    }
    await track(db, user.id, "user_photo_attached", {
      attachmentId: data.id,
      characterInstanceId: input.characterInstanceId,
      byteSizeBucket: chatPhotoByteBucket(input.byteSize),
      longEdgeBucket: chatPhotoEdgeBucket(Math.max(input.width??0,input.height??0)),
    });
    return json(
      { data: await attachmentPayload(db, data), correlationId },
      201,
      correlationId,
    );
  }

  if (input.action === "confirm_user_image") {
    const photoProcessingStartedAt=Date.now();
    await enforcePhotoSharingEntitlement(db, user.id);
    const attachment = await requireAttachment(
      db,
      user.id,
      continuity.id,
      input.attachmentId,
    );
    if (attachment.analysis_status === "ready" && attachment.upload_status === "uploaded") {
      return json({ data: await attachmentPayload(db, attachment), correlationId }, 200, correlationId);
    }
    if (!attachment.storage_path) throw new AppError("NOT_FOUND", "That photo is no longer available.", 404);
    const { data: file, error: downloadError } = await db.storage.from(
      "together-user-media",
    ).download(String(attachment.storage_path));
    if (downloadError || !file) {
      await track(db,user.id,"user_photo_processing_failed",safeChatPhotoTelemetry({stage:"private_storage",failureCode:"UPLOAD_NOT_FOUND",latencyBucket:chatPhotoLatencyBucket(Date.now()-photoProcessingStartedAt)}));
      throw new AppError(
        "VALIDATION_FAILED",
        "Finish uploading the photo before sending it.",
        422,
        true,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const actualValidation = validateUserImage({
      mimeType: String(attachment.mime_type),
      byteSize: bytes.byteLength,
    });
    const actualDimensions = imageDimensions(bytes, String(attachment.mime_type));
    if (
      !actualValidation.valid ||
      !matchesChatPhotoSignature(bytes, String(attachment.mime_type)) ||
      isAnimatedChatPhoto(bytes, String(attachment.mime_type)) ||
      !actualDimensions ||
      Math.max(actualDimensions.width, actualDimensions.height) > 2_048
    ) {
      await Promise.all([
        db.storage.from("together-user-media").remove([
          String(attachment.storage_path),
        ]),
        db.from("together_conversation_attachments").update({
          upload_status: "failed",
          analysis_status: "failed",
          analysis_metadata: {},
          updated_at: new Date().toISOString(),
        }).eq("id", attachment.id).eq("user_id", user.id),
      ]);
      await track(db,user.id,"user_photo_processing_failed",safeChatPhotoTelemetry({stage:"validation",failureCode:"VALIDATION_FAILED",latencyBucket:chatPhotoLatencyBucket(Date.now()-photoProcessingStartedAt),byteSizeBucket:chatPhotoByteBucket(bytes.byteLength)}));
      throw new AppError(
        "VALIDATION_FAILED",
        actualDimensions && Math.max(actualDimensions.width, actualDimensions.height) > 2_048 ? "That photo is larger than Kivelle's 2048-pixel upload limit." : "That file is not a supported, still image.",
        422,
      );
    }
    const provider = configuredVisionProvider();
    if (!provider) {
      await track(db,user.id,"user_photo_processing_failed",safeChatPhotoTelemetry({stage:"configuration",failureCode:"PROVIDER_NOT_CONFIGURED",latencyBucket:chatPhotoLatencyBucket(Date.now()-photoProcessingStartedAt),byteSizeBucket:chatPhotoByteBucket(bytes.byteLength),longEdgeBucket:chatPhotoEdgeBucket(Math.max(actualDimensions.width,actualDimensions.height))}));
      throw new AppError("PROVIDER_NOT_CONFIGURED", "Photo understanding is temporarily unavailable.", 503, true);
    }
    const { count: processingCount, error: processingError } = await db.from("together_conversation_attachments").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("analysis_status", "processing").neq("id", attachment.id);
    if (processingError) throw new AppError("INTERNAL_ERROR", "That photo could not be checked.", 500, true);
    if (Number(processingCount ?? 0) >= 2){await track(db,user.id,"user_photo_processing_failed",safeChatPhotoTelemetry({stage:"concurrency",failureCode:"RATE_LIMITED",latencyBucket:chatPhotoLatencyBucket(Date.now()-photoProcessingStartedAt)}));throw new AppError("RATE_LIMITED", "Two photos are already being checked. Try again in a moment.", 429, true);}
    await db.from("together_conversation_attachments").update({
      byte_size: bytes.byteLength,
      width: actualDimensions.width,
      height: actualDimensions.height,
      upload_status: "uploaded",
      analysis_status: "processing",
      updated_at: new Date().toISOString(),
    }).eq("id", attachment.id).eq("user_id", user.id);
    try {
      const result = await provider.analyze({
        bytes,
        contentType: String(attachment.mime_type),
        userCaption: input.caption,
        safetyIdentifier: await opaqueSafetyIdentifier(user.id),
      });
      const { data } = await db.from("together_conversation_attachments")
        .update({
          analysis_status: "ready",
          analysis_metadata: {
            shortDescription: result.shortDescription,
            notableDetails: result.notableDetails,
            visibleText: result.visibleText,
            safetyCategories: result.safetyCategories,
            confidence: result.confidence,
            containsRealPerson: result.containsRealPerson === true,
            containsMinor: result.containsMinor === true,
            provider: provider.id,
            model: result.model,
            providerRequestId: result.providerRequestId,
            contextVersion: 1,
          },
          updated_at: new Date().toISOString(),
        }).eq("id", attachment.id).eq("user_id", user.id).select("*").single();
      await track(db, user.id, "user_photo_analysis_ready", {
        attachmentId: attachment.id,
        provider: provider.id,
        latencyBucket: chatPhotoLatencyBucket(Date.now()-photoProcessingStartedAt),
        byteSizeBucket: chatPhotoByteBucket(bytes.byteLength),
        longEdgeBucket: chatPhotoEdgeBucket(Math.max(actualDimensions.width,actualDimensions.height)),
      });
      return json(
        {
          data: await attachmentPayload(db, data ?? attachment),
          correlationId,
        },
        200,
        correlationId,
      );
    } catch (error) {
      await db.from("together_conversation_attachments")
        .update({
          analysis_status: "failed",
          analysis_metadata: {},
          updated_at: new Date().toISOString(),
        }).eq("id", attachment.id).eq("user_id", user.id);
      await track(db,user.id,"user_photo_processing_failed",safeChatPhotoTelemetry({stage:"vision",failureCode:chatPhotoFailureCode(error),latencyBucket:chatPhotoLatencyBucket(Date.now()-photoProcessingStartedAt),byteSizeBucket:chatPhotoByteBucket(bytes.byteLength),longEdgeBucket:chatPhotoEdgeBucket(Math.max(actualDimensions.width,actualDimensions.height))}));
      throw error instanceof AppError ? error : new AppError("PROVIDER_UNAVAILABLE", "That photo could not be understood. Try again.", 503, true);
    }
  }

  if (input.action === "remove_attachment" || input.action === "delete_attachment") {
    const attachment = await requireAttachment(
      db,
      user.id,
      continuity.id,
      input.attachmentId,
    );
    if (input.action === "remove_attachment" && attachment.message_id) {
      throw new AppError(
        "CONFLICT",
        "Use Delete photo to remove a sent photo.",
        409,
      );
    }
    await db.from("together_conversation_attachments").delete().eq(
      "id",
      attachment.id,
    ).eq("user_id", user.id);
    if (attachment.storage_path) {
      await db.storage.from("together-user-media").remove([
        String(attachment.storage_path),
      ]);
    }
    await track(db, user.id, input.action === "delete_attachment" ? "user_photo_deleted" : "user_photo_removed", { attachmentId: attachment.id });
    return json({ data: { removed: true }, correlationId }, 200, correlationId);
  }

  if (input.action === "preview_voice") {
    if (preferences.companionVoiceNotes === false) {
      throw new AppError("FORBIDDEN", "Voice notes are turned off in Settings.", 403);
    }
    if (!capabilities.experience.voiceNotes) {
      throw new AppError("PLAN_LIMIT_REACHED", "Voice previews are available with Kivelle+.", 403);
    }
    const { data: conversation } = await db.from("together_conversations").select(
      "id,continuity_id,character_instance_id,metadata",
    ).eq("id", input.conversationId).eq("user_id", user.id).eq(
      "continuity_id",
      continuity.id,
    ).maybeSingle();
    if (!conversation) throw new AppError("NOT_FOUND", "That conversation is unavailable.", 404);
    const characterInstanceId = String(conversation.character_instance_id);
    await requireInstanceInActiveContinuity(db, user.id, characterInstanceId);
    const voicePreset = await validateCompanionVoicePreset(db, characterInstanceId, input.voicePreset);
    const presetKey = voicePreset ?? "default";
    const chatLanguage = normalizeChatLanguage(input.chatLanguage ?? conversationChatLanguage(conversation.metadata));
    const languageKey = chatLanguage.replace(/[^a-zA-Z0-9-]/g, "-");
    const previewKey = `${presetKey}-${languageKey}`;
    const storageFolder = `${user.id}/voice-previews/${characterInstanceId}/v1`;
    const { data: storedPreviews, error: storedPreviewError } = await db.storage
      .from("together-user-media")
      .list(storageFolder, { limit: 20, search: `${previewKey}.` });
    if (!storedPreviewError) {
      const storedPreview = storedPreviews?.find((entry) =>
        entry.name === `${previewKey}.mp3` || entry.name === `${previewKey}.wav`
      );
      if (storedPreview) {
        const storagePath = `${storageFolder}/${storedPreview.name}`;
        const { data: signed, error: signedError } = await db.storage
          .from("together-user-media")
          .createSignedUrl(storagePath, 3600);
        if (!signedError && signed?.signedUrl) {
          const contentType = storedPreview.name.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
          await track(db, user.id, "voice_preview_cache_hit", {
            characterInstanceId,
            conversationId: conversation.id,
            voicePreset: presetKey,
          });
          return json({
            data: {
              preview: {
                signedUrl: signed.signedUrl,
                durationMs: 0,
                contentType,
                voicePreset,
                cached: true,
              },
            },
            correlationId,
          }, 200, correlationId);
        }
      }
    }
    await enforceRateLimit(db, user.id, "together_voice_preview", 20, 3600);
    const provider = configuredTextToSpeechProvider();
    if (!provider) throw new AppError("PROVIDER_UNAVAILABLE", "Voice isn't connected yet.", 503, false);
    if (provider.id === "xai" && !voiceRolloutEligible(user.id)) {
      throw new AppError("PROVIDER_UNAVAILABLE", "Voice previews are not available for this rollout yet.", 503, false);
    }
    const voice = await resolveCompanionVoiceProfile(db, characterInstanceId, voicePreset);
    const previewText = chatLanguagePreviewText(chatLanguage);
    try {
      const result = await provider.synthesize({ text: previewText, voice, language: chatLanguage, outputFormat: "mp3" });
      const extension = result.contentType.includes("mpeg") ? "mp3" : "wav";
      const storagePath = `${storageFolder}/${previewKey}.${extension}`;
      const { error: uploadError } = await db.storage.from("together-user-media").upload(storagePath, result.bytes, {
        contentType: result.contentType,
        upsert: true,
      });
      if (uploadError) throw new AppError("INTERNAL_ERROR", "The voice preview could not be saved.", 500, true);
      const { data: signed, error: signedError } = await db.storage.from("together-user-media").createSignedUrl(storagePath, 3600);
      if (signedError || !signed?.signedUrl) throw new AppError("INTERNAL_ERROR", "The voice preview could not be opened.", 500, true);
      await recordVoiceNoteUsage(db, {
        userId: user.id,
        continuityId: continuity.id,
        characterInstanceId,
        conversationId: conversation.id,
        provider: provider.id,
        model: result.model,
        planTier: voiceEntitlement.tier,
        status: "success",
        characterCount: result.characterCount ?? previewText.length,
        latencyMs: result.latencyMs,
        estimatedCostUsd: result.estimatedCostUsd ?? 0,
      }).catch(() => undefined);
      await track(db, user.id, "voice_preview_ready", {
        characterInstanceId,
        conversationId: conversation.id,
        provider: provider.id,
        model: result.model,
        durationMs: result.durationMs,
        voicePreset: presetKey,
      });
      return json({ data: { preview: { signedUrl: signed.signedUrl, durationMs: result.durationMs, contentType: result.contentType, voicePreset, cached: false } }, correlationId }, 201, correlationId);
    } catch (error) {
      const failureCode = error instanceof AppError ? error.code : "PROVIDER_UNAVAILABLE";
      await recordVoiceNoteUsage(db, {
        userId: user.id,
        continuityId: continuity.id,
        characterInstanceId,
        conversationId: conversation.id,
        provider: provider.id,
        model: "unknown",
        planTier: voiceEntitlement.tier,
        status: "failure",
        characterCount: previewText.length,
        estimatedCostUsd: 0,
        failureCode,
      }).catch(() => undefined);
      await track(db, user.id, "voice_preview_failed", { characterInstanceId, conversationId: conversation.id, provider: provider.id, failureCode });
      throw error instanceof AppError ? error : new AppError("PROVIDER_UNAVAILABLE", "The voice preview could not be generated.", 503, true);
    }
  }

  if (input.action === "voice_note_quote") {
    if (preferences.companionVoiceNotes === false) throw new AppError("FORBIDDEN", "Voice notes are turned off in Settings.", 403);
    if (!capabilities.experience.voiceNotes) throw new AppError("PLAN_LIMIT_REACHED", "Voice notes are available with Kivelle+.", 403);
    const { data: message } = await db.from("together_messages").select("id,content,together_conversations!inner(continuity_id)").eq("id", input.messageId).eq("user_id", user.id).eq("role", "assistant").maybeSingle();
    const conversation = message?.together_conversations as Record<string, unknown> | undefined;
    if (!message || String(conversation?.continuity_id) !== continuity.id) throw new AppError("NOT_FOUND", "That companion message is unavailable.", 404);
    const canonicalText = String(message.content ?? "").trim();
    if (hasSexualDialogueLanguage(canonicalText)) {
      throw new AppError(
        "FORBIDDEN",
        "Sexual messages are not available as voice notes.",
        403,
      );
    }
    const requestKey = `voice-note:${message.id}`;
    const [{ data: duplicate }, subscription] = await Promise.all([
      db.from("together_generated_media").select("id,status").eq("user_id", user.id).eq("request_key", requestKey).maybeSingle(),
      resolveSubscriptionState(db, user.id),
    ]);
    const generationRequired = !duplicate || duplicate.status === "failed", pricing=voiceNotePricing(canonicalText.length),cost=generationRequired?pricing.creditCost:0;
    return json({ data: { creditCost: cost, creditBalance: subscription.creditBalance.total, canAfford: subscription.creditBalance.total >= cost, generationRequired, characterCount:pricing.characterCount, shortened:pricing.shortened }, correlationId }, 200, correlationId);
  }

  if (input.action === "request_voice_note") {
    if (preferences.companionVoiceNotes === false) {
      throw new AppError(
        "FORBIDDEN",
        "Voice notes are turned off in Settings.",
        403,
      );
    }
    if (!capabilities.experience.voiceNotes) {
      throw new AppError(
        "PLAN_LIMIT_REACHED",
        "Voice notes are available with Kivelle+.",
        403,
      );
    }
    await enforceRateLimit(
      db,
      user.id,
      "together_voice_note_request",
      30,
      3600,
    );
    const { data: message } = await db.from("together_messages").select(
      "*,together_conversations!inner(id,continuity_id,character_instance_id,user_id,metadata)",
    ).eq("id", input.messageId).eq("user_id", user.id).eq("role", "assistant")
      .maybeSingle();
    const conversation = message?.together_conversations as
      | Record<string, unknown>
      | undefined;
    if (!message || String(conversation?.continuity_id) !== continuity.id) {
      throw new AppError(
        "NOT_FOUND",
        "That companion message is unavailable.",
        404,
      );
    }
    const canonicalText = String(message.content ?? "").trim();
    if (!canonicalText) {
      throw new AppError(
        "VALIDATION_FAILED",
        "There is no spoken message to play.",
        422,
      );
    }
    if (hasSexualDialogueLanguage(canonicalText)) {
      throw new AppError(
        "FORBIDDEN",
        "Sexual messages are not available as voice notes.",
        403,
      );
    }
    const characterInstanceId = String(
      message.speaker_character_instance_id ?? message.character_instance_id ??
        conversation?.character_instance_id ?? "",
    );
    await requireInstanceInActiveContinuity(db, user.id, characterInstanceId);
    const requestKey = `voice-note:${message.id}`;
    const { data: duplicate } = await db.from("together_generated_media")
      .select("*").eq("user_id", user.id).eq("request_key", requestKey)
      .maybeSingle();
    if (duplicate && duplicate.status !== "failed") {
      return json(
        { data: await mediaPayload(db, duplicate), correlationId },
        200,
        correlationId,
      );
    }
    const provider = configuredTextToSpeechProvider();
    if (!provider) {
      return json(
        {
          data: {
            status: "not_configured",
            providerStatus: "not_configured",
            message: "Voice isn't connected yet.",
          },
          correlationId,
        },
        200,
        correlationId,
      );
    }
    if (provider.id === "xai" && !voiceRolloutEligible(user.id)) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Voice notes are not available for this rollout yet.",
        503,
        false,
      );
    }
    const storedVoicePreset = chatVoicePreset(conversation?.metadata);
    const chatLanguage = chatLanguageFromMessageMetadata(message.provider_metadata);
    const voicePreset = storedVoicePreset ? await validateCompanionVoicePreset(db, characterInstanceId, storedVoicePreset) : null;
    const voice = await resolveCompanionVoiceProfile(db, characterInstanceId, voicePreset);
    const mediaId = String(duplicate?.id ?? crypto.randomUUID());
    let performance;
    try {
      performance = prepareCompanionSpeech({
        canonicalText,
        voiceProfile: voice,
        mood: typeof message.provider_metadata?.mood === "string"
          ? message.provider_metadata.mood
          : null,
      });
    } catch {
      throw new AppError(
        "VALIDATION_FAILED",
        "That message is too long for a voice note.",
        422,
        false,
      );
    }
    if (!performance.spokenText) {
      throw new AppError(
        "VALIDATION_FAILED",
        "There is no spoken message to play.",
        422,
      );
    }
    const pricing=voiceNotePricing(canonicalText.length);
    const attemptNumber=Math.max(1,Number(duplicate?.attempt_count??0)+1);
    const charged=await spendCredits(db,{userId:user.id,action:"voice_note",amount:pricing.creditCost,idempotencyKey:`voice-note:${message.id}:attempt:${attemptNumber}`,referenceType:"generated_media",referenceId:mediaId,metadata:{messageId:message.id,characterInstanceId,attemptNumber,sourceCharacterCount:pricing.characterCount,spokenTextShortened:performance.shortened}});
    const mediaMutation = buildVoiceNoteMediaMutation({
      id: mediaId,
      userId: user.id,
      continuityId: continuity.id,
      characterInstanceId,
      conversationId: String(conversation?.id),
      messageId: message.id,
      requestKey,
      provider: provider.id,
      canonicalText,
      attemptNumber,
      metadata: {
        source: "assistant_message",
        voiceKey: voice.voiceKey,
        chatLanguage,
        spokenTextVersion: performance.spokenText,
        sourceCharacterCount: pricing.characterCount,
        spokenCharacterCount: performance.characterCount,
        spokenTextShortened: performance.shortened,
        requestId: input.requestId,
        contextVersion: 2,
        creditTransactionId:charged.transactionId,
        creditCost:charged.cost,
        creditRefunded:false,
      },
    });
    const { data: media, error: mediaError } = duplicate
      ? await db.from("together_generated_media").update(mediaMutation).eq(
        "id",
        mediaId,
      ).eq("user_id", user.id).select("*").single()
      : await db.from("together_generated_media").insert(mediaMutation).select(
        "*",
      ).single();
    if (mediaError || !media) {
      await refundCredits(db,{userId:user.id,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:"voice_note_start_failed",messageId:message.id}});
      throw new AppError(
        "INTERNAL_ERROR",
        "The voice note could not be started.",
        500,
        true,
      );
    }
    await track(db, user.id, "voice_note_requested", {
      mediaId,
      messageId: message.id,
      characterInstanceId,
      provider: provider.id,
      characterCount: performance.characterCount,
    });
    try {
      const result = await provider.synthesize({
        text: performance.spokenText,
        voice,
        language: chatLanguage,
        outputFormat: "mp3",
        delivery: { speed: performance.speed },
      });
      const extension = result.contentType.includes("mpeg") ? "mp3" : "wav";
      const storagePath =
        `${user.id}/voice-notes/${continuity.id}/${mediaId}.${extension}`;
      // A failed request may have uploaded its deterministic object before the
      // database update failed. Overwriting that same user-owned key makes an
      // idempotent retry recover instead of creating a duplicate media object.
      const { error: uploadError } = await db.storage.from(
        "together-user-media",
      ).upload(storagePath, result.bytes, {
        contentType: result.contentType,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const { data: ready } = await db.from("together_generated_media").update({
        status: "ready",
        storage_path: storagePath,
        duration_ms: result.durationMs,
        content_type: result.contentType,
        provider: provider.id,
        metadata: {
          ...(media.metadata as Record<string, unknown>),
          model: result.model,
          providerRequestId: result.providerRequestId ?? null,
          voiceId: result.voiceId ?? null,
          latencyMs: result.latencyMs ?? null,
          estimatedCostUsd: result.estimatedCostUsd ?? 0,
        },
        updated_at: new Date().toISOString(),
      }).eq("id", mediaId).eq("user_id", user.id).select("*").single();
      await recordVoiceNoteUsage(db, {
        userId: user.id,
        continuityId: continuity.id,
        characterInstanceId,
        conversationId: String(conversation?.id),
        mediaId,
        provider: provider.id,
        model: result.model,
        planTier: voiceEntitlement.tier,
        status: "success",
        characterCount: result.characterCount ?? performance.characterCount,
        latencyMs: result.latencyMs,
        estimatedCostUsd: result.estimatedCostUsd ?? 0,
      }).catch(() => undefined);
      await track(db, user.id, "voice_note_ready", {
        mediaId,
        messageId: message.id,
        characterInstanceId,
        provider: provider.id,
        model: result.model,
        durationMs: result.durationMs,
        latencyMs: result.latencyMs ?? null,
        estimatedCostUsd: result.estimatedCostUsd ?? 0,
      });
      return json(
        { data: await mediaPayload(db, ready ?? media), correlationId },
        201,
        correlationId,
      );
    } catch (error) {
      const failureCode = error instanceof AppError
        ? error.code
        : "PROVIDER_UNAVAILABLE";
      const creditRefunded=await refundCredits(db,{userId:user.id,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:"voice_note_generation_failed",mediaId,messageId:message.id,failureCode}});
      const { data: failed } = await db.from("together_generated_media").update(
        {
          status: "failed",
          failure_code: failureCode.toLowerCase(),
          failure_reason_safe: "The voice note could not be generated.",
          metadata: {
            ...(media.metadata as Record<string, unknown>),
            providerErrorCode: failureCode,
            creditRefunded,
          },
          updated_at: new Date().toISOString(),
        },
      ).eq("id", mediaId).eq("user_id", user.id).select("*").single();
      await recordVoiceNoteUsage(db, {
        userId: user.id,
        continuityId: continuity.id,
        characterInstanceId,
        conversationId: String(conversation?.id),
        mediaId,
        provider: provider.id,
        model: "unknown",
        planTier: voiceEntitlement.tier,
        status: "failure",
        characterCount: performance.characterCount,
        estimatedCostUsd: 0,
        failureCode,
      }).catch(() => undefined);
      await track(db, user.id, "voice_note_failed", {
        mediaId,
        messageId: message.id,
        characterInstanceId,
        provider: provider.id,
        failureCode,
      });
      return json(
        { data: await mediaPayload(db, failed ?? media), correlationId },
        200,
        correlationId,
      );
    }
  }

  const { data: media } = await db.from("together_generated_media").select("*")
    .eq("id", input.mediaId).eq("user_id", user.id).eq(
      "continuity_id",
      continuity.id,
    ).maybeSingle();
  if (!media) {
    throw new AppError("NOT_FOUND", "That media is unavailable.", 404);
  }
  if (
    media.media_type === "voice_note" &&
    hasSexualDialogueLanguage(String(media.canonical_text ?? ""))
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Sexual messages are not available as voice notes.",
      403,
    );
  }
  return json(
    { data: await mediaPayload(db, media), correlationId },
    200,
    correlationId,
  );
});

const MAX_DICTATION_BYTES = 8 * 1024 * 1024;
const supportedDictationTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

async function transcribeAudio(
  request: Request,
  correlationId: string,
  userId: string,
  db: any,
): Promise<Response> {
  if (request.method !== "POST") {
    throw new AppError("VALIDATION_FAILED", "Use POST for voice-to-text.", 405);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    throw new AppError("VALIDATION_FAILED", "A voice recording is required.", 422);
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_DICTATION_BYTES + 64 * 1024) {
    throw new AppError("VALIDATION_FAILED", "Keep voice-to-text recordings under one minute.", 413);
  }
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const conversationId = String(form?.get("conversationId") ?? "");
  const characterInstanceId = String(form?.get("characterInstanceId") ?? "");
  const durationMs = Math.max(0, Math.min(60_000, Number(form?.get("durationMs") ?? 0)));
  if (!(audio instanceof Blob) || !uuid.safeParse(conversationId).success ||
    !uuid.safeParse(characterInstanceId).success) {
    throw new AppError("VALIDATION_FAILED", "A valid voice recording is required.", 422);
  }
  const contentType = audio.type.toLowerCase().split(";", 1)[0] ?? "";
  if (!supportedDictationTypes.has(contentType)) {
    throw new AppError("VALIDATION_FAILED", "That audio format is not supported.", 422);
  }
  if (audio.size < 800) {
    throw new AppError("VALIDATION_FAILED", "Speak for a moment before stopping.", 422);
  }
  if (audio.size > MAX_DICTATION_BYTES) {
    throw new AppError("VALIDATION_FAILED", "Keep voice-to-text recordings under one minute.", 413);
  }

  const continuity = await activeContinuity(db, userId);
  await requireInstanceInActiveContinuity(db, userId, characterInstanceId);
  const conversation = await requireConversation(
    db,
    userId,
    continuity.id,
    conversationId,
    characterInstanceId,
  );
  await enforceRateLimit(db, userId, "together_chat_dictation", 120, 3600);
  const provider = configuredSpeechToTextProvider();
  if (!provider) {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Voice-to-text is not available right now.",
      503,
      true,
    );
  }
  const suppliedName = typeof (audio as Blob & { name?: unknown }).name === "string"
    ? String((audio as Blob & { name?: string }).name)
    : "dictation";
  const result = await provider.transcribe({
    bytes: new Uint8Array(await audio.arrayBuffer()),
    contentType,
    fileName: suppliedName,
    language: conversationChatLanguage(conversation.metadata),
  });
  await track(db, userId, "chat_dictation_transcribed", {
    conversationId,
    characterInstanceId,
    provider: provider.id,
    model: result.model,
    byteSize: audio.size,
    durationMs,
    latencyMs: result.latencyMs ?? null,
  });
  return json({
    data: {
      text: result.text,
      provider: provider.id,
      model: result.model,
    },
    correlationId,
  }, 200, correlationId);
}

async function requireConversation(
  db: any,
  userId: string,
  continuityId: string,
  conversationId: string,
  characterInstanceId: string,
) {
  const { data } = await db.from("together_conversations").select("id,metadata").eq(
    "id",
    conversationId,
  ).eq("user_id", userId).eq("continuity_id", continuityId).eq(
    "character_instance_id",
    characterInstanceId,
  ).maybeSingle();
  if (!data) {
    throw new AppError("NOT_FOUND", "That conversation is unavailable.", 404);
  }
  return data as Record<string, unknown>;
}

function conversationChatLanguage(metadata: unknown) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const preferences = record.chatPreferences && typeof record.chatPreferences === "object" && !Array.isArray(record.chatPreferences)
    ? record.chatPreferences as Record<string, unknown>
    : {};
  return normalizeChatLanguage(preferences.chatLanguage);
}

async function requireAttachment(
  db: any,
  userId: string,
  continuityId: string,
  attachmentId: string,
): Promise<Record<string, any>> {
  const { data } = await db.from("together_conversation_attachments").select(
    "*",
  ).eq("id", attachmentId).eq("user_id", userId).eq(
    "continuity_id",
    continuityId,
  ).maybeSingle();
  if (!data) {
    throw new AppError("NOT_FOUND", "That attachment is unavailable.", 404);
  }
  return data;
}

async function attachmentPayload(db: any, attachment: Record<string, any>) {
  let signedUrl: string | null = null;
  if (attachment.upload_status === "uploaded" && attachment.storage_path) {
    signedUrl = (await db.storage.from("together-user-media").createSignedUrl(
      String(attachment.storage_path),
      3600,
    )).data?.signedUrl ?? null;
  }
  return {
    attachment: { ...attachment, signed_url: signedUrl },
    upload: { bucket: "together-user-media", path: attachment.storage_path },
    providers: providerCapabilityStatuses(),
  };
}

async function mediaPayload(db: any, media: Record<string, any>) {
  let signedUrl: string | null = null;
  if (media.status === "ready" && media.storage_path) {
    signedUrl = (await db.storage.from("together-user-media").createSignedUrl(
      String(media.storage_path),
      3600,
    )).data?.signedUrl ?? null;
  }
  return {
    media: { ...media, signed_url: signedUrl },
    providers: providerCapabilityStatuses(),
  };
}

async function opaqueSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
