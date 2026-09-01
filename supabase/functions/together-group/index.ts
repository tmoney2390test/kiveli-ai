import { z } from "zod";
import {
  commonGroupWorldId,
  currentGroupPlan,
  defaultGroupTitle,
  groupPlanBlockingParticipantRemoval,
} from "../../../packages/together-domain/src/index.ts";
import { chatLanguagePreferences } from "../../../packages/together-domain/src/chat-language.ts";
import { parseBody } from "../_shared/body.ts";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { json, serve } from "../_shared/http.ts";
import { activeContinuity } from "../_shared/together-continuity.ts";
import {
  activeGroupParticipants,
  normalizeGroupSettings,
  requireGroupChatAccess,
  requireOwnedGroupConversation,
} from "../_shared/kivelle-group-chat.ts";
import { eligibleGroupInstances } from "../_shared/kivelle-group-eligibility.ts";
import { track } from "../_shared/together.ts";
import { AppError } from "../_shared/types.ts";
import { conversationArchiveFields } from "../_shared/together-conversation-archive.ts";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    characterInstanceIds: z.array(z.string().uuid()).min(2).max(5),
    worldId: z.string().uuid().optional(),
    title: z.string().trim().max(80).optional(),
    requestId: z.string().min(8).max(120),
  }),
  z.object({
    action: z.literal("create_from_scene"),
    sceneId: z.string().uuid(),
    title: z.string().trim().max(80).optional(),
    requestId: z.string().min(8).max(120),
  }),
  z.object({ action: z.literal("detail"), conversationId: z.string().uuid(), messageLimit:z.number().int().min(20).max(80).default(60) }),
  z.object({ action: z.literal("changes"), conversationId: z.string().uuid(), since:z.string().datetime() }),
  z.object({
    action: z.literal("messages"),
    conversationId: z.string().uuid(),
    before: z.string().datetime().optional(),
    beforeSequence: z.number().int().positive().optional(),
    limit: z.number().int().min(20).max(60).default(50),
  }).refine((value) => value.beforeSequence !== undefined || value.before !== undefined, {
    message: "A message cursor is required.",
  }),
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("fresh"),
    conversationId: z.string().uuid(),
    requestId: z.string().min(8).max(120),
  }),
  z.object({
    action: z.literal("set_favorite"),
    conversationId: z.string().uuid(),
    favorite: z.boolean(),
  }),
  z.object({
    action: z.literal("rename"),
    conversationId: z.string().uuid(),
    title: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("settings"),
    conversationId: z.string().uuid(),
    title: z.string().trim().max(80).nullable().optional(),
    responseStyle: z.enum(["texting", "paragraph"]).optional(),
    textSize: z.enum(["small", "medium", "large"]).optional(),
    chatLanguage: z.enum(chatLanguagePreferences).optional(),
    responseMode: z.enum(["automatic", "choose_speaker"]),
    energy: z.enum(["quiet", "balanced", "lively"]),
  }),
  z.object({
    action: z.literal("cancel_turn"),
    conversationId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("add_participant"),
    conversationId: z.string().uuid(),
    characterInstanceId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("remove_participant"),
    conversationId: z.string().uuid(),
    characterInstanceId: z.string().uuid(),
  }),
  z.object({ action: z.literal("archive"), conversationId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);
  await requireGroupChatAccess(db, user.id);
  if (input.action === "create" || input.action === "create_from_scene") {
    await enforceRateLimit(db, user.id, "together_group_create", 12, 3600);
    const existing = await db.from("together_conversations").select("*").eq(
      "user_id",
      user.id,
    ).eq("continuity_id", continuity.id).eq("kind", "group").contains(
      "metadata",
      { groupCreateRequestId: input.requestId },
    ).maybeSingle();
    if (existing.data) {
      return json(
        {
          data: await groupDetail(db, user.id, continuity.id, existing.data),
          correlationId,
        },
        200,
        correlationId,
      );
    }
    let ids: string[],
      addedBy: "user" | "shared_scene" = "user",
      sceneId: string | undefined;
    if (input.action === "create_from_scene") {
      const { data: scene } = await db.from("together_scene_sessions").select(
        "id,user_id,continuity_id",
      ).eq("id", input.sceneId).eq("user_id", user.id).eq(
        "continuity_id",
        continuity.id,
      ).maybeSingle();
      if (!scene) {
        throw new AppError(
          "NOT_FOUND",
          "That Shared Scene is unavailable.",
          404,
        );
      }
      const { data: participants } = await db.from(
        "together_scene_participants",
      ).select("character_instance_id").eq("scene_session_id", scene.id).order(
        "joined_at",
      );
      ids = [
        ...new Set(
          (participants ?? []).map((row: any) =>
            String(row.character_instance_id)
          ),
        ),
      ].slice(0, 5);
      addedBy = "shared_scene";
      sceneId = scene.id;
    } else ids = [...new Set(input.characterInstanceIds)];
    if (ids.length < 2 || ids.length > 5) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Choose 2 to 5 companions for a group.",
        400,
      );
    }
    const instances = await eligibleGroupInstances(
      db,
      user.id,
      continuity.id,
      ids,
    );
    if (instances.length !== ids.length) {
      throw new AppError(
        "FORBIDDEN",
        "Only companions you have met in this Life can join a group.",
        403,
      );
    }
    const ordered = ids.map((id) =>
      instances.find((instance: any) => String(instance.id) === id)!
    );
    const groupWorldId = await requireCommonResidentWorld(db, ordered);
    if (
      input.action === "create" && input.worldId &&
      input.worldId !== groupWorldId
    ) {
      throw new AppError(
        "CONFLICT",
        "Those companions no longer match the selected world. Refresh and try again.",
        409,
        true,
      );
    }
    const title = input.title?.trim() ||
      defaultGroupTitle(
        ordered.map((instance: any) =>
          String(instance.together_character_templates?.name ?? "Companion")
        ),
      );
    const { data: conversation, error } = await db.from(
      "together_conversations",
    ).insert({
      user_id: user.id,
      continuity_id: continuity.id,
      character_instance_id: ids[0],
      kind: "group",
      group_world_id: groupWorldId,
      title,
      metadata: {
        groupSettings: { responseMode: "automatic", energy: "balanced" },
        groupWorldId,
        groupCreateRequestId: input.requestId,
        ...(sceneId ? { createdFromSceneId: sceneId } : {}),
      },
    }).select("*").single();
    if (error || !conversation) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The group could not be created.",
        500,
        true,
      );
    }
    const { error: participantError } = await db.from(
      "together_conversation_participants",
    ).insert(ids.map((characterInstanceId, index) => ({
      user_id: user.id,
      continuity_id: continuity.id,
      conversation_id: conversation.id,
      character_instance_id: characterInstanceId,
      role: index === 0 ? "owner_companion" : "member",
      added_by: addedBy,
      witnessed_from_sequence: 1,
      metadata: sceneId ? { seedSceneId: sceneId } : {},
    })));
    if (participantError) {
      await db.from("together_conversations").delete().eq(
        "id",
        conversation.id,
      );
      throw new AppError(
        "INTERNAL_ERROR",
        "The group roster could not be created.",
        500,
        true,
      );
    }
    await track(
      db,
      user.id,
      sceneId ? "group_from_shared_scene_created" : "group_created",
      { conversationId: conversation.id, participantCount: ids.length },
    );
    return json(
      {
        data: await groupDetail(db, user.id, continuity.id, conversation),
        correlationId,
      },
      201,
      correlationId,
    );
  }
  if (input.action === "list") {
    const { data: groups, error } = await db.from("together_conversations")
      .select("*").eq("user_id", user.id).eq("continuity_id", continuity.id).eq(
        "kind",
        "group",
      ).is("archived_at", null).order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      });
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Groups could not be loaded.",
        500,
        true,
      );
    }
    const groupIds = (groups ?? []).map((group: any) => String(group.id));
    const { data: participantRows, error: participantError } = groupIds.length
      ? await db.from("together_conversation_participants").select(
        "*,together_character_instances(*,together_character_templates(*),together_character_versions(portrait_asset_key,visual_identity,personality_config,communication_style,boundaries))",
      ).eq("user_id", user.id).eq("continuity_id", continuity.id).in(
        "conversation_id",
        groupIds,
      ).is("left_at", null).order("joined_at")
      : { data: [], error: null };
    if (participantError) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Group rosters could not be loaded.",
        500,
        true,
      );
    }
    const participantsByConversation = new Map<string, any[]>();
    for (const participant of participantRows ?? []) {
      const key = String(participant.conversation_id);
      participantsByConversation.set(key, [
        ...(participantsByConversation.get(key) ?? []),
        participant,
      ]);
    }
    const details = await Promise.all(
      (groups ?? []).map((group: any) =>
        groupDetail(
          db,
          user.id,
          continuity.id,
          group,
          false,
          60,
          participantsByConversation.get(String(group.id)) ?? [],
        )
      ),
    );
    return json(
      { data: { groups: details }, correlationId },
      200,
      correlationId,
    );
  }
  if (input.action === "fresh") {
    const { data: existingFresh } = await db.from("together_conversations")
      .select("*").eq("user_id", user.id).eq("continuity_id", continuity.id)
      .eq("kind", "group").contains("metadata", {
        groupCreateRequestId: input.requestId,
        freshFromConversationId: input.conversationId,
      }).is("archived_at", null).maybeSingle();
    if (existingFresh) {
      return json({
        data: await groupDetail(db, user.id, continuity.id, existingFresh),
        correlationId,
      }, 200, correlationId);
    }
  }
  const conversation = await requireOwnedGroupConversation(db, {
    userId: user.id,
    continuityId: continuity.id,
    conversationId: input.conversationId,
  });
  if (input.action === "detail") {
    const readAt = new Date().toISOString();
    const { data: readConversation } = await db.from("together_conversations")
      .update({ last_read_at: readAt }).eq("id", conversation.id).eq(
        "user_id",
        user.id,
      ).select("*").single();
    return json(
      {
        data: await groupDetail(
          db,
          user.id,
          continuity.id,
          readConversation ?? conversation,
          true,
          input.messageLimit,
        ),
        correlationId,
      },
      200,
      correlationId,
    );
  }
  if (input.action === "messages") {
    return json({
      data: await groupMessagePage(db, user.id, conversation.id, input.limit, input.beforeSequence, input.before),
      correlationId,
    }, 200, correlationId);
  }
  if (input.action === "changes") {
    return json({ data: await groupChanges(db, user.id, continuity.id, conversation, input.since), correlationId }, 200, correlationId);
  }
  if (input.action === "fresh") {
    await enforceRateLimit(db, user.id, "together_group_fresh", 12, 3600);
    const { data: existingFresh } = await db.from("together_conversations")
      .select("*").eq("user_id", user.id).eq("continuity_id", continuity.id)
      .eq("kind", "group").contains("metadata", {
        groupCreateRequestId: input.requestId,
        freshFromConversationId: conversation.id,
      }).maybeSingle();
    if (existingFresh) {
      return json({
        data: await groupDetail(db, user.id, continuity.id, existingFresh),
        correlationId,
      }, 200, correlationId);
    }
    const roster = await activeGroupParticipants(db, {
      userId: user.id,
      continuityId: continuity.id,
      conversationId: conversation.id,
    });
    if (roster.length < 2) {
      throw new AppError(
        "CONFLICT",
        "This group no longer has enough active companions to start fresh.",
        409,
        true,
      );
    }
    const now = new Date(), nowIso = now.toISOString(),
      restoreUntil = new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      metadata = {
        ...(conversation.metadata ?? {}),
        groupCreateRequestId: input.requestId,
        freshFromConversationId: conversation.id,
      };
    const { data: fresh, error: freshError } = await db.from(
      "together_conversations",
    ).insert({
      user_id: user.id,
      continuity_id: continuity.id,
      character_instance_id: roster[0]!.character_instance_id,
      kind: "group",
      group_world_id: conversation.group_world_id,
      title: conversation.title,
      metadata,
    }).select("*").single();
    if (freshError || !fresh) {
      throw new AppError(
        "INTERNAL_ERROR",
        "A fresh group chat could not be created.",
        500,
        true,
      );
    }
    const { error: participantError } = await db.from(
      "together_conversation_participants",
    ).insert(roster.map((participant: any, index: number) => ({
      user_id: user.id,
      continuity_id: continuity.id,
      conversation_id: fresh.id,
      character_instance_id: participant.character_instance_id,
      role: index === 0 ? "owner_companion" : "member",
      added_by: "user",
      witnessed_from_sequence: 1,
      metadata: { freshFromConversationId: conversation.id },
    })));
    if (participantError) {
      await db.from("together_conversations").delete().eq("id", fresh.id)
        .eq("user_id", user.id);
      throw new AppError(
        "INTERNAL_ERROR",
        "The fresh group roster could not be created.",
        500,
        true,
      );
    }
    const planMove = await db.from("together_shared_plans").update({
      source_conversation_id: fresh.id,
      updated_at: nowIso,
    }).eq("source_conversation_id", conversation.id).eq("user_id", user.id)
      .eq("continuity_id", continuity.id).in("status", [
        "proposed",
        "scheduled",
        "active",
      ]);
    if (planMove.error) {
      await db.from("together_conversations").delete().eq("id", fresh.id)
        .eq("user_id", user.id);
      throw new AppError(
        "INTERNAL_ERROR",
        "The current group plan could not be carried into the fresh chat.",
        500,
        true,
      );
    }
    const archiveOld = await db.from("together_conversations").update({
      archived_at: nowIso,
      user_archived_at: nowIso,
      restore_until: restoreUntil,
      updated_at: nowIso,
    }).eq("id", conversation.id).eq("user_id", user.id).is(
      "archived_at",
      null,
    ).select("id").maybeSingle();
    if (archiveOld.error || !archiveOld.data) {
      await db.from("together_shared_plans").update({
        source_conversation_id: conversation.id,
        updated_at: nowIso,
      }).eq("source_conversation_id", fresh.id).eq("user_id", user.id).in(
        "status",
        ["proposed", "scheduled", "active"],
      );
      await db.from("together_conversations").delete().eq("id", fresh.id)
        .eq("user_id", user.id);
      throw new AppError(
        "CONFLICT",
        "This group changed while the fresh chat was being created.",
        409,
        true,
      );
    }
    await db.from("together_dialogue_turns").update({
      state: "cancelled",
      cancelled_at: nowIso,
      updated_at: nowIso,
    }).eq("conversation_id", conversation.id).in("state", [
      "planning",
      "generating",
    ]);
    await track(db, user.id, "group_fresh_chat_started", {
      conversationId: fresh.id,
      previousConversationId: conversation.id,
      participantCount: roster.length,
    });
    return json({
      data: await groupDetail(db, user.id, continuity.id, fresh),
      correlationId,
    }, 201, correlationId);
  }
  if (input.action === "set_favorite") {
    const metadata = {
      ...(conversation.metadata ?? {}),
      favorite: input.favorite,
    };
    const { data, error } = await db.from("together_conversations").update({
      metadata,
      updated_at: new Date().toISOString(),
    }).eq("id", conversation.id).eq("user_id", user.id).select("*").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "That favorite could not be saved.",
        500,
        true,
      );
    }
    await track(db, user.id, "group_favorite_updated", {
      conversationId: conversation.id,
      favorite: input.favorite,
    });
    return json({
      data: await groupDetail(db, user.id, continuity.id, data),
      correlationId,
    }, 200, correlationId);
  }
  if (input.action === "rename") {
    const { data } = await db.from("together_conversations").update({
      title: input.title,
      updated_at: new Date().toISOString(),
    }).eq("id", conversation.id).eq("user_id", user.id).select("*").single();
    return json(
      {
        data: await groupDetail(
          db,
          user.id,
          continuity.id,
          data ?? conversation,
        ),
        correlationId,
      },
      200,
      correlationId,
    );
  }
  if (input.action === "settings") {
    const currentMetadata = conversation.metadata &&
        typeof conversation.metadata === "object" &&
        !Array.isArray(conversation.metadata)
      ? conversation.metadata as Record<string, unknown>
      : {};
    const storedPreferences = currentMetadata.chatPreferences;
    const currentPreferences = storedPreferences &&
        typeof storedPreferences === "object" &&
        !Array.isArray(storedPreferences)
      ? storedPreferences as Record<string, unknown>
      : {};
    const responseStyle = input.responseStyle ??
      (currentPreferences.responseStyle === "paragraph" ? "paragraph" : "texting");
    const textSize = input.textSize ??
      (["small", "medium", "large"].includes(String(currentPreferences.textSize))
        ? String(currentPreferences.textSize) as "small" | "medium" | "large"
        : "medium");
    const chatLanguage = input.chatLanguage ??
      (chatLanguagePreferences.includes(currentPreferences.chatLanguage as never)
        ? currentPreferences.chatLanguage as typeof chatLanguagePreferences[number]
        : "en");
    const chatPreferences: Record<string, unknown> = {
      ...currentPreferences,
      responseStyle,
      textSize,
      contentMode: "mature",
      chatLanguage,
    };
    delete chatPreferences.spiceLevel;
    const metadata = {
      ...currentMetadata,
      chatPreferences,
      groupSettings: { responseMode: input.responseMode, energy: input.energy },
    };
    const { data, error } = await db.from("together_conversations").update({
      title: input.title === undefined ? conversation.title : input.title,
      metadata,
      updated_at: new Date().toISOString(),
    }).eq("id", conversation.id).eq("user_id", user.id).select("*").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Group chat settings could not be saved.",
        500,
        true,
      );
    }
    await track(db, user.id, "group_chat_settings_updated", {
      conversationId: conversation.id,
      responseStyle,
      textSize,
      chatLanguage,
      responseMode: input.responseMode,
      energy: input.energy,
    });
    return json(
      {
        data: await groupDetail(
          db,
          user.id,
          continuity.id,
          data ?? { ...conversation, metadata },
        ),
        correlationId,
      },
      200,
      correlationId,
    );
  }
  if (input.action === "cancel_turn") {
    await enforceRateLimit(db, user.id, "together_group_cancel_turn", 120, 3600);
    const now = new Date().toISOString();
    const { data: cancelled, error } = await db.from("together_dialogue_turns")
      .update({
        state: "cancelled",
        cancelled_at: now,
        version: 1000000,
        updated_at: now,
      })
      .eq("user_id", user.id)
      .eq("conversation_id", conversation.id)
      .in("state", ["planning", "generating"])
      .select("id");
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The group reply could not be stopped.",
        500,
        true,
      );
    }
    await track(db, user.id, "group_turn_cancelled_by_user", {
      conversationId: conversation.id,
      turnCount: cancelled?.length ?? 0,
    });
    return json({
      data: { cancelled: (cancelled?.length ?? 0) > 0 },
      correlationId,
    }, 200, correlationId);
  }
  if (input.action === "add_participant") {
    const roster = await activeGroupParticipants(db, {
      userId: user.id,
      continuityId: continuity.id,
      conversationId: conversation.id,
    });
    if (roster.length >= 5) {
      throw new AppError(
        "VALIDATION_FAILED",
        "A group can include up to 5 companions.",
        400,
      );
    }
    if (
      roster.some((row) =>
        String(row.character_instance_id) === input.characterInstanceId
      )
    ) {
      throw new AppError(
        "CONFLICT",
        "That companion is already in this group.",
        409,
      );
    }
    const [candidate] = await eligibleGroupInstances(
      db,
      user.id,
      continuity.id,
      [
        input.characterInstanceId,
      ],
    );
    if (!candidate) {
      throw new AppError(
        "FORBIDDEN",
        "Only a companion you have met in this Life can join.",
        403,
      );
    }
    const rosterInstances = roster.map((participant) =>
      participant.together_character_instances
    );
    const rosterWorldId = String(conversation.group_world_id ?? "") ||
      await requireCommonResidentWorld(db, rosterInstances);
    const candidateWorldId = await requireCommonResidentWorld(db, [candidate]);
    if (candidateWorldId !== rosterWorldId) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Group companions must belong to the same world.",
        400,
      );
    }
    const now = new Date().toISOString();
    const { error } = await db.from("together_conversation_participants")
      .insert({
        user_id: user.id,
        continuity_id: continuity.id,
        conversation_id: conversation.id,
        character_instance_id: input.characterInstanceId,
        role: "member",
        added_by: "user",
        joined_at: now,
        witnessed_from_sequence: Number(conversation.message_sequence ?? 0) + 1,
        metadata: { joinedAfterCreation: true },
      });
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "That companion could not be added.",
        500,
        true,
      );
    }
    await track(db, user.id, "group_character_added", {
      conversationId: conversation.id,
      characterInstanceId: input.characterInstanceId,
      participantCount: roster.length + 1,
    });
    return json(
      {
        data: await groupDetail(db, user.id, continuity.id, conversation),
        correlationId,
      },
      200,
      correlationId,
    );
  }
  if (input.action === "remove_participant") {
    const roster = await activeGroupParticipants(db, {
      userId: user.id,
      continuityId: continuity.id,
      conversationId: conversation.id,
    });
    if (roster.length <= 2) {
      throw new AppError(
        "VALIDATION_FAILED",
        "A group needs at least 2 companions.",
        400,
      );
    }
    const {data:currentPlans,error:planLookupError}=await db.from("together_shared_plans")
      .select("id,title,status,starts_at,participant_instance_ids")
      .eq("user_id",user.id).eq("continuity_id",continuity.id)
      .eq("source_conversation_id",conversation.id)
      .in("status",["proposed","scheduled","active"])
      .contains("participant_instance_ids",[input.characterInstanceId]);
    if(planLookupError)throw new AppError("INTERNAL_ERROR","Current group plans could not be checked.",500,true);
    const blockingPlan=groupPlanBlockingParticipantRemoval(currentPlans??[],input.characterInstanceId);
    if(blockingPlan)throw new AppError("CONFLICT",`${blockingPlan.title} still includes this companion. End or cancel that plan first.`,409,true);
    const now = new Date().toISOString();
    const { data } = await db.from("together_conversation_participants").update(
      {
        left_at: now,
        witnessed_to_sequence: Number(conversation.message_sequence ?? 0),
        updated_at: now,
      },
    ).eq("conversation_id", conversation.id).eq(
      "character_instance_id",
      input.characterInstanceId,
    ).is("left_at", null).select("id").maybeSingle();
    if (!data) {
      throw new AppError(
        "NOT_FOUND",
        "That companion is not in this group.",
        404,
      );
    }
    await db.from("together_dialogue_turns").update({
      state: "cancelled",
      cancelled_at: now,
      version: 1000000,
      updated_at: now,
    }).eq("conversation_id", conversation.id).in("state", [
      "planning",
      "generating",
    ]).contains("planned_actions", [{
      characterInstanceId: input.characterInstanceId,
    }]);
    await track(db, user.id, "group_character_removed", {
      conversationId: conversation.id,
      characterInstanceId: input.characterInstanceId,
      participantCount: roster.length - 1,
    });
    return json(
      {
        data: await groupDetail(db, user.id, continuity.id, conversation),
        correlationId,
      },
      200,
      correlationId,
    );
  }
  const {data:currentPlans,error:currentPlanError}=await db.from("together_shared_plans")
    .select("id,title,status,starts_at,participant_instance_ids")
    .eq("user_id",user.id).eq("continuity_id",continuity.id)
    .eq("source_conversation_id",conversation.id)
    .in("status",["proposed","scheduled","active"]);
  if(currentPlanError)throw new AppError("INTERNAL_ERROR","Current group plans could not be checked.",500,true);
  const blockingArchivePlan=currentGroupPlan(currentPlans??[]);
  if(blockingArchivePlan)throw new AppError("CONFLICT",`${blockingArchivePlan.title} is still current. End or cancel it before archiving this group.`,409,true);
  const archive = conversationArchiveFields(new Date());
  const [archiveResult] = await Promise.all([
    db.from("together_conversations").update({
      ...archive,
      updated_at: archive.archived_at,
    }).eq("id", conversation.id).eq("user_id", user.id).is("archived_at", null).select("*").maybeSingle(),
    db.from("together_dialogue_turns").update({
      state: "cancelled",
      cancelled_at: archive.archived_at,
      updated_at: archive.archived_at,
    }).eq("conversation_id", conversation.id).in("state", [
      "planning",
      "generating",
    ]),
  ]);
  if (archiveResult.error || !archiveResult.data) throw new AppError("CONFLICT", "This group is already archived.", 409);
  await track(db,user.id,"conversation_archived",{conversationId:conversation.id,kind:"group",restoreUntil:archive.restore_until});
  return json({ data: { archived: true, conversation: archiveResult.data }, correlationId }, 200, correlationId);
});

async function requireCommonResidentWorld(db: any, instances: any[]) {
  const versionIds = [
    ...new Set(
      instances.map((instance) => String(instance.character_version_id ?? ""))
        .filter(Boolean),
    ),
  ];
  if (versionIds.length !== instances.length) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Every group companion needs a canonical home world.",
      400,
    );
  }
  const { data, error } = await db.from("together_character_world_presence")
    .select("character_version_id,world_id").in(
      "character_version_id",
      versionIds,
    ).eq("presence_type", "resident");
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Companion worlds could not be verified.",
      500,
      true,
    );
  }
  const worldsByVersion = new Map<string, string[]>();
  for (const row of data ?? []) {
    const versionId = String(row.character_version_id);
    worldsByVersion.set(versionId, [
      ...(worldsByVersion.get(versionId) ?? []),
      String(row.world_id),
    ]);
  }
  const residentWorldIds = instances.map((instance) => {
    const worlds = worldsByVersion.get(String(instance.character_version_id)) ??
      [];
    return worlds.length === 1 ? worlds[0] : null;
  });
  const worldId = commonGroupWorldId(residentWorldIds);
  if (!worldId) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Group companions must belong to the same world.",
      400,
    );
  }
  return worldId;
}
async function groupDetail(
  db: any,
  userId: string,
  continuityId: string,
  conversation: any,
  includeTimeline = true,
  messageLimit = 60,
  participantRows?: any[],
) {
  const syncedAt = new Date().toISOString();
  const participants = participantRows ?? await activeGroupParticipants(db, {
    userId,
    continuityId,
    conversationId: String(conversation.id),
  });
  let messages: any[] = [],
    reactions: any[] = [],
    generatedMedia: any[] = [],
    mediaOffers: any[] = [],
    sharedPlans: any[] = [],
    conversationActions: any[] = [],
    conversationEvents: any[] = [],
    hasMoreMessages = false;
  if (includeTimeline) {
    const [page, activeMediaResult, activeOfferResult, planResult, actionResult, eventResult] = await Promise
      .all([
        groupMessagePage(db, userId, conversation.id, messageLimit),
        db.from("together_generated_media").select("*").eq("conversation_id", conversation.id).in("status", ["queued", "generating"]).in("content_level", ["standard", "romance"]).order("created_at", { ascending: false }).limit(20),
        db.from("together_media_offers").select("*").eq("conversation_id", conversation.id).in("status", ["pending", "accepted", "failed"]).in("content_level", ["standard", "romance"]).order("created_at", { ascending: false }).limit(20),
        db.from("together_shared_plans").select(
          "*,together_locations(id,name,slug),together_plan_attendance(*),together_plan_participant_responses(*)",
        ).eq("source_conversation_id", conversation.id).eq("user_id", userId)
          .eq("continuity_id", continuityId).order("starts_at", {
            ascending: false,
            nullsFirst: false,
          }).limit(100),
        db.from("together_conversation_actions").select("*").eq(
          "conversation_id",
          conversation.id,
        ).eq("user_id", userId).eq("continuity_id", continuityId).eq(
          "status",
          "pending",
        ).order("created_at").limit(40),
        db.from("together_conversation_events").select("*").eq(
          "conversation_id",
          conversation.id,
        ).eq("user_id", userId).order("created_at", { ascending: false }).limit(120),
      ]);
    messages = page.messages;
    reactions = page.reactions;
    generatedMedia = mergeRows(page.generatedMedia, activeMediaResult.data ?? []);
    mediaOffers = mergeRows(page.mediaOffers, activeOfferResult.data ?? []);
    hasMoreMessages = page.hasMore;
    sharedPlans = (planResult.data ?? []).map(decorateGroupPlan);
    conversationActions = actionResult.data ?? [];
    conversationEvents = [...(eventResult.data ?? [])].reverse();
  }
  return {
    conversation,
    participants,
    messages,
    reactions,
    generatedMedia,
    mediaOffers,
    sharedPlans,
    conversationActions,
    conversationEvents,
    settings: normalizeGroupSettings(conversation.metadata),
    hasMoreMessages,
    syncedAt,
  };
}

async function groupMessagePage(
  db: any,
  userId: string,
  conversationId: string,
  limit: number,
  beforeSequence?: number,
  before?: string,
) {
  let query = db.from("together_messages")
    .select("*,together_conversation_attachments(*)")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("conversation_sequence", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (beforeSequence !== undefined) query = query.lt("conversation_sequence", beforeSequence);
  else if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL_ERROR", "Group messages could not be loaded.", 500, true);
  const rows = data ?? [], hasMore = rows.length > limit, messages = [...rows.slice(0, limit)].reverse(), ids = messages.map((message: any) => String(message.id));
  const [reactionResult, mediaResult, offerResult] = ids.length
    ? await Promise.all([
      db.from("together_message_reactions").select("*").eq("conversation_id", conversationId).in("message_id", ids).order("created_at"),
      db.from("together_generated_media").select("*").eq("user_id", userId).eq("conversation_id", conversationId).in("message_id", ids).in("content_level", ["standard", "romance"]).order("created_at"),
      db.from("together_media_offers").select("*").eq("user_id", userId).eq("conversation_id", conversationId).in("message_id", ids).in("content_level", ["standard", "romance"]).order("created_at"),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const failed = [reactionResult, mediaResult, offerResult].find((result: any) => result.error);
  if (failed?.error) throw new AppError("INTERNAL_ERROR", "Group message details could not be loaded.", 500, true);
  const signed = await signGroupAssets(db, messages, mediaResult.data ?? []);
  return { messages: signed.messages, reactions: reactionResult.data ?? [], generatedMedia: signed.media, mediaOffers: offerResult.data ?? [], hasMore };
}

async function groupChanges(db: any, userId: string, continuityId: string, conversation: any, since: string) {
  const syncedAt = new Date().toISOString();
  const [messageResult, reactionResult, mediaResult, offerResult, planResult, actionResult, eventResult, conversationResult] = await Promise.all([
    db.from("together_messages").select("*,together_conversation_attachments(*)").eq("user_id", userId).eq("conversation_id", conversation.id).gt("created_at", since).order("created_at").limit(80),
    db.from("together_message_reactions").select("*").eq("conversation_id", conversation.id).gt("created_at", since).order("created_at").limit(100),
    db.from("together_generated_media").select("*").eq("user_id", userId).eq("conversation_id", conversation.id).in("content_level", ["standard", "romance"]).gt("updated_at", since).order("updated_at").limit(40),
    db.from("together_media_offers").select("*").eq("user_id", userId).eq("conversation_id", conversation.id).in("content_level", ["standard", "romance"]).gt("updated_at", since).order("updated_at").limit(40),
    db.from("together_shared_plans").select("*,together_locations(id,name,slug),together_plan_attendance(*),together_plan_participant_responses(*)").eq("source_conversation_id", conversation.id).eq("user_id", userId).eq("continuity_id", continuityId).gt("updated_at", since).order("updated_at").limit(40),
    db.from("together_conversation_actions").select("*").eq("conversation_id", conversation.id).eq("user_id", userId).eq("continuity_id", continuityId).gt("updated_at", since).order("updated_at").limit(40),
    db.from("together_conversation_events").select("*").eq("conversation_id", conversation.id).eq("user_id", userId).gt("created_at", since).order("created_at").limit(80),
    db.from("together_conversations").select("*").eq("id", conversation.id).eq("user_id", userId).maybeSingle(),
  ]);
  const failed = [messageResult, reactionResult, mediaResult, offerResult, planResult, actionResult, eventResult, conversationResult].find((result: any) => result.error);
  if (failed?.error) throw new AppError("INTERNAL_ERROR", "The group could not catch up.", 500, true);
  const signed = await signGroupAssets(db, messageResult.data ?? [], mediaResult.data ?? []);
  return { conversation: conversationResult.data ?? conversation, messages: signed.messages, reactions: reactionResult.data ?? [], generatedMedia: signed.media, mediaOffers: offerResult.data ?? [], sharedPlans: (planResult.data ?? []).map(decorateGroupPlan), conversationActions: actionResult.data ?? [], conversationEvents: eventResult.data ?? [], syncedAt };
}

function decorateGroupPlan(plan: any) {
  const attendance = plan.together_plan_attendance ?? [];
  return { ...plan, participant_responses: plan.together_plan_participant_responses ?? [], attendance: { user: attendance.find((row: any) => row.participant_type === "user") ?? null, character: attendance.find((row: any) => row.participant_type === "character" && String(row.character_instance_id) === String(plan.character_instance_id)) ?? null } };
}
function mergeRows<T extends { id: string }>(left: T[], right: T[]) { const values = new Map(left.map((item) => [item.id, item])); for (const item of right) values.set(item.id, item); return [...values.values()]; }
async function signGroupAssets(db: any, messages: any[], media: any[]) {
  const paths = [...messages.flatMap((message: any) => message.together_conversation_attachments ?? []).map((attachment: any) => String(attachment.storage_path ?? "")), ...media.filter((item: any) => item.status === "ready" && item.storage_path).map((item: any) => String(item.storage_path))].filter(Boolean), unique = [...new Set(paths)];
  if (!unique.length) return { messages, media };
  const { data: signed } = await db.storage.from("together-user-media").createSignedUrls(unique, 3600), byPath = new Map((signed ?? []).map((item: any) => [String(item.path), item.signedUrl]));
  return { messages: messages.map((message: any) => ({ ...message, together_conversation_attachments: (message.together_conversation_attachments ?? []).map((attachment: any) => ({ ...attachment, signed_url: byPath.get(String(attachment.storage_path)) ?? null })) })), media: media.map((item: any) => ({ ...item, signed_url: item.storage_path ? byPath.get(String(item.storage_path)) ?? null : null })) };
}
