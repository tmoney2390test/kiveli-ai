import type { SupabaseClient } from "@supabase/supabase-js";
import {
  characterCanSpeak,
  deriveCharacterLifeTransition,
  normalizeCharacterLifeState,
  type CharacterLifeParticipant,
  type CharacterLifeTransition,
} from "../../../packages/together-domain/src/character-life-state.ts";

type Row = Record<string, any>;

export function lifeParticipantFromInstance(instance: Row): CharacterLifeParticipant {
  return {
    characterInstanceId: String(instance.id ?? ""),
    name: String(instance.together_character_templates?.name ?? "Companion"),
    lifeState: instance.life_state,
  };
}

export function lifeParticipantsFromGroupRoster(roster: readonly Row[]): CharacterLifeParticipant[] {
  return roster.map((row) => lifeParticipantFromInstance(row.together_character_instances ?? {}));
}

export function groupParticipantCanSpeak(participant: Row): boolean {
  return characterCanSpeak(participant.together_character_instances?.life_state);
}

export function applyLifeTransitionToGroupRoster(
  roster: Row[],
  transition: CharacterLifeTransition | null,
): void {
  if (!transition) return;
  const participant = roster.find((row) =>
    String(row.character_instance_id) === transition.characterInstanceId
  );
  if (!participant?.together_character_instances) return;
  participant.together_character_instances.life_state = transition.to;
  participant.together_character_instances.life_state_summary = transition.summary;
}

export async function persistCharacterLifeTransition(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  sourceMessageId: string;
  message: string;
  participants: readonly CharacterLifeParticipant[];
  directedCharacterInstanceIds?: readonly string[];
  conversationId: string;
  sourceRole?: "user" | "assistant";
  allowedKinds?: readonly CharacterLifeTransition["kind"][];
}): Promise<CharacterLifeTransition | null> {
  const transition = deriveCharacterLifeTransition({
    message: input.message,
    participants: input.participants,
    directedCharacterInstanceIds: input.directedCharacterInstanceIds,
  });
  if (!transition) return null;
  if (input.allowedKinds && !input.allowedKinds.includes(transition.kind)) return null;

  const { data, error } = await input.db.from("together_character_instances")
    .update({
      life_state: transition.to,
      life_state_summary: transition.summary,
      life_state_changed_at: new Date().toISOString(),
      life_state_source_message_id: input.sourceMessageId,
      life_state_metadata: {
        transitionKind: transition.kind,
        previousState: transition.from,
        sourceConversationId: input.conversationId,
        sourceRole: input.sourceRole ?? "user",
        confidence: transition.confidence,
        version: 1,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transition.characterInstanceId)
    .eq("user_id", input.userId)
    .eq("continuity_id", input.continuityId)
    .eq("life_state", transition.from)
    .select("id,life_state")
    .maybeSingle();
  if (error) throw error;
  return data ? transition : null;
}

export function deadCharacterSceneNarration(input: {
  name: string;
  summary?: unknown;
}): string {
  const name = input.name.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "The companion";
  const summary = typeof input.summary === "string"
    ? input.summary.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim()
    : "";
  return summary
    ? `${summary} ${name} cannot answer unless this continuity explicitly brings them back through a supernatural event.`
    : `${name} is dead in this continuity and cannot answer. The scene remains, but there is no dialogue from them.`;
}

export function lifeStatePromptLabel(instance: Row): string {
  const state = normalizeCharacterLifeState(instance.life_state);
  if (state === "dead") return "dead — cannot speak or act voluntarily";
  if (state === "undead") return "supernaturally returned — may speak within that established form";
  return "alive";
}
