import { describe, expect, it } from "vitest";
import type { CharacterInstance, Snapshot } from "../types";
import {
  groupAddCandidates,
  groupWorldOptions,
  hasMetCompanion,
} from "./groupWorld";

function companion(id: string, name: string): CharacterInstance {
  return {
    id,
    user_id: "user",
    character_template_id: `${id}-template`,
    character_version_id: `${id}-version`,
    relationship_stage: "friend",
    current_mood: "calm",
    current_activity: "texting",
    current_location_id: null,
    current_energy: "medium",
    contact_added_at: "2026-08-01T12:00:00Z",
    introduced_at: "2026-08-01T12:00:00Z",
    met_at: "2026-08-01T12:00:00Z",
    last_simulated_at: "2026-08-01T12:00:00Z",
    together_character_templates: {
      id: `${id}-template`,
      name,
      slug: id,
      age: 26,
      occupation: "Artist",
      biography: "",
    },
    together_character_versions: {
      id: `${id}-version`,
      portrait_asset_key: id,
      interests: [],
      personality_config: {},
    },
  };
}

function snapshot(): Snapshot {
  const brooke = companion("brooke", "Brooke"),
    becka = companion("becka", "Becka"),
    chloe = companion("chloe", "Chloe");
  return {
    characters: [brooke, becka, chloe],
    worlds: [
      { id: "juniper", slug: "juniper-city", name: "Juniper City" },
      { id: "vervelle", slug: "port-vervelle", name: "Port Vervelle" },
      { id: "vespormoor", slug: "vespormoor", name: "Vespormoor" },
    ],
    locations: [],
    discoverableCharacters: [],
    characterWorldPresence: [
      {
        id: "brooke-home",
        character_version_id: brooke.character_version_id,
        world_id: "juniper",
        presence_type: "resident",
        familiarity: 1,
        visited_count: 1,
        metadata: {},
      },
      {
        id: "becka-home",
        character_version_id: becka.character_version_id,
        world_id: "juniper",
        presence_type: "resident",
        familiarity: 1,
        visited_count: 1,
        metadata: {},
      },
      {
        id: "chloe-home",
        character_version_id: chloe.character_version_id,
        world_id: "vervelle",
        presence_type: "resident",
        familiarity: 1,
        visited_count: 1,
        metadata: {},
      },
      {
        id: "chloe-visit",
        character_version_id: chloe.character_version_id,
        world_id: "juniper",
        presence_type: "visitor",
        familiarity: .2,
        visited_count: 1,
        metadata: {},
      },
    ],
  } as unknown as Snapshot;
}

describe("group world scoping", () => {
  it("groups introduced companions by resident world and ignores travel presence", () => {
    const options = groupWorldOptions(snapshot());
    expect(options.map((option) => option.world.id)).toEqual([
      "juniper",
      "vervelle",
      "vespormoor",
    ]);
    expect(
      options.find((option) => option.world.id === "juniper")?.characters.map((
        character,
      ) => character.id),
    ).toEqual(["becka", "brooke"]);
    expect(
      options.find((option) => option.world.id === "vervelle")?.characters.map((
        character,
      ) => character.id),
    ).toEqual(["chloe"]);
    expect(
      options.find((option) => option.world.id === "vespormoor")?.characters,
    ).toEqual([]);
  });

  it("keeps legacy contact-only companions eligible", () => {
    const legacy = companion("legacy", "Legacy");
    legacy.introduced_at = null;
    expect(hasMetCompanion(legacy)).toBe(true);
  });

  it("only offers same-world companions when adding to a group", () => {
    expect(
      groupAddCandidates(snapshot(), "juniper", new Set(["brooke"])).map((
        character,
      ) => character.id),
    ).toEqual(["becka"]);
  });
});
