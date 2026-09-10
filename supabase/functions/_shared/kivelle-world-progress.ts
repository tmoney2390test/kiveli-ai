import type { SupabaseClient } from '@supabase/supabase-js';
import { requestRead } from './request-context.ts';
import { activeContinuity } from './together-continuity.ts';
import { AppError } from './types.ts';

export const CALDERS_WORLD_ID='31740169-035e-5b10-8c9d-98b206e9f24b';
type Row=Record<string,any>;
export async function loadWorldProgress(db:SupabaseClient,userId:string,worldId:string,continuityId?:string):Promise<{version:number;state:Row}> {
  const id=continuityId??(await activeContinuity(db,userId)).id;
  const {data,error}=await requestRead(db,['world-progress',userId,id,worldId],()=>db.from('together_world_progress').select('version,state').eq('user_id',userId).eq('continuity_id',id).eq('world_id',worldId).maybeSingle());
  if(error)throw new AppError('INTERNAL_ERROR','Your world progress could not be loaded.',500,true);
  return {version:Number(data?.version??0),state:data?.state??{}};
}
export function locationAccessAllowed(location:Row,flags:string[]=[]):boolean {
  const access=location.access_metadata??{};
  if(access.publicMapVisible!==false&&access.initiallyDiscoverable!==false)return true;
  return typeof access.requiredState==='string'&&flags.includes(access.requiredState);
}
export async function filterAccessibleLocations(db:SupabaseClient,userId:string,locations:Row[]):Promise<Row[]> {
  const gated=locations.filter(location=>!locationAccessAllowed(location));
  if(!gated.length)return locations;
  const worlds=[...new Set(gated.map(location=>String(location.world_id)))];
  const flags=new Map(await Promise.all(worlds.map(async worldId=>[worldId,(await loadWorldProgress(db,userId,worldId)).state.flags??[]] as const)));
  return locations.filter(location=>locationAccessAllowed(location,flags.get(String(location.world_id))??[]));
}
export async function assertLocationAccess(db:SupabaseClient,userId:string|undefined,location:Row):Promise<void> {
  if(locationAccessAllowed(location))return;
  const state=userId?(await loadWorldProgress(db,userId,String(location.world_id))).state:{};
  if(!locationAccessAllowed(location,state.flags??[]))throw new AppError('NOT_FOUND','That place has not been discovered in this story.',404);
}
