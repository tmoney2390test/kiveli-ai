import { describe, expect, it } from 'vitest';
import { XAI_BUILT_IN_VOICES } from '@together/domain';
import {
  EOS_MERIDIAN_ARRIVAL_ID,
  EOS_MERIDIAN_CANONICAL_LORE,
  EOS_MERIDIAN_WORLD_ID,
  eosMeridianCharacterSlugs,
  eosMeridianLocations,
  eosMeridianVoiceAssignments,
  eosMeridianWorld,
} from './eos-meridian';

describe('Eos Meridian playable world', () => {
  it('publishes a complete grounded space-colony world', () => {
    expect(eosMeridianWorld.id).toBe(EOS_MERIDIAN_WORLD_ID);
    expect(eosMeridianWorld.slug).toBe('eos-meridian');
    expect(eosMeridianWorld.name).toBe('Eos Meridian');
    expect(eosMeridianWorld.published).toBe(true);
    expect(eosMeridianWorld.default_arrival_location_id).toBe(EOS_MERIDIAN_ARRIVAL_ID);
    expect(eosMeridianWorld.metadata.locationCount).toBe(54);
    expect(eosMeridianWorld.metadata.districtCount).toBe(6);
    expect(eosMeridianWorld.metadata.residentCompanionCount).toBe(47);
  });

  it('keeps the founding gap, independence charter, and night-side signal canonical', () => {
    expect(EOS_MERIDIAN_CANONICAL_LORE.founding).toContain('thirty-eight years');
    expect(EOS_MERIDIAN_CANONICAL_LORE.charter).toContain('local government');
    expect(EOS_MERIDIAN_CANONICAL_LORE.missingHours).toContain('Seventeen hours');
    expect(EOS_MERIDIAN_CANONICAL_LORE.signal).toContain('night-side ice');
    expect(EOS_MERIDIAN_CANONICAL_LORE.presentSeason).toContain('independence vote');
  });

  it('packages six districts with eight distinct venues each', () => {
    const districts = eosMeridianLocations.filter((location) => location.location_type === 'district');
    const places = eosMeridianLocations.filter((location) => location.parent_location_id);
    expect(eosMeridianLocations).toHaveLength(54);
    expect(districts).toHaveLength(6);
    expect(places).toHaveLength(48);
    expect(districts.map((district) => places.filter((place) => place.parent_location_id === district.id).length)).toEqual([8, 8, 8, 8, 8, 8]);
    expect(eosMeridianLocations.find((location) => location.id === EOS_MERIDIAN_ARRIVAL_ID)?.slug).toBe('meridian-concourse');
  });

  it('keeps every location unique, prompt-ready, and fully authored', () => {
    expect(new Set(eosMeridianLocations.map((location) => location.id)).size).toBe(54);
    expect(new Set(eosMeridianLocations.map((location) => location.slug)).size).toBe(54);
    expect(eosMeridianLocations.every((location) => location.canonical_visual_context?.canonicalPrompt?.includes('Eos Meridian'))).toBe(true);
    expect(eosMeridianLocations.every((location) => location.canonical_lore?.version === 2 && location.canonical_lore.authored === true)).toBe(true);
    expect(eosMeridianLocations.every((location) => location.metadata?.photoStatus === 'ready')).toBe(true);
    expect(eosMeridianLocations.every((location) => location.visual_asset_key === `eos-meridian-location-${location.slug}`)).toBe(true);
  });

  it('declares complete character and location media manifests', () => {
    expect(eosMeridianCharacterSlugs).toHaveLength(47);
    expect(new Set(eosMeridianCharacterSlugs).size).toBe(47);
    expect(eosMeridianLocations.every((location) => location.metadata?.photoStatus === 'ready')).toBe(true);
    expect(eosMeridianLocations.every((location) => location.visual_asset_key === `eos-meridian-location-${location.slug}`)).toBe(true);
  });

  it('assigns every companion a stable supported xAI voice for notes and calls', () => {
    expect(eosMeridianVoiceAssignments).toHaveLength(47);
    expect(new Set(eosMeridianVoiceAssignments.map((item) => item.slug))).toEqual(new Set(eosMeridianCharacterSlugs));
    expect(eosMeridianVoiceAssignments.every((item) => item.voiceKey === `eos-${item.slug}`)).toBe(true);
    expect(eosMeridianVoiceAssignments.every((item) => (XAI_BUILT_IN_VOICES as readonly string[]).includes(item.xaiVoiceId))).toBe(true);
    expect(new Set(eosMeridianVoiceAssignments.map((item) => item.xaiVoiceId)).size).toBe(5);
  });
});
