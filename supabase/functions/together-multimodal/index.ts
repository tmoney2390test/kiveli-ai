import { z } from 'zod';
import { normalizeSpeechText, validateUserImage } from '../../../packages/together-domain/src/multimodal.ts';
import { parseBody } from '../_shared/body.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import {
  configuredTextToSpeechProvider,
  configuredVisionProvider,
  normalizeMultimodalPreferences,
  providerCapabilityStatuses,
  resolveCompanionVoiceProfile,
  resolveServerExperienceCapabilities,
} from '../_shared/kivelle-multimodal.ts';
import { activeContinuity, requireInstanceInActiveContinuity } from '../_shared/together-continuity.ts';
import { track } from '../_shared/together.ts';
import { AppError } from '../_shared/types.ts';

const uuid = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('capabilities') }),
  z.object({ action: z.literal('preferences'), userPhotoUploads: z.boolean(), companionVoiceNotes: z.boolean(), autoplayVoiceNotes: z.boolean(), liveVoiceCalls: z.boolean(), generatedPhotos: z.boolean(),generatedVideos:z.boolean().default(true) }),
  z.object({ action: z.literal('prepare_user_image'), conversationId: uuid, characterInstanceId: uuid, mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), byteSize: z.number().int().positive().max(10 * 1024 * 1024), width: z.number().int().positive().max(20_000).optional(), height: z.number().int().positive().max(20_000).optional(), requestId: z.string().trim().min(8).max(120) }),
  z.object({ action: z.literal('confirm_user_image'), attachmentId: uuid }),
  z.object({ action: z.literal('remove_attachment'), attachmentId: uuid }),
  z.object({ action: z.literal('request_voice_note'), messageId: uuid, requestId: z.string().trim().min(8).max(120) }),
  z.object({ action: z.literal('media_status'), mediaId: uuid }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);
  const [{ data: profile },{data:entitlement}] = await Promise.all([db.from('together_profiles').select('multimodal_preferences').eq('user_id', user.id).single(),db.from('together_entitlements').select('entitlement_keys').eq('user_id',user.id).maybeSingle()]);
  const preferences = normalizeMultimodalPreferences(profile?.multimodal_preferences);
  const capabilities=resolveServerExperienceCapabilities(preferences,(entitlement?.entitlement_keys??[]).map(String));

  if (input.action === 'capabilities') {
    return json({ data: capabilities, correlationId }, 200, correlationId);
  }
  if (input.action === 'preferences') {
    const next = {
      userPhotoUploads: input.userPhotoUploads,
      companionVoiceNotes: input.companionVoiceNotes,
      autoplayVoiceNotes: input.autoplayVoiceNotes,
      liveVoiceCalls: input.liveVoiceCalls,
      generatedPhotos: input.generatedPhotos,
      generatedVideos: input.generatedVideos,
    };
    const { error } = await db.from('together_profiles').update({ multimodal_preferences: next, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL_ERROR', 'Media preferences could not be saved.', 500, true);
    await track(db, user.id, 'multimodal_preferences_changed');
    return json({ data: { preferences: next, ...resolveServerExperienceCapabilities(next,(entitlement?.entitlement_keys??[]).map(String)) }, correlationId }, 200, correlationId);
  }

  if (input.action === 'prepare_user_image') {
    if (preferences.userPhotoUploads === false) throw new AppError('FORBIDDEN', 'Photo uploads are turned off in Settings.', 403);
    await enforceRateLimit(db, user.id, 'together_user_photo_upload', 40, 3600);
    await requireInstanceInActiveContinuity(db, user.id, input.characterInstanceId);
    await requireConversation(db, user.id, continuity.id, input.conversationId, input.characterInstanceId);
    const validation = validateUserImage({ mimeType: input.mimeType, byteSize: input.byteSize });
    if (!validation.valid) throw new AppError('VALIDATION_FAILED', validation.message, 422);
    const { data: duplicate } = await db.from('together_conversation_attachments').select('*').eq('user_id', user.id).eq('metadata->>requestId', input.requestId).maybeSingle();
    if (duplicate) return json({ data: await attachmentPayload(db, duplicate), correlationId }, 200, correlationId);
    const attachmentId = crypto.randomUUID();
    const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${user.id}/attachments/${continuity.id}/${attachmentId}.${extension}`;
    const { data, error } = await db.from('together_conversation_attachments').insert({
      id: attachmentId,
      user_id: user.id,
      continuity_id: continuity.id,
      conversation_id: input.conversationId,
      kind: 'image',
      source: 'user',
      storage_path: storagePath,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      width: input.width ?? null,
      height: input.height ?? null,
      upload_status: 'pending',
      analysis_status: 'pending',
      metadata: { requestId: input.requestId, contextVersion: 1 },
    }).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'That photo could not be prepared.', 500, true);
    await track(db, user.id, 'user_photo_attached', { attachmentId: data.id, characterInstanceId: input.characterInstanceId });
    return json({ data: await attachmentPayload(db, data), correlationId }, 201, correlationId);
  }

  if (input.action === 'confirm_user_image') {
    const attachment = await requireAttachment(db, user.id, continuity.id, input.attachmentId);
    const { data: file, error: downloadError } = await db.storage.from('together-user-media').download(String(attachment.storage_path));
    if (downloadError || !file) throw new AppError('VALIDATION_FAILED', 'Finish uploading the photo before sending it.', 422, true);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const actualValidation=validateUserImage({mimeType:String(attachment.mime_type),byteSize:bytes.byteLength});
    if(!actualValidation.valid||!matchesImageSignature(bytes,String(attachment.mime_type))){
      await Promise.all([db.storage.from('together-user-media').remove([String(attachment.storage_path)]),db.from('together_conversation_attachments').update({upload_status:'failed',analysis_status:'failed',analysis_metadata:{validation:'invalid_image_bytes'},updated_at:new Date().toISOString()}).eq('id',attachment.id).eq('user_id',user.id)]);
      throw new AppError('VALIDATION_FAILED','That file is not a supported image.',422);
    }
    const provider = configuredVisionProvider();
    if (!provider) {
      const { data } = await db.from('together_conversation_attachments').update({ byte_size:bytes.byteLength,upload_status: 'uploaded', analysis_status: 'unavailable', analysis_metadata: { providerStatus: 'not_configured' }, updated_at: new Date().toISOString() }).eq('id', attachment.id).eq('user_id', user.id).select('*').single();
      return json({ data: await attachmentPayload(db, data ?? attachment), correlationId }, 200, correlationId);
    }
    await db.from('together_conversation_attachments').update({ byte_size:bytes.byteLength,upload_status: 'uploaded', analysis_status: 'processing', updated_at: new Date().toISOString() }).eq('id', attachment.id).eq('user_id', user.id);
    try {
      const result = await provider.analyze({ bytes, contentType: String(attachment.mime_type) });
      const { data } = await db.from('together_conversation_attachments').update({ analysis_status: 'ready', analysis_metadata: { ...result, provider: provider.id, contextVersion: 1 }, updated_at: new Date().toISOString() }).eq('id', attachment.id).eq('user_id', user.id).select('*').single();
      await track(db, user.id, 'user_photo_analysis_ready', { attachmentId: attachment.id });
      return json({ data: await attachmentPayload(db, data ?? attachment), correlationId }, 200, correlationId);
    } catch (error) {
      const { data } = await db.from('together_conversation_attachments').update({ analysis_status: 'failed', analysis_metadata: { provider: provider.id, error: error instanceof Error ? error.name : 'unknown' }, updated_at: new Date().toISOString() }).eq('id', attachment.id).eq('user_id', user.id).select('*').single();
      return json({ data: await attachmentPayload(db, data ?? attachment), warning: "This image couldn't be analyzed, but it can still be sent.", correlationId }, 200, correlationId);
    }
  }

  if (input.action === 'remove_attachment') {
    const attachment = await requireAttachment(db, user.id, continuity.id, input.attachmentId);
    if (attachment.message_id) throw new AppError('CONFLICT', 'Sent photos remain part of the conversation.', 409);
    await db.from('together_conversation_attachments').delete().eq('id', attachment.id).eq('user_id', user.id);
    if (attachment.storage_path) await db.storage.from('together-user-media').remove([String(attachment.storage_path)]);
    return json({ data: { removed: true }, correlationId }, 200, correlationId);
  }

  if (input.action === 'request_voice_note') {
    if (preferences.companionVoiceNotes === false) throw new AppError('FORBIDDEN', 'Voice notes are turned off in Settings.', 403);
    if(!capabilities.experience.voiceNotes)throw new AppError('PLAN_LIMIT_REACHED','Voice notes are available with Kivelle+.',403);
    await enforceRateLimit(db, user.id, 'together_voice_note_request', 30, 3600);
    const { data: message } = await db.from('together_messages').select('*,together_conversations!inner(id,continuity_id,character_instance_id,user_id)').eq('id', input.messageId).eq('user_id', user.id).eq('role', 'assistant').maybeSingle();
    const conversation = message?.together_conversations as Record<string, unknown> | undefined;
    if (!message || String(conversation?.continuity_id) !== continuity.id) throw new AppError('NOT_FOUND', 'That companion message is unavailable.', 404);
    const characterInstanceId = String(message.speaker_character_instance_id ?? message.character_instance_id ?? conversation?.character_instance_id ?? '');
    await requireInstanceInActiveContinuity(db, user.id, characterInstanceId);
    const requestKey = `voice-note:${message.id}:${input.requestId}`;
    const { data: duplicate } = await db.from('together_generated_media').select('*').eq('user_id', user.id).eq('request_key', requestKey).maybeSingle();
    if (duplicate) return json({ data: await mediaPayload(db, duplicate), correlationId }, 200, correlationId);
    const provider = configuredTextToSpeechProvider();
    if (!provider) return json({ data: { status: 'not_configured', providerStatus: 'not_configured', message: "Voice isn't connected yet." }, correlationId }, 200, correlationId);
    const voice = await resolveCompanionVoiceProfile(db, characterInstanceId);
    const mediaId = crypto.randomUUID();
    const canonicalText = String(message.content ?? '').trim();
    if (!canonicalText) throw new AppError('VALIDATION_FAILED', 'There is no spoken message to play.', 422);
    const { data: media, error: mediaError } = await db.from('together_generated_media').insert({
      id: mediaId, user_id: user.id, continuity_id: continuity.id, character_instance_id: characterInstanceId,
      conversation_id: conversation?.id, message_id: message.id, media_type: 'voice_note', status: 'generating',
      request_key: requestKey, provider: provider.id, canonical_text: canonicalText,
      metadata: { source: 'assistant_message', voiceKey: voice.voiceKey, contextVersion: 1 },
    }).select('*').single();
    if (mediaError || !media) throw new AppError('INTERNAL_ERROR', 'The voice note could not be started.', 500, true);
    try {
      const result = await provider.synthesize({ text: normalizeSpeechText(canonicalText), voice });
      const extension = result.contentType.includes('mpeg') ? 'mp3' : 'wav';
      const storagePath = `${user.id}/voice-notes/${continuity.id}/${mediaId}.${extension}`;
      const { error: uploadError } = await db.storage.from('together-user-media').upload(storagePath, result.bytes, { contentType: result.contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: ready } = await db.from('together_generated_media').update({ status: 'ready', storage_path: storagePath, duration_ms: result.durationMs, provider: provider.id, metadata: { ...(media.metadata as Record<string, unknown>), model: result.model, providerRequestId: result.providerRequestId ?? null }, updated_at: new Date().toISOString() }).eq('id', mediaId).eq('user_id', user.id).select('*').single();
      await track(db, user.id, 'voice_note_ready', { mediaId, messageId: message.id, characterInstanceId });
      return json({ data: await mediaPayload(db, ready ?? media), correlationId }, 201, correlationId);
    } catch (error) {
      const { data: failed } = await db.from('together_generated_media').update({ status: 'failed', failure_code: 'provider_unavailable', failure_reason_safe: 'The voice note could not be generated.', metadata: { ...(media.metadata as Record<string, unknown>), providerError: error instanceof Error ? error.name : 'unknown' }, updated_at: new Date().toISOString() }).eq('id', mediaId).eq('user_id', user.id).select('*').single();
      return json({ data: await mediaPayload(db, failed ?? media), correlationId }, 200, correlationId);
    }
  }

  const { data: media } = await db.from('together_generated_media').select('*').eq('id', input.mediaId).eq('user_id', user.id).eq('continuity_id', continuity.id).maybeSingle();
  if (!media) throw new AppError('NOT_FOUND', 'That media is unavailable.', 404);
  return json({ data: await mediaPayload(db, media), correlationId }, 200, correlationId);
});

async function requireConversation(db: any, userId: string, continuityId: string, conversationId: string, characterInstanceId: string) {
  const { data } = await db.from('together_conversations').select('id').eq('id', conversationId).eq('user_id', userId).eq('continuity_id', continuityId).eq('character_instance_id', characterInstanceId).maybeSingle();
  if (!data) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
}

async function requireAttachment(db: any, userId: string, continuityId: string, attachmentId: string): Promise<Record<string, any>> {
  const { data } = await db.from('together_conversation_attachments').select('*').eq('id', attachmentId).eq('user_id', userId).eq('continuity_id', continuityId).maybeSingle();
  if (!data) throw new AppError('NOT_FOUND', 'That attachment is unavailable.', 404);
  return data;
}

async function attachmentPayload(db: any, attachment: Record<string, any>) {
  let signedUrl: string | null = null;
  if (attachment.upload_status === 'uploaded') signedUrl = (await db.storage.from('together-user-media').createSignedUrl(String(attachment.storage_path), 3600)).data?.signedUrl ?? null;
  return { attachment: { ...attachment, signed_url: signedUrl }, upload: { bucket: 'together-user-media', path: attachment.storage_path }, providers: providerCapabilityStatuses() };
}

async function mediaPayload(db: any, media: Record<string, any>) {
  let signedUrl: string | null = null;
  if (media.status === 'ready' && media.storage_path) signedUrl = (await db.storage.from('together-user-media').createSignedUrl(String(media.storage_path), 3600)).data?.signedUrl ?? null;
  return { media: { ...media, signed_url: signedUrl }, providers: providerCapabilityStatuses() };
}

function matchesImageSignature(bytes:Uint8Array,mimeType:string):boolean{
  if(mimeType==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mimeType==='image/png')return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
  if(mimeType==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  return false;
}
