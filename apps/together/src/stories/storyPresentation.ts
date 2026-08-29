import type { StoryCampaign, StoryMessage, StoryPerson } from './types';

export const STORY_SPLIT_BREAKPOINT = 1100;
export function usesSplitStoryLayout(width: number): boolean {
  return width >= STORY_SPLIT_BREAKPOINT;
}

export function visibleStoryMessages(
  campaign: Pick<StoryCampaign, 'messages' | 'currentLocation'>,
  characterId?: string,
): StoryMessage[] {
  const visible = campaign.messages.filter(
    (message) => {
      if (message.role !== 'system') return message.location_slug === campaign.currentLocation.id;
      const kind = message.metadata?.kind;
      if (kind === 'presence_transition_summary') return message.location_slug === campaign.currentLocation.id;
      if (kind === 'presence_transition') {
        const movementCharacterId = typeof message.metadata?.characterId === 'string' ? message.metadata.characterId : message.character_slug;
        return message.location_slug === campaign.currentLocation.id || Boolean(characterId && movementCharacterId === characterId);
      }
      return true;
    },
  );

  return visible.slice(-36);
}

export function resolveStoryConversationPerson(
  campaign: Pick<StoryCampaign, 'presentCharacters' | 'othersNearby' | 'dossiers'>,
  selectedCharacterId: string,
): StoryPerson | undefined {
  const people = [...campaign.presentCharacters, ...campaign.othersNearby, ...campaign.dossiers];
  if (selectedCharacterId) return people.find((person) => person.id === selectedCharacterId);
  return campaign.presentCharacters[0] ?? campaign.othersNearby[0];
}

export function storyPersonIsPresent(
  campaign: Pick<StoryCampaign, 'presentCharacters' | 'othersNearby'>,
  characterId: string,
): boolean {
  return [...campaign.presentCharacters, ...campaign.othersNearby].some((person) => person.id === characterId);
}

export function initialStoryConversationId(
  campaign: Pick<StoryCampaign, 'messages' | 'presentCharacters' | 'othersNearby' | 'dossiers'>,
): string {
  const knownIds = new Set([...campaign.presentCharacters, ...campaign.othersNearby, ...campaign.dossiers].map((person) => person.id));
  for (const message of [...campaign.messages].reverse()) {
    const targetId = typeof message.metadata?.targetCharacterId === 'string' ? message.metadata.targetCharacterId : null;
    const candidate = targetId ?? (message.role === 'character' ? message.character_slug : null);
    if (candidate && knownIds.has(candidate)) return candidate;
  }
  return campaign.presentCharacters[0]?.id ?? campaign.othersNearby[0]?.id ?? '';
}

export function storyRelationshipLabel(person: Pick<StoryPerson, 'trust' | 'suspicion' | 'emotionalState' | 'relationshipCue'>): string {
  if (person.relationshipCue) return person.relationshipCue;
  if (person.emotionalState === 'hostile' || person.suspicion >= 70) return 'is openly wary of you';
  if (person.emotionalState === 'frightened') return 'is frightened, but still listening';
  if (person.emotionalState === 'convinced' || person.trust >= 70) return 'believes you may be telling the truth';
  if (person.emotionalState === 'curious' || person.trust >= 50) return 'is beginning to open up';
  if (person.emotionalState === 'guarded' || person.suspicion >= 45) return 'is keeping their guard up';
  return 'is still deciding what to make of you';
}
