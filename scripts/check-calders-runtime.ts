import {createClient} from '@supabase/supabase-js';
import {ensureCalderSchedule} from '../supabase/functions/_shared/kivelle-calders-schedule.ts';
import {resolveCalderPresence} from '../packages/together-domain/src/calders-schedule.ts';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const userId=Deno.env.get('CALDERS_TEST_USER_ID')!,continuityId=Deno.env.get('CALDERS_TEST_CONTINUITY_ID')!;
if(!userId||!continuityId)throw new Error('Set the dedicated test account and continuity IDs.');
const pack=JSON.parse(await Deno.readTextFile('content/calders-run/calders_run_content_pack.json'));
const identities=JSON.parse(await Deno.readTextFile('content/calders-run/production-identity-map.json'));
const now=new Date('2026-09-06T04:00:00Z');
let travelBlocks=0,eventBlocks=0;
for(const identity of (Deno.env.get('CALDERS_TRANSITIONS_ONLY')?[]:identities)){
  const instance={id:crypto.randomUUID(),character_template_id:identity.templateId,character_version_id:identity.versionId,continuity_id:continuityId};
  const blocks=await ensureCalderSchedule({db,userId,instance,timezone:'America/New_York',now,days:7,persist:false});
  if(!blocks.length)throw new Error(`No schedule for ${identity.slug}`);
  const intervals=blocks.map((b,index)=>({id:String(index),start:new Date(b.startsAt).getTime(),end:new Date(b.endsAt).getTime(),locationId:b.locationId,activity:b.title,kind:'baseline' as const,priority:1})).sort((a,b)=>a.start-b.start);
  for(let minute=0;minute<7*1440;minute++){
    const at=now.getTime()+minute*60000,active=intervals.filter(i=>i.start<=at&&i.end>at);
    if(active.length!==1)throw new Error(`${identity.slug}: ${active.length} intervals at minute ${minute}`);
    if(!resolveCalderPresence(intervals,at))throw new Error('Missing current presence');
  }
  const home=pack.homes.find((h:Record<string,unknown>)=>h.ownerCharacterId===identity.templateId);
  if(blocks.some(b=>b.locationId===home.id))throw new Error('A private home became a public location');
  travelBlocks+=blocks.filter(b=>b.activityKey==='travel').length;
  eventBlocks+=blocks.filter(b=>b.metadata?.reservationKind==='event').length;
}
if(!Deno.env.get('CALDERS_TRANSITIONS_ONLY'))console.log(JSON.stringify({characters:identities.length,days:7,overlaps:0,gaps:0,travelBlocks,eventBlocks,mode:'read_only'}));

// Exercise the production resolver against real canon with isolated saved-state fixtures.
const cole=identities.find((i:any)=>i.slug==='cole-hensley');
const instance={id:crypto.randomUUID(),character_template_id:cole.templateId,character_version_id:cole.versionId,continuity_id:continuityId};
function withProgress(state:Record<string,unknown>){
  return new Proxy(db,{get(target,key){
    if(key!=='from')return Reflect.get(target,key);
    return (table:string)=>{
      if(table!=='together_world_progress')return target.from(table);
      const query={select(){return query;},eq(){return query;},maybeSingle(){return Promise.resolve({data:{version:1,state},error:null});}};
      return query;
    };
  }});
}
const current=new Date('2026-09-09T16:00:00Z'),newBase=pack.districts.find((d:any)=>d.slug==='main-street').locationId;
const moved=await ensureCalderSchedule({db:withProgress({transitions:[{kind:'relocation',departingCharacterId:cole.templateId,recordedAt:'2026-09-09T04:00:00Z',locationId:newBase,arcSlug:'the-crowcut-reckoning'}]}),userId,instance,timezone:'America/New_York',now:current,days:2,persist:false});
if(moved.some(b=>Date.parse(b.startsAt)>=current.getTime()&&b.locationId==='cd490e32-1392-5575-91ea-f8d60722de15'))throw new Error('Cole returned to the former hideout after leaving the crew: '+JSON.stringify(moved.filter(b=>Date.parse(b.startsAt)>=current.getTime()&&b.locationId==='cd490e32-1392-5575-91ea-f8d60722de15')));
if(!moved.some(b=>b.activityKey==='sleep'&&b.locationId===newBase&&b.visibility==='hidden'))throw new Error('Relocation lost private sleep at the new base');
const absent=await ensureCalderSchedule({db:withProgress({transitions:[{kind:'absence',departingCharacterId:cole.templateId,recordedAt:'2026-09-09T15:00:00Z',returnAt:'2026-09-09T19:00:00Z',arcSlug:'test-absence'}]}),userId,instance,timezone:'America/New_York',now:current,days:2,persist:false});
const presence=absent.find(b=>Date.parse(b.startsAt)<=current.getTime()&&Date.parse(b.endsAt)>current.getTime());
if(presence?.locationId!==null||presence.interruptibility!=='unavailable')throw new Error('An absent character remained available for an in-person meeting');
const weather=await ensureCalderSchedule({db:withProgress({flags:['weather.severe']}),userId,instance,timezone:'America/New_York',now:current,days:2,persist:false});
if(weather.some(b=>b.activityKey==='travel'))throw new Error('Severe weather still produced a journey');
console.log(JSON.stringify({relocation:'passed',absence:'passed',blockedTravelChain:'passed',productionWrites:0}));

