import { z } from 'zod';
import { adminClient, serverEnv } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { dispatchMediaJobs } from '../_shared/together-media-dispatcher.ts';
// Explicit deployment roots for the async provider graph. Supabase's remote
// bundler currently omits transitive imports from the compact dispatcher
// module, even though Deno resolves them during local typechecking.
import '../_shared/kivelle-subscription.ts';
import '../_shared/together-media-auxiliary.ts';
import '../_shared/together-media-base.ts';
import '../_shared/together-media-finalizer.ts';
import '../_shared/together-media-quality.ts';
import '../_shared/together-media-providers.ts';
import '../../../packages/together-domain/src/media-quality.ts';
import '../_shared/together-place.ts';
import '../_shared/together.ts';
import '../_shared/wavespeed.ts';

const schema=z.object({limit:z.number().int().min(1).max(10).default(3)});

serve(async(request,correlationId)=>{
  const expected=serverEnv('TOGETHER_MEDIA_DISPATCH_SECRET');
  if(request.headers.get('x-together-dispatch-secret')!==expected)throw new AppError('FORBIDDEN','Media dispatch authorization failed.',403);
  const {limit}=await parseBody(request,schema);
  const db=adminClient();
  return json({data:await dispatchMediaJobs(db,limit,correlationId),correlationId},200,correlationId);
});
