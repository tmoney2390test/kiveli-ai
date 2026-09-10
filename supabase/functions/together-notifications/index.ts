import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const quietTime=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const initiativeLevel=z.enum(['off','occasional','natural','frequent']);

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), token: z.string().startsWith('ExponentPushToken[').max(256), platform: z.enum(['ios','android']), deviceId: z.string().uuid() }),
  z.object({ action: z.literal('deactivate'), deviceId: z.string().uuid() }),
  z.object({ action: z.literal('preferences'), pushEnabled: z.boolean(), characterInitiatedMessages: z.boolean(), initiativeLevel:initiativeLevel.optional(), companionInitiativePatches:z.record(z.string().uuid(),initiativeLevel.nullable()).refine(value=>Object.keys(value).length<=100).optional(), companionInitiativeLevels:z.record(z.string().uuid(),initiativeLevel).refine((value)=>Object.keys(value).length<=100,'Too many companion initiative overrides.').optional(), dateReminders: z.boolean().default(true), worldEventUpdates: z.boolean().default(true), quietHoursStart: quietTime, quietHoursEnd: quietTime, timezone: z.string().min(1).max(80) }),
  z.object({ action:z.literal('companion_preferences'), characterInstanceId:z.string().uuid(), continuityId:z.string().uuid(), frequency:z.enum(['default','off','occasional','natural','frequent']).optional(), quietHours:z.object({start:quietTime,end:quietTime,timezone:z.string().min(1).max(80),enabled:z.boolean()}).nullable().optional(), applyAllQuietHours:z.boolean().default(false) }),
  z.object({ action: z.literal('opened'), proactiveMessageId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_notifications', 60, 3600);
  const input = await parseBody(request, schema);
  if (input.action === 'register') {
    const now=new Date().toISOString();
    await db.from('together_push_tokens').update({active:false,deactivated_at:now}).eq('installation_id',input.deviceId).neq('user_id',user.id);
    await db.from('together_push_tokens').update({active:false,deactivated_at:now}).eq('expo_push_token',input.token).neq('user_id',user.id);
    const { error } = await db.from('together_push_tokens').upsert({ user_id: user.id, expo_push_token: input.token, platform: input.platform, device_id: input.deviceId, installation_id:input.deviceId,active: true,deactivated_at:null,last_registered_at:now }, { onConflict: 'user_id,expo_push_token' });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not register this device.', 500, true);
  } else if(input.action==='deactivate'){
    const{error}=await db.from('together_push_tokens').update({active:false,deactivated_at:new Date().toISOString()}).eq('user_id',user.id).eq('installation_id',input.deviceId);if(error)throw new AppError('INTERNAL_ERROR','Could not disable notifications on this device.',500,true);
  } else if (input.action === 'companion_preferences') {
    if(input.quietHours){try{new Intl.DateTimeFormat('en-US',{timeZone:input.quietHours.timezone}).format(new Date());}catch{throw new AppError('VALIDATION_FAILED','Choose a valid timezone.',400);}}
    const {data,error}=await db.rpc('kivelle_patch_companion_preferences',{p_user_id:user.id,p_character_id:input.characterInstanceId,p_life_id:input.continuityId,p_patch:{...(input.frequency!==undefined?{frequency:input.frequency}:{}),...(input.quietHours!==undefined?{quietHours:input.quietHours}:{}),applyAllQuietHours:input.applyAllQuietHours}});
    if(error){const paid=error.message.includes('PAID_REQUIRED'),unavailable=error.message.includes('COMPANION_UNAVAILABLE'),invalid=/INVALID_|NEED_DIFFERENT/.test(error.message);throw new AppError(paid||unavailable?'FORBIDDEN':invalid?'VALIDATION_FAILED':'INTERNAL_ERROR',paid?'Proactive messages require Kivelle+.':unavailable?'That companion is unavailable in this Life.':invalid?'Choose valid quiet hours with different start and end times.':'Could not save companion preferences.',paid||unavailable?403:invalid?400:500);}
    return json({data:{ok:true,preferences:data},correlationId},200,correlationId);
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
    const { error } = await db.rpc('kivelle_patch_notification_defaults',{p_user_id:user.id,p_patch:{...input,initiativeLevel:level},p_companion_patch:input.companionInitiativePatches??overrides??{}});
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not save notification settings.', 500, true);
    await db.from('together_profiles').update({experience_timezone:input.timezone,updated_at:new Date().toISOString()}).eq('user_id',user.id);
    await track(db,user.id,'initiative_preferences_updated',{initiativeLevel:level,companionOverrideCount:Object.keys(overrides??{}).length,dateReminders:input.dateReminders});
  } else {
    const { data } = await db.from('together_proactive_messages').update({ status: 'opened', updated_at: new Date().toISOString() }).eq('id', input.proactiveMessageId).eq('user_id', user.id).select('id').maybeSingle();
    if (!data) throw new AppError('NOT_FOUND', 'That message is no longer available.', 404);
    await track(db, user.id, 'proactive_message_opened', { proactiveMessageId: input.proactiveMessageId });
  }
  return json({ data: { ok: true }, correlationId }, 200, correlationId);
});
