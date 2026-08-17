import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';
import {activeContinuity,requireInstanceInActiveContinuity}from'../_shared/together-continuity.ts';
import { getActiveConversation, mergeConversationSceneMetadata, type ActiveConversationScene } from '../_shared/together-conversation.ts';
import { resolveCompanionPresence } from '../_shared/together-schedule.ts';
import { resolvePlaceContext, resolveWorldAccess } from '../_shared/together-place.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('new'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('archive'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('delete'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('rename'), conversationId: z.string().uuid(), title: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal('history'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('messages'), conversationId: z.string().uuid(), before: z.string().datetime().optional(), anchorMessageId: z.string().uuid().optional(), limit: z.number().int().min(1).max(60).default(50) }),
  z.object({ action: z.literal('search'), characterInstanceId: z.string().uuid(), query: z.string().trim().min(2).max(100), conversationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('read'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('reset'), characterInstanceId: z.string().uuid(), mode: z.enum(['memory','relationship','full']), requestId: z.string().uuid().optional() }),
  z.object({ action: z.literal('reset_preview'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('start_over'), characterInstanceId: z.string().uuid(), requestId: z.string().uuid() }),
  z.object({ action: z.literal('enter_scene'), characterInstanceId: z.string().uuid(), locationId: z.string().uuid(), conversationId: z.string().uuid().optional() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const continuity=await activeContinuity(db,user.id);
  const owned = 'characterInstanceId' in input && input.action !== 'start_over'
    ? await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId)
    : null;
  await enforceRateLimit(db, user.id, `together_conversation_${input.action}`, input.action === 'search' ? 40 : 20, 3600);

  if (input.action === 'reset_preview') {
    const target = await requireInstanceInActiveContinuity(db, user.id, input.characterInstanceId);
    const [templateRow, conversations, memories, plans, dates, moments, photos, stories] = await Promise.all([
      db.from('together_character_templates').select('name').eq('id',String(target.instance.character_template_id)).maybeSingle(),
      db.from('together_conversations').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_memories').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_shared_plans').select('id,status',{count:'exact'}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_date_sessions').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_moments').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_generated_media').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_story_arc_instances').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
    ]);
    const failed = [templateRow,conversations,memories,plans,dates,moments,photos,stories].find((item) => item.error);
    if (failed?.error) throw new AppError('INTERNAL_ERROR','The reset preview could not be loaded.',500,true);
    const planRows = (plans.data ?? []) as Array<{status:string}>;
    const preview = {
      characterInstanceId: input.characterInstanceId,
      characterName: String(templateRow.data?.name ?? 'Companion'),
      counts: {
        conversations: conversations.count ?? 0,
        memories: memories.count ?? 0,
        upcomingPlans: planRows.filter((plan) => ['proposed','scheduled','active'].includes(plan.status)).length,
        historicalPlans: planRows.filter((plan) => ['completed','missed','cancelled'].includes(plan.status)).length,
        dates: dates.count ?? 0,
        moments: moments.count ?? 0,
        photos: photos.count ?? 0,
        stories: stories.count ?? 0,
      },
    };
    await track(db,user.id,'character_reset_previewed',{characterInstanceId:input.characterInstanceId});
    return json({data:preview,correlationId},200,correlationId);
  }

  if (input.action === 'start_over') {
    await track(db,user.id,'character_reset_started',{characterInstanceId:input.characterInstanceId});
    const { data, error } = await db.rpc('kivelle_start_over_character', { p_user_id:user.id, p_character_instance_id:input.characterInstanceId, p_request_id:input.requestId });
    if (error || !data) {
      const code = error?.message?.includes('RESET_NO_FIRST_MEETING') ? 'CONFLICT' : 'INTERNAL_ERROR';
      await db.from('together_destructive_action_audit').insert({user_id:user.id,character_instance_id:input.characterInstanceId,action_type:'companion_full_reset',result_status:'failed',request_id:input.requestId});
      await track(db,user.id,'character_reset_failed',{characterInstanceId:input.characterInstanceId});
      throw new AppError(code as any, code === 'CONFLICT' ? 'This companion does not have a valid first meeting yet.' : 'The reset could not be completed. Nothing was changed.', code === 'CONFLICT' ? 409 : 500, code !== 'CONFLICT');
    }
    const paths = Array.isArray(data.storagePaths) ? data.storagePaths.filter((item:unknown):item is string => typeof item === 'string' && item.length > 0) : [];
    await removeStoragePaths(db,user.id,paths);
    const safeData = {...data}; delete safeData.storagePaths;
    await track(db,user.id,'character_reset_completed',{characterInstanceId:input.characterInstanceId,newCharacterInstanceId:data.newCharacterInstanceId,becameActive:data.becameActive});
    return json({data:safeData,correlationId},200,correlationId);
  }

  if (input.action === 'enter_scene') {
    const now = new Date();
    const place = await resolvePlaceContext({ db, locationId: input.locationId, now, userId: user.id, characterInstanceId: input.characterInstanceId });
    const access = await resolveWorldAccess({ db, userId: user.id, worldId: place.world.id });
    if (access === 'locked') throw new AppError('WORLD_LOCKED', 'That world is not available for this life yet.', 403);
    const presence = await resolveCompanionPresence({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now, ensure: false });
    if (!presence || presence.locationId !== place.location.id || presence.interruptibility === 'busy' || presence.interruptibility === 'unavailable') {
      await track(db, user.id, 'scene_entry_conflict', { characterInstanceId: input.characterInstanceId, locationId: input.locationId });
      throw new AppError('SCENE_NO_LONGER_AVAILABLE', 'They just headed out. You can still message them from here.', 409);
    }
    const {data:locationRow}=await db.from('together_locations').select('location_type,metadata').eq('id',place.location.id).maybeSingle();
    const privacy=String(locationRow?.metadata?.privacy??'').toLowerCase();
    const privateLocation=locationRow?.location_type==='residence'||['private','invite_only','invitation'].includes(privacy);
    const earlyRelationship=['stranger','acquaintance'].includes(String(owned?.instance?.relationship_stage??''));
    if(privateLocation&&earlyRelationship&&!['active_date','active_plan'].includes(presence.source))throw new AppError('SCENE_PRIVATE', 'This is not somewhere you can drop in uninvited yet. You can still message them.', 403);
    const conversation = input.conversationId ? await ownedConversation(db, user.id, continuity.id, input.conversationId) : await getActiveConversation(db, user.id, input.characterInstanceId, true);
    if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    const entryReason: ActiveConversationScene['entryReason'] = presence.source === 'active_date' ? 'active_date' : presence.source === 'active_plan' ? 'shared_plan' : 'user_drop_in';
    const scene = { version: 1 as const, characterInstanceId: input.characterInstanceId, locationId: place.location.id, worldId: place.world.id, interactionMode: 'co_present' as const, entryReason, enteredAt: now.toISOString(), source: presence.source === 'active_event' || presence.source === 'active_date' ? 'active_event' as const : presence.source === 'active_plan' ? 'presence' as const : 'presence' as const, activityKey:presence.activityKey,activityLabel:presence.activity, ...(presence.sourceEventId ? { sourceEventId: presence.sourceEventId } : {}), ...(presence.validUntil ? { validUntil: presence.validUntil } : {}), updatedAt: now.toISOString() };
    const metadata = mergeConversationSceneMetadata((conversation.metadata ?? {}) as Record<string, any>, scene);
    const { data: updated, error } = await db.from('together_conversations').update({ metadata, updated_at: now.toISOString() }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error || !updated) throw new AppError('INTERNAL_ERROR', 'The scene could not be entered.', 500, true);
    await track(db, user.id, 'join_character_clicked', { characterInstanceId: input.characterInstanceId, locationId: input.locationId });
    await track(db, user.id, 'scene_entry_succeeded', { characterInstanceId: input.characterInstanceId, locationId: input.locationId, entryReason });
    return json({ data: { conversation: updated, scene, presence, place }, correlationId }, 200, correlationId);
  }

  if (input.action === 'new') {
    const { data, error } = await db.rpc('kivelle_start_conversation', { p_user_id: user.id, p_character_instance_id: input.characterInstanceId });
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'A new conversation could not be started.', 500, true);
    await track(db, user.id, 'conversation_started', { characterInstanceId: input.characterInstanceId });
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'start_over') {
    await track(db,user.id,'character_reset_started',{characterInstanceId:input.characterInstanceId});
    const { data, error } = await db.rpc('kivelle_start_over_character', { p_user_id:user.id, p_character_instance_id:input.characterInstanceId, p_request_id:input.requestId });
    if (error || !data) {
      const code = error?.message?.includes('RESET_NO_FIRST_MEETING') ? 'CONFLICT' : 'INTERNAL_ERROR';
      await db.from('together_destructive_action_audit').insert({user_id:user.id,character_instance_id:input.characterInstanceId,action_type:'companion_full_reset',result_status:'failed',request_id:input.requestId});
      await track(db,user.id,'character_reset_failed',{characterInstanceId:input.characterInstanceId});
      throw new AppError(code as any, code === 'CONFLICT' ? 'This companion does not have a valid first meeting yet.' : 'The reset could not be completed. Nothing was changed.', code === 'CONFLICT' ? 409 : 500, code !== 'CONFLICT');
    }
    const paths = Array.isArray(data.storagePaths) ? data.storagePaths.filter((item:unknown):item is string => typeof item === 'string' && item.length > 0) : [];
    await removeStoragePaths(db,user.id,paths);
    const safeData = {...data}; delete safeData.storagePaths;
    await track(db,user.id,'character_reset_completed',{characterInstanceId:input.characterInstanceId,newCharacterInstanceId:data.newCharacterInstanceId,becameActive:data.becameActive});
    return json({data:safeData,correlationId},200,correlationId);
  }

  if (input.action === 'enter_scene') {
    const now = new Date();
    const place = await resolvePlaceContext({ db, locationId: input.locationId, now, userId: user.id, characterInstanceId: input.characterInstanceId });
    const access = await resolveWorldAccess({ db, userId: user.id, worldId: place.world.id });
    if (access === 'locked') throw new AppError('WORLD_LOCKED', 'That world is not available for this life yet.', 403);
    const presence = await resolveCompanionPresence({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now, ensure: false });
    if (!presence || presence.locationId !== place.location.id || presence.interruptibility === 'busy' || presence.interruptibility === 'unavailable') {
      await track(db, user.id, 'scene_entry_conflict', { characterInstanceId: input.characterInstanceId, locationId: input.locationId });
      throw new AppError('SCENE_NO_LONGER_AVAILABLE', 'They just headed out. You can still message them from here.', 409);
    }
    const {data:locationRow}=await db.from('together_locations').select('location_type,metadata').eq('id',place.location.id).maybeSingle();
    const privacy=String(locationRow?.metadata?.privacy??'').toLowerCase();
    const privateLocation=locationRow?.location_type==='residence'||['private','invite_only','invitation'].includes(privacy);
    const earlyRelationship=['stranger','acquaintance'].includes(String(owned?.instance?.relationship_stage??''));
    if(privateLocation&&earlyRelationship&&!['active_date','active_plan'].includes(presence.source))throw new AppError('SCENE_PRIVATE', 'This is not somewhere you can drop in uninvited yet. You can still message them.', 403);
    const conversation = input.conversationId ? await ownedConversation(db, user.id, continuity.id, input.conversationId) : await getActiveConversation(db, user.id, input.characterInstanceId, true);
    if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    const entryReason = presence.source === 'active_date' ? 'active_date' : presence.source === 'active_plan' ? 'shared_plan' : 'user_drop_in';
    const scene = { version: 1 as const, characterInstanceId: input.characterInstanceId, locationId: place.location.id, worldId: place.world.id, interactionMode: 'co_present' as const, entryReason, enteredAt: now.toISOString(), source: presence.source === 'active_event' || presence.source === 'active_date' ? 'active_event' as const : presence.source === 'active_plan' ? 'presence' as const : 'presence' as const, ...(presence.sourceEventId ? { sourceEventId: presence.sourceEventId } : {}), ...(presence.validUntil ? { validUntil: presence.validUntil } : {}), updatedAt: now.toISOString() };
    const metadata = mergeConversationSceneMetadata((conversation.metadata ?? {}) as Record<string, any>, scene);
    const { data: updated, error } = await db.from('together_conversations').update({ metadata, updated_at: now.toISOString() }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error || !updated) throw new AppError('INTERNAL_ERROR', 'The scene could not be entered.', 500, true);
    await track(db, user.id, 'join_character_clicked', { characterInstanceId: input.characterInstanceId, locationId: input.locationId });
    await track(db, user.id, 'scene_entry_succeeded', { characterInstanceId: input.characterInstanceId, locationId: input.locationId, entryReason });
    return json({ data: { conversation: updated, scene, presence, place }, correlationId }, 200, correlationId);
  }

  if (input.action === 'new') {
    const { data, error } = await db.rpc('kivelle_start_conversation', { p_user_id: user.id, p_character_instance_id: input.characterInstanceId });
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'A new conversation could not be started.', 500, true);
    await track(db, user.id, 'conversation_started', { characterInstanceId: input.characterInstanceId });
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'history') {
    const { data, error } = await db.from('together_conversations').select('*,together_messages(count)').eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).order('created_at', { ascending: false }).limit(100);
    if (error) throw new AppError('INTERNAL_ERROR', 'Conversation history could not be loaded.', 500, true);
    const enriched = await Promise.all((data ?? []).map(async (conversation) => {
      const { data: preview } = await db.from('together_messages').select('content,created_at,role').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return { ...conversation, message_count: Number(conversation.together_messages?.[0]?.count ?? 0), last_message_preview: preview?.content ?? null };
    }));
    await track(db, user.id, 'conversation_history_viewed', { characterInstanceId: input.characterInstanceId });
    return json({ data: enriched, correlationId }, 200, correlationId);
  }

  if (input.action === 'messages') {
    const owned = await ownedConversation(db, user.id,continuity.id,input.conversationId);
    if (input.anchorMessageId && !input.before) {
      const { data: anchor } = await db.from('together_messages').select('id,created_at').eq('id', input.anchorMessageId).eq('conversation_id', owned.id).eq('user_id', user.id).maybeSingle();
      if (!anchor) throw new AppError('NOT_FOUND', 'That search result is no longer available.', 404);
      const half = Math.max(1, Math.floor(input.limit / 2));
      const [olderPage, newerPage] = await Promise.all([
        db.from('together_messages').select('*').eq('user_id', user.id).eq('conversation_id', owned.id).lte('created_at', anchor.created_at).order('created_at', { ascending: false }).limit(half + 1),
        db.from('together_messages').select('*').eq('user_id', user.id).eq('conversation_id', owned.id).gt('created_at', anchor.created_at).order('created_at', { ascending: true }).limit(half),
      ]);
      if (olderPage.error || newerPage.error) throw new AppError('INTERNAL_ERROR', 'The surrounding conversation could not be loaded.', 500, true);
      const messages = [...(newerPage.data ?? []).reverse(), ...(olderPage.data ?? [])];
      return json({ data: { messages, hasMore: (olderPage.data?.length ?? 0) === half + 1, conversation: owned, anchorMessageId: anchor.id }, correlationId }, 200, correlationId);
    }
    let query = db.from('together_messages').select('*').eq('user_id', user.id).eq('conversation_id', owned.id).order('created_at', { ascending: false }).limit(input.limit);
    if (input.before) query = query.lt('created_at', input.before);
    const { data, error } = await query;
    if (error) throw new AppError('INTERNAL_ERROR', 'Messages could not be loaded.', 500, true);
    return json({ data: { messages: data ?? [], hasMore: (data?.length ?? 0) === input.limit, conversation: owned }, correlationId }, 200, correlationId);
  }

  if (input.action === 'search') {
    const safeQuery = input.query.replace(/[%_]/g, '').trim();
    let query = db.from('together_messages').select('id,conversation_id,role,content,created_at,together_conversations!inner(title,archived_at,character_instance_id)').eq('user_id', user.id).eq('together_conversations.character_instance_id', input.characterInstanceId).ilike('content', `%${safeQuery}%`).order('created_at', { ascending: false }).limit(50);
    if (input.conversationId) query = query.eq('conversation_id', input.conversationId);
    const { data, error } = await query;
    if (error) throw new AppError('INTERNAL_ERROR', 'Conversation search is unavailable.', 500, true);
    await track(db, user.id, 'conversation_search_used', { resultCount: data?.length ?? 0 });
    return json({ data: data ?? [], correlationId }, 200, correlationId);
  }

  if (input.action === 'reset') {
    if (input.mode === 'full') {
      const requestId = input.requestId ?? crypto.randomUUID();
      const { data, error } = await db.rpc('kivelle_start_over_character', { p_user_id:user.id, p_character_instance_id:input.characterInstanceId, p_request_id:requestId });
      if (error || !data) throw new AppError('INTERNAL_ERROR', 'The reset could not be completed. Nothing was changed.', 500, true);
      const paths = Array.isArray(data.storagePaths) ? data.storagePaths.filter((item:unknown):item is string => typeof item === 'string' && item.length > 0) : [];
      await removeStoragePaths(db,user.id,paths);
      const safeData = {...data}; delete safeData.storagePaths;
      await track(db,user.id,'character_reset_completed',{characterInstanceId:input.characterInstanceId,newCharacterInstanceId:data.newCharacterInstanceId,becameActive:data.becameActive});
      return json({data:safeData,correlationId},200,correlationId);
    }
    const { data, error } = await db.rpc('kivelle_reset_companion', { p_user_id: user.id, p_character_instance_id: input.characterInstanceId, p_mode: input.mode });
    if (error) {
      await db.from('together_destructive_action_audit').insert({ user_id: user.id, character_instance_id: input.characterInstanceId, action_type: input.mode === 'memory' ? 'companion_memories_reset' : input.mode === 'relationship' ? 'relationship_reset' : 'companion_full_reset', result_status: 'failed' });
      throw new AppError('INTERNAL_ERROR', 'The reset could not be completed. Nothing was changed.', 500, true);
    }
    const { data, error } = await db.rpc('kivelle_reset_companion', { p_user_id: user.id, p_character_instance_id: input.characterInstanceId, p_mode: input.mode });
    if (error) {
      await db.from('together_destructive_action_audit').insert({ user_id: user.id, character_instance_id: input.characterInstanceId, action_type: input.mode === 'memory' ? 'companion_memories_reset' : input.mode === 'relationship' ? 'relationship_reset' : 'companion_full_reset', result_status: 'failed' });
      throw new AppError('INTERNAL_ERROR', 'The reset could not be completed. Nothing was changed.', 500, true);
    }
    const paths = Array.isArray(data?.storagePaths) ? data.storagePaths.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0) : [];
    await removeStoragePaths(db, user.id, paths);
    await track(db, user.id, input.mode === 'memory' ? 'companion_memories_reset' : input.mode === 'relationship' ? 'relationship_reset' : 'companion_full_reset', { characterInstanceId: input.characterInstanceId });
    return json({ data, correlationId }, 200, correlationId);
  }

  const conversation = await ownedConversation(db, user.id,continuity.id,input.conversationId);
  if (input.action === 'read') {
    const now = new Date().toISOString();
    await db.from('together_conversations').update({ last_read_at: now }).eq('id', conversation.id).eq('user_id', user.id);
    return json({ data: { last_read_at: now }, correlationId }, 200, correlationId);
  }
  if (input.action === 'rename') {
    const { data, error } = await db.from('together_conversations').update({ title: input.title, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error) throw new AppError('INTERNAL_ERROR', 'The conversation could not be renamed.', 500, true);
    await track(db, user.id, 'conversation_renamed', { conversationId: conversation.id });
    return json({ data, correlationId }, 200, correlationId);
  }
  if (input.action === 'archive') {
    const { data, error } = await db.from('together_conversations').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id).is('archived_at', null).select('*').maybeSingle();
    if (error || !data) throw new AppError('CONFLICT', 'This conversation is already in history.', 409);
    await track(db, user.id, 'conversation_archived', { conversationId: conversation.id });
    return json({ data, correlationId }, 200, correlationId);
  }

  const { data: deleted, error: deleteError } = await db.rpc('kivelle_delete_conversation', { p_user_id: user.id, p_conversation_id: conversation.id });
  if (deleteError) {
    await db.from('together_destructive_action_audit').insert({ user_id: user.id, character_instance_id: conversation.character_instance_id, action_type: 'conversation_deleted', result_status: 'failed' });
    throw new AppError('INTERNAL_ERROR', 'The transcript could not be deleted. Nothing was changed.', 500, true);
  }
  const storagePaths = Array.isArray(deleted?.storagePaths) ? deleted.storagePaths.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0) : [];
  await removeStoragePaths(db, user.id, storagePaths);
  await track(db, user.id, 'conversation_deleted', { characterInstanceId: conversation.character_instance_id });
  return json({ data: deleted, correlationId }, 200, correlationId);
});

async function ownedConversation(db: any, userId: string,continuityId:string, conversationId: string): Promise<Record<string, any>> {
  const { data } = await db.from('together_conversations').select('*').eq('id', conversationId).eq('user_id', userId).eq('continuity_id',continuityId).maybeSingle();
  if (!data) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
  return data;
}

async function removeStoragePaths(db: any, userId: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db.storage.from('together-user-media').remove(paths);
  if (!error) return;
  const jobs = paths.map((storagePath) => ({ user_id: userId, bucket_id: 'together-user-media', storage_path: storagePath, status: 'pending', attempt_count: 1, last_error: error.message }));
  const { error: queueError } = await db.from('together_storage_cleanup_jobs').insert(jobs);
  if (queueError) console.warn('Kivelle media cleanup retry could not be recorded', queueError.message);
}

