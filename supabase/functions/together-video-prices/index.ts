import { adminClient, serverEnv } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { waitUntil } from '../_shared/background.ts';
import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';
import { monitorVideoPrices } from '../_shared/kivelle-video-prices.ts';

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('NOT_FOUND', 'Unavailable.', 404);
  if (!constantTimeEqual(request.headers.get('x-together-dispatch-secret') ?? '', serverEnv('TOGETHER_MEDIA_DISPATCH_SECRET'))) throw new AppError('FORBIDDEN', 'Authorization required.', 403);
  waitUntil(monitorVideoPrices(adminClient()));
  return json({ data: { queued: true }, correlationId }, 202, correlationId);
});
