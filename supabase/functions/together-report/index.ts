import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const schema = z.object({ messageId: z.string().uuid().optional(), reason: z.enum(['unsafe','harassment','sexual_content','self_harm','impersonation','privacy','other']), detail: z.string().trim().max(1000).default('') });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_report', 15, 86400);
  const input = await parseBody(request, schema);
  if (input.messageId) {
    const { data } = await db.from('together_messages').select('id').eq('id', input.messageId).eq('user_id', user.id).maybeSingle();
    if (!data) throw new AppError('NOT_FOUND', 'That response is no longer available.', 404);
  }
  const { data, error } = await db.from('together_safety_reports').insert({ user_id: user.id, message_id: input.messageId ?? null, reason: input.reason, detail: input.detail }).select('id').single();
  if (error) throw new AppError('INTERNAL_ERROR', 'Could not submit your report.', 500, true);
  await track(db, user.id, 'safety_report_submitted', { reportId: data.id, reason: input.reason });
  return json({ data: { reportId: data.id }, correlationId }, 201, correlationId);
});
