import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";

type Row = Record<string, any>;

export type MediaWorldContainment = {
  worldId: string;
  worldSlug: string;
  worldName: string;
  worldDescription: string;
  worldVisualContext: Record<string, unknown>;
  locationId?: string;
  locationName?: string;
  locationPath?: string;
  requestedSetting?: string;
  resolutionReason:
    | "authoritative_location"
    | "requested_exact_location"
    | "requested_setting_match"
    | "current_presence"
    | "resident_world_fallback";
  providerRequestText?: string;
};

export type MediaSettingCandidate = {
  id: string;
  worldId: string;
  name: string;
  slug: string;
  category: string;
  locationType: string;
  description: string;
  possibleActivities: string[];
  mediaAliases: string[];
  visualText: string;
  loreText: string;
  sortOrder: number;
};

export type RequestedMediaSetting = {
  phrase: string;
  family?: string;
  candidate?: MediaSettingCandidate;
  providerRequestText: string;
  match: "exact" | "generic";
};

type SettingFamily = { key: string; terms: string[]; signals: string[] };

// These are visual environment concepts, not world-specific mappings. A new
// world inherits support by authoring ordinary location names, categories,
// possible_activities, canonical visual context, or metadata.mediaAliases.
const SETTING_FAMILIES: SettingFamily[] = [
  { key: "pool", terms: ["swimming pool", "poolside", "pool", "hot tub"], signals: ["pool", "pools", "swim", "swimming", "bathing", "bath", "baths", "spa", "thermal", "geothermal", "hydrotherapy", "water"] },
  { key: "beach", terms: ["private beach", "beach", "seaside", "shore"], signals: ["beach", "shore", "seaside", "coast", "cove", "sand", "ocean", "sea", "waterfront"] },
  { key: "lake", terms: ["lakeside", "lake"], signals: ["lake", "lakeside", "reservoir", "waterfront", "pier", "dock", "water"] },
  { key: "river", terms: ["riverside", "riverwalk", "river"], signals: ["river", "riverside", "riverwalk", "waterfront", "embankment"] },
  { key: "hotel", terms: ["hotel room", "hotel", "resort", "inn", "motel"], signals: ["hotel", "inn", "motel", "lodging", "stay", "suite", "room", "resort"] },
  { key: "home", terms: ["bedroom", "apartment", "at home", "home"], signals: ["home", "bedroom", "apartment", "residence", "private room", "cabin", "quarters"] },
  { key: "restaurant", terms: ["restaurant", "dining room", "dinner table"], signals: ["restaurant", "dining", "dinner", "food", "bistro", "trattoria", "kitchen"] },
  { key: "cafe", terms: ["coffee shop", "café", "cafe"], signals: ["cafe", "coffee", "tea", "bakery"] },
  { key: "bar", terms: ["nightclub", "dance club", "cocktail bar", "bar", "club"], signals: ["bar", "club", "nightclub", "cocktail", "pub", "lounge", "nightlife", "music"] },
  { key: "garden", terms: ["greenhouse", "conservatory", "garden"], signals: ["garden", "greenhouse", "conservatory", "plants", "botany", "orchard"] },
  { key: "park", terms: ["city park", "park"], signals: ["park", "green", "outdoor", "lawn", "trail"] },
  { key: "forest", terms: ["in the woods", "woodland", "forest", "woods"], signals: ["forest", "woods", "woodland", "trees", "trail", "falls"] },
  { key: "mountain", terms: ["mountainside", "mountaintop", "mountain"], signals: ["mountain", "ridge", "summit", "overlook", "trail", "ski"] },
  { key: "library", terms: ["bookstore", "bookshop", "library"], signals: ["library", "bookstore", "bookshop", "books", "archives"] },
  { key: "gym", terms: ["fitness studio", "boxing gym", "gym"], signals: ["gym", "fitness", "boxing", "training", "workout"] },
  { key: "medical", terms: ["hospital room", "hospital", "medical clinic", "clinic"], signals: ["hospital", "clinic", "medical", "health", "infirmary"] },
  { key: "office", terms: ["workshop", "workplace", "office", "studio"], signals: ["office", "studio", "workshop", "work", "atelier", "fabrication"] },
  { key: "university", terms: ["college campus", "university campus", "campus", "university", "college"], signals: ["university", "college", "campus", "school", "class", "lecture"] },
  { key: "museum", terms: ["art gallery", "gallery", "museum"], signals: ["museum", "gallery", "exhibition", "art", "history"] },
  { key: "cinema", terms: ["movie theater", "movie theatre", "cinema", "theater", "theatre"], signals: ["cinema", "theater", "theatre", "movie", "film"] },
  { key: "harbor", terms: ["on a yacht", "on a boat", "marina", "harbor", "harbour", "dock", "pier", "yacht", "boat"], signals: ["marina", "harbor", "harbour", "dock", "pier", "boat", "yacht", "sailing"] },
];

export async function resolveCanonicalMediaWorld(input: {
  db: SupabaseClient;
  characterVersionIds: string[];
  requestText?: string;
  authoritativeLocationId?: string;
  presenceLocationId?: string;
  groupWorldId?: string;
}): Promise<MediaWorldContainment> {
  const versionIds = [...new Set(input.characterVersionIds.filter(Boolean))];
  if (!versionIds.length) throw new AppError("NOT_FOUND", "The companion world could not be resolved.", 404);
  const { data: presences, error: presenceError } = await input.db.from("together_character_world_presence").select("character_version_id,world_id,presence_type").in("character_version_id", versionIds).eq("presence_type", "resident");
  if (presenceError) throw new AppError("INTERNAL_ERROR", "Companion world membership could not be verified.", 500, true);
  const worldsByVersion = new Map<string, Set<string>>();
  for (const row of presences ?? []) {
    const key = String(row.character_version_id), worlds = worldsByVersion.get(key) ?? new Set<string>();
    worlds.add(String(row.world_id)); worldsByVersion.set(key, worlds);
  }
  if (versionIds.some((id) => !worldsByVersion.get(id)?.size)) throw new AppError("CHARACTER_WORLD_MISMATCH", "A selected companion does not have a canonical home world.", 409, true);
  const sharedWorlds = [...(worldsByVersion.get(versionIds[0]!) ?? [])].filter((worldId) => versionIds.every((id) => worldsByVersion.get(id)?.has(worldId)));
  const worldId = input.groupWorldId && sharedWorlds.includes(input.groupWorldId) ? input.groupWorldId : sharedWorlds.length === 1 ? sharedWorlds[0]! : "";
  if (!worldId) throw new AppError("CHARACTER_WORLD_MISMATCH", "Selected companions must belong to the same world for one photo.", 409, true);
  if (input.groupWorldId && input.groupWorldId !== worldId) throw new AppError("CHARACTER_WORLD_MISMATCH", "This conversation and its companions belong to different worlds.", 409, true);

  const [{ data: world, error: worldError }, { data: locations, error: locationsError }] = await Promise.all([
    input.db.from("together_worlds").select("id,slug,name,description,visual_context,published").eq("id", worldId).maybeSingle(),
    input.db.from("together_locations").select("id,world_id,parent_location_id,slug,name,description,category,location_type,possible_activities,metadata,canonical_visual_context,canonical_lore,sort_order").eq("world_id", worldId).limit(250),
  ]);
  if (worldError || !world || world.published === false) throw new AppError("INTERNAL_ERROR", "The companion home world could not be loaded.", 500, true);
  if (locationsError) throw new AppError("INTERNAL_ERROR", "World locations could not be checked.", 500, true);
  const candidates = (locations ?? []).map(toCandidate);
  const byId = new Map(candidates.map((location) => [location.id, location]));
  const assertScopedLocation = (locationId?: string) => {
    if (!locationId) return undefined;
    const location = byId.get(locationId);
    if (!location) throw new AppError("MEDIA_WORLD_MISMATCH", "The requested photo location does not belong to this companion's world.", 409, true);
    return location;
  };
  const authoritative = assertScopedLocation(input.authoritativeLocationId);
  const current = assertScopedLocation(input.presenceLocationId);
  const requested = resolveRequestedMediaSetting(input.requestText, candidates);
  if (requested && !requested.candidate) throw new AppError("MEDIA_SETTING_UNAVAILABLE", `That setting is not established in ${world.name} yet. Choose a place from ${world.name}.`, 409, true);
  const resolved = authoritative ?? requested?.candidate ?? current;
  const reason: MediaWorldContainment["resolutionReason"] = authoritative
    ? "authoritative_location"
    : requested?.candidate
    ? requested.match === "exact" ? "requested_exact_location" : "requested_setting_match"
    : current
    ? "current_presence"
    : "resident_world_fallback";
  return {
    worldId,
    worldSlug: String(world.slug),
    worldName: String(world.name),
    worldDescription: String(world.description ?? ""),
    worldVisualContext: (world.visual_context ?? {}) as Record<string, unknown>,
    ...(resolved ? { locationId: resolved.id, locationName: resolved.name, locationPath: resolved.name } : {}),
    ...(requested
      ? {
        requestedSetting: requested.phrase,
        providerRequestText: `${requested.providerRequestText.replace(/[.\s]+$/g, "")}. Set the environment only at ${resolved?.name ?? world.name}, inside ${world.name}.`.slice(0, 400),
      }
      : input.requestText
      ? { providerRequestText: input.requestText.slice(0, 400) }
      : {}),
    resolutionReason: reason,
  };
}

export function resolveRequestedMediaSetting(requestText: string | undefined, candidates: MediaSettingCandidate[]): RequestedMediaSetting | null {
  const original = String(requestText ?? "").trim();
  if (!original) return null;
  const normalized = normalize(original);
  const exact = candidates
    .filter((candidate) => normalize(candidate.name).length >= 4 && containsPhrase(normalized, normalize(candidate.name)))
    .sort((left, right) => right.name.length - left.name.length || left.sortOrder - right.sortOrder)[0];
  if (exact) return { phrase: exact.name, candidate: exact, providerRequestText: stripSettingPhrase(original, exact.name), match: "exact" };
  const familyMatches = SETTING_FAMILIES.flatMap((family) => family.terms.map((term) => ({ family, term })))
    .filter(({ term }) => containsPhrase(normalized, normalize(term)) && hasSettingSyntax(original, term))
    .map((match) => {
      const ranked = candidates.map((candidate) => ({ candidate, score: scoreSettingCandidate(candidate, match.family) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.candidate.sortOrder - right.candidate.sortOrder || left.candidate.name.localeCompare(right.candidate.name));
      return { ...match, ranked, bestScore: ranked[0]?.score ?? 0 };
    })
    .sort((left, right) => right.bestScore - left.bestScore || right.term.length - left.term.length);
  const familyMatch = familyMatches[0];
  if (!familyMatch) return null;
  return {
    phrase: familyMatch.term,
    family: familyMatch.family.key,
    candidate: familyMatch.ranked[0]?.score && familyMatch.ranked[0].score >= 45 ? familyMatch.ranked[0].candidate : undefined,
    providerRequestText: stripSettingPhrase(original, familyMatch.term),
    match: "generic",
  };
}

export function buildMediaWorldContainmentInstruction(containment: MediaWorldContainment | undefined): string {
  if (!containment) return "Remain inside the established Kivelle world and exact canonical location. Never substitute a familiar real-world environment.";
  const visual = containment.worldVisualContext, signature = [
    stringValue(visual.setting),
    listValue(visual.architecture),
    listValue(visual.recurringElements ?? visual.recurring_elements),
    listValue(visual.climate),
  ].filter(Boolean).join("; ");
  const avoid = listValue(visual.avoid);
  const exact = containment.locationName ? `Exact setting: ${containment.locationName}, ${containment.worldName}.` : `Setting must be native to ${containment.worldName}.`;
  return [
    `HARD WORLD LOCK: this image exists only in ${containment.worldName}; never relocate it to Earth, another Kivelle world, or a generic real-world substitute.`,
    exact,
    signature ? `World signature: ${signature}.` : "Use only the authored world identity.",
    avoid ? `Forbidden world drift: ${avoid}.` : "Exclude real-world brands, landmarks, signage, skylines, and architecture that are not canonical to this world.",
    "Any setting words in the creative request have already been resolved; the canonical world and exact setting override photographic priors and all conflicting wording.",
  ].join(" ");
}

export function validateReferenceAssetWorldScope(rows: Array<Record<string, unknown>>, input: { worldId: string; locationId?: string; characterVersionIds: string[] }): Array<Record<string, unknown>> {
  const versions = new Set(input.characterVersionIds.map(String));
  return rows.filter((row) => {
    const role = String(row.asset_role ?? row.role ?? ""), characterVersionId = String(row.character_version_id ?? ""), locationId = String(row.location_id ?? ""), worldId = String(row.world_id ?? "");
    if (role.startsWith("character_") || role === "outfit_continuity") return Boolean(characterVersionId && versions.has(characterVersionId));
    if (role.startsWith("location_")) return Boolean(input.locationId && locationId === input.locationId);
    if (role === "world_canonical") return worldId === input.worldId;
    return role === "previous_media";
  });
}

function toCandidate(row: Row): MediaSettingCandidate {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>, visual = row.canonical_visual_context ?? {}, lore = row.canonical_lore ?? {};
  return {
    id: String(row.id), worldId: String(row.world_id), name: String(row.name), slug: String(row.slug), category: String(row.category ?? ""), locationType: String(row.location_type ?? "venue"), description: String(row.description ?? ""),
    possibleActivities: Array.isArray(row.possible_activities) ? row.possible_activities.map(String) : [],
    mediaAliases: Array.isArray(metadata.mediaAliases) ? metadata.mediaAliases.map(String) : Array.isArray(metadata.media_aliases) ? metadata.media_aliases.map(String) : [],
    visualText: JSON.stringify(visual), loreText: JSON.stringify(lore), sortOrder: Number(row.sort_order ?? 0),
  };
}

function scoreSettingCandidate(candidate: MediaSettingCandidate, family: SettingFamily): number {
  const fields = {
    aliases: normalize(candidate.mediaAliases.join(" ")),
    name: normalize(`${candidate.name} ${candidate.slug}`),
    category: normalize(`${candidate.category} ${candidate.locationType}`),
    activities: normalize(candidate.possibleActivities.join(" ")),
    visual: normalize(candidate.visualText),
    description: normalize(`${candidate.description} ${candidate.loreText}`),
  };
  let score = 0;
  for (const signal of family.signals) {
    const word = normalize(signal);
    if (containsPhrase(fields.aliases, word)) score += 120;
    if (containsPhrase(fields.name, word)) score += 90;
    if (containsPhrase(fields.category, word)) score += 75;
    if (containsPhrase(fields.activities, word)) score += 65;
    if (containsPhrase(fields.visual, word)) score += 45;
    if (containsPhrase(fields.description, word)) score += 28;
  }
  if (["district", "region", "zone"].includes(candidate.locationType)) score -= 30;
  return score;
}

function stripSettingPhrase(original: string, phrase: string): string {
  const escaped = escapeRegExp(phrase).replace(/\\ /g, "[\\s-]+");
  const spatial = new RegExp(`\\b(?:in|into|to|at|from|by|inside|outside|near|around|beside|on)\\s+(?:(?:the|a|an|my|her|his|their)\\s+)?[^,.;!?]{0,70}?\\b${escaped}\\b`, "iu");
  let cleaned = original.replace(spatial, " ");
  if (cleaned === original) cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, "iu"), " ");
  return cleaned.replace(/\s+([,.;!?])/g, "$1").replace(/(^|\s)[,;]+(?=\s|$)/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 400) || "Create the requested personal photograph.";
}

function hasSettingSyntax(original: string, phrase: string): boolean {
  const escaped = escapeRegExp(phrase).replace(/\\ /g, "[\\s-]+");
  if (/(?:side|front)$/i.test(phrase)) return true;
  return new RegExp(`\\b(?:in|into|to|at|from|by|inside|outside|near|around|beside|on)\\b[^,.;!?]{0,70}?\\b${escaped}\\b`, "iu").test(original) ||
    new RegExp(`\\b${escaped}\\b[\\s-]*(?:photo|selfie|picture|portrait|background|setting|scene)\\b`, "iu").test(original) ||
    new RegExp(`\\b(?:photo|selfie|picture|portrait|background|setting|scene)\\b[^,.;!?]{0,45}?\\b${escaped}\\b`, "iu").test(original);
}

function normalize(value: string): string { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function containsPhrase(haystack: string, needle: string): boolean { return Boolean(needle && (` ${haystack} `).includes(` ${needle} `)); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function listValue(value: unknown): string { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8).join(", ") : stringValue(value); }
