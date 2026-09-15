import type { Snapshot } from '../types';
import { featuredCompanionGender, featuredCompanionsForWorld, type CompanionGender, type FeaturedCompanion } from './featuredCompanions';

// Recommendation signals come from this account's engagement, never the user's
// gender or the device-wide Explore filter. No message contents are inspected.
export function homeCompanionRecommendations(snapshot: Snapshot, worldId: string, activeTemplateId?: string, now = Date.now()): FeaturedCompanion[] {
  const candidates = featuredCompanionsForWorld(snapshot, worldId, activeTemplateId);
  const relationships = new Map((snapshot.relationships ?? []).map(item => [item.character_instance_id, item]));
  const recent = new Map<string, number>();
  const archived = new Set<string>();
  for (const conversation of snapshot.conversations ?? []) {
    if (conversation.kind === 'group') continue;
    if (conversation.archived_at || conversation.user_archived_at) {
      archived.add(conversation.character_instance_id);
      continue;
    }
    const time = Date.parse(conversation.last_message_at ?? '');
    if (Number.isFinite(time)) recent.set(conversation.character_instance_id, Math.max(recent.get(conversation.character_instance_id) ?? 0, time));
  }
  const affinity: Record<CompanionGender, number> = { female: 0, male: 0, unspecified: 0 };
  const perTemplate = new Map<string, { gender: CompanionGender; weight: number }>();
  for (const character of snapshot.characters) {
    if (archived.has(character.id) && !recent.has(character.id)) continue;
    const relationship = relationships.get(character.id);
    const turns = relationship?.genuine_back_and_forth_turns ?? relationship?.interaction_turn_count ?? relationship?.conversation_count ?? 0;
    if (!Number.isFinite(turns) || turns <= 0) continue;
    const last = recent.get(character.id);
    const freshness = last === undefined ? 0.25 : Math.max(0.1, Math.pow(0.5, Math.max(0, now - last) / (30 * 86400000)));
    const weight = Math.log1p(Math.min(200, turns)) * freshness;
    const id = character.character_template_id;
    if (weight <= (perTemplate.get(id)?.weight ?? 0)) continue;
    perTemplate.set(id, { gender: featuredCompanionGender({ ...character.together_character_templates, together_character_versions: character.together_character_versions }), weight });
  }
  for (const { gender, weight } of perTemplate.values()) affinity[gender] += weight;
  const genders = [...new Set(candidates.map(featuredCompanionGender))];
  const strongest = genders.reduce<CompanionGender | undefined>((best, gender) => best === undefined || affinity[gender] > affinity[best] ? gender : best, undefined);
  const total = Object.values(affinity).reduce((sum, value) => sum + value, 0);
  const share = strongest && total ? affinity[strongest] / total : 0;
  if (strongest && total >= 0.5 && share >= 0.65) {
    const preferred = candidates.filter(item => featuredCompanionGender(item) === strongest);
    const others = candidates.filter(item => featuredCompanionGender(item) !== strongest);
    // Four or five of each six cards reflect a clear preference; keep discovery
    // possible, and fill normally when a world has fewer matching residents.
    const quota = Math.min(5, Math.max(4, Math.round(6 * share)));
    const result: FeaturedCompanion[] = [];
    while (preferred.length || others.length) result.push(...preferred.splice(0, quota), ...others.splice(0, 6 - quota));
    return result;
  }
  // A mixed or new account shouldn't get six men merely because names sort first.
  const buckets = genders.map(gender => candidates.filter(item => featuredCompanionGender(item) === gender));
  const result: FeaturedCompanion[] = [];
  while (buckets.some(bucket => bucket.length)) for (const bucket of buckets) {
    const next = bucket.shift();
    if (next) result.push(next);
  }
  return result;
}
