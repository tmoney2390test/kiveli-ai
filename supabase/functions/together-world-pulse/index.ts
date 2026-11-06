import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { loadAroundTown } from '../_shared/kivelle-world-pulse.ts';
import { isWorldCatalogVisible } from '../../../packages/together-domain/src/world-access.ts';
import { worldPulseV2LegacyItems } from '../../../packages/together-domain/src/world-pulse-v2.ts';
import { loadWorldPulseV2, loadWorldPulseV2Detail, loadWorldPulseV2ConversationLabel, worldPulseV2Enabled, worldPulseV2EnabledForWorld } from '../_shared/kivelle-world-pulse-v2.ts';

const querySchema=z.object({worldId:z.string().uuid().optional(),eventId:z.string().uuid().optional(),conversationId:z.string().uuid().optional()});

serve(async(request,correlationId)=>{
  if(request.method!=='GET')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Use GET.',correlationId}},405,correlationId);
  const{user,db}=await authenticated(request);await enforceRateLimit(db,user.id,'together_world_pulse',180,3600);
  const url=new URL(request.url),parsed=querySchema.parse({worldId:url.searchParams.get('worldId')??undefined,eventId:url.searchParams.get('eventId')??undefined,conversationId:url.searchParams.get('conversationId')??undefined});
  const [continuity,requestedWorld,profileResult]=await Promise.all([
    activeContinuity(db,user.id),
    parsed.worldId?db.from('together_worlds').select('id,published,metadata').eq('id',parsed.worldId).maybeSingle():Promise.resolve(null),
    db.from('together_profiles').select('experience_timezone').eq('user_id',user.id).maybeSingle(),
  ]);
  if(!continuity)return json({data:{worldId:null,events:[],items:[],generatedAt:new Date().toISOString()},correlationId},200,correlationId);
  if(parsed.conversationId){
    const label=worldPulseV2Enabled()?await loadWorldPulseV2ConversationLabel({db,userId:user.id,continuityId:String(continuity.id),conversationId:parsed.conversationId}):null;
    return json({data:{version:2,serverNow:new Date().toISOString(),label},correlationId},200,correlationId);
  }
  if(worldPulseV2Enabled()&&parsed.eventId){
    const detail=await loadWorldPulseV2Detail({db,occurrenceId:parsed.eventId,userId:user.id,continuityId:String(continuity.id)});
    return json({data:detail,correlationId},200,correlationId);
  }
  let worldId=parsed.worldId;
  if(worldId&&(!requestedWorld?.data||!isWorldCatalogVisible(requestedWorld.data)))worldId=undefined;
  if(!worldId&&continuity.active_companion_instance_id){const{data:instance}=await db.from('together_character_instances').select('current_location_id,together_locations(world_id)').eq('id',continuity.active_companion_instance_id).eq('user_id',user.id).maybeSingle();const location=Array.isArray(instance?.together_locations)?instance.together_locations[0]:instance?.together_locations;worldId=location?.world_id?String(location.world_id):undefined;}
  if(worldId&&(!parsed.worldId||worldId!==parsed.worldId||!requestedWorld?.data||!isWorldCatalogVisible(requestedWorld.data))){const{data:world}=await db.from('together_worlds').select('published,metadata').eq('id',worldId).maybeSingle();if(!world||!isWorldCatalogVisible(world))worldId=undefined;}
  if(!worldId)return json({data:{worldId:null,events:[],items:[],generatedAt:new Date().toISOString()},correlationId},200,correlationId);
  if(await worldPulseV2EnabledForWorld(db,worldId)){
    const pulse=await loadWorldPulseV2({db,worldId,userId:user.id,continuityId:String(continuity.id)});
    // Installed native builds predating V2 still read `items` on Home. Keep
    // their Around Town contract while newer clients use the rich V2 events.
    return json({data:{...pulse,items:worldPulseV2LegacyItems(pulse.events)},correlationId},200,correlationId);
  }
  const timezone=String(profileResult.data?.experience_timezone??request.headers.get('x-kivelle-timezone')??'UTC');
  const pulse=await loadAroundTown({db,userId:user.id,continuityId:String(continuity.id),worldId,timezone,limit:8,refreshInBackground:(task)=>{
    const runtime=(globalThis as typeof globalThis&{EdgeRuntime?:{waitUntil:(work:Promise<unknown>)=>void}}).EdgeRuntime;
    if(runtime)runtime.waitUntil(task);
    else void task;
  }});
  return json({data:{worldId,...pulse,generatedAt:new Date().toISOString()},correlationId},200,correlationId);
});
