import{describe,expect,it}from'vitest';
import{buildPlanSlots,hasPlanConflict,isLocationOpen,recommendPlanOptions}from'./plans';
import type{Location,SharedPlan}from'../types';

const locations:Location[]=[
  {id:'velvet',name:'Velvet Hour',slug:'velvet-hour',description:'Quiet cocktail lounge.',category:'lounge',hours:{open:'17:00',close:'01:00'},possible_activities:['cocktails','music','conversation'],metadata:{tags:['nightlife','romantic'],date_types:['drinks']}},
  {id:'river',name:'Riverwalk',slug:'riverwalk',description:'Path beside the water.',category:'outdoors',possible_activities:['walk','photo walk'],metadata:{tags:['outdoors','quiet']}},
  {id:'bakery',name:'Moss & Crumb',slug:'moss-and-crumb',description:'Tiny bakery.',category:'bakery',hours:{open:'07:00',close:'16:00'},possible_activities:['pastry','coffee']},
  {id:'studio',name:'Photography Studio',slug:'photography-studio',description:'Work.',category:'work',hours:{open:'08:00',close:'19:00'},possible_activities:['editing']},
];
const context={activity:'Editing photos at the studio',mood:'Creative',locationId:'studio',interests:['Photography'],relationshipStage:'friend',hour:14,locations};

describe('native shared-plan recommendations',()=>{
  it('uses the world catalog rather than a fixed global list',()=>{const options=recommendPlanOptions(context);expect(options.some((item)=>item.activityKey==='photo_walk')).toBe(true);expect(options.some((item)=>item.locationId==='studio')).toBe(false);});
  it('keeps a location handoff scoped here',()=>{const options=recommendPlanOptions({...context,scopedLocationId:'velvet'});expect(options.length).toBeGreaterThan(0);expect(options.every((item)=>item.locationId==='velvet')).toBe(true);});
  it('returns global recommendations only after choose elsewhere',()=>{const options=recommendPlanOptions({...context,scopedLocationId:'velvet',chooseElsewhere:true});expect(options.some((item)=>item.locationId!=='velvet')).toBe(true);});
  it('does not let current work location dominate recommendations',()=>{expect(recommendPlanOptions(context)[0]?.locationId).not.toBe('studio');});
});

describe('real scheduling validation',()=>{
  it('only offers future smart slots',()=>{const now=new Date('2026-08-14T20:30:00-04:00');const slots=buildPlanSlots(now);expect(slots.length).toBeGreaterThanOrEqual(2);expect(slots.every((slot)=>new Date(slot.value)>now)).toBe(true);});
  it('moves a suggestion until after a busy companion schedule',()=>{const now=new Date('2026-08-14T12:00:00-04:00');const option=recommendPlanOptions({...context,scopedLocationId:'velvet'})[0]!;const slots=buildPlanSlots({now,option,schedules:[{id:'work',character_version_id:'maya-v1',day_of_week:5,start_minute:540,end_minute:1200,location_id:'studio',activity:'client shoot',availability:'busy',energy_delta:0}],plans:[],dates:[]});expect(new Date(slots[0]!.value).getHours()).toBeGreaterThanOrEqual(20);expect(slots[0]?.reason).toContain('free');});
  it('rejects a bakery after closing',()=>{expect(isLocationOpen(locations[2]!,new Date('2026-08-15T20:00:00-04:00'),60)).toBe(false);});
  it('detects overlapping canonical plans',()=>{const plan={id:'one',character_instance_id:'maya',title:'Rooftop Movie',activity_key:'movie',location_id:'velvet',starts_at:'2026-08-16T00:00:00Z',ends_at:'2026-08-16T02:00:00Z',status:'scheduled',source:'chat',created_at:'2026-08-14T12:00:00Z',updated_at:'2026-08-14T12:00:00Z'}satisfies SharedPlan;expect(hasPlanConflict(new Date('2026-08-16T01:00:00Z'),90,[plan],[])?.title).toBe('Rooftop Movie');});
});
