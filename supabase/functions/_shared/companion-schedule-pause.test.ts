import { assertEquals } from 'jsr:@std/assert';
import { resolveCharacterPresence, resolveCompanionPresence, ensureCharacterSchedule } from './together-schedule.ts';
import { activeSnapshotCommitment } from './together.ts';
import { buildCompanionPrompt, preparePromptContext } from './kivelle-intelligence.ts';
import { loadInitiativeSource } from './kivelle-proactive-context.ts';

const now=new Date('2026-09-11T12:00:00Z');
const pause={version:1,pausedAt:'2026-09-10T10:00:00Z',locationId:null,activity:'Reading',activityKey:'reading',interruptibility:'open',state:'relaxing'};
function database({paused=true,plan=false,scene=false,date=false}={}){
  const records:Record<string,Record<string,unknown>[]>= {
    together_character_instances:[{id:'companion',character_version_id:'version',current_location_id:null,current_activity:'Work',current_presence_source:'schedule',schedule_pause:paused?pause:null}],
    together_character_schedule_events:[{id:'shift',starts_at:'2026-09-11T11:00:00Z',ends_at:'2026-09-11T20:00:00Z',activity_key:'work',title:'At work',location_id:null,priority:'hard_obligation',visibility:'known',source:'generated',interruptibility:'busy',generation_key:'shift',metadata:{}}],
    together_shared_plans:plan?[{id:'plan',starts_at:'2026-09-11T11:00:00Z',ends_at:'2026-09-11T13:00:00Z',activity_key:'lunch',title:'Lunch together',location_id:null}]:[],
    together_scene_sessions:scene?[{id:'scene',started_at:'2026-09-11T11:00:00Z',expected_end_at:'2026-09-11T13:00:00Z',location_id:'place',world_id:'world',activity_key:'walk',state:{activityLabel:'Taking a walk'}}]:[],
    together_date_sessions:date?[{id:'date',started_at:'2026-09-11T11:00:00Z',together_date_templates:{name:'A shared activity'}}]:[],
  };
  const calls:Array<[string,string,unknown]>=[];
  const db={from:(table:string)=>{
    const query:Record<string,any>={};let rows=records[table]??[];
    for(const method of ['select','eq','neq','in','not','order','limit','contains','is','lte','gte','gt'])query[method]=(...args:unknown[])=>{calls.push([table,method,args]);if(method==='gt'&&args[0]==='starts_at')rows=[];return query;};
    query.maybeSingle=()=>Promise.resolve({data:rows[0]??null,error:null});
    query.then=(resolve:(value:unknown)=>void)=>Promise.resolve({data:rows,error:null}).then(resolve);
    return query;
  }};
  return {db:db as any,calls};
}
Deno.test('paused routine stays at the captured activity across days',async()=>{
  const {db}=database();const result=await resolveCharacterPresence({db,userId:'owner',characterInstanceId:'companion',now,ensure:false});
  assertEquals(result?.activity,'Reading');assertEquals(result?.nextEvent,undefined);assertEquals(result?.expectedEndAt,undefined);assertEquals(result?.scheduleEventId,undefined);
});
Deno.test('paused schedule does not materialize new routine blocks',async()=>{
  const {db,calls}=database();assertEquals(await ensureCharacterSchedule({db,userId:'owner',characterInstanceId:'companion',now}),[]);
  assertEquals(calls.every(([table])=>table==='together_character_instances'),true);
});
Deno.test('plans, scenes and dates can override a paused routine',async()=>{
  for(const [options,source,activity] of [[{plan:true},'active_plan','Lunch together'],[{scene:true},'scene','Taking a walk'],[{date:true},'active_date','A shared activity']] as const){
    const {db}=database(options);const result=await resolveCompanionPresence({db,userId:'owner',characterInstanceId:'companion',now,ensure:false});
    assertEquals(result?.source,source);assertEquals(result?.activity,activity);
  }
});
Deno.test('resuming resolves current routine instead of the old held activity',async()=>{
  const {db}=database({paused:false});const result=await resolveCharacterPresence({db,userId:'owner',characterInstanceId:'companion',now,ensure:false});
  assertEquals(result?.activity,'At work');assertEquals(result?.source,'schedule');
});
Deno.test('routine capture does not freeze a temporary plan into the hold',async()=>{
  const {db}=database({paused:false,plan:true});const result=await resolveCharacterPresence({db,userId:'owner',characterInstanceId:'companion',now,ensure:false,routineOnly:true});
  assertEquals(result?.activity,'At work');
});

Deno.test('snapshot plans replace held presence only while the commitment is active',()=>{
  const instance={id:'companion',schedule_pause:pause,current_activity:'Reading',current_location_id:'home'};
  const plan={id:'plan',character_instance_id:'companion',status:'scheduled',title:'Lunch together',location_id:'cafe',starts_at:'2026-09-11T11:00:00Z',ends_at:'2026-09-11T13:00:00Z'};
  const active=activeSnapshotCommitment(instance,now,[],[plan]);
  assertEquals(active?.current_location_id,'cafe');assertEquals(active?.current_activity,'Lunch together');assertEquals(active?.schedule_pause,pause);
  assertEquals(activeSnapshotCommitment(instance,new Date('2026-09-11T14:00:00Z'),[],[plan]),null);
  assertEquals(activeSnapshotCommitment(instance,now,[],[{...plan,status:'cancelled'}]),null);
  assertEquals(activeSnapshotCommitment(instance,now,[],[{...plan,character_instance_id:'other'}]),null);
});

Deno.test('schedule hold guidance survives prompt compaction without blocking user plans',()=>{
  const context={character:{name:'Alex',age:30},userMessage:'Hello',currentScene:{schedulePaused:true,activity:'Reading',location:'Library'},memories:[],recent:[]};
  for(const mode of ['full','compact','minimal'] as const){
    const prompt=buildCompanionPrompt(preparePromptContext(context,mode));
    assertEquals(prompt.includes('Routine schedule is paused.'),true);
    assertEquals(prompt.includes('User-led scenes and explicit plans still operate.'),true);
    assertEquals(prompt.includes('Reading'),true);
  }
  assertEquals(buildCompanionPrompt({...context,currentScene:{...context.currentScene,schedulePaused:false}}).includes('Routine schedule is paused.'),false);
});

Deno.test('queued routine messages are suppressed during a hold, without suppressing plan reminders',async()=>{
  const {db,calls}=database();
  for(const proactive of [{character_instance_id:'companion',context:{scheduleEventId:'shift'}},{character_instance_id:'companion',life_event_id:'event'}]){
    assertEquals(await loadInitiativeSource(db,'owner',proactive,now,'UTC'),null);
  }
  assertEquals(calls.some(([table])=>table==='together_character_schedule_events'||table==='together_life_events'),false);
  const plan={title:'Lunch together',status:'scheduled',starts_at:'2026-09-11T11:00:00Z',ends_at:'2026-09-11T13:00:00Z'};
  const query:any={eq:()=>query,contains:()=>query,select:()=>query,maybeSingle:()=>Promise.resolve({data:plan,error:null})};
  const planDb={from:(table:string)=>{assertEquals(table,'together_shared_plans');return query;}} as any;
  assertEquals((await loadInitiativeSource(planDb,'owner',{character_instance_id:'companion',context:{planId:'plan'}},now,'UTC'))?.draft,'Our plan, Lunch together, has started.');
});
