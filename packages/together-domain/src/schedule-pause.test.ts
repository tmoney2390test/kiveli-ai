import { describe, expect, it } from 'vitest';
import { pausedCharacterState, scheduleEventAllowedDuringPause, schedulePauseConfirmation, schedulePauseFrom, type SchedulePause } from './schedule-pause';

const pause: SchedulePause = { version:1,pausedAt:'2026-09-11T12:00:00Z',locationId:'cafe',activity:'Reading',activityKey:'reading',interruptibility:'open',state:'relaxing' };
describe('companion schedule pause', () => {
  it('is opt-in and rejects malformed stored state', () => {
    for (const value of [null,undefined,true,{}, {...pause,pausedAt:'invalid'}, {...pause,version:2}]) expect(schedulePauseFrom(value)).toBeNull();
    expect(schedulePauseFrom(pause)).toEqual(pause);
  });
  it('holds routine presence without changing identity, life state, or relationships', () => {
    const character={id:'one',schedule_pause:pause,current_location_id:'work',current_activity:'Working',life_state:'dead',trust:30};
    expect(pausedCharacterState(character)).toMatchObject({current_location_id:'cafe',current_activity:'Reading',current_schedule_event_id:null,life_state:'dead',trust:30});
    expect(character.current_location_id).toBe('work');
    expect(pausedCharacterState({...character,schedule_pause:null}).current_location_id).toBe('work');
  });
  it('keeps explicit plans but excludes automatic routines and extensions', () => {
    expect(scheduleEventAllowedDuringPause({source:'user_plan'})).toBe(true);
    for(const source of ['recurring','generated','override'])expect(scheduleEventAllowedDuringPause({source})).toBe(false);
  });
  it('requires distinct confirmation for both directions', () => {
    expect(schedulePauseConfirmation(false,'Alex').confirmation).toBe('pause_schedule');
    expect(schedulePauseConfirmation(true,'Alex').confirmation).toBe('resume_schedule');
    expect(schedulePauseConfirmation(false,'Alex').message).toContain('Plans and scenes');
    expect(schedulePauseConfirmation(true,'Alex').message).toContain('not be replayed');
  });
});
