import { z } from 'zod';
import { adminClient } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { parseBody } from '../_shared/body.ts';
import { waitUntil } from '../_shared/background.ts';
import { AppError } from '../_shared/types.ts';
import { isHomeArtworkServiceRequest } from '../_shared/home-artwork-service-auth.ts';
import { approveHomeArtwork, generateHomeArtwork } from '../_shared/character-home-artwork.ts';
import { draftHomeCatalog } from '../_shared/home-catalog-draft.ts';
const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('draft_content'),homeIds:z.array(z.string().uuid()).min(1).max(4),editorialNote:z.string().max(800).optional()}),
  z.object({action:z.literal('generate'), jobId:z.string().uuid()}),
  z.object({action:z.literal('approve'), homeId:z.string().uuid(), artworkId:z.string().uuid()}),
]);
serve(async (request, correlationId) => {
  if (!isHomeArtworkServiceRequest(request, [Deno.env.get('TOGETHER_MEDIA_DISPATCH_SECRET')])) {
    throw new AppError('FORBIDDEN', 'Home artwork dispatch authorization failed.', 403);
  }
  const input = await parseBody(request, schema);
  const db = adminClient();
  if(input.action==='draft_content')return json({data:await draftHomeCatalog(db,input.homeIds,input.editorialNote),correlationId},200,correlationId);
  if (input.action === 'approve') {
    await approveHomeArtwork(db, input.homeId, input.artworkId);
    return json({data:{approved:true},correlationId},200,correlationId);
  }
  const {data:job,error} = await db.from('together_home_artwork').select('id,status').eq('id',input.jobId).maybeSingle();
  if (error || !job) throw new AppError('NOT_FOUND','That artwork job is unavailable.',404);
  // Never requeue failed/finished jobs or create paid work implicitly.
  if (job.status === 'queued') waitUntil(generateHomeArtwork(db, job.id));
  return json({data:{jobId:job.id,status:job.status,started:job.status==='queued'},correlationId},202,correlationId);
});
