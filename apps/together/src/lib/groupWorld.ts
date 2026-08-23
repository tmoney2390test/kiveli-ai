import type { CharacterInstance, Snapshot, World } from "../types";
import { characterResidentWorld } from "./place";

export type GroupWorldOption = {
  world: World;
  characters: CharacterInstance[];
};

export function hasMetCompanion(character: CharacterInstance): boolean {
  return Boolean(character.introduced_at || character.contact_added_at);
}

/** Known companions grouped by canonical resident world, never travel state. */
export function groupWorldOptions(snapshot: Snapshot): GroupWorldOption[] {
  const introduced = snapshot.characters.filter(hasMetCompanion);
  return snapshot.worlds
    .map((world) => ({
      world,
      characters: introduced
        .filter((character) =>
          characterResidentWorld(snapshot, character)?.id === world.id
        )
        .sort((left, right) =>
          left.together_character_templates.name.localeCompare(
            right.together_character_templates.name,
          )
        ),
    }))
    .sort((left, right) => left.world.name.localeCompare(right.world.name));
}

export function groupAddCandidates(
  snapshot: Snapshot,
  worldId: string | null | undefined,
  activeCharacterInstanceIds: ReadonlySet<string>,
): CharacterInstance[] {
  if (!worldId) return [];
  return snapshot.characters
    .filter(hasMetCompanion)
    .filter((character) => !activeCharacterInstanceIds.has(character.id))
    .filter((character) =>
      characterResidentWorld(snapshot, character)?.id === worldId
    )
    .sort((left, right) =>
      left.together_character_templates.name.localeCompare(
        right.together_character_templates.name,
      )
    );
}
