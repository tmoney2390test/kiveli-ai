import type { CharacterTemplate, CharacterVersion, Snapshot } from '../types';
import { characterCatalogForWorld } from './place';

export type FeaturedCompanion = CharacterTemplate & { together_character_versions: CharacterVersion };
export type FeaturedGenderFilter = 'female' | 'male' | 'any';
export type CompanionGender = Exclude<FeaturedGenderFilter, 'any'> | 'unspecified';
export const FEATURED_COMPANION_LIMIT = 10;

export function featuredCompanionsMatchingGender(companions: FeaturedCompanion[], gender: FeaturedGenderFilter = 'any'): FeaturedCompanion[] {
  return companions.filter((companion) => gender === 'any' || featuredCompanionGender(companion) === gender);
}

export function featuredCompanionRail(companions: FeaturedCompanion[], gender: FeaturedGenderFilter = 'any', page = 0): FeaturedCompanion[] {
  const matching = featuredCompanionsMatchingGender(companions, gender);
  const safePage = Math.max(0, Math.min(page, Math.max(0, Math.ceil(matching.length / FEATURED_COMPANION_LIMIT) - 1)));
  const start = safePage * FEATURED_COMPANION_LIMIT;
  return matching.slice(start, start + FEATURED_COMPANION_LIMIT);
}

export function featuredCompanionGender(companion: FeaturedCompanion): CompanionGender {
  const metadataGender = normalizeGenderValue(companion.discovery_metadata?.gender);
  if (metadataGender) return metadataGender;

  const pronounGender = normalizeGenderValue(companion.together_character_versions.pronouns);
  if (pronounGender) return pronounGender;

  const version = companion.together_character_versions;
  return companionGenderFromSignals(
    JSON.stringify(version.appearance_config ?? {}),
    JSON.stringify(version.visual_identity ?? {}),
    companion.biography,
  );
}

export function companionGenderFromSignals(...signals: unknown[]): CompanionGender {
  for (const signal of signals) {
    const explicit = normalizeGenderValue(signal);
    if (explicit) return explicit;
  }

  const descriptiveContext = signals.map((signal) => typeof signal === 'string' ? signal : JSON.stringify(signal ?? '')).join(' ').toLowerCase();

  if (/\b(she|her|woman|women|female|girl)\b/.test(descriptiveContext)) return 'female';
  if (/\b(he|him|man|men|male|boy)\b/.test(descriptiveContext)) return 'male';
  return 'unspecified';
}

export function featuredCompanionsForWorld(snapshot: Snapshot, worldId: string, activeTemplateId?: string): FeaturedCompanion[] {
  const scoped = characterCatalogForWorld(snapshot,worldId)
    .map(({template,version})=>({...template,together_character_versions:version}))
    .sort((left, right) => featuredScore(right) - featuredScore(left) || left.name.localeCompare(right.name));

  const alternatives = scoped.filter((template) => template.id !== activeTemplateId);
  return alternatives.length ? alternatives : scoped;
}

function featuredScore(template: FeaturedCompanion) {
  const metadata = template.discovery_metadata ?? {};
  return Number(metadata.featured === true) * 8
    + Number(metadata.trending === true) * 5
    + Number(metadata.new === true) * 3
    + Number(template.creator_id == null);
}

function normalizeGenderValue(value: unknown): Exclude<CompanionGender, 'unspecified'> | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (/^(female|woman|women|girl|she(?:\s*\/\s*her)?)$/.test(normalized)) return 'female';
  if (/^(male|man|men|boy|he(?:\s*\/\s*him)?)$/.test(normalized)) return 'male';
  return null;
}
