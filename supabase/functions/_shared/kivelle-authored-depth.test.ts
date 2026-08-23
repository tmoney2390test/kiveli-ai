import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import type { AuthoredContentUsage } from "./kivelle-authored-depth.ts";
import { resolveDialogueOpportunities } from "./kivelle-dialogue-opportunities.ts";
import { resolveSceneInteractionBeats } from "./kivelle-scene-beats.ts";
import { resolveRelevantWorldFacts } from "./kivelle-world-facts.ts";

const WORLD_A = "00000000-0000-4000-8000-000000000001";
const WORLD_B = "00000000-0000-4000-8000-000000000002";
const LOCATION = "00000000-0000-4000-8000-000000000003";
const DISTRICT = "00000000-0000-4000-8000-000000000004";

function fact(overrides: Record<string, unknown> = {}) {
  return {
    id: "fact-1",
    world_id: WORLD_A,
    slug: "burning-winter",
    title: "The Burning Winter",
    fact_text: "The Burning Winter destroyed much of old Vespormoor in 1846.",
    category: "history",
    truth_mode: "canonical",
    knowledge_scope: "public",
    content_level: "standard",
    topic_tags: ["burning winter", "history"],
    trigger_terms: ["burning winter", "1846"],
    dayparts: [],
    relationship_stages: [],
    min_world_familiarity: 0,
    cooldown_turns: 20,
    weight: 1,
    active: true,
    metadata: {},
    ...overrides,
  };
}

function worldInput(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [fact()],
    worldId: WORLD_A,
    currentLocationId: null,
    districtLocationId: null,
    userMessage: "What happened during the Burning Winter?",
    queryIntent: "history",
    contentMode: "standard",
    relationshipStage: "friend",
    worldFamiliarity: 30,
    currentTurn: 50,
    ...overrides,
  };
}

Deno.test("world facts return zero for casual chat and never cross worlds", () => {
  assertEquals(resolveRelevantWorldFacts(worldInput({ userMessage: "hey", queryIntent: "general" })), []);
  assertEquals(resolveRelevantWorldFacts(worldInput({ candidates: [fact({ world_id: WORLD_B })] })), []);
});

Deno.test("world facts rank location and district facts while preserving rumor labels", () => {
  const results = resolveRelevantWorldFacts(worldInput({
    currentLocationId: LOCATION,
    districtLocationId: DISTRICT,
    userMessage: "Is this place private, and what rumors are there?",
    queryIntent: "location",
    candidates: [
      fact({ id: "district", slug: "district", district_location_id: DISTRICT, category: "privacy", topic_tags: ["private"], trigger_terms: ["private"] }),
      fact({ id: "location", slug: "location", location_id: LOCATION, category: "privacy", topic_tags: ["private"], trigger_terms: ["private"] }),
      fact({ id: "rumor", slug: "rumor", truth_mode: "rumor", category: "rumor", topic_tags: ["rumor"], trigger_terms: ["rumor"] }),
    ],
  }));
  assertEquals(results.length, 3);
  assertEquals(results[0]!.slug, "location");
  assertEquals(results.find((item) => item.slug === "rumor")?.truthMode, "rumor");
});

Deno.test("world fact knowledge, story, and content gates fail closed", () => {
  const candidates = [
    fact({ id: "mature", slug: "mature", content_level: "mature" }),
    fact({ id: "local", slug: "local", knowledge_scope: "local", min_world_familiarity: 40 }),
    fact({ id: "story", slug: "story", knowledge_scope: "story", required_story_slug: "missing-clause" }),
    fact({ id: "private", slug: "private", knowledge_scope: "private", metadata: {} }),
  ];
  assertEquals(resolveRelevantWorldFacts(worldInput({ candidates, worldFamiliarity: 0, activeStorySlug: null })), []);
  assertEquals(resolveRelevantWorldFacts(worldInput({ candidates: [candidates[0]], contentMode: "mature" })).length, 1);
  assertEquals(resolveRelevantWorldFacts(worldInput({ candidates: [candidates[2]], activeStorySlug: "missing-clause" })).length, 1);
});

Deno.test("world fact cooldown yields to a direct user question and result limits are hard", () => {
  const usage = new Map<string, AuthoredContentUsage>([["world_fact:fact-1", { contentKind: "world_fact", contentKey: "fact-1", usedAt: new Date().toISOString(), conversationTurn: 49 }]]);
  assertEquals(resolveRelevantWorldFacts(worldInput({ userMessage: "The Burning Winter made the town different.", queryIntent: "general", recentUsage: usage })).length, 0);
  assertEquals(resolveRelevantWorldFacts(worldInput({ recentUsage: usage })).length, 1);
  const candidates = Array.from({ length: 30 }, (_, index) => fact({ id: `fact-${index}`, slug: `fact-${index}` }));
  assertEquals(resolveRelevantWorldFacts(worldInput({ candidates, maximumResults: 99 })).length, 5);
  assertEquals(resolveRelevantWorldFacts(worldInput({ candidates, userMessage: "I keep thinking about the Burning Winter.", queryIntent: "general", maximumResults: 99 })).length, 2);
});

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1", world_id: WORLD_A, slug: "raw-hour", topic: "What a Raw Hour means", angle: "Whether being unfiltered feels intimate or exposed.", framing: "Optional.",
    topic_tags: ["raw hour", "privacy"], trigger_terms: ["raw hour"], character_tags: [], occupation_tags: [], min_relationship_stage: "friend", max_relationship_stage: null,
    content_level: "romance", min_spice_level: 1, required_fact_slug: "raw-hour-fact", required_story_slug: null, dayparts: [], interaction_modes: ["remote", "co_present"], weight: 1, cooldown_turns: 20, active: true,
    ...overrides,
  };
}

Deno.test("dialogue opportunities deepen the subject but cannot hijack it", () => {
  const base = { candidates: [opportunity()], worldId: WORLD_A, userMessage: "Would you ever do a Raw Hour?", queryIntent: "general", currentTopic: "", contentMode: "romance", relationshipStage: "friend", spiceLevel: 2, selectedFactSlugs: ["raw-hour-fact"], interactionModes: ["remote"], currentTurn: 10 };
  assertEquals(resolveDialogueOpportunities(base).length, 1);
  assertEquals(resolveDialogueOpportunities({ ...base, userMessage: "My train is late.", selectedFactSlugs: [] }), []);
  assertEquals(resolveDialogueOpportunities({ ...base, userMessage: "hey" }), []);
  assertEquals(resolveDialogueOpportunities({ ...base, relationshipStage: "acquaintance" }), []);
  assertEquals(resolveDialogueOpportunities({ ...base, contentMode: "standard" }), []);
});

function beat(overrides: Record<string, unknown> = {}) {
  return {
    id: "beat-1", world_id: WORLD_A, slug: "whisper-dock", title: "Room for confession", interaction_type: "confession",
    seed: "The setting creates a quiet opening for either person to ask, volunteer, or stay silent; no confession is forced.", affordances: ["ask", "volunteer", "stay silent"],
    topic_tags: ["confession", "dock"], character_tags: [], min_relationship_stage: "friend", max_relationship_stage: null, content_level: "romance", min_spice_level: 1,
    required_fact_slug: "whisper-dock-fact", required_story_slug: null, interaction_modes: ["co_present", "active_date"], co_present_required: true,
    required_participant_count: 1, maximum_participant_count: 2, dayparts: [], activity_tags: ["conversation"], weight: 1, cooldown_hours: 24, active: true, metadata: {},
    ...overrides,
  };
}

function beatInput(overrides: Record<string, unknown> = {}) {
  return { candidates: [beat()], worldId: WORLD_A, userMessage: "It feels like a place for a confession.", contentMode: "romance", relationshipStage: "friend", spiceLevel: 2, selectedFactSlugs: ["whisper-dock-fact"], interactionModes: ["co_present"], interactionMode: "co_present", activity: "conversation", participantCount: 1, now: new Date("2026-08-23T12:00:00Z"), ...overrides };
}

Deno.test("scene beats require co-presence, matching participants, daypart, story, and actual social edges", () => {
  assertEquals(resolveSceneInteractionBeats(beatInput()).length, 1);
  assertEquals(resolveSceneInteractionBeats(beatInput({ interactionMode: "remote", interactionModes: ["remote"] })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ required_participant_count: 2 })] })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ dayparts: ["late_night"] })], daypart: "morning" })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ required_story_slug: "missing-clause" })], activeStorySlug: null })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ interaction_type: "character_character", required_participant_count: 2, maximum_participant_count: 3, metadata: { requiredParticipantRelationshipTypes: ["former_partner"] } })], participantCount: 2, participantRelationshipTypes: ["friend"] })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ interaction_type: "character_character", required_participant_count: 2, maximum_participant_count: 3, metadata: { requiredParticipantRelationshipTypes: ["former_partner"] } })], participantCount: 2, participantRelationshipTypes: ["former_partner"] })).length, 1);
});

Deno.test("scene beats cannot manufacture user actions or mutate relationship state", () => {
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ seed: "The user kisses the companion." })] })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [beat({ metadata: { trustDelta: 5 } })] })), []);
  const result = resolveSceneInteractionBeats(beatInput())[0];
  assertMatch(result!.seed, /no confession is forced/i);
  assertEquals("relationshipDelta" in result!, false);
});

Deno.test("adult scene beats cannot bypass mode, spice, boundaries, consent, or cooldown", () => {
  const adult = beat({ interaction_type: "adult", content_level: "mature", min_spice_level: 2, metadata: { blockedBoundaryTags: ["feeding"] } });
  const accepted = { active: true, shouldReciprocate: true, outcome: "accepted", disposition: "open" };
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [adult], contentMode: "mature", characterBoundaries: ["No feeding"], intimacyStance: accepted })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [adult], contentMode: "standard", characterBoundaries: [], intimacyStance: accepted })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [adult], contentMode: "mature", spiceLevel: 1, characterBoundaries: [], intimacyStance: accepted })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [adult], contentMode: "mature", characterBoundaries: [], intimacyStance: { active: true, shouldReciprocate: false, outcome: "declined", disposition: "decline" } })), []);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [adult], contentMode: "mature", userMessage: "Stop, I changed my mind.", characterBoundaries: [], intimacyStance: accepted })), []);
  const recentUsage = new Map<string, AuthoredContentUsage>([["interaction_beat:beat-1", { contentKind: "interaction_beat", contentKey: "beat-1", usedAt: "2026-08-23T11:30:00Z" }]]);
  assertEquals(resolveSceneInteractionBeats(beatInput({ candidates: [adult], contentMode: "mature", characterBoundaries: [], intimacyStance: accepted, recentUsage })), []);
});
