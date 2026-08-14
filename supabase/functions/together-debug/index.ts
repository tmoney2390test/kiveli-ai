import { z } from 'zod';
import { authenticated } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot } from '../_shared/together.ts';

const schema = z.object({ action: z.enum(['inspect','adjust_relationship']), characterInstanceId: z.string().uuid().optional(), changes: z.record(z.string(), z.number()).optional() });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const allowed = (Deno.env.get('TOGETHER_DEBUG_USER_IDS') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!allowed.includes(user.id) && user.app_metadata?.together_internal !== true) throw new AppError('FORBIDDEN', 'Internal build access is required.', 403);
  const input = await parseBody(request, schema);
  if (input.action === 'adjust_relationship') {
    if (!input.characterInstanceId || !input.changes) throw new AppError('VALIDATION_FAILED', 'Choose a character and changes.', 400);
    const permitted = ['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'];
    const changes = Object.fromEntries(Object.entries(input.changes).filter(([key]) => permitted.includes(key)).map(([key,value]) => [key, Math.max(0, Math.min(100, Math.round(value)))]));
    const { error } = await db.from('together_relationship_states').update({ ...changes, updated_at: new Date().toISOString() }).eq('character_instance_id', input.characterInstanceId).eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL_ERROR', 'Debug adjustment failed.', 500);
  }
  const snapshot = await buildSnapshot(db, user.id);
  return json({ data: { ...snapshot, aiContext: { note: 'Structured context preview. Credentials and provider secrets are intentionally excluded.' } }, correlationId }, 200, correlationId);
});
