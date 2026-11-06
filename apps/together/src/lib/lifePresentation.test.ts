import { describe, expect, it } from 'vitest';
import type { CharacterScheduleEvent } from '../types';
import { getScheduleEventPresentation, getScheduleHint } from './lifePresentation';

function event(overrides:Partial<CharacterScheduleEvent>={}):CharacterScheduleEvent{return{
  id:'event',user_id:'user',continuity_id:'life',character_instance_id:'character',location_id:'location',
  activity_key:'occupation_primary',title:'Generic work',starts_at:'2026-08-17T13:00:00.000Z',ends_at:'2026-08-17T21:00:00.000Z',
  priority:'hard_obligation',visibility:'known',source:'recurring',interruptibility:'busy',participant_instance_ids:['character'],
  generation_key:'life_engine_v2:test',generation_version:'life_engine_v2',metadata:{activityLabel:'reviewing a difficult case file',upcomingHint:'Has a precinct briefing later'},created_at:'2026-08-17T00:00:00.000Z',updated_at:'2026-08-17T00:00:00.000Z',...overrides
};}

describe('Life Engine presentation',()=>{
  it('prefers authored current activity presentation',()=>{expect(getScheduleEventPresentation(event()).activity).toBe('Reviewing a difficult case file');});
  it('prefers authored upcoming hints',()=>{expect(getScheduleHint(event())).toBe('Has a precinct briefing later');});
  it('never leaks a hidden event even when metadata contains presentation',()=>{expect(getScheduleHint(event({visibility:'hidden'}))).toBeNull();});
  it('recovers the specific event activity from a stale filler label',()=>{
    const stale=event({title:'Making time for a familiar routine',metadata:{activityLabel:'Making time for a familiar routine',activityVariants:['Reviewing a difficult case file','Making time for a familiar routine']}});
    expect(getScheduleEventPresentation(stale).activity).toBe('Reviewing a difficult case file');
    expect(getScheduleHint(stale)).toBe('Reviewing a difficult case file');
  });
});
