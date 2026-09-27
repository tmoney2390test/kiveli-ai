import type { CharacterInstance } from '../types';

// Presence/dialogue deltas omit signed artwork. Keep it for the same version;
// a changed identity or an explicit null still replaces the previous portrait.
export function reconcileCompanion(previous: CharacterInstance | undefined, next: CharacterInstance): CharacterInstance {
  if (!previous || previous.character_version_id !== next.character_version_id || !previous.together_character_versions || !next.together_character_versions) return next;
  return { ...next, together_character_versions: { ...previous.together_character_versions, ...next.together_character_versions,
    portrait_url: next.together_character_versions.portrait_url === undefined ? previous.together_character_versions.portrait_url : next.together_character_versions.portrait_url,
  } };
}
