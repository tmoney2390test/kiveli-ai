import { z } from 'zod';
import { adminClient, serverEnv } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { dispatchMediaJobs } from '../_shared/together-media-dispatcher.ts';

const schema=z.object({limit:z.number().int().min(1).max(10).default(3)});

serve(async(request,correlationId)=>{
  const expected=serverEnv('TOGETHER_MEDIA_DISPATCH_SECRET');
  if(request.headers.get('x-together-dispatch-secret')!==expected)throw new AppError('FORBIDDEN','Media dispatch authorization failed.',403);
  const {limit}=await parseBody(request,schema);
  const db=adminClient();
  return json({data:await dispatchMediaJobs(db,limit,correlationId),correlationId},200,correlationId);
});
