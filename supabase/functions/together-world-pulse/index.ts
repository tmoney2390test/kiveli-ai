import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { loadAroundTown } from '../_shared/kivelle-world-pulse.ts';

const querySchema=z.object({worldId:z.string().uuid().optional()});

serve(async(request,correlationId)=>{
  if(request.method!=='GET')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Use GET.',correlationId}},405,correlationId);
  const{user,db}=await authenticated(request);await enforceRateLimit(db,user.id,'together_world_pulse',180,3600);
  const url=new URL(request.url),parsed=querySchema.parse({worldId:url.searchParams.get('worldId')??undefined});
  const continuity=await activeContinuity(db,user.id);if(!continuity)return json({data:{worldId:null,events:[],items:[],generatedAt:new Date().toISOString()},correlationId},200,correlationId);
  let worldId=parsed.worldId;
  if(worldId){const{data:world}=await db.from('together_worlds').select('id').eq('id',worldId).eq('published',true).maybeSingle();if(!world)worldId=undefined;}
  if(!worldId&&continuity.active_companion_instance_id){const{data:instance}=await db.from('together_character_instances').select('current_location_id,together_locations(world_id)').eq('id',continuity.active_companion_instance_id).eq('user_id',user.id).maybeSingle();const location=Array.isArray(instance?.together_locations)?instance.together_locations[0]:instance?.together_locations;worldId=location?.world_id?String(location.world_id):undefined;}
  if(!worldId)return json({data:{worldId:null,events:[],items:[],generatedAt:new Date().toISOString()},correlationId},200,correlationId);
  const{data:profile}=await db.from('together_profiles').select('experience_timezone').eq('user_id',user.id).maybeSingle();
  const timezone=String(profile?.experience_timezone??request.headers.get('x-kivelle-timezone')??'UTC');
  const pulse=await loadAroundTown({db,userId:user.id,continuityId:String(continuity.id),worldId,timezone,limit:8});
  return json({data:{worldId,...pulse,generatedAt:new Date().toISOString()},correlationId},200,correlationId);
});
