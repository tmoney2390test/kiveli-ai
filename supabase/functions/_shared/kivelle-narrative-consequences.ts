import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type NarrativeConsequenceCandidate,
  narrativeConsequenceRequestWindow,
  validateNarrativeConsequenceCandidate,
} from "../../../packages/together-domain/src/narrative-consequences.ts";

type Row = Record<string, any>;

export type PersistedNarrativeConsequence = {
  id: string;
  title: string;
  worldId: string;
  status: "active";
  created: boolean;
};

export async function persistNarrativeConsequence(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  conversationId: string;
  sourceUserMessageId: string;
  sourceAssistantMessageId: string;
  userText: string;
  assistantText: string;
  context: Row;
  candidate: NarrativeConsequenceCandidate;
  now?: Date;
}): Promise<PersistedNarrativeConsequence | null> {
  if (Deno.env.get("KIVELLE_HIGH_STAKES_STORY_ACTIONS_ENABLED") === "false") return null;
  const worldId = nullableId(input.context.place?.world?.id);
  if (!worldId) return null;
  const validation = validateNarrativeConsequenceCandidate({
    candidate: input.candidate,
    requestText: narrativeConsequenceRequestWindow({userMessage:input.userText,recent:input.context.recent??[]}),
    assistantText: input.assistantText,
    character: input.context.character ?? {},
    relationship: input.context.relationship ?? {},
    hasWorld: true,
    activeStory: Boolean(input.context.activeStory),
  });
  if (!validation.allowed) return null;

  const simulationKey = `narrative-consequence-v1:${input.sourceAssistantMessageId}`;
  const { data: existing, error: existingError } = await input.db
    .from("together_world_event_instances")
    .select("id,world_id,status,metadata")
    .eq("user_id", input.userId)
    .eq("continuity_id", input.continuityId)
    .eq("simulation_key", simulationKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      id: String(existing.id),
      title: String(existing.metadata?.narrativeTitle ?? input.candidate.title),
      worldId: String(existing.world_id),
      status: "active",
      created: false,
    };
  }

  const template = {
    world_id: worldId,
    slug: "emergent-high-stakes",
    title: "A turning point",
    summary: "A consequential decision is changing this world.",
    event_type: "story_consequence",
    weekdays: [],
    start_minute: 0,
    duration_minutes: 1440,
    probability: 0,
    knowledge_scope: "public",
    significance: 1,
    topic_tags: ["turning-point", "consequence"],
    activity_tags: [],
    participant_selector: {},
    plan_affordances: {},
    weight: 0,
    active: false,
    metadata: { source: "dialogue_consequence_v1", materializeAutomatically: false },
  };
  const { data: templateRow, error: templateError } = await input.db
    .from("together_world_event_templates")
    .upsert(template, { onConflict: "world_id,slug" })
    .select("id")
    .single();
  if (templateError) throw templateError;

  const now = input.now ?? new Date();
  const endsAt = new Date(now.getTime() + input.candidate.durationHours * 3600000);
  const locationId = nullableId(input.context.place?.location?.id ?? input.context.currentScene?.locationId);
  const districtId = nullableId(input.context.place?.district?.id);
  const metadata = {
    source: "dialogue_consequence_v1",
    narrativeTitle: input.candidate.title,
    narrativeEventType: input.candidate.domain,
    narrativeKnowledgeScope: input.candidate.knowledgeScope,
    narrativeSignificance: 1,
    narrativeScope: input.candidate.scope,
    consequences: input.candidate.consequences,
    authorityBasis: input.candidate.authorityBasis,
    persuasionBasis: input.candidate.persuasionBasis,
    sourceConversationId: input.conversationId,
    sourceUserMessageId: input.sourceUserMessageId,
    sourceAssistantMessageId: input.sourceAssistantMessageId,
    sourceCharacterInstanceId: input.characterInstanceId,
    gateReasonCodes: validation.reasonCodes,
  };
  const { data: event, error: eventError } = await input.db
    .from("together_world_event_instances")
    .insert({
      user_id: input.userId,
      continuity_id: input.continuityId,
      template_id: templateRow.id,
      world_id: worldId,
      location_id: locationId,
      district_location_id: districtId,
      local_date: String(input.context.clock?.localDate ?? now.toISOString().slice(0, 10)),
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "active",
      public_summary: input.candidate.summary,
      simulation_key: simulationKey,
      metadata,
    })
    .select("id")
    .single();
  if (eventError) {
    if (eventError.code === "23505") {
      const { data: raced, error: racedError } = await input.db
        .from("together_world_event_instances")
        .select("id")
        .eq("continuity_id", input.continuityId)
        .eq("simulation_key", simulationKey)
        .single();
      if (racedError) throw racedError;
      return { id: String(raced.id), title: input.candidate.title, worldId, status: "active", created: false };
    }
    throw eventError;
  }
  const { error: participantError } = await input.db
    .from("together_world_event_participants")
    .upsert({
      user_id: input.userId,
      continuity_id: input.continuityId,
      world_event_instance_id: event.id,
      character_instance_id: input.characterInstanceId,
      role: "decision_maker",
      attendance_state: "arrived",
      knowledge_detail: "full",
      joined_at: now.toISOString(),
      metadata: { source: "dialogue_consequence_v1" },
    }, { onConflict: "world_event_instance_id,character_instance_id" });
  if (participantError) {
    await input.db.from("together_world_event_instances").delete().eq("id", event.id).eq("user_id", input.userId);
    throw participantError;
  }
  return { id: String(event.id), title: input.candidate.title, worldId, status: "active", created: true };
}

function nullableId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id || null;
}
