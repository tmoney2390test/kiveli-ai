import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyConversationEngagement,
  applyInteractionProposal,
  detectFlirtSignal,
  evolveCharacterUserView,
  isDurableUserMemory,
  normalizeChatLanguage,
  normalizeRealtimeTranscriptEvents,
  type RealtimeTranscriptEvent,
  type RelationshipState,
  scoreConversationEngagement,
  type SpiceLevel,
  updateChemistry,
} from "../../../packages/together-domain/src/index.ts";
import {
  ConfiguredConversationAnalysisProvider,
  ConfiguredEmbeddingProvider,
  type DialogueContext,
} from "./together-ai.ts";
import {
  deriveEmotionalResidue,
  upsertEmotionalResidue,
} from "./kivelle-emotional-residue.ts";
import { markMentionedMemories } from "./kivelle-memory.ts";
import {
  mergeConversationSummary,
  relationshipMetrics,
  track,
} from "./together.ts";
import { writeConversationEvent } from "./together-plans.ts";

export type IncomingVoiceTranscriptEvent = {
  sequence: number;
  providerEventId?: string;
  role: "user" | "assistant";
  content: string;
  occurredAt?: string;
  final: boolean;
};

const analysis = new ConfiguredConversationAnalysisProvider();
const embeddings = new ConfiguredEmbeddingProvider();

export function voiceCallNeedsTranscriptFinalization(input: {
  isFailure: boolean;
  incomingEventCount: number;
  transcriptStatus: unknown;
}): boolean {
  return !input.isFailure || input.incomingEventCount > 0 ||
    ["receiving", "failed", "finalizing"].includes(
      String(input.transcriptStatus ?? "pending"),
    );
}

export async function ingestVoiceTranscriptEvents(input: {
  db: SupabaseClient;
  call: Record<string, unknown>;
  events: IncomingVoiceTranscriptEvent[];
}): Promise<{ accepted: number; ignored: number }> {
  const rows = input.events.flatMap((event) => {
    const providerEvent: RealtimeTranscriptEvent = {
      speaker: event.role === "assistant" ? "character" : "user",
      text: event.content,
      providerEventId: event.providerEventId,
      occurredAt: event.occurredAt,
      final: event.final,
    };
    const [normalized] = normalizeRealtimeTranscriptEvents(
      [providerEvent],
      new Date().toISOString(),
    );
    if (!normalized) return [];
    return [{
      call_session_id: String(input.call.id),
      user_id: String(input.call.user_id),
      sequence: Math.max(1, Math.floor(event.sequence)),
      speaker: normalized.role === "assistant" ? "character" : "user",
      content: normalized.content,
      occurred_at: clampOccurredAt(
        normalized.occurredAt,
        input.call.created_at,
      ),
      provider_event_id: normalized.providerEventId ?? null,
      final: true,
    }];
  });
  let accepted = 0;
  for (const row of rows) {
    const { error } = await input.db.from(
      "together_voice_call_transcript_events",
    ).insert(row);
    if (!error) accepted += 1;
    else if (String((error as { code?: string }).code ?? "") !== "23505") {
      throw error;
    }
  }
  if (accepted > 0) {
    await input.db.from("together_voice_call_sessions").update({
      transcript_status: "receiving",
      updated_at: new Date().toISOString(),
    }).eq("id", input.call.id).eq("user_id", input.call.user_id).neq(
      "transcript_status",
      "finalized",
    );
  }
  return { accepted, ignored: input.events.length - accepted };
}

export async function finalizeVoiceCallTranscript(input: {
  db: SupabaseClient;
  call: Record<string, unknown>;
  context: DialogueContext;
  correlationId: string;
}): Promise<{ messageCount: number; reconciled: boolean }> {
  const { data: claimed } = await input.db.from("together_voice_call_sessions")
    .update({
      transcript_status: "finalizing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.call.id).eq("user_id", input.call.user_id)
    .in("transcript_status", ["pending", "receiving", "failed"]).select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: current } = await input.db.from(
      "together_voice_call_sessions",
    ).select("transcript_status").eq("id", input.call.id).maybeSingle();
    return {
      messageCount: 0,
      reconciled: current?.transcript_status === "finalized",
    };
  }

  try {
    const { data: events, error } = await input.db.from(
      "together_voice_call_transcript_events",
    ).select("*")
      .eq("call_session_id", input.call.id).eq("user_id", input.call.user_id)
      .eq("final", true)
      .order("occurred_at", { ascending: true }).order("sequence", {
        ascending: true,
      });
    if (error) throw error;
    const inserted: Array<Record<string, unknown>> = [];
    for (const event of events ?? []) {
      if (event.canonical_message_id) continue;
      const role = event.speaker === "character" ? "assistant" : "user";
      const metadata = {
        source: "voice_call",
        callSessionId: String(input.call.id),
        providerEventId: event.provider_event_id ?? null,
        voiceSequence: event.sequence,
        provider: String(input.call.provider ?? "unknown"),
        model: String(input.call.model ?? "unknown"),
        callDurationMs: Math.max(
          0,
          Number(input.call.connected_duration_ms ?? 0),
        ),
        chatLanguage: normalizeChatLanguage(record(input.call.metadata)['chatLanguage']),
      };
      const row: Record<string, unknown> = {
        conversation_id: input.call.conversation_id,
        user_id: input.call.user_id,
        character_instance_id: input.call.character_instance_id,
        role,
        content: event.content,
        delivery_status: "complete",
        provider_metadata: metadata,
        created_at: event.occurred_at,
      };
      if (role === "assistant") {
        row.speaker_character_instance_id = input.call.character_instance_id;
      } else {row.client_request_id =
          `voice-call:${input.call.id}:${event.sequence}`;}
      const { data: message, error: messageError } = await input.db.from(
        "together_messages",
      ).insert(row).select("*").single();
      if (messageError) {
        if (
          String((messageError as { code?: string }).code ?? "") === "23505"
        ) {
          const existingQuery = input.db.from("together_messages").select("*")
            .eq("conversation_id", input.call.conversation_id);
          const { data: existing } = role === "user"
            ? await existingQuery.eq("client_request_id", row.client_request_id)
              .maybeSingle()
            : await existingQuery.eq(
              "provider_metadata->>callSessionId",
              String(input.call.id),
            ).eq("provider_metadata->>voiceSequence", String(event.sequence))
              .maybeSingle();
          if (existing) {
            await input.db.from("together_voice_call_transcript_events").update(
              { canonical_message_id: existing.id },
            ).eq("id", event.id);
            inserted.push(existing);
            continue;
          }
        }
        throw messageError;
      }
      await input.db.from("together_voice_call_transcript_events").update({
        canonical_message_id: message.id,
      }).eq("id", event.id);
      inserted.push(message);
    }

    const allMessages = [...(events ?? [])];
    const userText = allMessages.filter((event) => event.speaker === "user")
      .map((event) => String(event.content)).join("\n").slice(0, 12_000);
    const assistantText = allMessages.filter((event) =>
      event.speaker === "character"
    ).map((event) => String(event.content)).join("\n").slice(0, 12_000);
    let reconciled = false;
    if (userText && assistantText) {
      const sourceMessageId = String(
        (inserted.find((message) => message.role === "user") ?? {}).id ?? "",
      );
      const assistantMessageId = String(
        ([...inserted].reverse().find((message) =>
          message.role === "assistant"
        ) ?? {}).id ?? "",
      );
      if (sourceMessageId && assistantMessageId) {
        await reconcileVoiceCallContinuity({
          db: input.db,
          call: input.call,
          context: input.context,
          userText,
          assistantText,
          sourceMessageId,
          assistantMessageId,
          correlationId: input.correlationId,
        });
        reconciled = true;
      }
    }
    const finalizedAt = new Date().toISOString();
    await input.db.from("together_voice_call_sessions").update({
      transcript_status: "finalized",
      transcript_finalized_at: finalizedAt,
      summary: `Voice call · ${allMessages.length} turns`,
      updated_at: finalizedAt,
    }).eq("id", input.call.id).eq("user_id", input.call.user_id);
    const { error: eventError } = await input.db.from(
      "together_conversation_events",
    ).insert({
      user_id: input.call.user_id,
      continuity_id: input.call.continuity_id,
      character_instance_id: input.call.character_instance_id,
      conversation_id: input.call.conversation_id,
      event_type: "voice_call",
      entity_type: "voice_call_session",
      entity_id: input.call.id,
      metadata: {
        durationMs: Math.max(0, Number(input.call.connected_duration_ms ?? 0)),
        turnCount: allMessages.length,
        transcriptStatus: "finalized",
      },
      created_at: input.call.connected_at ?? input.call.created_at ??
        finalizedAt,
    });
    if (
      eventError &&
      String((eventError as { code?: string }).code ?? "") !== "23505"
    ) throw eventError;
    const latest = allMessages.at(-1)?.occurred_at ?? finalizedAt;
    await input.db.from("together_conversations").update({
      last_message_at: latest,
      last_assistant_message_at: [...allMessages].reverse().find((event) =>
        event.speaker === "character"
      )?.occurred_at ?? null,
      updated_at: finalizedAt,
    }).eq("id", input.call.conversation_id).eq("user_id", input.call.user_id);
    await track(
      input.db,
      String(input.call.user_id),
      "voice_call_transcript_finalized",
      {
        callSessionId: input.call.id,
        characterInstanceId: input.call.character_instance_id,
        turnCount: allMessages.length,
        messageCount: inserted.length,
      },
    );
    if (reconciled) {
      await track(
        input.db,
        String(input.call.user_id),
        "voice_call_reconciliation_completed",
        {
          callSessionId: input.call.id,
          characterInstanceId: input.call.character_instance_id,
          turnCount: allMessages.length,
        },
      );
    }
    return { messageCount: inserted.length, reconciled };
  } catch (error) {
    await input.db.from("together_voice_call_sessions").update({
      transcript_status: "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", input.call.id).eq("user_id", input.call.user_id);
    throw error;
  }
}

async function reconcileVoiceCallContinuity(
  input: {
    db: SupabaseClient;
    call: Record<string, unknown>;
    context: DialogueContext;
    userText: string;
    assistantText: string;
    sourceMessageId: string;
    assistantMessageId: string;
    correlationId: string;
  },
) {
  const userId = String(input.call.user_id),
    instanceId = String(input.call.character_instance_id),
    conversationId = String(input.call.conversation_id);
  const [
    { data: profile },
    { data: threads },
    { data: relationship },
    { data: instance },
    { data: conversation },
    { data: reflection },
  ] = await Promise.all([
    input.db.from("together_profiles").select(
      "memory_categories,content_preferences",
    ).eq("user_id", userId).maybeSingle(),
    input.db.from("together_open_threads").select("*").eq("user_id", userId).eq(
      "character_instance_id",
      instanceId,
    ).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).is("resolved_at", null).limit(20),
    input.db.from("together_relationship_states").select("*").eq(
      "user_id",
      userId,
    ).eq("character_instance_id", instanceId).maybeSingle(),
    input.db.from("together_character_instances").select(
      "relationship_stage,continuity_id,together_character_templates(spice_level),together_character_versions(personality_config)",
    ).eq("id", instanceId).eq("user_id", userId).maybeSingle(),
    input.db.from("together_conversations").select(
      "safe_context,summary_through,summary_message_count,metadata",
    ).eq("id", conversationId).eq("user_id", userId).maybeSingle(),
    input.db.from("together_relationship_reflections").select(
      "user_view,metadata",
    ).eq("character_instance_id", instanceId).eq("user_id", userId)
      .eq('visibility_scope','all').in('content_rating',['safe','suggestive'])
      .maybeSingle(),
  ]);
  if (!relationship || !instance) return;
  const proposal = await analysis.analyze({
    userMessage: input.userText,
    assistantMessage: input.assistantText,
    existingThreads: threads ?? [],
    context: input.context,
    usageScope: {
      db: input.db,
      userId,
      continuityId: instance.continuity_id,
      conversationId,
      characterInstanceId: instanceId,
      subscriptionTier: input.context.subscription?.tier,
      contentMode: input.context.contentMode,
      correlationId: input.correlationId,
    },
  });
  const now = new Date(),
    enabled = (profile?.memory_categories ?? {}) as Record<string, boolean>;
  const engagement = scoreConversationEngagement({
    message: input.userText,
    memoryWorthy: proposal.memoryCandidates.length > 0 ||
      proposal.newThreads.length > 0,
    repair: Number(proposal.relationshipChanges.conflict ?? 0) < 0,
  });
  const romanceEnabled =
    (profile?.content_preferences as Record<string, unknown> | undefined)
      ?.romanceEnabled !== false;
  const current = toDomainRelationship(
    relationship,
    String(instance.relationship_stage ?? "stranger"),
    romanceEnabled,
  );
  const romanticSignal = detectFlirtSignal(input.userText).strength >= .35 ||
    detectFlirtSignal(input.assistantText).strength >= .35;
  const proposed = applyInteractionProposal(
    current,
    proposal.relationshipChanges,
    engagement.quality,
    { recentLowSignalTurns: 0, romanceEnabled, romanticSignal },
  );
  const engaged = applyConversationEngagement(proposed, engagement);
  const template = firstRecord(instance.together_character_templates),
    version = firstRecord(instance.together_character_versions);
  const prefs = record(conversation?.metadata?.chatPreferences),
    spice = normalizeSpice(
      input.context.subscription?.tier !== "free"
        ? prefs.spiceLevel ?? template?.spice_level
        : template?.spice_level,
    );
  const chemistry = updateChemistry({
    state: engaged,
    spiceLevel: spice,
    userSignal: detectFlirtSignal(input.userText),
    characterSignal: detectFlirtSignal(input.assistantText),
    personality: record(version?.personality_config),
    contextFit: .65,
    now,
  });
  const nextDomain = {
    ...engaged,
    chemistryHeat: chemistry.chemistryHeat,
    physicalTension: chemistry.physicalTension,
    userFlirtSignals: chemistry.userFlirtSignals,
    characterFlirtSignals: chemistry.characterFlirtSignals,
    mutualFlirtSignals: chemistry.mutualFlirtSignals,
    attractionAcknowledged: chemistry.attractionAcknowledged,
  };
  await input.db.from("together_relationship_states").update({
    ...Object.fromEntries(
      relationshipMetrics.map((metric) => [metric, nextDomain[metric]]),
    ),
    conversation_count: Number(
      relationship.interaction_turn_count ??
        relationship.conversation_count ?? 0,
    ) + 1,
    interaction_turn_count: Number(
      relationship.interaction_turn_count ??
        relationship.conversation_count ?? 0,
    ) + 1,
    meaningful_interaction_count:
      Number(relationship.meaningful_interaction_count ?? 0) +
      (engagement.relationshipSignificant ? 1 : 0),
    engagement_score: nextDomain.engagementScore,
    genuine_back_and_forth_turns: nextDomain.genuineBackAndForthTurns,
    trivial_engagement_score: nextDomain.trivialEngagementScore,
    chemistry_heat: chemistry.chemistryHeat,
    physical_tension: chemistry.physicalTension,
    user_flirt_signals: chemistry.userFlirtSignals,
    character_flirt_signals: chemistry.characterFlirtSignals,
    mutual_flirt_signals: chemistry.mutualFlirtSignals,
    attraction_acknowledged: chemistry.attractionAcknowledged,
    last_chemistry_change_at: chemistry.lastChemistryChangeAt ??
      relationship.last_chemistry_change_at ?? null,
    last_flirt_signal_at: chemistry.lastFlirtSignalAt ??
      relationship.last_flirt_signal_at ?? null,
    last_interaction_quality: engagement.quality,
    updated_at: now.toISOString(),
  }).eq("character_instance_id", instanceId).eq("user_id", userId);

  const userView = evolveCharacterUserView(reflection?.user_view, {
    userMessage: input.userText,
    assistantMessage: input.assistantText,
    memoryCandidates: proposal.memoryCandidates,
    sourceMessageId: input.assistantMessageId,
    now,
  });
  await input.db.from("together_relationship_reflections").upsert({
    character_instance_id: instanceId,
    user_id: userId,
    continuity_id: instance.continuity_id,
    user_view: userView,
    updated_through_message_id: input.assistantMessageId,
    content_rating:'safe',visibility_scope:'all',moderation_version:'safe-voice-v1',
    metadata: {
      ...(reflection?.metadata ?? {}),
      userViewSource: "voice_call_evidence",
      userViewVersion: userView.version,
    },
    updated_at: now.toISOString(),
  }, { onConflict: "character_instance_id" });
  const residue = deriveEmotionalResidue(input.userText, input.assistantText);
  if (residue) {
    await upsertEmotionalResidue({
      db: input.db,
      userId,
      continuityId: String(instance.continuity_id),
      characterInstanceId: instanceId,
      sourceId: input.assistantMessageId,
      residue,
      now,
    });
  }
  if (
    proposal.mentionedMemoryIds.length || proposal.reinforcedMemoryIds.length
  ) {
    await markMentionedMemories({
      db: input.db,
      userId,
      memoryIds: proposal.mentionedMemoryIds,
      reinforcedIds: proposal.reinforcedMemoryIds,
      now,
    });
  }

  for (const candidate of proposal.memoryCandidates) {
    if (
      enabled[candidate.memory_type] === false ||
      !isDurableUserMemory({
        memoryType: candidate.memory_type,
        canonicalText: candidate.canonical_text,
      })
    ) continue;
    const embedding = await embeddings.embed(candidate.canonical_text, {
      db: input.db,
      userId,
      continuityId: instance.continuity_id,
      conversationId,
      characterInstanceId: instanceId,
      subscriptionTier: input.context.subscription?.tier,
      correlationId: input.correlationId,
      purpose: "voice_call_memory_write",
    });
    const { data: existing } = await input.db.from("together_memories").select(
      "*",
    ).eq("user_id", userId).eq("character_instance_id", instanceId).eq(
      "dedupe_key",
      candidate.dedupe_key,
    ).eq("status", "active").maybeSingle();
    if (existing) {
      await input.db.from("together_memories").update({
        importance: Math.max(Number(existing.importance), candidate.importance),
        confidence: Math.min(
          1,
          Math.max(Number(existing.confidence), candidate.confidence) + .02,
        ),
        embedding: embedding ?? existing.embedding,
        source_message_id: input.sourceMessageId,
        source_type: "message",
        source_id: input.sourceMessageId,
        learned_via: "direct_user",
        reinforcement_count: Number(existing.reinforcement_count ?? 0) + 1,
        updated_at: now.toISOString(),
      }).eq("id", existing.id);
    } else {await input.db.from("together_memories").insert({
        user_id: userId,
        character_instance_id: instanceId,
        ...candidate,
        source_message_id: input.sourceMessageId,
        source_type: "message",
        source_id: input.sourceMessageId,
        learned_via: "direct_user",
        shareability: "private",
        valid_from: now.toISOString(),
        embedding,
        status: "active",
      });}
  }
  if (enabled.open_thread !== false) {
    for (const thread of proposal.newThreads) {
      const { data: existing } = await input.db.from("together_open_threads")
        .select("id").eq("user_id", userId).eq(
          "character_instance_id",
          instanceId,
        ).eq("dedupe_key", thread.dedupe_key).is("resolved_at", null)
        .maybeSingle();
      if (!existing) {
        await input.db.from("together_open_threads").insert({
          user_id: userId,
          character_instance_id: instanceId,
          ...thread,
          source_message_id: input.sourceMessageId,
        });
      }
    }
  }
  for (const threadId of proposal.resolvedThreadIds) {
    await input.db.from("together_open_threads").update({
      resolved_at: now.toISOString(),
      follow_up_eligible: false,
      resolution_message_id: input.sourceMessageId,
      updated_at: now.toISOString(),
    }).eq("id", threadId).eq("user_id", userId).eq(
      "character_instance_id",
      instanceId,
    ).is("resolved_at", null);
  }

  for (const candidate of proposal.actionCandidates) {
    const { data: created } = await input.db.from(
      "together_conversation_actions",
    ).insert({
      user_id: userId,
      character_instance_id: instanceId,
      conversation_id: conversationId,
      assistant_message_id: input.assistantMessageId,
      candidate_type: candidate.type,
      status: "pending",
      payload: {
        ...candidate.payload,
      source: "voice_call",
        callSessionId: input.call.id,
      },
      confidence: candidate.confidence,
      expires_at: new Date(now.getTime() + 24 * 3600000).toISOString(),
      updated_at: now.toISOString(),
    }).select("id").maybeSingle();
    if (created) {
      await writeConversationEvent(input.db, {
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
          source: "voice_call",
        },
      });
    }
  }
  const { data: messageRows } = await input.db.from("together_messages").select(
    "id,role,content,created_at",
  ).eq("user_id", userId).eq("conversation_id", conversationId).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).order(
    "created_at",
    { ascending: false },
  ).limit(80);
  const messages = [...(messageRows ?? [])].reverse();
  if (messages.length) {
    const priorSafe=record(conversation?.safe_context),safeSummary=mergeConversationSummary(String(priorSafe.summary??""),messages);
    await input.db.from("together_conversations").update({
      safe_context:{...priorSafe,summary:safeSummary,updatedAt:now.toISOString()},
      summary_through: messages.at(-1)?.created_at,
      summary_message_count: messages.length,
      updated_at: now.toISOString(),
    }).eq("id", conversationId).eq("user_id", userId);
  }
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
    activeMajorConflict: Boolean(state.active_major_conflict),
    romanceEnabled,
    romancePathStatus: String(
      state.romance_path_status ?? "open",
    ) as RelationshipState["romancePathStatus"],
  };
}
function normalizeSpice(value: unknown): SpiceLevel {
  const number = Number(value);
  return number === 1 || number === 3 ? number : 2;
}
function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
function firstRecord(value: unknown): Record<string, unknown> {
  const first = Array.isArray(value) ? value[0] : value;
  return first && typeof first === "object" && !Array.isArray(first)
    ? first as Record<string, unknown>
    : {};
}
function clampOccurredAt(value: string, createdAt: unknown): string {
  const time = new Date(value).getTime(),
    minimum = new Date(String(createdAt ?? Date.now())).getTime() - 60_000,
    maximum = Date.now() + 60_000;
  return new Date(
    Math.max(
      minimum,
      Math.min(maximum, Number.isFinite(time) ? time : Date.now()),
    ),
  ).toISOString();
}
