import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { resolvePlaceContext, resolveWorldAccess } from '../_shared/together-place.ts';

const schema=z.object({locationId:z.string().uuid()});

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_place_detail',180,3600);
  const input=await parseBody(request,schema);
  const place=await resolvePlaceContext({db,locationId:input.locationId,userId:user.id});
  const access=await resolveWorldAccess({db,userId:user.id,worldId:place.world.id});
  if(access==='locked'||access==='available')throw new AppError('NOT_FOUND','That place is unavailable.',404);
  return json({data:{place},correlationId},200,correlationId);
});
