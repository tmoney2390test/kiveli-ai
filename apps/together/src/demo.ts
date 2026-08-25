import type { Snapshot } from './types';
import { neonKyoLocations, neonKyoWorld } from './worlds/neon-kyo';
import { portVervelleLocations, portVervelleWorld } from './worlds/port-vervelle';
import { vespormoorLocations, vespormoorWorld } from './worlds/vespormoor';
import { northvaleLocations, northvaleWorld } from './worlds/northvale';

const templates = {
  maya: { id:'12000000-0000-4000-8000-000000000001',name:'Maya',slug:'maya' as const,age:26,occupation:'Photographer',biography:'Creative, independent, and always seeing the world through a different lens. Loves live music, sushi, and sunset light.' },
  chloe: { id:'12000000-0000-4000-8000-000000000002',name:'Chloe',slug:'chloe' as const,age:27,occupation:'Designer',biography:'Adventurous, witty, and perceptive. Maya’s closest friend.' },
  alex: { id:'12000000-0000-4000-8000-000000000003',name:'Alex',slug:'alex' as const,age:28,occupation:'Creative Producer',biography:'Thoughtful, curious, and quietly funny.' },
};
const character=(slug:keyof typeof templates,index:number,location:string,activity:string,mood:string)=>({id:`20000000-0000-4000-8000-00000000000${index}`,user_id:'demo',character_template_id:templates[slug].id,character_version_id:`13000000-0000-4000-8000-00000000000${index}`,relationship_stage:slug==='maya'?'flirting':'acquaintance',current_mood:mood,current_activity:activity,current_location_id:location,current_energy:'medium' as const,contact_added_at:slug==='maya'?new Date().toISOString():null,introduced_at:slug==='maya'?new Date().toISOString():null,met_at:'2026-07-23T12:00:00Z',last_simulated_at:new Date().toISOString(),together_character_templates:templates[slug],together_character_versions:{id:`13000000-0000-4000-8000-00000000000${index}`,portrait_asset_key:`${slug}-portrait`,interests:slug==='maya'?['Photography','Movies','Sushi','Live Music','Football']:['Design','Music','City Life'],personality_config:{}}});

export const demoSnapshot={
  discoverableCharacters:[{...templates.maya,character_role:'primary_companion',can_be_selected:true,can_be_romanced:true,together_character_versions:{id:'13000000-0000-4000-8000-000000000001',portrait_asset_key:'maya-portrait',interests:['Photography','Movies','Sushi','Live Music','Football'],personality_config:{}}}],
  profile:{display_name:'Tim',active_companion_instance_id:'20000000-0000-4000-8000-000000000001',interests:['Sports','Movies','Photography'],experience_goals:['Dating','Stories'],memory_categories:{semantic:true,preference:true,episodic:true,relationship:true,emotional:true,open_thread:true}},
  worlds:[{id:'10000000-0000-4000-8000-000000000001',slug:'juniper-city',name:'Juniper City',description:'A city full of people, places, and stories.',access_type:'free',timezone:'America/New_York',sort_order:0,featured:true,published:true,visual_context:{setting:'A contemporary creative city.'},metadata:{}},portVervelleWorld,neonKyoWorld,vespormoorWorld,northvaleWorld],
  locations:[
    {id:'11000000-0000-4000-8000-000000000001',world_id:'10000000-0000-4000-8000-000000000001',location_type:'venue',name:'Juniper Café',slug:'juniper-cafe',description:'A warm neighborhood café.',category:'café',possible_activities:['coffee','open mic']},
    {id:'11000000-0000-4000-8000-000000000002',world_id:'10000000-0000-4000-8000-000000000001',location_type:'residence',name:"Maya's Apartment",slug:'maya-apartment',description:'Maya’s apartment.',category:'home',possible_activities:['rest']},
    {id:'11000000-0000-4000-8000-000000000003',world_id:'10000000-0000-4000-8000-000000000001',location_type:'venue',name:'Skyline Rooftop',slug:'skyline-rooftop',description:'City views after dark.',category:'nightlife',possible_activities:['movie']},
    {id:'11000000-0000-4000-8000-000000000004',world_id:'10000000-0000-4000-8000-000000000001',location_type:'venue',name:'Northside Bar',slug:'northside-bar',description:'Trivia and live music.',category:'nightlife',possible_activities:['trivia']},
    {id:'11000000-0000-4000-8000-000000000005',world_id:'10000000-0000-4000-8000-000000000001',location_type:'outdoor',name:'Riverwalk',slug:'riverwalk',description:'A quiet path beside the river.',category:'outdoors',possible_activities:['walk']},
    {id:'11000000-0000-4000-8000-000000000006',world_id:'10000000-0000-4000-8000-000000000001',location_type:'venue',name:'Photography Studio',slug:'photography-studio',description:'Maya’s creative workspace.',category:'work',possible_activities:['shoot']},
    ...portVervelleLocations,
    ...neonKyoLocations,
    ...vespormoorLocations,
    ...northvaleLocations,
  ],
  characters:[character('maya',1,'11000000-0000-4000-8000-000000000001','having coffee with Chloe','playful'),character('chloe',2,'11000000-0000-4000-8000-000000000003','heading to Skyline Rooftop','adventurous'),character('alex',3,'11000000-0000-4000-8000-000000000005','finishing a photo walk','thoughtful')],
  schedules:[],
  relationships:[{character_instance_id:'20000000-0000-4000-8000-000000000001',trust:38,comfort:35,attraction:40,affinity:42,familiarity:39,respect:44,conflict:0,romantic_interest:32,commitment:4,conversation_count:23,days_known:7,recent_direction:'improving'}],
  relationshipMilestones:[{id:'21000000-0000-4000-8000-000000000001',character_instance_id:'20000000-0000-4000-8000-000000000001',kind:'first_date_invitation',from_stage:'flirting',to_stage:null,status:'pending',title:'Dinner at Juniper?',body:'Maya grins. “You’ve mentioned that place enough times. Are you actually going to take me?”',prompt:'What do you say?',choices:[{id:'accept',label:'Yes—let’s do it',tone:'primary'},{id:'defer',label:'Ask me again later',tone:'secondary'}],created_at:new Date().toISOString()}],
  relationshipCues:{'20000000-0000-4000-8000-000000000001':{label:'There’s a spark',detail:'The warmth between you has a playful romantic edge.',tone:'spark'}},
  memories:[
    {id:'30000000-0000-4000-8000-000000000001',character_instance_id:'20000000-0000-4000-8000-000000000001',memory_type:'semantic',canonical_text:"User's dog is named Cooper.",importance:.86,confidence:.98,pinned:true,status:'active',created_at:'2026-08-02T12:00:00Z',updated_at:'2026-08-02T12:00:00Z'},
    {id:'30000000-0000-4000-8000-000000000002',character_instance_id:'20000000-0000-4000-8000-000000000001',memory_type:'preference',canonical_text:'User dislikes olives.',importance:.7,confidence:.94,pinned:false,status:'active',created_at:'2026-08-03T12:00:00Z',updated_at:'2026-08-03T12:00:00Z'},
    {id:'30000000-0000-4000-8000-000000000003',character_instance_id:'20000000-0000-4000-8000-000000000001',memory_type:'relationship',canonical_text:'Maya calls the user Trouble.',importance:.8,confidence:1,pinned:false,status:'active',created_at:'2026-08-04T12:00:00Z',updated_at:'2026-08-04T12:00:00Z'},
  ],
  openThreads:[{id:'40000000-0000-4000-8000-000000000001',character_instance_id:'20000000-0000-4000-8000-000000000001',topic:'Friday presentation',expected_at:'2026-08-14T12:00:00Z',follow_up_eligible:true}],
  conversations:[{id:'50000000-0000-4000-8000-000000000001',character_instance_id:'20000000-0000-4000-8000-000000000001',kind:'direct',title:'Maya',last_message_at:new Date().toISOString()}],
  sharedPlans:[],
  conversationEvents:[],
  lifeEvents:[{id:'60000000-0000-4000-8000-000000000001',title:'Client cancels shoot',narrative_summary:'A client canceled at the last minute, leaving Maya unexpectedly free.',starts_at:new Date().toISOString()}],
  proactiveMessages:[{id:'70000000-0000-4000-8000-000000000001',content:'You would not believe the client I had today. She wanted “moody, but make it corporate.”',status:'sent'}],
  dates:[{id:'80000000-0000-4000-8000-000000000001',character_instance_id:'20000000-0000-4000-8000-000000000001',status:'unlocked',current_phase:'arrival',phase_index:0,state:{},scheduled_for:'2026-08-15T23:00:00Z',completed_at:null,together_date_templates:{id:'15000000-0000-4000-8000-000000000001',name:'Dinner at Juniper',description:'An intimate dinner.',phases:[{id:'arrival',title:'Arrival',choices:[{id:'ask-day',label:'Ask about her day'},{id:'airport-callback',label:'Tease her about the airport joke'}]},{id:'ordering',title:'Ordering',choices:[{id:'listen-recommendation',label:'Let Maya choose'}]},{id:'early_conversation',title:'Easy Conversation',choices:[{id:'ask-photography',label:'Ask about her photography'}]},{id:'personal_conversation',title:'Something Real',choices:[{id:'listen-carefully',label:'Listen without fixing it'}]},{id:'unexpected_moment',title:'The Spicy Roll',choices:[{id:'order-rescue',label:'Order a rescue drink'}]},{id:'dessert',title:'Dessert',choices:[{id:'share-dessert',label:'Order dessert to share'}]},{id:'after_date',title:'After Dinner',choices:[{id:'riverwalk',label:'Suggest a Riverwalk stroll'}]},{id:'resolution',title:'A New Memory',choices:[]}]} }],
  moments:[{id:'90000000-0000-4000-8000-000000000001',character_instance_id:'20000000-0000-4000-8000-000000000001',title:'Airport Joke',summary:'Maya officially decided your airport navigation skills are hopeless.',occurred_at:'2026-08-03T12:00:00Z',location_id:'11000000-0000-4000-8000-000000000001',participant_instance_ids:['20000000-0000-4000-8000-000000000001'],linked_memory_ids:[],relationship_stage_at_creation:'flirting',moment_type:'memory',media:[{asset:'maya-portrait'}]}],
  entitlements:{tier:'free',entitlement_keys:['maya_relationship','text_basic','memory_basic','city_life','dinner_juniper']},
  notificationPreferences:{push_enabled:false,character_initiated_messages:true,quiet_hours_start:'23:00',quiet_hours_end:'08:00',timezone:'America/New_York'},
} as unknown as Snapshot;
