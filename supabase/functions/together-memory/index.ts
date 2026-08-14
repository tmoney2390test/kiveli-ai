import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), memoryId: z.string().uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('forget'), memoryId: z.string().uuid() }),
  z.object({ action: z.literal('pin'), memoryId: z.string().uuid(), pinned: z.boolean() }),
  z.object({ action: z.literal('preferences'), categories: z.record(z.string(), z.boolean()) }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_memory', 60, 3600);
  const input = await parseBody(request, schema);
  if (input.action === 'preferences') {
    const { error } = await db.from('together_profiles').update({ memory_categories: input.categories, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not update memory preferences.', 500, true);
    return json({ data: { categories: input.categories }, correlationId }, 200, correlationId);
  }
  const patch = input.action === 'edit' ? { canonical_text: input.text, updated_at: new Date().toISOString() } : input.action === 'forget' ? { status: 'forgotten', embedding: null, updated_at: new Date().toISOString() } : { pinned: input.pinned, updated_at: new Date().toISOString() };
  const { data, error } = await db.from('together_memories').update(patch).eq('id', input.memoryId).eq('user_id', user.id).select('*').maybeSingle();
  if (error) throw new AppError('INTERNAL_ERROR', 'Could not update that memory.', 500, true);
  if (!data) throw new AppError('NOT_FOUND', 'That memory no longer exists.', 404);
  await track(db, user.id, input.action === 'forget' ? 'memory_deleted' : input.action === 'edit' ? 'memory_edited' : 'memory_edited', { memoryId: input.memoryId, action: input.action });
  return json({ data, correlationId }, 200, correlationId);
});
