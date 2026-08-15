import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), token: z.string().startsWith('ExponentPushToken[').max(256), platform: z.enum(['ios','android']), deviceId: z.string().max(200).optional() }),
  z.object({ action: z.literal('preferences'), pushEnabled: z.boolean(), characterInitiatedMessages: z.boolean(), dateReminders: z.boolean().default(true), worldEventUpdates: z.boolean().default(true), quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/), quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().min(1).max(80) }),
  z.object({ action: z.literal('opened'), proactiveMessageId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_notifications', 60, 3600);
  const input = await parseBody(request, schema);
  if (input.action === 'register') {
    const { error } = await db.from('together_push_tokens').upsert({ user_id: user.id, expo_push_token: input.token, platform: input.platform, device_id: input.deviceId ?? null, active: true, last_registered_at: new Date().toISOString() }, { onConflict: 'user_id,expo_push_token' });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not register this device.', 500, true);
  } else if (input.action === 'preferences') {
    try{new Intl.DateTimeFormat('en-US',{timeZone:input.timezone}).format(new Date());}catch{throw new AppError('VALIDATION_FAILED','Choose a valid timezone.',400);}
    const { error } = await db.from('together_notification_preferences').upsert({ user_id: user.id, push_enabled: input.pushEnabled, character_initiated_messages: input.characterInitiatedMessages, date_reminders: input.dateReminders, world_event_updates: input.worldEventUpdates, quiet_hours_start: input.quietHoursStart, quiet_hours_end: input.quietHoursEnd, timezone: input.timezone, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not save notification settings.', 500, true);
    await db.from('together_profiles').update({experience_timezone:input.timezone,updated_at:new Date().toISOString()}).eq('user_id',user.id);
    if (!input.characterInitiatedMessages) await db.from('together_proactive_messages').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'queued');
  } else {
    const { data } = await db.from('together_proactive_messages').update({ status: 'opened', updated_at: new Date().toISOString() }).eq('id', input.proactiveMessageId).eq('user_id', user.id).select('id').maybeSingle();
    if (!data) throw new AppError('NOT_FOUND', 'That message is no longer available.', 404);
    await track(db, user.id, 'proactive_message_opened', { proactiveMessageId: input.proactiveMessageId });
  }
  return json({ data: { ok: true }, correlationId }, 200, correlationId);
});
