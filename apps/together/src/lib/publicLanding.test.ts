import { describe, expect, it } from 'vitest';
import { PUBLIC_COMPANIONS, PUBLIC_LANDING_COPY, PUBLIC_WORLDS } from './publicLanding';

describe('public landing content', () => {
  it('uses the living-world headline and only the published world roster', () => {
    expect(PUBLIC_LANDING_COPY.title).toBe('Step Into Worlds');
    expect(PUBLIC_LANDING_COPY.titleAccent).toBe('Made for Connection.');
    expect(PUBLIC_WORLDS.map((world) => world.slug)).toEqual([
      'juniper-city',
      'neon-kyo',
      'port-vervelle',
      'vespormoor',
      'northvale',
      'eos-meridian',
    ]);
  });

  it('keeps every featured companion scoped to a published populated world', () => {
    const worldSlugs = new Set(PUBLIC_WORLDS.map((world) => world.slug));
    expect(PUBLIC_COMPANIONS.length).toBe(12);
    expect(PUBLIC_COMPANIONS.every((companion) => worldSlugs.has(companion.worldSlug))).toBe(true);
    expect(PUBLIC_COMPANIONS.map((companion) => companion.worldSlug)).toContain('vespormoor');
    expect(PUBLIC_COMPANIONS.map((companion) => companion.worldSlug)).toContain('northvale');
    expect(PUBLIC_COMPANIONS.map((companion) => companion.worldSlug)).toContain('eos-meridian');
  });
});
