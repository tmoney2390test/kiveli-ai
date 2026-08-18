import { z } from 'zod';
import { parseBody } from '../_shared/body.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { buildKivelleConversationContext } from '../_shared/kivelle-conversation-context-base.ts';
import { configuredRealtimeVoiceProvider, normalizeMultimodalPreferences, resolveCompanionVoiceProfile, resolveServerExperienceCapabilities } from '../_shared/kivelle-multimodal.ts';
import { activeContinuity, requireInstanceInActiveContinuity } from '../_shared/together-continuity.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { track } from '../_shared/together.ts';
import { AppError } from '../_shared/types.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), characterInstanceId: z.string().uuid(), conversationId: z.string().uuid(), requestId: z.string().trim().min(8).max(120) }),
  z.object({ action: z.literal('status'), callSessionId: z.string().uuid() }),
  z.object({ action: z.literal('end'), callSessionId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);

  if (input.action === 'create') {
    await enforceRateLimit(db, user.id, 'together_voice_call_create', 12, 3600);
    const { instance } = await requireInstanceInActiveContinuity(db, user.id, input.characterInstanceId);
    const { data: conversation } = await db.from('together_conversations').select('*').eq('id', input.conversationId).eq('user_id', user.id).eq('continuity_id', continuity.id).eq('character_instance_id', input.characterInstanceId).maybeSingle();
    if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    const [{ data: profile },{data:entitlement}] = await Promise.all([db.from('together_profiles').select('multimodal_preferences').eq('user_id', user.id).single(),db.from('together_entitlements').select('entitlement_keys').eq('user_id',user.id).maybeSingle()]);
    if (normalizeMultimodalPreferences(profile?.multimodal_preferences).liveVoiceCalls === false) throw new AppError('FORBIDDEN', 'Live calls are turned off in Settings.', 403);
    if(!resolveServerExperienceCapabilities(normalizeMultimodalPreferences(profile?.multimodal_preferences),(entitlement?.entitlement_keys??[]).map(String)).experience.liveVoiceCalls)throw new AppError('PLAN_LIMIT_REACHED','Live calls are available with Kivelle Max.',403);
    const { data: duplicate } = await db.from('together_voice_call_sessions').select('*').eq('user_id', user.id).eq('request_id', input.requestId).maybeSingle();
    if (duplicate) return json({ data: sanitizeCall(duplicate), correlationId }, 200, correlationId);
    await track(db,user.id,'voice_call_started',{characterInstanceId:input.characterInstanceId});
    const provider = configuredRealtimeVoiceProvider();
    if (!provider) return json({ data: { status: 'not_configured', providerStatus: 'not_configured', message: "Live voice calls aren't connected yet." }, correlationId }, 200, correlationId);

    const now = new Date();
    const lifeRun = await runLifeSimulation({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now, evaluateProactive: false, trigger: 'conversation_continued' });
    const context = await buildKivelleConversationContext({ db, userId: user.id, instance, conversation, userMessage: 'The user is starting a live voice call.', lifeRun, semanticRows: [], now });
    const id = crypto.randomUUID();
    const { data: created, error } = await db.from('together_voice_call_sessions').insert({
      id, user_id: user.id, continuity_id: continuity.id, character_instance_id: input.characterInstanceId,
      conversation_id: input.conversationId, status: 'creating', request_id: input.requestId,
      provider: provider.id, metadata: { contextVersion: 1 },
    }).select('*').single();
    if (error || !created) throw new AppError('INTERNAL_ERROR', 'The call could not be started.', 500, true);
    try {
      const voice = await resolveCompanionVoiceProfile(db, input.characterInstanceId);
      const providerSession = await provider.createSession({ callSessionId: id, voice, context: safeRealtimeContext(context) });
      const connectedAt = new Date().toISOString();
      const { data: active } = await db.from('together_voice_call_sessions').update({ status: 'active', started_at: connectedAt, connected_at: connectedAt, provider_session_id: providerSession.providerSessionId, metadata: { contextVersion: 1, providerMetadata: providerSession.providerMetadata ?? {} }, updated_at: connectedAt }).eq('id', id).eq('user_id', user.id).select('*').single();
      await track(db, user.id, 'voice_call_connected', { callSessionId: id, characterInstanceId: input.characterInstanceId });
      return json({ data: { call: sanitizeCall(active ?? created), clientSecret: providerSession.clientSecret, expiresAt: providerSession.expiresAt }, correlationId }, 201, correlationId);
    } catch (error) {
      await db.from('together_voice_call_sessions').update({ status: 'failed', ended_at: new Date().toISOString(), failure_code: 'provider_unavailable', failure_reason_safe: "The call couldn't connect.", updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
      await track(db, user.id, 'voice_call_failed', { callSessionId: id, characterInstanceId: input.characterInstanceId });
      return json({ data: { call: { ...sanitizeCall(created), status: 'failed', failure_reason_safe: "The call couldn't connect." } }, correlationId }, 200, correlationId);
    }
  }

  const { data: call } = await db.from('together_voice_call_sessions').select('*').eq('id', input.callSessionId).eq('user_id', user.id).eq('continuity_id', continuity.id).maybeSingle();
  if (!call) throw new AppError('NOT_FOUND', 'That call is unavailable.', 404);
  if (input.action === 'status') return json({ data: { call: sanitizeCall(call) }, correlationId }, 200, correlationId);
  if (call.status === 'ended') return json({ data: { call: sanitizeCall(call) }, correlationId }, 200, correlationId);
  const provider = configuredRealtimeVoiceProvider();
  if (provider && call.provider_session_id) await provider.endSession(String(call.provider_session_id)).catch(() => undefined);
  const endedAt = new Date().toISOString();
  const durationSeconds = call.connected_at ? Math.max(0, Math.floor((Date.now() - new Date(call.connected_at).getTime()) / 1000)) : 0;
  const { data: ended } = await db.from('together_voice_call_sessions').update({ status: 'ended', ended_at: endedAt, usage_metadata: { ...(call.usage_metadata as Record<string, unknown> ?? {}), durationSeconds }, updated_at: endedAt }).eq('id', call.id).eq('user_id', user.id).select('*').single();
  await track(db, user.id, 'voice_call_ended', { callSessionId: call.id, characterInstanceId: call.character_instance_id, durationSeconds });
  return json({ data: { call: sanitizeCall(ended ?? call) }, correlationId }, 200, correlationId);
});

function safeRealtimeContext(context: Record<string, any>): Record<string, unknown> {
  return {
    character: context.character,
    persona: context.persona,
    relationship: context.relationship,
    currentScene: context.currentScene,
    life: context.life,
    activePlan: context.activePlan,
    activeDate: context.activeDate,
    openThreads: context.openThreads,
    memories: context.memoryContext ?? context.memories,
    contentMode: context.contentMode,
    conversationStyle: context.conversationStyle,
  };
}

function sanitizeCall(call: Record<string, any>) {
  const { provider_session_id: _providerSessionId, ...safe } = call;
  return safe;
}
