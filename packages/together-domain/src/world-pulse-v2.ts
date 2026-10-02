/** Global Pulse rules. No account or Life identifier enters this scheduler. */
import type { AroundTownItem } from './world-pulse';
export const WORLD_PULSE_DAILY_MIN = 6;
export const WORLD_PULSE_DAILY_MAX = 8;
export const WORLD_PULSE_TEMPLATES_PER_WORLD = 200;
export const WORLD_PULSE_REPEAT_COOLDOWN_HOURS = 30 * 24;
export const WORLD_PULSE_DISCOVERY_TTL_HOURS = 24;
export const WORLD_PULSE_CONTEXT_HOURS = 7 * 24;

const DAY_MS = 86_400_000;
const COOLDOWN_MS = WORLD_PULSE_REPEAT_COOLDOWN_HOURS * 3_600_000;
const EPOCH_MS = Date.parse('2026-10-01T00:00:00.000Z');
/** Keep the times identical on every 30-day rotation: date alone is insufficient. */
export const WORLD_PULSE_SLOT_MINUTES = [75, 285, 495, 705, 915, 1125, 1275, 1395] as const;
const EIGHT_DAYS = new Set([2, 8, 14, 20, 26]);
const SEVEN_DAYS = new Set([0, 3, 6, 9, 12, 15, 18, 21, 24, 27]);

export type PulseTemplateForSchedule = {
  id: string;
  repeatIdentity: string;
  schedulingRank: number;
  active: boolean;
  participantIds: readonly string[];
  eventType: string;
  locationId: string;
  selectionWeight?: number;
  cooldownDays?: number;
};
export type PulseReservation = { repeatIdentity: string; occurredAt: string; slotKey?: string };
export type PulsePlannedSlot = {
  worldId: string;
  date: string;
  slot: number;
  slotKey: string;
  occurredAt: string;
  templateId: string;
  repeatIdentity: string;
};
export type PulseShortage = { date: string; slot: number; mandatory: boolean; reason: string };

export function worldPulseDailyBudget(dayIndex: number): number {
  const day = ((dayIndex % 30) + 30) % 30;
  return EIGHT_DAYS.has(day) ? 8 : SEVEN_DAYS.has(day) ? 7 : 6;
}

export function worldPulseThirtyDayAllocationFits(budgets: readonly number[], catalogSize: number): boolean {
  return budgets.length === 30 && budgets.every((count) => Number.isInteger(count) && count >= WORLD_PULSE_DAILY_MIN && count <= WORLD_PULSE_DAILY_MAX)
    && budgets.reduce((sum, count) => sum + count, 0) <= catalogSize;
}

export function worldPulseDayIndex(date: string): number {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error(`Invalid UTC date: ${date}`);
  return Math.round((timestamp - EPOCH_MS) / DAY_MS);
}

export function worldPulseSlotTime(date: string, slot: number): string {
  if (!Number.isInteger(slot) || slot < 0 || slot >= WORLD_PULSE_DAILY_MAX) throw new Error('Invalid Pulse slot');
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + WORLD_PULSE_SLOT_MINUTES[slot]! * 60_000).toISOString();
}

export function worldPulseIsDiscoverable(occurredAt: string, serverNow: string): boolean {
  const occurred = Date.parse(occurredAt), now = Date.parse(serverNow);
  return Number.isFinite(occurred) && Number.isFinite(now) && occurred <= now && occurred >= now - WORLD_PULSE_DISCOVERY_TTL_HOURS * 3_600_000;
}

export function worldPulseRepeatEligible(candidateAt: string, repeatIdentity: string, reservations: readonly PulseReservation[], sameSlotKey?: string, cooldownDays = 30): boolean {
  const at = Date.parse(candidateAt);
  if (!Number.isFinite(at)) return false;
  const spacing = Math.max(COOLDOWN_MS, cooldownDays * DAY_MS);
  return reservations.every((item) => item.repeatIdentity !== repeatIdentity || (sameSlotKey && item.slotKey === sameSlotKey) || Math.abs(Date.parse(item.occurredAt) - at) >= spacing);
}

/** Speaker packets are filtered by canonical ID; being in the cast is not omniscience. */
export function knownWorldPulseFacts(facts: unknown, characterTemplateId: string): { id: string; text: string }[] {
  if (!Array.isArray(facts)) return [];
  const entries: unknown[] = facts;
  return entries.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const fact = value as Record<string, unknown>;
    const knowers: unknown = fact['knownByCharacterTemplateIds'];
    if (!Array.isArray(knowers) || !(knowers as unknown[]).includes(characterTemplateId)) return [];
    const id = typeof fact['id'] === 'string' ? fact['id'] : '';
    const text = typeof fact['text'] === 'string' ? fact['text'] : '';
    return id && text ? [{ id, text }] : [];
  });
}

function slotOrdinal(dayOfCycle: number, slot: number): number {
  let result = 0;
  for (let day = 0; day < dayOfCycle; day++) result += worldPulseDailyBudget(day);
  return result + slot;
}

/**
 * Deterministic 30-day inventory assignment. Mandatory slots are considered
 * across the full horizon before optional slots. The same identity keeps the
 * same time in the next rotation, giving exactly 720h between publications.
 * Existing occurrence/reservation timestamps are authoritative after edits.
 */
export function planWorldPulseHorizon(input: {
  worldId: string;
  startDate: string;
  days: number;
  templates: readonly PulseTemplateForSchedule[];
  existing?: readonly PulseReservation[];
}): { slots: PulsePlannedSlot[]; shortages: PulseShortage[]; dailyCounts: Record<string, number>; minimumRepeatHours: number | null } {
  const { worldId, startDate } = input;
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 366) throw new Error('Horizon must be 1–366 days');
  const firstDay = worldPulseDayIndex(startDate);
  const valid = input.templates.filter((template) => template.active && Number.isInteger(template.schedulingRank) && template.schedulingRank >= 0 && template.participantIds.length >= 1 && template.participantIds.length <= 4 && new Set(template.participantIds).size === template.participantIds.length && template.repeatIdentity && template.locationId);
  const identities = new Set(valid.map((template) => template.repeatIdentity));
  if (identities.size !== valid.length) throw new Error('Active templates must have unique repeat identities');
  const ranks = new Set(valid.map((template) => template.schedulingRank));
  if (ranks.size !== valid.length) throw new Error('Active templates must have unique scheduling ranks');
  const byRank = new Map(valid.map((template) => [template.schedulingRank, template]));
  const spare = valid.filter((template) => template.schedulingRank >= WORLD_PULSE_TEMPLATES_PER_WORLD).sort((a,b) => a.schedulingRank-b.schedulingRank);
  const reservations: PulseReservation[] = [...(input.existing ?? [])];
  const slots: PulsePlannedSlot[] = [], shortages: PulseShortage[] = [];
  const tasks: { date: string; dayOfCycle: number; slot: number; mandatory: boolean }[] = [];
  for (let offset = 0; offset < input.days; offset++) {
    const date = new Date(EPOCH_MS + (firstDay + offset) * DAY_MS).toISOString().slice(0, 10);
    const dayOfCycle = ((firstDay + offset) % 30 + 30) % 30;
    for (let slot = 0; slot < worldPulseDailyBudget(dayOfCycle); slot++) tasks.push({ date, dayOfCycle, slot, mandatory: slot < WORLD_PULSE_DAILY_MIN });
  }
  // The canonical 200 positions make baseline and optional slots feasible as
  // one exact cycle. Sort by priority only when looking for spare inventory.
  for (const task of tasks) {
    const slotKey = `world-pulse-v2:${worldId}:${task.date}:${task.slot}`;
    const occurredAt = worldPulseSlotTime(task.date, task.slot);
    const existing = reservations.find((item) => item.slotKey === slotKey);
    if (existing) continue;
    const ordinal = slotOrdinal(task.dayOfCycle, task.slot);
    const preferred = byRank.get(ordinal);
    // Spare inventory may fill a damaged canonical slot. Never consume another
    // position in the first 200: that would steal a future mandatory slot.
    const candidates = preferred ? [preferred, ...spare] : spare;
    const selected = candidates.find((template) => worldPulseRepeatEligible(occurredAt, template.repeatIdentity, reservations, undefined, template.cooldownDays));
    if (!selected) {
      shortages.push({ date: task.date, slot: task.slot, mandatory: task.mandatory, reason: valid.length < WORLD_PULSE_TEMPLATES_PER_WORLD ? 'catalog_below_200_or_cooldown' : 'cooldown_or_reservation_conflict' });
      continue;
    }
    slots.push({ worldId, date: task.date, slot: task.slot, slotKey, occurredAt, templateId: selected.id, repeatIdentity: selected.repeatIdentity });
    reservations.push({ repeatIdentity: selected.repeatIdentity, occurredAt, slotKey });
  }
  const dailyCounts: Record<string, number> = {};
  for (const task of tasks) {
    dailyCounts[task.date] ??= 0;
    const slotKey = `world-pulse-v2:${worldId}:${task.date}:${task.slot}`;
    if (reservations.some((item) => item.slotKey === slotKey && !slots.some((slot) => slot.slotKey === slotKey)))
      dailyCounts[task.date]! += 1;
  }
  for (const slot of slots) dailyCounts[slot.date] = (dailyCounts[slot.date] ?? 0) + 1;
  const byIdentity = new Map<string, number[]>();
  for (const reservation of reservations) {
    const at = Date.parse(reservation.occurredAt);
    if (Number.isFinite(at)) byIdentity.set(reservation.repeatIdentity, [...(byIdentity.get(reservation.repeatIdentity) ?? []), at]);
  }
  let minimumRepeatHours = Infinity;
  for (const times of byIdentity.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) minimumRepeatHours = Math.min(minimumRepeatHours, (times[i]! - times[i - 1]!) / 3_600_000);
  }
  return { slots, shortages, dailyCounts, minimumRepeatHours: Number.isFinite(minimumRepeatHours) ? minimumRepeatHours : null };
}

export type WorldPulseV2Participant = {
  characterTemplateId: string;
  characterInstanceId?: string | null;
  slug: string;
  publicHandle: string | null;
  name: string;
  roleLabel: string;
  primary: boolean;
  ordinal: number;
  available: boolean;
};

export function worldPulsePortraitCellWidth(viewportWidth: number, participantCount: number): number {
  if (!Number.isFinite(viewportWidth) || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > 4) throw new Error('Invalid Pulse portrait layout');
  return Math.max(63, Math.min(146, (Math.min(viewportWidth, 600) - 42 - (participantCount - 1) * 7) / participantCount));
}
export type WorldPulseV2Event = {
  id: string;
  worldId: string;
  templateId: string;
  title: string;
  feedSummary: string;
  eventType: string;
  occurredAt: string;
  endsAt: string;
  significance: number;
  location: { id: string; slug: string; name: string };
  participants: WorldPulseV2Participant[];
};

/** Keep pre-V2 native Home builds safe until they receive the new event route. */
export function worldPulseV2LegacyItems(events: readonly WorldPulseV2Event[]): AroundTownItem[] {
  return events.map((event) => ({
    id: event.id, kind: 'happening_now', title: event.title, summary: event.feedSummary,
    startsAt: event.occurredAt, endsAt: event.endsAt, locationId: event.location.id,
    locationName: event.location.name, locationSlug: event.location.slug,
    participantCharacterInstanceIds: event.participants.flatMap((person) => person.characterInstanceId ? [person.characterInstanceId] : []),
    participantNames: event.participants.map((person) => person.name), action: 'open_place',
    eventType: event.eventType, significance: event.significance,
  }));
}
