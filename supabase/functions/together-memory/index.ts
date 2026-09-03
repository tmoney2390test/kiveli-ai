import { z } from "zod";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { parseBody } from "../_shared/body.ts";
import { json, serve } from "../_shared/http.ts";
import { AppError } from "../_shared/types.ts";
import { track } from "../_shared/together.ts";
import { activeContinuity } from "../_shared/together-continuity.ts";
import { resolveSubscriptionState } from "../_shared/kivelle-subscription.ts";
import {
  canonicalMemoryTextFromUserInput,
  manualMemoryText,
  memorySourceContext,
  resolveMemoryProductAccess,
} from "../_shared/kivelle-memory-access.ts";

type Row = Record<string, any>;
type MemoryCursor = {
  pinned: boolean;
  retrievalCount: number;
  updatedAt: string;
  id: string;
};

const editableMemoryType = z.enum([
  "semantic",
  "preference",
  "episodic",
  "relationship",
  "emotional",
]);
const memoryCategory = z.enum([
  "all",
  "about",
  "preference",
  "shared",
  "relationship",
  "upcoming",
]);
const memorySort = z.enum(["pinned", "newest", "oldest", "recalled"]);
const categoryPreferences = z.object({
  semantic: z.boolean().optional(),
  preference: z.boolean().optional(),
  episodic: z.boolean().optional(),
  relationship: z.boolean().optional(),
  emotional: z.boolean().optional(),
  open_thread: z.boolean().optional(),
}).strict();
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("overview"),
    characterInstanceId: z.string().uuid(),
    privacyMode: z.boolean().default(false),
    query: z.string().trim().max(120).default(""),
    category: memoryCategory.default("all"),
    sort: memorySort.default("pinned"),
    cursor: z.string().max(400).optional(),
    limit: z.number().int().min(10).max(100).default(30),
    includeSummary: z.boolean().default(true),
  }),
  z.object({ action: z.literal("history"), memoryId: z.string().uuid() }),
  z.object({
    action: z.literal("create"),
    characterInstanceId: z.string().uuid(),
    memoryType: editableMemoryType,
    text: z.string().trim().min(1).max(2000),
    pinned: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("edit"),
    memoryId: z.string().uuid(),
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("restore"),
    memoryId: z.string().uuid(),
    revisionId: z.string().uuid(),
  }),
  z.object({ action: z.literal("forget"), memoryId: z.string().uuid() }),
  z.object({
    action: z.literal("pin"),
    memoryId: z.string().uuid(),
    pinned: z.boolean(),
  }),
  z.object({
    action: z.literal("bulk"),
    memoryIds: z.array(z.string().uuid()).min(1).max(100),
    operation: z.enum(["pin", "unpin", "forget"]),
  }),
  z.object({
    action: z.literal("preferences"),
    categories: categoryPreferences,
  }),
  z.object({
    action: z.literal("forget_all"),
    characterInstanceId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("remember_message"),
    messageId: z.string().uuid(),
    characterInstanceId: z.string().uuid(),
  }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, "together_memory", 180, 3600);
  const input = await parseBody(request, schema),
    continuity = await activeContinuity(db, user.id);

  if (input.action === "overview") {
    const [companion, subscription] = await Promise.all([
      loadCompanion(
        db,
        user.id,
        continuity.id,
        input.characterInstanceId,
      ),
      resolveSubscriptionState(db, user.id),
    ]),
      access = resolveMemoryProductAccess(
        subscription.tier,
        subscription.entitlementKeys,
      );
    // Aggregate totals are stable across cursor pages. Avoid repeating that
    // database work while the user scrolls through a large memory journal.
    const countsPromise = input.cursor || !input.includeSummary
      ? Promise.resolve({ count: 0, categories: {} as Record<string, number> })
      : loadCounts(db, user.id, continuity.id, companion.id);
    if (!input.privacyMode && !access.inspector) {
      const counts = await countsPromise;
      return json(
        {
          data: {
            access,
            tier: subscription.tier,
            ...counts,
            memories: [],
            insights: null,
            pageInfo: { hasMore: false, nextCursor: null },
          },
          correlationId,
        },
        200,
        correlationId,
      );
    }
    const cursor = decodeCursor(input.cursor);
    const [counts, { data, error }, insights] = await Promise.all([
      countsPromise,
      db.rpc("kivelle_memory_center_page_v2", {
        p_user_id: user.id,
        p_continuity_id: continuity.id,
        p_character_instance_id: companion.id,
        p_query: input.query || null,
        p_types: typesForCategory(input.category),
        p_sort: input.sort,
        p_cursor_pinned: cursor?.pinned ?? null,
        p_cursor_retrieval_count: cursor?.retrievalCount ?? null,
        p_cursor_updated_at: cursor?.updatedAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: input.limit + 1,
      }),
      !input.cursor && input.includeSummary && access.maxInsights &&
          !input.privacyMode
        ? loadMaxInsights(db, user.id, continuity.id, companion.id)
        : Promise.resolve(null),
    ]);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Memories could not be loaded.",
        500,
        true,
      );
    }
    const rawPageRows=(data??[]) as Row[];
    const safeIds=rawPageRows.map((row)=>String(row.id));
    const safePolicyResult=safeIds.length?await db.from('together_memories').select('id').eq('user_id',user.id).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).in('id',safeIds):{data:[],error:null};
    if(safePolicyResult.error)throw new AppError('INTERNAL_ERROR','Memories could not be loaded.',500,true);
    const visibleIds=new Set((safePolicyResult.data??[]).map((row)=>String(row.id)));
    const pageRows = rawPageRows.filter((row)=>visibleIds.has(String(row.id))),
      hasMore = pageRows.length > input.limit,
      rows = pageRows.slice(0, input.limit),
      last = rows.at(-1);
    return json(
      {
        data: {
          access,
          tier: subscription.tier,
          ...counts,
          memories: rows.map((row) => safeMemory(row, input.privacyMode)),
          insights,
          pageInfo: {
            hasMore,
            nextCursor: hasMore && last ? encodeCursor(last) : null,
          },
        },
        correlationId,
      },
      200,
      correlationId,
    );
  }

  if (input.action === "preferences") {
    const { error } = await db.from("together_profiles").update({
      memory_categories: input.categories,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Could not update memory preferences.",
        500,
        true,
      );
    }
    return json(
      { data: { categories: input.categories }, correlationId },
      200,
      correlationId,
    );
  }

  if (input.action === "forget_all") {
    const companion = input.characterInstanceId
      ? await loadCompanion(
        db,
        user.id,
        continuity.id,
        input.characterInstanceId,
      )
      : null;
    const { data, error } = await db.rpc("kivelle_forget_memory_scope", {
      p_user_id: user.id,
      p_continuity_id: continuity.id,
      p_character_instance_id: companion?.id ?? null,
    });
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Remembered information could not be erased.",
        500,
        true,
      );
    }
    await track(db, user.id, "memory_deleted", {
      scope: companion ? "companion" : "life",
      characterInstanceId: companion?.id ?? null,
    });
    return json({ data, correlationId }, 200, correlationId);
  }

  const subscription = await resolveSubscriptionState(db, user.id),
    access = resolveMemoryProductAccess(
      subscription.tier,
      subscription.entitlementKeys,
    );
  const manualActions = [
    "create",
    "edit",
    "restore",
    "pin",
    "remember_message",
  ];
  if (
    (manualActions.includes(input.action) ||
      (input.action === "bulk" && input.operation !== "forget")) &&
    !access.manualControl
  ) {
    throw new AppError(
      "PLAN_LIMIT_REACHED",
      "Memory curation is available with Kivelle+.",
      403,
    );
  }
  if (input.action === "history" && !access.inspector) {
    throw new AppError(
      "PLAN_LIMIT_REACHED",
      "Memory history is available with Kivelle+.",
      403,
    );
  }

  if (input.action === "create") {
    const companion = await loadCompanion(
        db,
        user.id,
        continuity.id,
        input.characterInstanceId,
      ),
      canonicalText = canonicalMemoryTextFromUserInput(input.text),
      now = new Date().toISOString(),
      key = crypto.randomUUID();
    const { data, error } = await db.from("together_memories").insert({
      user_id: user.id,
      continuity_id: continuity.id,
      character_instance_id: companion.id,
      memory_type: input.memoryType,
      canonical_text: canonicalText,
      dedupe_key: `manual-ui:${key}`,
      subject_key: `manual-ui:${key}`,
      importance: .9,
      confidence: 1,
      pinned: input.pinned,
      status: "active",
      source_type: "manual",
      learned_via: "direct_user",
      shareability: "private",
      valid_from: now,
      metadata: { manual: true, createdInMemoryCenter: true },
      content_rating:'safe',
      visibility_scope:'all',
      moderation_version:'manual-memory-v1',
      updated_at: now,
    }).select("*").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "That memory could not be saved.",
        500,
        true,
      );
    }
    await track(db, user.id, "memory_created", {
      memoryId: data.id,
      type: data.memory_type,
      source: "memory_center",
    });
    return json(
      { data: safeMemory(data, false), correlationId },
      200,
      correlationId,
    );
  }

  if (input.action === "remember_message") {
    const companion = await loadCompanion(
      db,
      user.id,
      continuity.id,
      input.characterInstanceId,
    );
    const { data: message, error: messageError } = await db.from(
      "together_messages",
    ).select(
      "id,conversation_id,role,content,character_instance_id,speaker_character_instance_id,created_at,content_rating,visibility_scope",
    ).eq("id", input.messageId).eq("user_id", user.id).maybeSingle();
    if (
      messageError || !message ||
      !["user", "assistant"].includes(String(message.role)) ||
      !String(message.content ?? "").trim()||message.visibility_scope!=='all'||!['safe','suggestive'].includes(String(message.content_rating))
    ) throw new AppError("NOT_FOUND", "That message is unavailable.", 404);
    const { data: conversation, error: conversationError } = await db.from(
      "together_conversations",
    ).select("id,kind,continuity_id,character_instance_id").eq(
      "id",
      message.conversation_id,
    ).eq("user_id", user.id).eq("continuity_id", continuity.id).maybeSingle();
    if (conversationError || !conversation) {
      throw new AppError("NOT_FOUND", "That conversation is unavailable.", 404);
    }
    if (conversation.kind === "group") {
      const { data: participant } = await db.from(
        "together_conversation_participants",
      ).select("id").eq("conversation_id", conversation.id).eq(
        "character_instance_id",
        companion.id,
      ).is("left_at", null).maybeSingle();
      if (!participant) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Choose a companion in this conversation.",
          400,
        );
      }
    } else if (String(conversation.character_instance_id) !== companion.id) {
      throw new AppError(
        "VALIDATION_ERROR",
        "That message belongs to another relationship.",
        400,
      );
    }
    if (
      message.role === "assistant" &&
      String(
          message.speaker_character_instance_id ??
            message.character_instance_id ?? "",
        ) !== companion.id
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "That message belongs to another companion.",
        400,
      );
    }
    const authored = manualMemoryText({
        role: String(message.role),
        content: String(message.content),
        characterName: companion.name,
      }),
      now = new Date().toISOString();
    const { data, error } = await db.from("together_memories").upsert({
      user_id: user.id,
      continuity_id: continuity.id,
      character_instance_id: companion.id,
      memory_type: authored.memoryType,
      canonical_text: authored.canonicalText,
      dedupe_key: `manual-message:${message.id}`,
      subject_key: `manual-message:${message.id}`,
      importance: .9,
      confidence: 1,
      pinned: true,
      status: "active",
      source_message_id: message.id,
      source_type: "manual",
      source_id: message.id,
      learned_via: message.role === "user" ? "direct_user" : "system_event",
      shareability: "private",
      valid_from: message.created_at ?? now,
      metadata: { manual: true, originalRole: message.role },
      updated_at: now,
    }, { onConflict: "character_instance_id,dedupe_key" }).select("*").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "That message could not be remembered.",
        500,
        true,
      );
    }
    await track(db, user.id, "memory_created", {
      memoryId: data.id,
      type: data.memory_type,
      source: "manual_message",
    });
    return json(
      {
        data: safeMemory(
          { ...data, source_conversation_id: conversation.id },
          false,
        ),
        correlationId,
      },
      200,
      correlationId,
    );
  }

  if (input.action === "bulk") {
    const ids = [...new Set(input.memoryIds)];
    const { data: rows, error: checkError } = await db.from("together_memories")
      .select("id").eq("user_id", user.id).eq("continuity_id", continuity.id)
      .eq("status", "active").eq('visibility_scope','all').in('content_rating',['safe','suggestive']).in("id", ids);
    if (checkError || rows?.length !== ids.length) {
      throw new AppError(
        "NOT_FOUND",
        "One or more memories are no longer available.",
        404,
      );
    }
    const now = new Date().toISOString(),
      patch = input.operation === "forget"
        ? {
          status: "forgotten",
          embedding: null,
          pinned: false,
          valid_to: now,
          updated_at: now,
        }
        : { pinned: input.operation === "pin", updated_at: now };
    const { error } = await db.from("together_memories").update(patch).eq(
      "user_id",
      user.id,
    ).eq("continuity_id", continuity.id).in("id", ids);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Those memories could not be updated.",
        500,
        true,
      );
    }
    await track(
      db,
      user.id,
      input.operation === "forget" ? "memory_deleted" : "memory_edited",
      { count: ids.length, action: `bulk_${input.operation}` },
    );
    return json({ data: { updated: ids }, correlationId }, 200, correlationId);
  }

  if (input.action === "history") {
    const current = await loadOwnedMemory(
        db,
        user.id,
        continuity.id,
        input.memoryId,
      ),
      revisions: Row[] = [current];
    let predecessor = String(current.supersedes_memory_id ?? "");
    while (predecessor && revisions.length < 20) {
      const { data, error } = await db.from("together_memories").select("*").eq(
        "id",
        predecessor,
      ).eq("user_id", user.id).eq("continuity_id", continuity.id).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).maybeSingle();
      if (error || !data) break;
      revisions.push(data);
      predecessor = String(data.supersedes_memory_id ?? "");
    }
    const locationIds = [
        ...new Set(revisions.map(memoryLocationId).filter(Boolean)),
      ],
      locations = locationIds.length
        ? await db.from("together_locations").select("id,name,slug").in(
          "id",
          locationIds,
        )
        : { data: [], error: null };
    const locationMap = new Map(
      (locations.data ?? []).map((item: Row) => [String(item.id), item]),
    );
    return json(
      {
        data: {
          revisions: revisions.map((row) =>
            safeMemory({
              ...row,
              ...locationFields(locationMap.get(memoryLocationId(row))),
            }, false)
          ),
        },
        correlationId,
      },
      200,
      correlationId,
    );
  }

  if (input.action === "restore") {
    const current = await loadOwnedMemory(
        db,
        user.id,
        continuity.id,
        input.memoryId,
        "active",
      ),
      revision = await loadOwnedMemory(
        db,
        user.id,
        continuity.id,
        input.revisionId,
      );
    if (
      String(current.character_instance_id) !==
        String(revision.character_instance_id) ||
      String(current.subject_key) !== String(revision.subject_key)
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "That revision belongs to a different memory.",
        400,
      );
    }
    return await replaceMemory(
      db,
      user.id,
      continuity.id,
      current.id,
      String(revision.canonical_text),
      correlationId,
      "restore",
    );
  }

  const existing = await loadOwnedMemory(
    db,
    user.id,
    continuity.id,
    input.memoryId,
    "active",
  );
  if (input.action === "edit") {
    return await replaceMemory(
      db,
      user.id,
      continuity.id,
      existing.id,
      canonicalMemoryTextFromUserInput(input.text),
      correlationId,
      "edit",
    );
  }
  const now = new Date().toISOString(),
    patch = input.action === "forget"
      ? {
        status: "forgotten",
        embedding: null,
        pinned: false,
        valid_to: now,
        updated_at: now,
      }
      : { pinned: input.pinned, updated_at: now };
  const { data, error } = await db.from("together_memories").update(patch).eq(
    "id",
    input.memoryId,
  ).eq("user_id", user.id).eq("continuity_id", continuity.id).select("*")
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Could not update that memory.",
      500,
      true,
    );
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "That memory no longer exists.", 404);
  }
  await track(
    db,
    user.id,
    input.action === "forget" ? "memory_deleted" : "memory_edited",
    { memoryId: input.memoryId, action: input.action },
  );
  return json(
    { data: safeMemory(data, false), correlationId },
    200,
    correlationId,
  );
});

async function loadCounts(
  db: any,
  userId: string,
  continuityId: string,
  characterInstanceId: string,
) {
  const { data, error } = await db.from('together_memories').select('memory_type').eq('user_id',userId).eq('continuity_id',continuityId).eq('character_instance_id',characterInstanceId).eq('status','active').eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Memory totals could not be loaded.",
      500,
      true,
    );
  }
  return {
    count: data?.length??0,
    categories: Object.fromEntries(['semantic','emotional','preference','episodic','relationship','open_thread'].map((kind)=>[kind,(data??[]).filter((row:Record<string,unknown>)=>row.memory_type===kind).length])),
  };
}
async function loadCompanion(
  db: any,
  userId: string,
  continuityId: string,
  characterInstanceId: string,
): Promise<{ id: string; name: string }> {
  const { data, error } = await db.from("together_character_instances").select(
    "id,together_character_templates(name)",
  ).eq("id", characterInstanceId).eq("user_id", userId).eq(
    "continuity_id",
    continuityId,
  ).maybeSingle();
  const template = Array.isArray(data?.together_character_templates)
    ? data.together_character_templates[0]
    : data?.together_character_templates;
  if (error || !data) {
    throw new AppError("NOT_FOUND", "That companion is unavailable.", 404);
  }
  return {
    id: String(data.id),
    name: String(template?.name ?? "Your companion"),
  };
}
async function loadOwnedMemory(
  db: any,
  userId: string,
  continuityId: string,
  memoryId: string,
  status?: string,
): Promise<Row> {
  let query = db.from("together_memories").select("*").eq("id", memoryId).eq(
    "user_id",
    userId,
  ).eq("continuity_id", continuityId).eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "That memory could not be checked.",
      500,
      true,
    );
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "That memory no longer exists.", 404);
  }
  return data;
}
async function replaceMemory(
  db: any,
  userId: string,
  continuityId: string,
  memoryId: string,
  canonicalText: string,
  correlationId: string,
  reason: "edit" | "restore",
) {
  const { data, error } = await db.rpc("kivelle_edit_memory_v2", {
    p_user_id: userId,
    p_continuity_id: continuityId,
    p_memory_id: memoryId,
    p_canonical_text: canonicalText,
  });
  if (error || !data) {
    throw new AppError(
      "INTERNAL_ERROR",
      "That correction could not be saved.",
      500,
      true,
    );
  }
  await track(db, userId, "memory_edited", {
    memoryId: String(data.id),
    action: reason,
    replacesMemoryId: memoryId,
  });
  return json(
    { data: safeMemory(data, false), correlationId },
    200,
    correlationId,
  );
}

function safeMemory(row: Row, privacyMode: boolean) {
  const base = {
    id: String(row.id),
    character_instance_id: String(row.character_instance_id),
    memory_type: String(row.memory_type),
    canonical_text: String(row.canonical_text),
    pinned: Boolean(row.pinned),
    status: String(row.status ?? "active"),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
  if (privacyMode) return base;
  const locationName = String(row.location_name ?? "") || undefined,
    locationSlug = String(row.location_slug ?? "") || undefined,
    sourceMessageId = row.source_message_id
      ? String(row.source_message_id)
      : null,
    sourceConversationId = row.source_conversation_id
      ? String(row.source_conversation_id)
      : null,
    sourceType = row.source_type ? String(row.source_type) : null,
    sourceId = row.source_id ? String(row.source_id) : null;
  return {
    ...base,
    importance: Number(row.importance ?? 0),
    confidence: Number(row.confidence ?? 0),
    source_type: sourceType,
    source_id: sourceId,
    source_message_id: sourceMessageId,
    sourceConversationId,
    learned_via: row.learned_via ? String(row.learned_via) : null,
    location_id: row.location_id ? String(row.location_id) : null,
    locationName,
    locationSlug,
    last_retrieved_at: row.last_retrieved_at
      ? String(row.last_retrieved_at)
      : null,
    last_mentioned_at: row.last_mentioned_at
      ? String(row.last_mentioned_at)
      : null,
    retrieval_count: Number(row.retrieval_count ?? 0),
    mention_count: Number(row.mention_count ?? 0),
    reinforcement_count: Number(row.reinforcement_count ?? 0),
    sourceContext: memorySourceContext(row, locationName),
    sourceHref: sourceHref({
      sourceType,
      sourceId,
      sourceMessageId,
      sourceConversationId,
      locationSlug,
    }),
    knowledgeKind: row.learned_via === "inferred_pattern"
      ? "inferred"
      : "direct",
    corrected: Boolean(row.supersedes_memory_id),
    supersedes_memory_id: row.supersedes_memory_id
      ? String(row.supersedes_memory_id)
      : null,
    expectedAt:
      String(row.metadata?.expectedAt ?? row.metadata?.expected_at ?? "") ||
      null,
  };
}
function sourceHref(
  input: {
    sourceType: string | null;
    sourceId: string | null;
    sourceMessageId: string | null;
    sourceConversationId: string | null;
    locationSlug?: string;
  },
) {
  if (input.sourceConversationId && input.sourceMessageId) {
    return `/conversation/${input.sourceConversationId}?messageId=${input.sourceMessageId}`;
  }
  if (input.sourceType === "moment" && input.sourceId) {
    return `/moment/${input.sourceId}`;
  }
  if (input.sourceType === "date" && input.sourceId) {
    return `/date/${input.sourceId}`;
  }
  if (input.sourceType === "plan" && input.sourceId) {
    return `/plan/${input.sourceId}`;
  }
  if (input.locationSlug) return `/location/${input.locationSlug}`;
  return null;
}
function typesForCategory(
  category: z.infer<typeof memoryCategory>,
): string[] | null {
  if (category === "about") return ["semantic", "emotional"];
  if (category === "preference") return ["preference"];
  if (category === "shared") return ["episodic"];
  if (category === "relationship") return ["relationship"];
  if (category === "upcoming") return ["open_thread"];
  return null;
}
function encodeCursor(row: Row) {
  const value: MemoryCursor = {
    pinned: Boolean(row.pinned),
    retrievalCount: Number(row.retrieval_count ?? 0),
    updatedAt: String(row.updated_at),
    id: String(row.id),
  };
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decodeCursor(value: string | undefined): MemoryCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      atob(
        value.replaceAll("-", "+").replaceAll("_", "/") +
          "=".repeat((4 - value.length % 4) % 4),
      ),
    );
    return memoryCursorSchema.parse(decoded);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "That memory page cursor is invalid.",
      400,
    );
  }
}
const memoryCursorSchema = z.object({
  pinned: z.boolean(),
  retrievalCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  id: z.string().uuid(),
});
function memoryLocationId(row: Row) {
  return String(
    row.location_id ?? row.metadata?.locationId ?? row.metadata?.location_id ??
      "",
  );
}
function locationFields(row: Row | undefined) {
  return row
    ? { location_name: String(row.name), location_slug: String(row.slug) }
    : {};
}

async function loadMaxInsights(
  db: any,
  userId: string,
  continuityId: string,
  characterInstanceId: string,
) {
  const [recalled] = await Promise.all([
    db.from("together_memories").select("canonical_text,retrieval_count").eq(
      "user_id",
      userId,
    ).eq("continuity_id", continuityId).eq(
      "character_instance_id",
      characterInstanceId,
    ).eq("status", "active").eq('visibility_scope','all').in('content_rating',['safe','suggestive']).gt("retrieval_count", 0).order("retrieval_count", {
      ascending: false,
    }).limit(5),
  ]);
  if (recalled.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Deeper memory insights could not be loaded.",
      500,
      true,
    );
  }
  return {
    relationshipSummary: "",
    sharedReferences: [],
    learnedPatterns: [],
    recalledReferences: (recalled.data ?? []).map((memory: Row) =>
      String(memory.canonical_text)
    ),
  };
}
