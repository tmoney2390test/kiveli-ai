import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { resolvePlaceContext } from '../_shared/together-place.ts';

const schema=z.object({locationId:z.string().uuid()});

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_place_detail',180,3600);
  const input=await parseBody(request,schema);
  const place=await resolvePlaceContext({db,locationId:input.locationId,userId:user.id});
  return json({data:{place},correlationId},200,correlationId);
});
