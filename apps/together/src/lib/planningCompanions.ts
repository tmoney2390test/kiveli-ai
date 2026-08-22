import type { CharacterInstance, Snapshot } from '../types';
import { characterCanPlanInWorld } from './place';

function activityTime(value?: string | null) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Known companions who canonically belong to a world, ordered by the latest conversation. */
export function planningCompanionsForWorld(snapshot: Snapshot, worldId: string): CharacterInstance[] {
  const recentByCharacter = new Map<string, number>();
  for (const conversation of snapshot.conversations.filter((item)=>['direct','first_meeting'].includes(item.kind))) {
    const recent = activityTime(conversation.last_message_at ?? conversation.updated_at ?? conversation.created_at);
    recentByCharacter.set(conversation.character_instance_id, Math.max(recentByCharacter.get(conversation.character_instance_id) ?? 0, recent));
  }

  return snapshot.characters
    .filter((character) => characterCanPlanInWorld(snapshot, character, worldId))
    .filter((character) => Boolean(character.contact_added_at || character.introduced_at || recentByCharacter.has(character.id)))
    .sort((left, right) =>
      (recentByCharacter.get(right.id) ?? 0) - (recentByCharacter.get(left.id) ?? 0)
      || left.together_character_templates.name.localeCompare(right.together_character_templates.name),
    );
}
