import{describe,expect,it}from'vitest';
import{isLocationPlanDismissalCoolingDown,matchAssistantLocationPlan}from'./location-plan-mention';

const places=[
  {id:'blue',worldId:'vervelle',name:'The Blue Lantern',slug:'blue-lantern',category:'nightlife',activities:['drinks','live music'],dateTypes:['late drinks']},
  {id:'lantern',worldId:'vervelle',name:'Lantern Walk',slug:'lantern-walk',category:'outdoors',activities:['walk']},
  {id:'home',worldId:'vervelle',name:'Home',slug:'home',category:'home',activities:['rest']},
  {id:'studio',worldId:'vervelle',name:'Northlight Studio',slug:'northlight-studio',category:'work',activities:['editing']},
];

describe('assistant location plan mentions',()=>{
  it('turns a canonical character-authored place mention into a plan target',()=>{
    expect(matchAssistantLocationPlan('Meet me at The Blue Lantern after sunset.',places)).toMatchObject({locationId:'blue',activityKey:'late_drinks',locationName:'The Blue Lantern'});
  });
  it('recognizes the location slug as natural words',()=>{
    expect(matchAssistantLocationPlan('I keep thinking about blue lantern.',places)?.locationId).toBe('blue');
  });
  it('recognizes a distinctive shortened venue name and a single typo in an authored alias',()=>{
    const motor={id:'motor',worldId:'juniper',name:'Northline Motor Lodge',slug:'northline-motor-lodge',category:'hotel',activities:['stay'],aliases:['Motor House']};
    expect(matchAssistantLocationPlan('We could meet at the Motor Lodge tonight.',[...places,motor])?.locationId).toBe('motor');
    expect(matchAssistantLocationPlan('Maybe the motor hluse after dark?',[...places,motor])?.locationId).toBe('motor');
  });
  it('uses the longest exact location match',()=>{
    expect(matchAssistantLocationPlan('The Blue Lantern has better music than Lantern Walk.',places)?.locationId).toBe('blue');
  });
  it('does not match partial words',()=>{
    expect(matchAssistantLocationPlan('That blue lanternfish was beautiful.',places)).toBeNull();
  });
  it('does not propose the place where the current conversation is happening',()=>{
    expect(matchAssistantLocationPlan('Meet me at The Blue Lantern after sunset.',places,{excludeLocationIds:['blue']})).toBeNull();
  });
  it('never proposes homes, workplaces, or private locations',()=>{
    expect(matchAssistantLocationPlan('I am at Home and heading to Northlight Studio.',places)).toBeNull();
    expect(matchAssistantLocationPlan('Try the Hidden Room.',[...places,{id:'hidden',name:'Hidden Room',slug:'hidden-room',category:'lounge',activities:['drinks'],private:true}])).toBeNull();
  });
});

describe('dismissed location plan cooldown',()=>{
  const now=new Date('2026-08-22T18:00:00.000Z');
  it('suppresses the same location for 24 hours',()=>{
    expect(isLocationPlanDismissalCoolingDown('blue',[{payload:{locationId:'blue'},updated_at:'2026-08-21T18:00:01.000Z'}],now)).toBe(true);
  });
  it('does not suppress another location or an expired dismissal',()=>{
    expect(isLocationPlanDismissalCoolingDown('lantern',[{payload:{locationId:'blue'},updated_at:'2026-08-22T17:00:00.000Z'}],now)).toBe(false);
    expect(isLocationPlanDismissalCoolingDown('blue',[{payload:{locationId:'blue'},updated_at:'2026-08-21T17:59:59.000Z'}],now)).toBe(false);
  });
  it('ignores invalid or future dismissal timestamps',()=>{
    expect(isLocationPlanDismissalCoolingDown('blue',[{payload:{locationId:'blue'},updated_at:null},{payload:{locationId:'blue'},updated_at:'2026-08-22T18:00:01.000Z'}],now)).toBe(false);
  });
});
