import { describe, expect, it } from 'vitest';
import { LAST_NIGHT_IN_VESPORMOOR, assertLastNightContent } from '../../../supabase/functions/_shared/kivelle-stories-content';
import { STORY_LOOP_END_MINUTE, applyStoryAction, initialStoryCampaign, storyCharactersAtLocation, validateStoryDefinition } from './stories';
import { resolveCharacterStoryProfile, resolveLocationStoryProfile } from './story-director';

describe('The Last Night in Vespormoor content pack',()=>{
  it('ships the promised authored depth with valid references',()=>{
    expect(()=>assertLastNightContent()).not.toThrow();
    expect(validateStoryDefinition(LAST_NIGHT_IN_VESPORMOOR)).toEqual([]);
    expect(LAST_NIGHT_IN_VESPORMOOR.evidence).toHaveLength(40);
    expect(LAST_NIGHT_IN_VESPORMOOR.deductions).toHaveLength(5);
    expect(LAST_NIGHT_IN_VESPORMOOR.endings).toHaveLength(4);
    expect(LAST_NIGHT_IN_VESPORMOOR.characters.filter((item)=>item.storyProfile?.participationTier==='core')).toHaveLength(12);
    expect(LAST_NIGHT_IN_VESPORMOOR.knownBaseCharacterIds).toHaveLength(47);
    for(const id of LAST_NIGHT_IN_VESPORMOOR.knownBaseCharacterIds ?? []) expect(resolveCharacterStoryProfile(LAST_NIGHT_IN_VESPORMOOR,id)).not.toBeNull();
    for(const id of LAST_NIGHT_IN_VESPORMOOR.knownBaseLocationIds ?? []) expect(resolveLocationStoryProfile(LAST_NIGHT_IN_VESPORMOOR,id)).not.toBeNull();
    const strategies=LAST_NIGHT_IN_VESPORMOOR.characters.filter((item)=>item.storyProfile?.participationTier==='core').map((item)=>item.storyProfile!.conversationalStrategy);
    expect(new Set(strategies).size).toBe(12);
  });
  it('begins with only canonically scheduled people at the bell tower',()=>{
    const state=initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    const present=storyCharactersAtLocation(LAST_NIGHT_IN_VESPORMOOR,state).map((person)=>person.id);
    expect(present).toContain('elara-vale');
    expect(present).not.toContain('celeste-moreau');
  });
  it('moves Elara canonically when dialogue crosses her 9 PM schedule boundary',()=>{
    const state=initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    state.currentMinute=1259;
    const result=applyStoryAction(LAST_NIGHT_IN_VESPORMOOR,state,{type:'conversation',characterId:'elara-vale',freeformText:'Where will you go next?'});
    expect(result.timeAdvanced).toBe(2);
    expect(result.state.currentMinute).toBe(1261);
    expect(result.presenceTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({type:'departed',characterId:'elara-vale',originLocationId:'bell-tower',destinationLocationId:'black-lantern',storyMinute:1260,activity:'Watching Celeste’s contacts',witnessed:true}),
      expect.objectContaining({type:'arrived',characterId:'elara-vale',originLocationId:'bell-tower',destinationLocationId:'black-lantern',storyMinute:1260,activity:'Watching Celeste’s contacts'}),
    ]));
  });
  it('resolves every participating character across the complete loop window',()=>{
    const state=initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    for(const minute of [1240,1300,1360,1439]){
      state.currentMinute=minute;
      for(const character of LAST_NIGHT_IN_VESPORMOOR.characters){
        expect(resolveCharacterStoryProfile(LAST_NIGHT_IN_VESPORMOOR,character.id)).not.toBeNull();
        expect(character.schedules.some((block)=>minute>=block.startsAt&&minute<block.endsAt)).toBe(true);
      }
    }
  });
  it('supports the first-loop happy path, checkpoint resume, midnight, and persistent knowledge',()=>{
    let state=initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    state=applyStoryAction(LAST_NIGHT_IN_VESPORMOOR,state,{type:'conversation',characterId:'elara-vale',approachId:'elara-token'}).state;
    expect(state.evidenceIds).toEqual(expect.arrayContaining(['token-memory','bell-thirteen']));
    const checkpoint=structuredClone(state);
    state=applyStoryAction(LAST_NIGHT_IN_VESPORMOOR,checkpoint,{type:'travel',locationId:'observatory'}).state;
    state=applyStoryAction(LAST_NIGHT_IN_VESPORMOOR,state,{type:'investigate',interactionId:'read-observatory-panels'}).state;
    expect(state.evidenceIds).toContain('observatory-focus');
    expect(state.evidenceIds).not.toContain('zuri-countdown');
    state=applyStoryAction(LAST_NIGHT_IN_VESPORMOOR,state,{type:'conversation',characterId:'zuri-campbell',approachId:'zuri-countdown'}).state;
    expect(state.evidenceIds).toContain('zuri-countdown');
    state={...state,currentMinute:STORY_LOOP_END_MINUTE,status:'midnight'};
    const reset=applyStoryAction(LAST_NIGHT_IN_VESPORMOOR,state,{type:'reset'}).state;
    expect(reset.currentLoop).toBe(1);
    expect(reset.currentLocationId).toBe('bell-tower');
    expect(reset.evidenceIds).toEqual(expect.arrayContaining(['token-memory','observatory-focus']));
    expect(reset.loopFlags).toEqual([]);
  });
});
