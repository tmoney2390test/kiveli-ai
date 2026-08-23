import { z } from "zod";
import {
  commonGroupWorldId,
  currentGroupPlan,
  defaultGroupTitle,
  groupPlanBlockingParticipantRemoval,
} from "../../../packages/together-domain/src/index.ts";
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
  z.object({ action: z.literal("detail"), conversationId: z.string().uuid() }),
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("rename"),
    conversationId: z.string().uuid(),
    title: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("settings"),
    conversationId: z.string().uuid(),
    responseMode: z.enum(["automatic", "choose_speaker"]),
    energy: z.enum(["quiet", "balanced", "lively"]),
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
    const details = await Promise.all(
      (groups ?? []).map((group: any) =>
        groupDetail(db, user.id, continuity.id, group, false)
      ),
    );
    return json(
      { data: { groups: details }, correlationId },
      200,
      correlationId,
    );
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
        ),
        correlationId,
      },
      200,
      correlationId,
    );
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
    const metadata = {
      ...(conversation.metadata ?? {}),
      groupSettings: { responseMode: input.responseMode, energy: input.energy },
    };
    const { data } = await db.from("together_conversations").update({
      metadata,
      updated_at: new Date().toISOString(),
    }).eq("id", conversation.id).eq("user_id", user.id).select("*").single();
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
  const now = new Date().toISOString();
  await Promise.all([
    db.from("together_conversations").update({
      archived_at: now,
      updated_at: now,
    }).eq("id", conversation.id).eq("user_id", user.id),
    db.from("together_dialogue_turns").update({
      state: "cancelled",
      cancelled_at: now,
      updated_at: now,
    }).eq("conversation_id", conversation.id).in("state", [
      "planning",
      "generating",
    ]),
  ]);
  return json({ data: { archived: true }, correlationId }, 200, correlationId);
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
) {
  const participants = await activeGroupParticipants(db, {
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
    conversationEvents: any[] = [];
  if (includeTimeline) {
    const [result, reactionResult, mediaResult, offerResult, planResult, actionResult, eventResult] = await Promise
      .all([
        db.from("together_messages").select(
          "*,together_conversation_attachments(*)",
        ).eq("conversation_id", conversation.id).order(
          "conversation_sequence",
          { ascending: true, nullsFirst: false },
        ).order("created_at", { ascending: true }).limit(300),
        db.from("together_message_reactions").select("*").eq(
          "conversation_id",
          conversation.id,
        ).order("created_at"),
        db.from("together_generated_media").select("*").eq(
          "conversation_id",
          conversation.id,
        ).order("created_at"),
        db.from("together_media_offers").select("*").eq(
          "conversation_id",
          conversation.id,
        ).order("created_at"),
        db.from("together_shared_plans").select(
          "*,together_locations(id,name,slug),together_plan_attendance(*),together_plan_participant_responses(*)",
        ).eq("source_conversation_id", conversation.id).eq("user_id", userId)
          .eq("continuity_id", continuityId).order("starts_at", {
            ascending: true,
            nullsFirst: false,
          }),
        db.from("together_conversation_actions").select("*").eq(
          "conversation_id",
          conversation.id,
        ).eq("user_id", userId).eq("continuity_id", continuityId).eq(
          "status",
          "pending",
        ).order("created_at"),
        db.from("together_conversation_events").select("*").eq(
          "conversation_id",
          conversation.id,
        ).eq("user_id", userId).order("created_at"),
      ]);
    messages = result.data ?? [];
    reactions = reactionResult.data ?? [];
    generatedMedia = mediaResult.data ?? [];
    mediaOffers = offerResult.data ?? [];
    sharedPlans = (planResult.data ?? []).map((plan: any) => {
      const attendance = plan.together_plan_attendance ?? [];
      return {
        ...plan,
        participant_responses: plan.together_plan_participant_responses ?? [],
        attendance: {
          user: attendance.find((row: any) => row.participant_type === "user") ?? null,
          character: attendance.find((row: any) =>
            row.participant_type === "character" &&
            String(row.character_instance_id) === String(plan.character_instance_id)
          ) ?? null,
        },
      };
    });
    conversationActions = actionResult.data ?? [];
    conversationEvents = eventResult.data ?? [];
    const paths = [
      ...messages.flatMap((message: any) =>
        message.together_conversation_attachments ?? []
      ).map((attachment: any) => String(attachment.storage_path ?? "")),
      ...generatedMedia.filter((media: any) => media.status === "ready").map((
        media: any,
      ) => String(media.storage_path ?? "")),
    ].filter(Boolean);
    if (paths.length) {
      const { data: signed } = await db.storage.from("together-user-media")
        .createSignedUrls([...new Set(paths)], 3600);
      const byPath = new Map(
        (signed ?? []).map((item: any) => [String(item.path), item.signedUrl]),
      );
      messages = messages.map((message: any) => ({
        ...message,
        together_conversation_attachments:
          (message.together_conversation_attachments ?? []).map((
            attachment: any,
          ) => ({
            ...attachment,
            signed_url: byPath.get(String(attachment.storage_path)) ?? null,
          })),
      }));
      generatedMedia = generatedMedia.map((media: any) => ({
        ...media,
        signed_url: byPath.get(String(media.storage_path)) ?? null,
      }));
    }
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
  };
}
