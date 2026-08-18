import { z } from 'zod';
import { parseBody } from '../_shared/body.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { activeContinuity, requireInstanceInActiveContinuity } from '../_shared/together-continuity.ts';
import { resolveCompanionPresence } from '../_shared/together-schedule.ts';
import { normalizeMultimodalPreferences, resolveServerExperienceCapabilities } from '../_shared/kivelle-multimodal.ts';
import { track } from '../_shared/together.ts';
import { AppError } from '../_shared/types.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('available'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('join'), sceneId: z.string().uuid(), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('leave_character'), sceneId: z.string().uuid(), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('leave_scene'), sceneId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);
  const[{data:profile},{data:entitlement}]=await Promise.all([db.from('together_profiles').select('multimodal_preferences').eq('user_id',user.id).maybeSingle(),db.from('together_entitlements').select('entitlement_keys').eq('user_id',user.id).maybeSingle()]);
  if(!resolveServerExperienceCapabilities(normalizeMultimodalPreferences(profile?.multimodal_preferences),(entitlement?.entitlement_keys??[]).map(String)).experience.multiCharacterScenes)throw new AppError('PLAN_LIMIT_REACHED','Multi-character living scenes are available with Kivelle Max.',403);

  if (input.action === 'available') {
    const { data: conversation } = await db.from('together_conversations').select('*').eq('id', input.conversationId).eq('user_id', user.id).eq('continuity_id', continuity.id).maybeSingle();
    if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    const { data: scene } = await db.from('together_scene_sessions').select('*').eq('user_id', user.id).eq('continuity_id', continuity.id).eq('character_instance_id', conversation.character_instance_id).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!scene) return json({ data: { scene: null, participants: [], availableCharacters: [] }, correlationId }, 200, correlationId);
    await ensurePrimaryParticipant(db, scene);
    const [{ data: participants }, { data: candidates }] = await Promise.all([
      db.from('together_scene_participants').select('*,together_character_instances(id,current_location_id,together_character_templates(name,slug,public_handle),together_character_versions(portrait_asset_url,visual_identity))').eq('scene_session_id', scene.id).is('left_at', null).order('joined_at'),
      db.from('together_character_instances').select('id,current_location_id,together_character_templates(name,slug,public_handle),together_character_versions(portrait_asset_url,visual_identity)').eq('user_id', user.id).eq('continuity_id', continuity.id).neq('id', conversation.character_instance_id),
    ]);
    const participantIds = new Set((participants ?? []).map((item: any) => String(item.character_instance_id)));
    const plausible = (candidates ?? []).filter((candidate: any) => String(candidate.current_location_id ?? '') === String(scene.location_id) && !participantIds.has(String(candidate.id))).slice(0, 12);
    const presence = await Promise.all(plausible.map(async (candidate: any) => ({ candidate, presence: await resolveCompanionPresence({ db, userId: user.id, characterInstanceId: String(candidate.id), ensure: false }).catch(() => null) })));
    const availableCharacters = presence.filter(({ presence }) => presence?.locationId === String(scene.location_id) && presence.worldId === String(scene.world_id) && presence.interruptibility !== 'unavailable').map(({ candidate, presence }) => ({ ...candidate, presence }));
    if (availableCharacters.length) await track(db, user.id, 'shared_scene_available', { sceneId: scene.id, availableCount: availableCharacters.length });
    return json({ data: { scene, participants: participants ?? [], availableCharacters }, correlationId }, 200, correlationId);
  }

  const scene = await requireScene(db, user.id, continuity.id, input.sceneId);
  if (input.action === 'join') {
    await enforceRateLimit(db, user.id, 'together_shared_scene_join', 30, 3600);
    await requireInstanceInActiveContinuity(db, user.id, input.characterInstanceId);
    const presence = await resolveCompanionPresence({ db, userId: user.id, characterInstanceId: input.characterInstanceId, ensure: false });
    if (!presence || presence.locationId !== String(scene.location_id) || presence.worldId !== String(scene.world_id) || presence.interruptibility === 'unavailable') throw new AppError('SCENE_NO_LONGER_AVAILABLE', 'They are no longer here.', 409);
    const sequence = Number((scene.state as Record<string, unknown> | null)?.sequence ?? 0) + 1;
    const { data: participant, error } = await db.from('together_scene_participants').upsert({
      user_id: user.id, continuity_id: continuity.id, scene_session_id: scene.id,
      character_instance_id: input.characterInstanceId, role: 'participant', joined_at: new Date().toISOString(),
      left_at: null, witnessed_from_sequence: sequence, witnessed_to_sequence: null,
      metadata: { presenceSource: presence.source, contextVersion: 1 },
    }, { onConflict: 'scene_session_id,character_instance_id' }).select('*').single();
    if (error || !participant) throw new AppError('INTERNAL_ERROR', 'They could not join the scene.', 500, true);
    const participantIds = [...new Set([...(scene.participant_instance_ids ?? []).map(String), input.characterInstanceId])];
    await db.from('together_scene_sessions').update({ participant_instance_ids: participantIds, state: { ...(scene.state ?? {}), sequence, participantCount: participantIds.length }, updated_at: new Date().toISOString() }).eq('id', scene.id).eq('user_id', user.id);
    await track(db, user.id, 'shared_scene_character_joined', { sceneId: scene.id, characterInstanceId: input.characterInstanceId });
    return json({ data: { participant, participantInstanceIds: participantIds }, correlationId }, 201, correlationId);
  }

  if (input.action === 'leave_character') {
    if (input.characterInstanceId === String(scene.character_instance_id)) throw new AppError('CONFLICT', 'Leave the scene to end time with the primary companion.', 409);
    const sequence = Number((scene.state as Record<string, unknown> | null)?.sequence ?? 0) + 1;
    const leftAt = new Date().toISOString();
    const { data: participant } = await db.from('together_scene_participants').update({ left_at: leftAt, witnessed_to_sequence: sequence, updated_at: leftAt }).eq('scene_session_id', scene.id).eq('character_instance_id', input.characterInstanceId).eq('user_id', user.id).is('left_at', null).select('*').maybeSingle();
    if (!participant) throw new AppError('NOT_FOUND', 'That character is not in this scene.', 404);
    const participantIds = (scene.participant_instance_ids ?? []).map(String).filter((id: string) => id !== input.characterInstanceId);
    await db.from('together_scene_sessions').update({ participant_instance_ids: participantIds, state: { ...(scene.state ?? {}), sequence, participantCount: participantIds.length }, updated_at: leftAt }).eq('id', scene.id).eq('user_id', user.id);
    await track(db, user.id, 'shared_scene_character_left', { sceneId: scene.id, characterInstanceId: input.characterInstanceId });
    return json({ data: { participant, participantInstanceIds: participantIds }, correlationId }, 200, correlationId);
  }

  const endedAt = new Date().toISOString();
  await Promise.all([
    db.from('together_scene_participants').update({ left_at: endedAt, updated_at: endedAt }).eq('scene_session_id', scene.id).eq('user_id', user.id).is('left_at', null),
    db.from('together_scene_sessions').update({ ended_at: endedAt, updated_at: endedAt }).eq('id', scene.id).eq('user_id', user.id).is('ended_at', null),
  ]);
  await track(db, user.id, 'shared_scene_left', { sceneId: scene.id });
  return json({ data: { ended: true }, correlationId }, 200, correlationId);
});

async function requireScene(db: any, userId: string, continuityId: string, sceneId: string): Promise<Record<string, any>> {
  const { data } = await db.from('together_scene_sessions').select('*').eq('id', sceneId).eq('user_id', userId).eq('continuity_id', continuityId).is('ended_at', null).maybeSingle();
  if (!data) throw new AppError('SCENE_NOT_FOUND', 'That shared scene is no longer active.', 404);
  return data;
}

async function ensurePrimaryParticipant(db: any, scene: Record<string, any>) {
  await db.from('together_scene_participants').upsert({
    user_id: scene.user_id, continuity_id: scene.continuity_id, scene_session_id: scene.id,
    character_instance_id: scene.character_instance_id, role: 'primary_companion', joined_at: scene.started_at,
    witnessed_from_sequence: 1, metadata: { canonicalPrimary: true, contextVersion: 1 },
  }, { onConflict: 'scene_session_id,character_instance_id', ignoreDuplicates: true });
}
