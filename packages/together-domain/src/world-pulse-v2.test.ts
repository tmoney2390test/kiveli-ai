import { describe, expect, it } from 'vitest';
import {
  planWorldPulseHorizon, worldPulseDailyBudget, worldPulseThirtyDayAllocationFits, worldPulseIsDiscoverable, worldPulsePortraitCellWidth, worldPulseV2LegacyItems, knownWorldPulseFacts,
  worldPulseRepeatEligible, WORLD_PULSE_REPEAT_COOLDOWN_HOURS,
  type PulseTemplateForSchedule,
} from './world-pulse-v2';

const templates = (count: number): PulseTemplateForSchedule[] => Array.from({ length: count }, (_, index) => ({
  id: `template-${index}`, repeatIdentity: `incident-${index}`, schedulingRank: index, active: true,
  participantIds: [`resident-${index % 48}`], eventType: 'community', locationId: `place-${index % 20}`,
}));

describe('pre-V2 native compatibility', () => {
  it('provides the items array and canonical place fields older Home builds read', () => {
    const items = worldPulseV2LegacyItems([{ id: 'event', worldId: 'world', templateId: 'template',
      title: 'The repair ticket that came back twice', feedSummary: 'A water inspection stalled.',
      eventType: 'water', occurredAt: '2026-10-02T01:15:00Z', endsAt: '2026-10-03T01:15:00Z',
      significance: .45, location: { id: 'place', slug: 'solace-reservoir', name: 'Solace Reservoir' },
      participants: [
        { characterTemplateId: 'one', characterInstanceId: 'met-one', slug: 'naomi', publicHandle: null,
          name: 'Naomi', roleLabel: 'Sought a plan', primary: true, ordinal: 0, available: true },
        { characterTemplateId: 'two', characterInstanceId: null, slug: 'zoe', publicHandle: null,
          name: 'Zoe', roleLabel: 'Identified care needs', primary: false, ordinal: 1, available: true },
      ],
    }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'event', kind: 'happening_now', startsAt: '2026-10-02T01:15:00Z',
      locationId: 'place', locationSlug: 'solace-reservoir', locationName: 'Solace Reservoir',
      participantNames: ['Naomi', 'Zoe'], participantCharacterInstanceIds: ['met-one'], action: 'open_place' });
  });
});

describe('global World Pulse rotation', () => {
  it('uses 200 slots in a varied 30-day cycle', () => {
    const budgets = Array.from({ length: 30 }, (_, day) => worldPulseDailyBudget(day));
    expect(budgets.reduce((sum, count) => sum + count, 0)).toBe(200);
    expect(budgets.filter((count) => count === 6)).toHaveLength(15);
    expect(budgets.filter((count) => count === 7)).toHaveLength(10);
    expect(budgets.filter((count) => count === 8)).toHaveLength(5);
    expect(worldPulseThirtyDayAllocationFits(budgets, 200)).toBe(true);
  });

  it('plans 90 days with six, seven, and eight events and exact 720-hour reuse', () => {
    const result = planWorldPulseHorizon({ worldId: 'world', startDate: '2026-10-01', days: 90, templates: templates(200) });
    expect(result.shortages).toEqual([]);
    expect(result.slots).toHaveLength(600);
    expect(new Set(Object.values(result.dailyCounts))).toEqual(new Set([6, 7, 8]));
    expect(result.minimumRepeatHours).toBe(WORLD_PULSE_REPEAT_COOLDOWN_HOURS);
  });

  it('keeps rolling spacing across a 31-day month and leap-day boundary', () => {
    const first = planWorldPulseHorizon({ worldId: 'world', startDate: '2027-01-20', days: 90, templates: templates(200) });
    const leap = planWorldPulseHorizon({ worldId: 'world', startDate: '2028-02-10', days: 90, templates: templates(200) });
    expect(first.shortages).toEqual([]);
    expect(leap.shortages).toEqual([]);
    expect(first.minimumRepeatHours).toBe(720);
    expect(leap.minimumRepeatHours).toBe(720);
  });

  it('rejects an eight-every-day request as beyond 200-template capacity', () => {
    expect(worldPulseThirtyDayAllocationFits(Array(30).fill(8), templates(200).length)).toBe(false);
    const result = planWorldPulseHorizon({ worldId: 'world', startDate: '2026-10-01', days: 90, templates: templates(199) });
    expect(result.shortages.length).toBeGreaterThan(0);
    expect(result.minimumRepeatHours === null || result.minimumRepeatHours >= 720).toBe(true);
  });

  it('does not steal a later mandatory rank to replace a damaged optional slot', () => {
    const damaged = templates(200);
    damaged[20]!.active = false; // day 2's optional eighth position
    const result = planWorldPulseHorizon({ worldId: 'world', startDate: '2026-10-01', days: 30, templates: damaged });
    expect(result.shortages).toEqual([{ date: '2026-10-03', slot: 7, mandatory: false, reason: 'catalog_below_200_or_cooldown' }]);
    expect(result.dailyCounts['2026-10-04']).toBe(7);
    expect(result.dailyCounts['2026-10-05']).toBe(6);
  });

  it('sees future reservations and rejects a shifted slot that would be less than 720 hours away', () => {
    const result = planWorldPulseHorizon({ worldId: 'world', startDate: '2026-10-01', days: 31,
      templates: templates(200), existing: [{ repeatIdentity: 'incident-0',
        occurredAt: '2026-10-31T00:45:00.000Z', slotKey: 'world-pulse-v2:world:2026-10-31:0' }] });
    expect(result.shortages.some((item) => item.date === '2026-10-01' && item.slot === 0)).toBe(true);
    expect(result.slots.some((item) => item.repeatIdentity === 'incident-0' && item.date === '2026-10-01')).toBe(false);
  });

  it('treats exactly 720 hours as eligible, including across cosmetic versions', () => {
    const previous = [{ repeatIdentity: 'same-incident', occurredAt: '2026-10-01T01:15:00.000Z' }];
    expect(worldPulseRepeatEligible('2026-10-31T01:14:59.999Z', 'same-incident', previous)).toBe(false);
    expect(worldPulseRepeatEligible('2026-10-31T01:15:00.000Z', 'same-incident', previous)).toBe(true);
    expect(worldPulseRepeatEligible('2026-10-31T01:15:00.000Z', 'same-incident', previous, undefined, 31)).toBe(false);
  });

  it('shows 23h59m events but no future or expired discovery', () => {
    const now = '2026-10-02T12:00:00.000Z';
    expect(worldPulseIsDiscoverable('2026-10-01T12:01:00.000Z', now)).toBe(true);
    expect(worldPulseIsDiscoverable('2026-10-01T11:59:59.999Z', now)).toBe(false);
    expect(worldPulseIsDiscoverable('2026-10-02T12:00:00.001Z', now)).toBe(false);
  });

  it('keeps hidden facts isolated to the speaker who knows them', () => {
    const facts = [
      { id: 'receipt', text: 'Mina kept the receipt.', userVisible: false, knownByCharacterTemplateIds: ['mina'] },
      { id: 'balance', text: 'The balance was paid.', userVisible: true, knownByCharacterTemplateIds: ['mina','piper'] },
    ];
    expect(knownWorldPulseFacts(facts, 'mina')).toHaveLength(2);
    expect(knownWorldPulseFacts(facts, 'piper')).toEqual([{ id: 'balance', text: 'The balance was paid.' }]);
    expect(knownWorldPulseFacts(facts, 'yuna')).toEqual([]);
  });

  it('keeps four portraits readable in a row on narrow phones', () => {
    for (const width of [320,342,390,430]) {
      const cell = worldPulsePortraitCellWidth(width,4);
      expect(cell).toBeGreaterThanOrEqual(63);
      expect(cell * 4 + 7 * 3).toBeLessThanOrEqual(width - 40);
    }
  });
});
