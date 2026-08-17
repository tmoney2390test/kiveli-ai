import type { CharacterInstance, CharacterVersion, Snapshot } from '../types';
import { worldForLocation } from './place';
export { selectCharacterPlacePerspective } from './placePerspective';

export function selectActiveCompanion(snapshot: Snapshot, companionId?: string): CharacterInstance | undefined {
  return snapshot.characters.find((item) => item.id === companionId)
    ?? snapshot.characters.find((item) => item.id === snapshot.activeContinuity?.active_companion_instance_id)
    ?? snapshot.characters.find((item) => item.id === snapshot.profile?.active_companion_instance_id)
    ?? snapshot.characters.find((item) => Boolean(item.contact_added_at || item.introduced_at))
    ?? snapshot.characters[0];
}

export function selectPortraitVersion(snapshot: Snapshot, character: CharacterInstance): CharacterVersion {
  return snapshot.discoverableCharacters.find((item) => item.id === character.character_template_id)?.together_character_versions
    ?? character.together_character_versions;
}

export const selectCompanionRelationship = (snapshot: Snapshot, companionId: string) => snapshot.relationships.find((item) => item.character_instance_id === companionId);
export const selectCompanionMemories = (snapshot: Snapshot, companionId: string) => snapshot.memories.filter((item) => item.character_instance_id === companionId);
export const selectCompanionPlans = (snapshot: Snapshot, companionId: string) => snapshot.sharedPlans.filter((item) => item.character_instance_id === companionId);
export const selectCompanionDates = (snapshot: Snapshot, companionId: string) => snapshot.dates.filter((item) => item.character_instance_id === companionId);
export const selectCompanionStories = (snapshot: Snapshot, companionId: string) => (snapshot.storyArcs ?? []).filter((item) => item.character_instance_id === companionId);
export const selectCompanionMedia = (snapshot: Snapshot, companionId: string) => (snapshot.generatedMedia ?? []).filter((item) => item.character_instance_id === companionId);
export const selectCompanionMoments = (snapshot: Snapshot, companionId: string) => snapshot.moments.filter((item) => item.character_instance_id === companionId || item.participant_instance_ids.includes(companionId));
export const selectCompanionEvents = (snapshot: Snapshot, companionId: string) => snapshot.lifeEvents.filter((item) => item.character_instance_id === companionId);
export const selectCompanionThreads = (snapshot: Snapshot, companionId: string) => snapshot.openThreads.filter((item) => item.character_instance_id === companionId);
export const selectCompanionProactiveMessages = (snapshot: Snapshot, companionId: string) => snapshot.proactiveMessages.filter((item) => item.character_instance_id === companionId);

export const selectWorldLocations = (snapshot: Snapshot, worldId: string) => snapshot.locations.filter((item) => item.world_id === worldId);
export const selectWorldEvents = (snapshot: Snapshot, worldId: string) => snapshot.lifeEvents.filter((item) => {
  const location = item.location_id ? snapshot.locations.find((place) => place.id === item.location_id) : undefined;
  return location?.world_id === worldId;
});
export const selectWorldCharacters = (snapshot: Snapshot, worldId: string) => snapshot.characters.filter((item) => worldForLocation(snapshot, item.current_location_id)?.id === worldId || snapshot.characterWorldPresence?.some((presence) => presence.character_version_id === item.character_version_id && presence.world_id === worldId && presence.presence_type !== 'unavailable'));

export function selectCompanionLife(snapshot: Snapshot, companionId: string) {
  return {
    companion: snapshot.characters.find((item) => item.id === companionId),
    relationship: selectCompanionRelationship(snapshot, companionId),
    memories: selectCompanionMemories(snapshot, companionId),
    moments: selectCompanionMoments(snapshot, companionId),
    plans: selectCompanionPlans(snapshot, companionId),
    dates: selectCompanionDates(snapshot, companionId),
    stories: selectCompanionStories(snapshot, companionId),
    media: selectCompanionMedia(snapshot, companionId),
    events: selectCompanionEvents(snapshot, companionId),
    threads: selectCompanionThreads(snapshot, companionId),
    proactiveMessages: selectCompanionProactiveMessages(snapshot, companionId),
  };
}
