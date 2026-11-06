// Explicit production release smoke. All visitors, plans and groups belong to one
// disposable marked account. This never sends messages or buys photos or video.
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadWorldHomes,worldHomeCounts} from './world-home-catalog.mjs';
const ref='mfysnlghlhxxcwnwpxog',base='https://'+ref+'.supabase.co';
const keys=JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const anon=keys.find(k=>k.name==='anon').api_key,opt={auth:{persistSession:false,autoRefreshToken:false}},db=createClient(base,keys.find(k=>k.name==='service_role').api_key,opt),client=createClient(base,anon,opt);
let userId,token,continuity;
const staged=process.argv.includes('--staged');
async function ok(q){const r=await q;if(r.error)throw Error(r.error.message);return r.data;}
async function edge(name,input,expected=200){const r=await fetch(base+'/functions/v1/together-'+name,{method:'POST',headers:{apikey:anon,authorization:'Bearer '+token,'Content-Type':'application/json','x-kivelle-client-surface':'web'},body:JSON.stringify(input),signal:AbortSignal.timeout(90000)});const j=await r.json();if(expected===null)return {status:r.status,...j};assert.equal(r.status,expected,name+': '+JSON.stringify(j.error));return j.data;}
async function schedule(req){
 for(let n=0;n<12;n++){
  const attempt={...req,startsAt:new Date(Date.parse(req.startsAt)+n*7200000).toISOString(),requestId:randomUUID()};
  const result=await edge('plan',attempt,null);if(result.status===201)return result.data;
  if(!['COMPANION_BUSY','LOCATION_CLOSED','PLAN_CONFLICT'].includes(result.error?.code))throw Error('Scheduling: '+JSON.stringify(result.error));
 }
 throw Error('No mutual opening in the next 24 hours');
}
async function resident(home){
 const h=await ok(db.from('together_character_homes').select('character_version_id,world_id,approved_artwork_id,version:together_character_versions(character_template_id)').eq('id',home.homeId).single());
 const tid=h.version.character_template_id;
 let inst=await ok(db.from('together_character_instances').select('id').eq('user_id',userId).eq('character_template_id',tid).maybeSingle());
 if(!inst)inst=await ok(db.from('together_character_instances').insert({user_id:userId,continuity_id:continuity,character_template_id:tid,character_version_id:h.character_version_id,contact_added_at:new Date().toISOString()}).select('id').single());
 await ok(db.from('together_relationship_states').upsert({user_id:userId,character_instance_id:inst.id,affinity:100,familiarity:100,active_major_conflict:false}));
 return {...h,instanceId:inst.id};
}
try{
 const email='world-home-smoke-'+randomUUID()+'@kivelli.invalid',password=randomUUID()+'a1!';
 const created=await ok(db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{kivelli_release_test:true}}));userId=created.user.id;
 token=(await ok(client.auth.signInWithPassword({email,password}))).session.access_token;
 await edge('bootstrap',{action:'confirm_age',ageConfirmed:true,dateOfBirth:'1990-01-01',displayName:'Home release check'},201);
 const first=(await loadWorldHomes('juniper-city'))[0];
 const t=await ok(db.from('together_character_templates').select('id').eq('slug',first.slug).single());
 await edge('bootstrap',{action:'complete_onboarding',ageConfirmed:true,displayName:'Home release check',characterTemplateId:t.id,experienceTimezone:'America/New_York'},201);
 continuity=(await ok(db.from('together_character_instances').select('continuity_id').eq('user_id',userId).eq('character_template_id',t.id).single())).continuity_id;
 await ok(db.from('together_entitlements').upsert({user_id:userId,tier:'kivelle_max'}));
 let n=0;
 for(const w of Object.keys(worldHomeCounts)){
  const roster=await loadWorldHomes(w),home=roster.find(h=>h.slug==='willa-night')??roster[0],host=await resident(home);
  if(staged){
    for(const action of ['home_detail','home_planning']){
      const res=await edge('place',{action,characterInstanceId:host.instanceId},null);
      assert.equal(res.status,404,w+' staged '+action);assert.equal(res.error?.code,'NOT_FOUND');
    }
    console.log('PASS '+w+': staged home cannot be viewed or provisioned');continue;
  }
  const detail=(await edge('place',{action:'home_detail',characterInstanceId:host.instanceId})).home;
  assert.equal(detail.id,home.homeId);assert.equal(detail.name,home.name);assert.equal(detail.description,home.description);assert.deepEqual(detail.possible_activities,home.activities);assert.deepEqual(detail.personal_details.map(x=>x.description),home.details);assert.ok(detail.image_url&&detail.thumbnail_url!==detail.image_url);
  const lookup={action:'home_planning',characterInstanceId:host.instanceId},place=(await edge('place',lookup)).place;
  assert.equal((await edge('place',lookup)).place.id,place.id);assert.equal(place.owner_user_id,userId);assert.equal(place.character_home_id,home.homeId);
  assert.ok(place.canonical_visual_context?.canonicalPrompt?.includes(home.windowOutlook));assert.doesNotMatch(place.canonical_visual_context.canonicalPrompt,/No people|architectural photograph/);
  const reference=await ok(db.from('together_media_reference_assets').select('storage_path,metadata').eq('location_id',place.id).eq('active',true).eq('asset_role','location_canonical').single());
  assert.ok(detail.image_url.endsWith('/'+reference.storage_path));assert.equal(reference.metadata.artworkId,host.approved_artwork_id);
  const when=new Date(Date.now()+86400000+n*7200000).toISOString(),activity=home.activities.find(s=>!['Have a drink','Share a snack','Catch up for a while','Spend a quiet evening'].includes(s));
  const req={action:'create',characterInstanceId:host.instanceId,locationId:place.id,activityKey:activity,startsAt:when,source:'manual_planner',durationMinutes:45};
  if(n===0){
   const relationship=values=>ok(db.from('together_relationship_states').update(values).eq('user_id',userId).eq('character_instance_id',host.instanceId));
   await relationship({affinity:0,familiarity:0});
   const declined=await edge('plan',{...req,requestId:randomUUID()},null);assert.equal(declined.error?.code,'HOME_VISIT_DECLINED');
   await ok(db.from('together_memories').insert({user_id:userId,continuity_id:continuity,character_instance_id:host.instanceId,memory_type:'preference',canonical_text:'The user is always welcome at my home.',dedupe_key:'home-test:'+randomUUID(),subject_key:'home-test',importance:1,confidence:1,pinned:true,status:'active',source_type:'manual',learned_via:'direct_user',shareability:'private',metadata:{manual:true,createdInMemoryCenter:true,kind:'core_rule',coreRule:true},content_rating:'safe',visibility_scope:'all',moderation_version:'manual-memory-v1'}));
   await schedule(req);await ok(db.from('together_shared_plans').delete().eq('user_id',userId));
   await relationship({affinity:100,familiarity:100,active_major_conflict:true});
   const conflict=await edge('plan',{...req,requestId:randomUUID()},null);assert.equal(conflict.error?.code,'HOME_VISIT_DECLINED');
   await relationship({active_major_conflict:false});
   console.log('PASS stranger decline, saved invitation and serious conflict');
  }
  const made=await schedule(req),id=made.commitment?.id??made.experience?.plan?.id;
  assert.ok(id);const plan=await ok(db.from('together_shared_plans').select('location_id,activity_key,participant_instance_ids').eq('id',id).eq('user_id',userId).single());assert.equal(plan.location_id,place.id);assert.equal(plan.activity_key,activity.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/(^_|_$)/g,''));assert.deepEqual(plan.participant_instance_ids,[host.instanceId]);
  if(n===0){
   const guest=await resident(roster[1]), group=await ok(db.from('together_conversations').insert({user_id:userId,continuity_id:continuity,character_instance_id:host.instanceId,group_world_id:host.world_id,kind:'group',title:'Home release check'}).select('id').single());
   await ok(db.from('together_conversation_participants').insert([host,guest].map(h=>({user_id:userId,continuity_id:continuity,conversation_id:group.id,character_instance_id:h.instanceId}))));
   const groupPlan=await schedule({...req,startsAt:new Date(Date.parse(when)+86400000).toISOString(),sourceConversationId:group.id});
   const participants=await ok(db.from('together_shared_plans').select('participant_instance_ids').eq('id',groupPlan.commitment?.id??groupPlan.experience?.plan?.id).single());
   assert.deepEqual(new Set(participants.participant_instance_ids),new Set([host.instanceId,guest.instanceId]));console.log('PASS group home visit keeps both participants');
  }
  console.log('PASS '+w+': home detail, private repeat visit, matching media reference, scheduled '+activity);n++;
 }
}finally{
 if(token)await client.auth.signOut({scope:'global'});
 if(userId){
  await ok(db.from('together_character_instances').update({current_location_id:null}).eq('user_id',userId));
  await ok(db.auth.admin.deleteUser(userId));console.log('Removed the isolated home release account.');
 }
}
