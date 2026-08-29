import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';
import { cancelQueuedAmbientProactiveMessages } from '../_shared/kivelle-initiative.ts';

const initiativeLevel=z.enum(['off','occasional','natural','frequent']);

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), token: z.string().startsWith('ExponentPushToken[').max(256), platform: z.enum(['ios','android']), deviceId: z.string().max(200).optional() }),
  z.object({ action: z.literal('deactivate'), platform: z.enum(['ios','android']).optional() }),
  z.object({ action: z.literal('preferences'), pushEnabled: z.boolean(), characterInitiatedMessages: z.boolean(), initiativeLevel:initiativeLevel.optional(), companionInitiativeLevels:z.record(z.string().uuid(),initiativeLevel).refine((value)=>Object.keys(value).length<=100,'Too many companion initiative overrides.').optional(), dateReminders: z.boolean().default(true), worldEventUpdates: z.boolean().default(true), quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/), quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().min(1).max(80) }),
  z.object({ action: z.literal('opened'), proactiveMessageId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_notifications', 60, 3600);
  const input = await parseBody(request, schema);
  if (input.action === 'register') {
    const { error } = await db.from('together_push_tokens').upsert({ user_id: user.id, expo_push_token: input.token, platform: input.platform, device_id: input.deviceId ?? null, active: true, last_registered_at: new Date().toISOString() }, { onConflict: 'user_id,expo_push_token' });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not register this device.', 500, true);
  } else if(input.action==='deactivate'){
    let query=db.from('together_push_tokens').update({active:false}).eq('user_id',user.id);
    if(input.platform)query=query.eq('platform',input.platform);
    const{error}=await query;if(error)throw new AppError('INTERNAL_ERROR','Could not disable notifications on this device.',500,true);
  } else if (input.action === 'preferences') {
    try{new Intl.DateTimeFormat('en-US',{timeZone:input.timezone}).format(new Date());}catch{throw new AppError('VALIDATION_FAILED','Choose a valid timezone.',400);}
    const level=input.initiativeLevel??(input.characterInitiatedMessages?'natural':'off'),overrides=input.companionInitiativeLevels;
    if(overrides){
      const ids=Object.keys(overrides);
      if(ids.length){
        const{data,error}=await db.from('together_character_instances').select('id').eq('user_id',user.id).in('id',ids);
        if(error||(data?.length??0)!==ids.length)throw new AppError('FORBIDDEN','One of those companion preferences is unavailable.',403);
      }
    }
    const { error } = await db.from('together_notification_preferences').upsert({ user_id: user.id, push_enabled: input.pushEnabled, character_initiated_messages: level!=='off',initiative_level:level,...(overrides?{companion_initiative_levels:overrides}:{}), date_reminders: input.dateReminders, world_event_updates: input.worldEventUpdates, quiet_hours_start: input.quietHoursStart, quiet_hours_end: input.quietHoursEnd, timezone: input.timezone, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not save notification settings.', 500, true);
    await db.from('together_profiles').update({experience_timezone:input.timezone,updated_at:new Date().toISOString()}).eq('user_id',user.id);
    if(level==='off')await cancelQueuedAmbientProactiveMessages(db,{userId:user.id,keepCharacterInstanceIds:Object.entries(overrides??{}).filter(([,override])=>override!=='off').map(([id])=>id)});
    else if(overrides){for(const[characterInstanceId,override]of Object.entries(overrides)){if(override==='off')await cancelQueuedAmbientProactiveMessages(db,{userId:user.id,characterInstanceId});}}
    await track(db,user.id,'initiative_preferences_updated',{initiativeLevel:level,companionOverrideCount:Object.keys(overrides??{}).length,dateReminders:input.dateReminders});
  } else {
    const { data } = await db.from('together_proactive_messages').update({ status: 'opened', updated_at: new Date().toISOString() }).eq('id', input.proactiveMessageId).eq('user_id', user.id).select('id').maybeSingle();
    if (!data) throw new AppError('NOT_FOUND', 'That message is no longer available.', 404);
    await track(db, user.id, 'proactive_message_opened', { proactiveMessageId: input.proactiveMessageId });
  }
  return json({ data: { ok: true }, correlationId }, 200, correlationId);
});
