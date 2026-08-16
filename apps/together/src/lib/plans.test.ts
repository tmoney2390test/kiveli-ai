import{describe,expect,it}from'vitest';
import{buildPlanSlots,companionPick,defaultPlanTimeFields,hasPlanConflict,isLocationOpen,localPlanDateValue,parseCustomPlanTime,recommendPlanOptions,resolvePlanDraft}from'./plans';
import type{Location,SharedPlan}from'../types';

const locations=[
  {id:'velvet',name:'Velvet Hour',slug:'velvet-hour',description:'Quiet cocktail lounge.',category:'lounge',hours:{open:'17:00',close:'01:00'},possible_activities:['cocktails','music','conversation'],metadata:{tags:['nightlife','romantic'],date_types:['drinks']}},
  {id:'river',name:'Riverwalk',slug:'riverwalk',description:'Path beside the water.',category:'outdoors',possible_activities:['walk','photo walk'],metadata:{tags:['outdoors','quiet']}},
  {id:'bakery',name:'Moss & Crumb',slug:'moss-and-crumb',description:'Tiny bakery.',category:'bakery',hours:{open:'07:00',close:'16:00'},possible_activities:['pastry','coffee']},
  {id:'arcade',name:'Pixel & Pint',slug:'pixel-and-pint',description:'A loud social arcade.',category:'arcade',hours:{open:'17:00',close:'01:00'},possible_activities:['arcade games','trivia'],metadata:{tags:['games','crowds','playful'],social_energy:'high'}},
  {id:'books',name:'Paper Trail',slug:'paper-trail',description:'A quiet bookstore.',category:'bookstore',hours:{open:'09:00',close:'21:00'},possible_activities:['books','quiet browsing'],metadata:{tags:['books','quiet'],privacy:'quiet'}},
  {id:'studio',name:'Photography Studio',slug:'photography-studio',description:'Work.',category:'work',hours:{open:'08:00',close:'19:00'},possible_activities:['editing']},
] as unknown as Location[];
const context={activity:'Editing photos at the studio',mood:'Creative',locationId:'studio',interests:['Photography'],relationshipStage:'friend',hour:14,locations};

describe('native shared-plan recommendations',()=>{
  it('uses the world catalog rather than a fixed global list',()=>{const options=recommendPlanOptions(context);expect(options.some((item)=>item.activityKey==='photo_walk')).toBe(true);expect(options.some((item)=>item.locationId==='studio')).toBe(false);});
  it('keeps a location handoff scoped here',()=>{const options=recommendPlanOptions({...context,scopedLocationId:'velvet'});expect(options.length).toBeGreaterThan(0);expect(options.every((item)=>item.locationId==='velvet')).toBe(true);});
  it('returns global recommendations only after choose elsewhere',()=>{const options=recommendPlanOptions({...context,scopedLocationId:'velvet',chooseElsewhere:true});expect(options.some((item)=>item.locationId!=='velvet')).toBe(true);});
  it('does not let current work location dominate recommendations',()=>{expect(recommendPlanOptions(context)[0]?.locationId).not.toBe('studio');});
  it('progressively resolves known location and activity without asking for them again',()=>{const result=resolvePlanDraft({companionId:'maya',locationId:'velvet',activityIntent:'drinks',source:'chat',confidence:{location:1,activity:1}},{...context,scopedLocationId:'velvet',schedules:[],plans:[],dates:[]});expect(result.option?.locationId).toBe('velvet');expect(result.missing).not.toContain('location');expect(result.slots[0]?.best).toBe(true);});
  it('uses personality to make companion picks meaningfully different',()=>{const playful=companionPick({...context,personality:{playful:.95},interests:['games']}),thoughtful=companionPick({...context,personality:{thoughtful:.95,homebody:.9},interests:['books']});expect(playful?.locationId).toBe('arcade');expect(thoughtful?.locationId).toBe('books');});
  it('does not rank a crowded activity first when the user dislikes crowds',()=>{const pick=companionPick({...context,userInterests:['games'],preferences:['User dislikes crowds'],personality:{playful:.9}});expect(pick?.locationId).not.toBe('arcade');});
  it('penalizes recently repeated places for something different',()=>{const prior={id:'old',character_instance_id:'maya',title:'Riverwalk',activity_key:'walk',location_id:'river',starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),status:'completed',source:'chat',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}satisfies SharedPlan;expect(recommendPlanOptions({...context,intent:'different',previousPlans:[prior]})[0]?.locationId).not.toBe('river');});
});

describe('real scheduling validation',()=>{
  it('only offers future smart slots',()=>{const now=new Date('2026-08-14T20:30:00-04:00');const slots=buildPlanSlots(now);expect(slots.length).toBeGreaterThanOrEqual(2);expect(slots.every((slot)=>new Date(slot.value)>now)).toBe(true);});
  it('keeps a viable late-evening suggestion on the same local calendar day',()=>{const now=new Date(2026,7,15,22,38);const option=recommendPlanOptions({...context,scopedLocationId:'velvet'})[0]!;const slots=buildPlanSlots({now,option,schedules:[],plans:[],dates:[]});expect(slots[0]).toBeDefined();const first=new Date(slots[0]!.value);expect(localPlanDateValue(first)).toBe(localPlanDateValue(now));expect(first.getTime()).toBeGreaterThan(now.getTime()+10*60000);});
  it('defaults custom planning to the local day and next quarter-hour',()=>{const now=new Date(2026,7,15,22,38);expect(defaultPlanTimeFields(now)).toEqual({date:'2026-08-15',time:'23:15'});expect(localPlanDateValue(now)).toBe('2026-08-15');});
  it('strictly rejects rolled-over custom dates and invalid times',()=>{expect(parseCustomPlanTime('2026-02-30','19:30')).toBeNull();expect(parseCustomPlanTime('2026-08-15','25:00')).toBeNull();expect(parseCustomPlanTime('2026-08-15','23:15')).not.toBeNull();});
  it('moves a suggestion until after a busy companion schedule',()=>{const now=new Date('2026-08-14T12:00:00-04:00');const option=recommendPlanOptions({...context,scopedLocationId:'velvet'})[0]!;const slots=buildPlanSlots({now,option,schedules:[{id:'work',character_version_id:'maya-v1',day_of_week:5,start_minute:540,end_minute:1200,location_id:'studio',activity:'client shoot',availability:'busy',energy_delta:0}],plans:[],dates:[]});expect(new Date(slots[0]!.value).getHours()).toBeGreaterThanOrEqual(20);expect(slots[0]?.reason).toContain('free');});
  it('rejects a bakery after closing',()=>{expect(isLocationOpen(locations[2]!,new Date('2026-08-15T20:00:00-04:00'),60)).toBe(false);});
  it('detects overlapping canonical plans',()=>{const plan={id:'one',character_instance_id:'maya',title:'Rooftop Movie',activity_key:'movie',location_id:'velvet',starts_at:'2026-08-16T00:00:00Z',ends_at:'2026-08-16T02:00:00Z',status:'scheduled',source:'chat',created_at:'2026-08-14T12:00:00Z',updated_at:'2026-08-14T12:00:00Z'}satisfies SharedPlan;expect(hasPlanConflict(new Date('2026-08-16T01:00:00Z'),90,[plan],[])?.title).toBe('Rooftop Movie');});
});
