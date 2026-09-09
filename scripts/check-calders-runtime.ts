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
for(const identity of identities){
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
console.log(JSON.stringify({characters:identities.length,days:7,overlaps:0,gaps:0,travelBlocks,eventBlocks,mode:'read_only'}));
