import{describe,expect,it}from'vitest';
import{buildPlanSlots,companionPick,defaultPlanTimeFields,hasPlanConflict,isLocationOpen,isVenueProgramTime,localPlanDateValue,nextAvailableGroupPlanTime,parseCustomPlanTime,planOptionCanStartNow,previewPlanTiming,recommendPlanOptions,resolveGroupPlanAvailability,resolvePlanDraft}from'./plans';
import type{CharacterInstance,Location,SharedPlan}from'../types';

const locations=[
  {id:'velvet',name:'Velvet Hour',slug:'velvet-hour',description:'Quiet cocktail lounge.',category:'lounge',hours:{open:'17:00',close:'01:00'},possible_activities:['cocktails','music','conversation'],metadata:{tags:['nightlife','romantic'],date_types:['drinks']}},
  {id:'river',name:'Riverwalk',slug:'riverwalk',description:'Path beside the water.',category:'outdoors',possible_activities:['walk','photo walk'],metadata:{tags:['outdoors','quiet']}},
  {id:'bakery',name:'Moss & Crumb',slug:'moss-and-crumb',description:'Tiny bakery.',category:'bakery',hours:{open:'07:00',close:'16:00'},possible_activities:['pastry','coffee']},
  {id:'arcade',name:'Pixel & Pint',slug:'pixel-and-pint',description:'A loud social arcade.',category:'arcade',hours:{open:'17:00',close:'01:00'},possible_activities:['arcade games','trivia'],metadata:{tags:['games','crowds','playful'],social_energy:'high'}},
  {id:'books',name:'Paper Trail',slug:'paper-trail',description:'A quiet bookstore.',category:'bookstore',hours:{open:'09:00',close:'21:00'},possible_activities:['books','quiet browsing'],metadata:{tags:['books','quiet'],privacy:'quiet'}},
  {id:'studio',name:'Photography Studio',slug:'photography-studio',description:'Work.',category:'work',hours:{open:'08:00',close:'19:00'},possible_activities:['editing']},
] as unknown as Location[];
const context={activity:'Editing photos at the studio',mood:'Creative',locationId:'studio',interests:['Photography'],relationshipStage:'friend',hour:14,locations};

const groupCharacter=(id:string,name:string,version:string)=>({id,user_id:'user',character_template_id:`${id}-template`,character_version_id:version,relationship_stage:'friend',current_mood:'good',current_activity:'relaxing',current_location_id:null,current_energy:'medium',current_interruptibility:'open',contact_added_at:'2026-08-01',introduced_at:'2026-08-01',met_at:'2026-08-01',last_simulated_at:'2026-08-01',together_character_templates:{id:`${id}-template`,name,slug:id,age:26,occupation:'Artist',biography:''},together_character_versions:{id:version,portrait_asset_key:id,interests:[],personality_config:{}}}) as CharacterInstance;

describe('group availability',()=>{
  const aya=groupCharacter('aya','Aya Mori','aya-v1'),chloe=groupCharacter('chloe','Chloe Mercier','chloe-v1');
  it('reports the exact busy companion instead of claiming the whole group is free',()=>{
    const start=new Date(2026,7,24,18,0);
    const result=resolveGroupPlanAvailability({participants:[aya,chloe],start,durationMinutes:90,schedules:[{id:'shift',character_version_id:'chloe-v1',day_of_week:start.getDay(),start_minute:17*60,end_minute:20*60,activity:'evening shift',availability:'busy',energy_delta:-1}],plans:[],dates:[]});
    expect(result.map((item)=>item.state)).toEqual(['free','busy']);
    expect(result[1]?.detail).toContain('8:00 PM');
  });
  it('finds the next half-hour when every companion is free',()=>{
    const after=new Date(Date.now()+20*60000);after.setMinutes(0,0,0);
    const option={id:'river:walk',title:'Walk',description:'',locationId:'river',locationName:'Riverwalk',activityKey:'walk',source:'location_activity' as const,tags:[],durationMinutes:60,reason:'Everyone is free'};
    const first=resolveGroupPlanAvailability({participants:[aya,chloe],start:after,durationMinutes:60,schedules:[{id:'shift',character_version_id:'chloe-v1',day_of_week:after.getDay(),start_minute:after.getHours()*60,end_minute:after.getHours()*60+90,activity:'work',availability:'busy',energy_delta:0}],plans:[],dates:[]});
    expect(first[1]?.available).toBe(false);
    const next=nextAvailableGroupPlanTime({participants:[aya,chloe],after,option,schedules:[{id:'shift',character_version_id:'chloe-v1',day_of_week:after.getDay(),start_minute:after.getHours()*60,end_minute:after.getHours()*60+90,activity:'work',availability:'busy',energy_delta:0}],plans:[],dates:[]});
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThanOrEqual(new Date(after).setHours(after.getHours(),30));
  });
  it('treats Start Now as a passive-schedule override but not a plan conflict',()=>{
    const start=new Date();
    const schedule={id:'shift',character_version_id:'chloe-v1',day_of_week:start.getDay(),start_minute:0,end_minute:1439,activity:'work',availability:'busy' as const,energy_delta:0};
    expect(resolveGroupPlanAvailability({participants:[chloe],start,durationMinutes:60,schedules:[schedule],plans:[],dates:[],immediate:true})[0]).toMatchObject({available:true,state:'free'});
    const conflict={id:'plan',character_instance_id:'chloe',participant_instance_ids:['chloe'],title:'Existing plan',activity_key:'walk',location_id:'river',starts_at:new Date(start.getTime()-60000).toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),status:'active' as const,source:'chat' as const,created_at:start.toISOString(),updated_at:start.toISOString()};
    expect(resolveGroupPlanAvailability({participants:[chloe],start,durationMinutes:60,schedules:[schedule],plans:[conflict],dates:[],immediate:true})[0]).toMatchObject({available:false,state:'conflict'});
  });
  it('ignores active-plan overlap only while replacing the active plan now',()=>{
    const start=new Date();
    const active={id:'active-plan',character_instance_id:'chloe',participant_instance_ids:['chloe'],title:'Movies',activity_key:'movie',location_id:'river',starts_at:new Date(start.getTime()-60000).toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),status:'active' as const,source:'chat' as const,created_at:start.toISOString(),updated_at:start.toISOString()};
    const scheduled={...active,id:'scheduled-plan',title:'Dinner later',status:'scheduled' as const};
    expect(resolveGroupPlanAvailability({participants:[chloe],start,durationMinutes:60,schedules:[],plans:[active],dates:[],immediate:true,replacingActivePlan:true})[0]).toMatchObject({available:true});
    expect(resolveGroupPlanAvailability({participants:[chloe],start,durationMinutes:60,schedules:[],plans:[scheduled],dates:[],immediate:true,replacingActivePlan:true})[0]).toMatchObject({available:false,state:'conflict'});
  });
});

describe('venue programming',()=>{
  const arena={id:'arena',world_id:'juniper',name:'Juniper Civic Arena',slug:'juniper-civic-arena',location_type:'venue',description:'Sports arena',category:'entertainment',hours:{open:'10:00',close:'23:59'},possible_activities:['basketball game'],metadata:{tags:['sports','arena'],event_programs:[{activityKey:'basketball_game',title:'Juniper Flight Basketball',daysOfWeek:[5,6],startTime:'19:30',durationMinutes:150,scheduleNote:'Tipoff is at 7:30 PM.'}]}} as Location;

  it('aligns sports plans to the next canonical event start',()=>{
    const option=recommendPlanOptions({...context,locations:[arena],scopedLocationId:'arena'})[0]!;
    const slots=buildPlanSlots({now:new Date(2026,7,17,10,0),option});
    expect(slots[0]).toBeDefined();
    const start=new Date(slots[0]!.value);
    expect(start.getDay()).toBe(5);
    expect(start.getHours()).toBe(19);
    expect(start.getMinutes()).toBe(30);
    expect(option.durationMinutes).toBe(150);
  });

  it('rejects arbitrary times for a programmed event',()=>{
    const option=recommendPlanOptions({...context,locations:[arena],scopedLocationId:'arena'})[0]!;
    expect(isVenueProgramTime(option,new Date(2026,7,21,19,30))).toBe(true);
    expect(isVenueProgramTime(option,new Date(2026,7,21,21,0))).toBe(false);
  });
});

describe('native shared-plan recommendations',()=>{
  it('uses the world catalog rather than a fixed global list',()=>{const options=recommendPlanOptions(context);expect(options.some((item)=>item.activityKey==='photo_walk')).toBe(true);expect(options.some((item)=>item.locationId==='studio')).toBe(false);});
  it('keeps a location handoff scoped here',()=>{const options=recommendPlanOptions({...context,scopedLocationId:'velvet'});expect(options.length).toBeGreaterThan(0);expect(options.every((item)=>item.locationId==='velvet')).toBe(true);});
  it('returns global recommendations only after choose elsewhere',()=>{const options=recommendPlanOptions({...context,scopedLocationId:'velvet',chooseElsewhere:true});expect(options.some((item)=>item.locationId!=='velvet')).toBe(true);});
  it('never recommends the current chat location, even when a handoff scoped that place',()=>{const options=recommendPlanOptions({...context,excludedLocationId:'river',scopedLocationId:'river'});expect(options.length).toBeGreaterThan(0);expect(options.every((item)=>item.locationId!=='river')).toBe(true);expect(companionPick({...context,excludedLocationId:'river',personality:{outdoorsy:1},interests:['outdoors']})?.locationId).not.toBe('river');});
  it('does not let current work location dominate recommendations',()=>{expect(recommendPlanOptions(context)[0]?.locationId).not.toBe('studio');});
  it('progressively resolves known location and activity without asking for them again',()=>{const result=resolvePlanDraft({companionId:'maya',locationId:'velvet',activityIntent:'drinks',source:'chat',confidence:{location:1,activity:1}},{...context,scopedLocationId:'velvet',schedules:[],plans:[],dates:[]});expect(result.option?.locationId).toBe('velvet');expect(result.missing).not.toContain('location');expect(result.slots[0]?.best).toBe(true);});
  it('uses personality to make companion picks meaningfully different',()=>{const playful=companionPick({...context,personality:{playful:.95},interests:['games']}),thoughtful=companionPick({...context,personality:{thoughtful:.95,homebody:.9},interests:['books']});expect(playful?.locationId).toBe('arcade');expect(thoughtful?.locationId).toBe('books');});
  it('does not rank a crowded activity first when the user dislikes crowds',()=>{const pick=companionPick({...context,userInterests:['games'],preferences:['User dislikes crowds'],personality:{playful:.9}});expect(pick?.locationId).not.toBe('arcade');});
  it('penalizes recently repeated places for something different',()=>{const prior={id:'old',character_instance_id:'maya',title:'Riverwalk',activity_key:'walk',location_id:'river',starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),status:'completed',source:'chat',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}satisfies SharedPlan;expect(recommendPlanOptions({...context,intent:'different',previousPlans:[prior]})[0]?.locationId).not.toBe('river');});
  it('surfaces a canonical happening at its place without inventing a program',()=>{const pulse={id:'pulse',templateId:'template',worldId:'juniper',locationId:'river',districtLocationId:null,title:'River evening',summary:'A community walk is active.',eventType:'community',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),status:'active' as const,knowledgeScope:'public' as const,significance:.9,topicTags:['river'],activityTags:['walk'],participantCharacterInstanceIds:[],planAffordances:{reason:'The Riverwalk has a community evening underway.'}};const first=recommendPlanOptions({...context,worldPulse:[pulse]})[0];expect(first?.locationId).toBe('river');expect(first?.reason).toContain('community evening');});
});

describe('real scheduling validation',()=>{
  it('previews the shared NOW and IN 1 HOUR timing choices without rounding',()=>{const now=new Date('2026-08-20T12:34:56.000Z');expect(previewPlanTiming('now',now).toISOString()).toBe(now.toISOString());expect(previewPlanTiming('in_one_hour',now).toISOString()).toBe('2026-08-20T13:34:56.000Z');});
  it('only offers future smart slots',()=>{const now=new Date('2026-08-14T20:30:00-04:00');const slots=buildPlanSlots(now);expect(slots.length).toBeGreaterThanOrEqual(2);expect(slots.every((slot)=>new Date(slot.value)>now)).toBe(true);});
  it('keeps a viable late-evening suggestion on the same local calendar day',()=>{const now=new Date(2026,7,15,22,38);const option=recommendPlanOptions({...context,scopedLocationId:'velvet'})[0]!;const slots=buildPlanSlots({now,option,schedules:[],plans:[],dates:[]});expect(slots[0]).toBeDefined();const first=new Date(slots[0]!.value);expect(localPlanDateValue(first)).toBe(localPlanDateValue(now));expect(first.getTime()).toBeGreaterThan(now.getTime()+10*60000);});
  it('defaults custom planning to the local day and next quarter-hour',()=>{const now=new Date(2026,7,15,22,38);expect(defaultPlanTimeFields(now)).toEqual({date:'2026-08-15',time:'23:15'});expect(localPlanDateValue(now)).toBe('2026-08-15');});
  it('strictly rejects rolled-over custom dates and invalid times',()=>{expect(parseCustomPlanTime('2026-02-30','19:30')).toBeNull();expect(parseCustomPlanTime('2026-08-15','25:00')).toBeNull();expect(parseCustomPlanTime('2026-08-15','23:15')).not.toBeNull();});
  it('moves a suggestion until after a busy companion schedule',()=>{const now=new Date('2026-08-14T12:00:00-04:00');const option=recommendPlanOptions({...context,scopedLocationId:'velvet'})[0]!;const slots=buildPlanSlots({now,option,schedules:[{id:'work',character_version_id:'maya-v1',day_of_week:5,start_minute:540,end_minute:1200,location_id:'studio',activity:'client shoot',availability:'busy',energy_delta:0}],plans:[],dates:[]});expect(new Date(slots[0]!.value).getHours()).toBeGreaterThanOrEqual(20);expect(slots[0]?.reason).toContain('free');});
  it('rejects a bakery after closing',()=>{expect(isLocationOpen(locations[2]!,new Date('2026-08-15T20:00:00-04:00'),60)).toBe(false);});
  it('only offers switch-now activities that remain open for their full duration',()=>{
    const bakeryOption=recommendPlanOptions({...context,locations:[locations[2]!],scopedLocationId:'bakery'})[0]!;
    expect(planOptionCanStartNow(bakeryOption,new Date('2026-08-15T14:00:00-04:00'),'America/New_York')).toBe(true);
    expect(planOptionCanStartNow(bakeryOption,new Date('2026-08-15T15:30:00-04:00'),'America/New_York')).toBe(false);
    const unknownOption=recommendPlanOptions({...context,locations:[locations[1]!],scopedLocationId:'river'})[0]!;
    expect(planOptionCanStartNow(unknownOption,new Date('2026-08-15T14:00:00-04:00'),'America/New_York')).toBe(false);
  });
  it('detects overlapping canonical plans',()=>{const plan={id:'one',character_instance_id:'maya',title:'Rooftop Movie',activity_key:'movie',location_id:'velvet',starts_at:'2026-08-16T00:00:00Z',ends_at:'2026-08-16T02:00:00Z',status:'scheduled',source:'chat',created_at:'2026-08-14T12:00:00Z',updated_at:'2026-08-14T12:00:00Z'}satisfies SharedPlan;expect(hasPlanConflict(new Date('2026-08-16T01:00:00Z'),90,[plan],[])?.title).toBe('Rooftop Movie');});
});
