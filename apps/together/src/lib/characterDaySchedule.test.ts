import { describe, expect, it } from 'vitest';
import type { CharacterInstance, CharacterScheduleEvent, Snapshot } from '../types';
import { buildCharacterDaySchedule } from './characterDaySchedule';

const instance = { id: 'maya', character_version_id: 'maya-v1' } as CharacterInstance;
const baseEvent: CharacterScheduleEvent = {
  id: 'visible', user_id: 'user', continuity_id: 'life', character_instance_id: 'maya', location_id: 'studio',
  activity_key: 'photo_editing', title: 'Editing photos', starts_at: '2026-08-18T13:00:00.000Z', ends_at: '2026-08-18T15:00:00.000Z',
  priority: 'hard_obligation', visibility: 'known', source: 'generated', interruptibility: 'busy', participant_instance_ids: [],
  generation_key: 'visible', generation_version: '1', metadata: {}, created_at: '2026-08-18T00:00:00.000Z', updated_at: '2026-08-18T00:00:00.000Z',
};
const snapshot = {
  profile: { experience_timezone: 'America/New_York' },
  scheduleEvents: [baseEvent, { ...baseEvent, id: 'private', visibility: 'hidden' }],
  schedules: [],
  locations: [{ id: 'studio', name: 'Photography Studio' }],
} as unknown as Snapshot;

describe('character day schedule', () => {
  it('shows today’s visible generated schedule and removes hidden events', () => {
    const result = buildCharacterDaySchedule({ snapshot, instance, characterVersionId: 'maya-v1', timezone: 'America/New_York', now: new Date('2026-08-18T14:00:00.000Z') });
    expect(result.source).toBe('generated');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'visible', location: 'Photography Studio', current: true, past: false });
  });

  it('falls back to the authored routine when generated events are unavailable', () => {
    const result = buildCharacterDaySchedule({ snapshot: { ...snapshot, scheduleEvents: [], schedules: [{ id: 'routine', character_version_id: 'maya-v1', day_of_week: 2, start_minute: 540, end_minute: 660, location_id: 'studio', activity: 'client_shoot', availability: 'busy', energy_delta: -1 }] }, characterVersionId: 'maya-v1', timezone: 'America/New_York', now: new Date('2026-08-18T14:00:00.000Z') });
    expect(result.entries[0]).toMatchObject({ activity: 'Client shoot', time: '9:00 AM–11:00 AM', current: true });
  });

  it('uses a shared authored timetable instead of a per-user generated day', () => {
    const authoredSnapshot = {
      ...snapshot,
      schedules: [{
        id: 'brooke-home', character_version_id: 'maya-v1', day_of_week: 2, start_minute: 450, end_minute: 510,
        location_id: null, activity: 'starting the day', availability: 'limited', energy_delta: 0,
        metadata: { scheduleMode: 'authored', displayLocation: 'Home', activityVariants: ['Starting slow at home', 'Getting ready for the river shift'] },
      }],
    } as unknown as Snapshot;
    const result = buildCharacterDaySchedule({ snapshot: authoredSnapshot, instance, characterVersionId: 'maya-v1', timezone: 'America/New_York', now: new Date('2026-08-18T12:00:00.000Z') });
    expect(result.source).toBe('authored');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'routine:brooke-home', location: 'Home', time: '7:30 AM–8:30 AM', current: true });
    expect(result.currentStatus?.location).toBe('Home');
    expect(['Starting slow at home', 'Getting ready for the river shift']).toContain(result.entries[0]?.activity);
  });

  it('keeps authored passive presence at home outside the visible timetable', () => {
    const authoredSnapshot = {
      ...snapshot,
      schedules: [{
        id: 'brooke-day', character_version_id: 'maya-v1', day_of_week: 2, start_minute: 450, end_minute: 510,
        location_id: 'studio', activity: 'getting ready', availability: 'limited', energy_delta: 0,
        metadata: { scheduleMode: 'authored', displayLocation: 'Home' },
      }],
    } as unknown as Snapshot;
    const result = buildCharacterDaySchedule({ snapshot: authoredSnapshot, instance, characterVersionId: 'maya-v1', timezone: 'America/New_York', now: new Date('2026-08-18T06:00:00.000Z') });
    expect(result.currentStatus).toEqual({ activity: 'Sleeping at home', location: 'Home' });
  });

  it('uses the viewer clock instead of the character world clock', () => {
    const tokyoSnapshot = {
      ...snapshot,
      schedules: [{
        id: 'mina-overnight', character_version_id: 'maya-v1', day_of_week: 4, start_minute: 0, end_minute: 180,
        location_id: 'studio', activity: 'closing the club sensory systems', availability: 'busy', energy_delta: -2,
        metadata: { scheduleMode: 'authored', activityVariants: ['Closing the club sensory systems after hours'] },
      }],
    } as unknown as Snapshot;
    const result = buildCharacterDaySchedule({
      snapshot: tokyoSnapshot,
      instance,
      characterVersionId: 'maya-v1',
      timezone: 'Asia/Tokyo',
      now: new Date('2026-08-20T16:50:00.000Z'),
    });
    expect(result.entries[0]).toMatchObject({ time: '12:00 AM–3:00 AM', current: false, past: true });
    expect(result.currentStatus).toEqual({ activity: 'Having some downtime at home', location: 'Home' });
  });
});
