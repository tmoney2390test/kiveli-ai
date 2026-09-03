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
import { activeConversationLimitError, isActiveConversationLimitDatabaseError, resolveSubscriptionAccess } from '../_shared/kivelle-subscription.ts';
import { conversationArchiveExpired, conversationArchiveFields } from '../_shared/together-conversation-archive.ts';
import { validateCompanionVoicePreset } from '../_shared/companion-voice-selection.ts';
import { chatLanguagePreferences } from '../../../packages/together-domain/src/chat-language.ts';
import { resolveAdultAccess } from '../_shared/web-adult-access.ts';
import { projectConversationRows, safeSearchRows, signProjectedAttachments } from '../_shared/content-projection.ts';
import { conversationActionRateLimit } from '../_shared/together-request-limits.ts';
import { waitUntil } from '../_shared/background.ts';
import { normalizeChatDynamism,normalizeReasoningPreference,reasoningPreferenceAllowedForTier } from '../../../packages/together-domain/src/chat-generation.ts';
import { characterAdultStatusFromInstance, privateTextProjectionAuthorizedForConversation } from '../_shared/private-adult-text-policy.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inbox') }),
  z.object({ action: z.literal('inbox_v2'), limit: z.number().int().min(10).max(100).default(40), offset: z.number().int().min(0).max(5000).default(0) }),
  z.object({ action: z.literal('archived') }),
  z.object({ action: z.literal('open'), characterInstanceId: z.string().uuid(), limit: z.number().int().min(1).max(60).default(50) }),
  z.object({ action: z.literal('ensure'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('new'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('archive'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('delete'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('restore'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('rename'), conversationId: z.string().uuid(), title: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal('settings'), conversationId: z.string().uuid(), title: z.string().trim().max(80).nullable(), responseStyle: z.enum(['texting','paragraph']), textSize: z.enum(['small','medium','large']), contentMode: z.enum(['standard','romance','mature','explicit']).optional(), spiceLevel: z.union([z.literal(1),z.literal(2),z.literal(3)]).optional(), voicePreset: z.enum(['warm','bright','clear','strong','balanced']).nullable().optional(), chatLanguage: z.enum(chatLanguagePreferences).optional(), chatDynamism:z.union([z.literal(0),z.literal(25),z.literal(50),z.literal(75),z.literal(100)]).optional(), reasoningPreference:z.enum(['auto','none','low','medium','high']).optional() }),
  z.object({ action: z.literal('history'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('messages'), conversationId: z.string().uuid(), before: z.string().datetime().optional(), beforeSequence: z.number().int().positive().optional(), anchorMessageId: z.string().uuid().optional(), limit: z.number().int().min(1).max(60).default(50) }),
  z.object({ action: z.literal('search'), characterInstanceId: z.string().uuid(), query: z.string().trim().min(2).max(100), conversationId: z.string().uuid().optional() }),
  z.object({ action: z.literal('read'), conversationId: z.string().uuid() }),
  z.object({ action: z.literal('pin'), conversationId: z.string().uuid(), pinned: z.boolean() }),
  z.object({ action: z.literal('message_favorite'), conversationId: z.string().uuid(), messageId: z.string().uuid(), favorite: z.boolean() }),
  z.object({ action: z.literal('reset'), characterInstanceId: z.string().uuid(), mode: z.enum(['memory','relationship','full']), requestId: z.string().uuid().optional() }),
  z.object({ action: z.literal('reset_preview'), characterInstanceId: z.string().uuid() }),
  z.object({ action: z.literal('start_over'), characterInstanceId: z.string().uuid(), requestId: z.string().uuid() }),
  z.object({ action: z.literal('enter_scene'), characterInstanceId: z.string().uuid(), locationId: z.string().uuid(), conversationId: z.string().uuid().optional() }),
]);

serve(async (request, correlationId) => {
  const requestStarted=performance.now();
  const { user, db } = await authenticated(request);
  const authenticatedAt=performance.now();
  const input = await parseBody(request, schema);
  const requestLimit=conversationActionRateLimit(input.action);
  const characterScopePromise='characterInstanceId' in input&&input.action!=='start_over'
    ? requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId)
    : null;
  const [adultAccess,continuity,owned]=await Promise.all([
    resolveAdultAccess(request,user,db),
    characterScopePromise?characterScopePromise.then((scope)=>scope.continuity):activeContinuity(db,user.id),
    characterScopePromise??Promise.resolve(null),
    enforceRateLimit(db,user.id,`together_conversation_${input.action}`,requestLimit.limit,requestLimit.windowSeconds),
  ]);
  const preparedAt=performance.now();

  if (input.action === 'inbox') {
    const { data, error } = await db.from('together_conversations').select('*').eq('user_id', user.id).eq('continuity_id', continuity.id).is('archived_at', null).in('kind', ['direct', 'first_meeting','group']).order('last_message_at', { ascending: false, nullsFirst: false }).limit(100);
    if (error) throw new AppError('INTERNAL_ERROR', 'Messages could not be loaded.', 500, true);
    const enriched = (data ?? []).map((conversation) => {
      const unread = Boolean(conversation.last_assistant_message_at && (!conversation.last_read_at || new Date(conversation.last_assistant_message_at) > new Date(conversation.last_read_at)));
      // Inbox rows are always a privacy-safe projection. Full private context is
      // resolved only after the owned conversation and current roster are loaded.
      return { ...projectConversation(conversation,false), unread };
    });
    await track(db, user.id, 'conversation_inbox_viewed', { conversationCount: enriched.length, version: 1 });
    return json({ data: enriched, correlationId }, 200, correlationId);
  }

  if (input.action === 'inbox_v2') {
    const { data, error } = await db.from('together_conversations').select('*').eq('user_id', user.id).eq('continuity_id', continuity.id).is('archived_at', null).in('kind', ['direct', 'first_meeting','group']).order('last_message_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(input.offset, input.offset + input.limit);
    if (error) throw new AppError('INTERNAL_ERROR', 'Messages could not be loaded.', 500, true);
    const page = (data ?? []).slice(0, input.limit);
    const conversationIds = page.map((conversation) => String(conversation.id));
    const groupIds = page.filter((conversation) => conversation.kind === 'group').map((conversation) => String(conversation.id));
    const [participantResult, pendingResult, groupMessageResult] = await Promise.all([
      groupIds.length
        ? db.from('together_conversation_participants').select('*,together_character_instances(*,together_character_templates(*),together_character_versions(portrait_asset_key,visual_identity,personality_config,communication_style,boundaries))').eq('user_id', user.id).eq('continuity_id', continuity.id).in('conversation_id', groupIds).is('left_at', null).order('joined_at')
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? db.from('together_dialogue_turns').select('conversation_id,planned_actions,state').eq('user_id', user.id).in('conversation_id', conversationIds).in('state', ['planning','generating'])
        : Promise.resolve({ data: [], error: null }),
      groupIds.length
        ? db.from('together_messages').select('conversation_id,speaker_character_instance_id,character_instance_id,created_at,conversation_sequence,content_rating,visibility_scope').eq('user_id', user.id).in('conversation_id', groupIds).eq('role', 'assistant').order('created_at', { ascending: false }).limit(2000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (participantResult.error) throw new AppError('INTERNAL_ERROR', 'Group rosters could not be loaded.', 500, true);
    if (pendingResult.error) throw new AppError('INTERNAL_ERROR', 'Message status could not be loaded.', 500, true);
    if (groupMessageResult.error) throw new AppError('INTERNAL_ERROR', 'Group message status could not be loaded.', 500, true);
    const pendingIds = new Set((pendingResult.data ?? []).map((turn) => String(turn.conversation_id)));
    const participantNames = new Map<string, string>();
    for (const participant of participantResult.data ?? []) {
      const name = String(participant.together_character_instances?.together_character_templates?.name ?? '').trim();
      if (name) participantNames.set(String(participant.character_instance_id), name);
    }
    const latestGroupSpeaker = new Map<string, { id: string; name: string | null }>();
    const unreadCounts = new Map<string, number>();
    const lastReadByConversation = new Map(page.map((conversation) => [String(conversation.id), conversation.last_read_at ? new Date(conversation.last_read_at).getTime() : 0]));
    for (const message of groupMessageResult.data ?? []) {
      // Only non-content metadata is selected here. Count restricted private-text
      // activity without ever loading its dialogue into an inbox response.
      const conversationId = String(message.conversation_id);
      const speakerId = String(message.speaker_character_instance_id ?? message.character_instance_id ?? '');
      if (!latestGroupSpeaker.has(conversationId) && speakerId) {
        latestGroupSpeaker.set(conversationId, { id: speakerId, name: participantNames.get(speakerId) ?? null });
      }
      const createdAt = new Date(String(message.created_at)).getTime();
      if (createdAt > (lastReadByConversation.get(conversationId) ?? 0)) {
        unreadCounts.set(conversationId, Math.min(99, (unreadCounts.get(conversationId) ?? 0) + 1));
      }
    }
    const pendingSpeakerByConversation = new Map<string, string>();
    for (const turn of pendingResult.data ?? []) {
      const actions = Array.isArray(turn.planned_actions) ? turn.planned_actions : [];
      const speakerId = String(actions.find((action: any) => action && typeof action === 'object' && action.type === 'message')?.characterInstanceId ?? '');
      const name = participantNames.get(speakerId);
      if (name) pendingSpeakerByConversation.set(String(turn.conversation_id), name);
    }
    const enriched:Record<string,any>[] = page.map((conversation):Record<string,any> => {
      const conversationId = String(conversation.id);
      const restrictedOrSafeUnread=Boolean(conversation.last_assistant_message_at&&(!conversation.last_read_at||new Date(conversation.last_assistant_message_at)>new Date(conversation.last_read_at)));
      const groupUnreadCount = conversation.kind === 'group' ? unreadCounts.get(conversationId) ?? (restrictedOrSafeUnread?1:0) : undefined;
      const unread = conversation.kind === 'group'
        ? Boolean(groupUnreadCount)
        : Boolean(conversation.last_assistant_message_at && (!conversation.last_read_at || new Date(conversation.last_assistant_message_at) > new Date(conversation.last_read_at)));
      const lastSpeaker = latestGroupSpeaker.get(conversationId);
      return {
        ...projectConversation(conversation,false),
        unread,
        ...(groupUnreadCount !== undefined ? { unread_count: groupUnreadCount } : {}),
        ...(lastSpeaker ? { last_speaker_character_instance_id: lastSpeaker.id, last_speaker_name: lastSpeaker.name } : {}),
        reply_pending: pendingIds.has(conversationId),
        reply_pending_speaker_name: pendingSpeakerByConversation.get(conversationId) ?? null,
      };
    });
    const conversationById = new Map(enriched.map((conversation) => [String(conversation.id), conversation]));
    const participantsByConversation = new Map<string, any[]>();
    for (const participant of participantResult.data ?? []) {
      const key = String(participant.conversation_id);
      participantsByConversation.set(key, [...(participantsByConversation.get(key) ?? []), participant]);
    }
    const groups = groupIds.map((conversationId) => ({
      conversation: conversationById.get(conversationId),
      participants: participantsByConversation.get(conversationId) ?? [],
    })).filter((group) => Boolean(group.conversation));
    const hasMore = (data?.length ?? 0) > input.limit;
    await track(db, user.id, 'conversation_inbox_viewed', { conversationCount: enriched.length, offset: input.offset, hasMore });
    return json({ data: { conversations: enriched, groups, pageInfo: { hasMore, nextOffset: hasMore ? input.offset + enriched.length : null } }, correlationId }, 200, correlationId);
  }

  if (input.action === 'archived') {
    const now = new Date();
    const nowIso = now.toISOString();
    const { data: expired, error: expiredError } = await db.from('together_conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('continuity_id', continuity.id)
      .not('user_archived_at', 'is', null)
      .lte('restore_until', nowIso)
      .limit(100);
    if (expiredError) throw new AppError('INTERNAL_ERROR', 'Archived chats could not be loaded.', 500, true);
    let purgedCount = 0;
    for (const item of expired ?? []) {
      const { data: deleted, error: deleteError } = await db.rpc('kivelle_delete_conversation', { p_user_id: user.id, p_conversation_id: item.id });
      if (deleteError) {
        console.warn('Expired archived chat could not be purged', item.id, deleteError.message);
        continue;
      }
      const storagePaths = Array.isArray(deleted?.storagePaths) ? deleted.storagePaths.filter((path: unknown): path is string => typeof path === 'string' && path.length > 0) : [];
      await removeStoragePaths(db, user.id, storagePaths);
      purgedCount += 1;
    }

    const { data, error } = await db.from('together_conversations')
      .select('*,together_messages(count)')
      .eq('user_id', user.id)
      .eq('continuity_id', continuity.id)
      .not('user_archived_at', 'is', null)
      .gt('restore_until', nowIso)
      .order('user_archived_at', { ascending: false })
      .limit(100);
    if (error) throw new AppError('INTERNAL_ERROR', 'Archived chats could not be loaded.', 500, true);
    const enriched = (data ?? []).map((conversation) => ({ ...projectConversation(conversation,false), message_count: Number(conversation.together_messages?.[0]?.count ?? 0) }));
    await track(db, user.id, 'conversation_archive_viewed', { conversationCount: enriched.length, purgedCount });
    return json({ data: enriched, correlationId }, 200, correlationId);
  }

  if (input.action === 'open') {
    const conversation=await getActiveConversation(db,user.id,input.characterInstanceId,true);
    if(!conversation)throw new AppError('INTERNAL_ERROR','The conversation could not be opened.',500,true);
    const adultTextAuthorized=await privateTextProjectionAuthorizedForConversation({db,userId:user.id,continuityId:continuity.id,conversation,access:adultAccess});
    const fetchLimit=adultTextAuthorized?input.limit+1:Math.min(241,Math.max(input.limit+1,input.limit*4));
    const{data,error}=await db.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('user_id',user.id).eq('conversation_id',String(conversation.id)).order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(fetchLimit);
    if(error)throw new AppError('INTERNAL_ERROR','Messages could not be loaded.',500,true);
    const readAt=performance.now(),raw=(data??[])as Record<string,unknown>[];
    const projected=projectConversationRows(raw,{authorizedWebAdult:adultAccess.authorized_web_adult,authorizedPrivateAdultText:adultTextAuthorized});
    const messages=await signProjectedAttachments(db,projected.slice(0,input.limit),adultAccess.authorized_web_adult,{request,access:adultAccess,userId:user.id});
    waitUntil(track(db,user.id,'conversation_opened',{characterInstanceId:input.characterInstanceId,conversationId:conversation.id}));
    return timedJson({data:{conversation:projectConversation(conversation,adultTextAuthorized),messages,hasMore:raw.length===fetchLimit||projected.length>input.limit},correlationId},correlationId,{requestStarted,authenticatedAt,preparedAt,readAt});
  }

  if (input.action === 'ensure') {
    const conversation = await getActiveConversation(db, user.id, input.characterInstanceId, true);
    if (!conversation) throw new AppError('INTERNAL_ERROR', 'The conversation could not be opened.', 500, true);
    await track(db, user.id, 'conversation_ensured', { characterInstanceId: input.characterInstanceId, conversationId: conversation.id });
    return json({ data: projectConversation(conversation,false), correlationId }, 200, correlationId);
  }

  if (input.action === 'reset_preview') {
    const target = await requireInstanceInActiveContinuity(db, user.id, input.characterInstanceId);
    const [templateRow, conversations, memories, plans, dates, moments, photos, stories] = await Promise.all([
      db.from('together_character_templates').select('name').eq('id',String(target.instance.character_template_id)).maybeSingle(),
      db.from('together_conversations').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId).is('user_archived_at',null),
      db.from('together_memories').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId),
      db.from('together_shared_plans').select('id,status',{count:'exact'}).eq('user_id',user.id).contains('participant_instance_ids',[input.characterInstanceId]),
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
    const {data:activeScene}=await db.from('together_scene_sessions').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).is('ended_at',null).order('started_at',{ascending:false}).limit(1).maybeSingle();
    if(activeScene&&String(activeScene.location_id)!==place.location.id)throw new AppError('SCENE_NO_LONGER_AVAILABLE','They are already somewhere else. You can still message them.',409);
    const source=presence.source==='active_date'?'date':presence.source==='active_plan'?'shared_plan':'drop_in';
    let sceneSession=activeScene;
    if(!sceneSession){
      const expectedEndAt=presence.validUntil??new Date(now.getTime()+90*60_000).toISOString();
      const {data:created,error:createError}=await db.from('together_scene_sessions').insert({user_id:user.id,continuity_id:continuity.id,character_instance_id:input.characterInstanceId,conversation_id:conversation.id,world_id:place.world.id,location_id:place.location.id,source,activity_key:presence.activityKey??null,participant_instance_ids:[input.characterInstanceId],started_at:now.toISOString(),expected_end_at:expectedEndAt,state:{sequence:0,entryReason,participantCount:1}}).select('*').single();
      if(createError||!created)throw new AppError('INTERNAL_ERROR','The scene could not be entered.',500,true);
      sceneSession=created;
    }
    const {error:participantError}=await db.from('together_scene_participants').upsert({user_id:user.id,continuity_id:continuity.id,scene_session_id:sceneSession.id,character_instance_id:input.characterInstanceId,role:'primary_companion',joined_at:sceneSession.started_at,witnessed_from_sequence:1,metadata:{canonicalPrimary:true,contextVersion:1}},{onConflict:'scene_session_id,character_instance_id'});
    if(participantError)throw new AppError('INTERNAL_ERROR','The scene could not be entered.',500,true);
    const scene = { version: 1 as const, characterInstanceId: input.characterInstanceId, locationId: place.location.id, worldId: place.world.id, interactionMode: 'co_present' as const, entryReason, enteredAt: String(sceneSession.started_at), source: presence.source === 'active_event' || presence.source === 'active_date' ? 'active_event' as const : presence.source === 'active_plan' ? 'presence' as const : 'presence' as const, activityKey:presence.activityKey,activityLabel:presence.activity, sceneSessionId:String(sceneSession.id), ...(presence.sourceEventId ? { sourceEventId: presence.sourceEventId } : {}), ...((sceneSession.expected_end_at??presence.validUntil) ? { validUntil: String(sceneSession.expected_end_at??presence.validUntil) } : {}), updatedAt: now.toISOString() };
    const metadata = mergeConversationSceneMetadata((conversation.metadata ?? {}) as Record<string, any>, scene);
    const { data: updated, error } = await db.from('together_conversations').update({ metadata, updated_at: now.toISOString() }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error || !updated) throw new AppError('INTERNAL_ERROR', 'The scene could not be entered.', 500, true);
    await track(db, user.id, 'join_character_clicked', { characterInstanceId: input.characterInstanceId, locationId: input.locationId });
    await track(db, user.id, 'scene_entry_succeeded', { characterInstanceId: input.characterInstanceId, locationId: input.locationId, entryReason });
    return json({ data: { conversation: projectConversation(updated,false), scene, sceneSession, presence, place }, correlationId }, 200, correlationId);
  }

  if (input.action === 'new') {
    const access=await resolveSubscriptionAccess(db,user.id);
    const { data, error } = await db.rpc('kivelle_start_conversation', { p_user_id: user.id, p_character_instance_id: input.characterInstanceId });
    if (error || !data) {
      if(isActiveConversationLimitDatabaseError(error))throw activeConversationLimitError(access.capabilities);
      throw new AppError('INTERNAL_ERROR', 'A new conversation could not be started.', 500, true);
    }
    await track(db, user.id, 'conversation_started', { characterInstanceId: input.characterInstanceId });
    return json({ data: projectConversation(data,false), correlationId }, 200, correlationId);
  }

  if (input.action === 'history') {
    const { data, error } = await db.from('together_conversations').select('*,together_messages(count)').eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).is('user_archived_at', null).order('created_at', { ascending: false }).limit(100);
    if (error) throw new AppError('INTERNAL_ERROR', 'Conversation history could not be loaded.', 500, true);
    const adultTextAuthorized=(data?.[0])?await privateTextProjectionAuthorizedForConversation({db,userId:user.id,continuityId:continuity.id,conversation:data[0],access:adultAccess}):false;
    const enriched = (data ?? []).map((conversation) => ({ ...projectConversation(conversation,false), message_count: Number(conversation.together_messages?.[0]?.count ?? 0) }));
    await track(db, user.id, 'conversation_history_viewed', { characterInstanceId: input.characterInstanceId });
    return json({ data: enriched, correlationId }, 200, correlationId);
  }

  if (input.action === 'messages') {
    const owned=await ownedConversation(db,user.id,continuity.id,input.conversationId);
    const adultTextAuthorized=await privateTextProjectionAuthorizedForConversation({db,userId:user.id,continuityId:continuity.id,conversation:owned,access:adultAccess});
    if (input.anchorMessageId && !input.before && input.beforeSequence === undefined) {
      let anchorQuery=db.from('together_messages').select('id,created_at,conversation_sequence').eq('id', input.anchorMessageId).eq('conversation_id', input.conversationId).eq('user_id', user.id);
      if(!adultTextAuthorized)anchorQuery=anchorQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
      const{data:anchor}=await anchorQuery.maybeSingle();
      if (owned.user_archived_at && conversationArchiveExpired(owned.restore_until, new Date())) throw new AppError('NOT_FOUND', 'That archived chat is no longer available.', 404);
      if (!anchor) throw new AppError('NOT_FOUND', 'That search result is no longer available.', 404);
      const half = Math.max(1, Math.floor(input.limit / 2));
      const anchorSequence = Number(anchor.conversation_sequence ?? 0);
      let olderQuery = db.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('user_id', user.id).eq('conversation_id', owned.id);
      let newerQuery = db.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('user_id', user.id).eq('conversation_id', owned.id);
      const [olderPage, newerPage] = await Promise.all(anchorSequence > 0 ? [
        olderQuery.lte('conversation_sequence', anchorSequence).order('conversation_sequence', { ascending: false }).order('id', { ascending: false }).limit(half + 1),
        newerQuery.gt('conversation_sequence', anchorSequence).order('conversation_sequence', { ascending: true }).order('id', { ascending: true }).limit(half),
      ] : [
        olderQuery.lte('created_at', anchor.created_at).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(half + 1),
        newerQuery.gt('created_at', anchor.created_at).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(half),
      ]);
      if (olderPage.error || newerPage.error) throw new AppError('INTERNAL_ERROR', 'The surrounding conversation could not be loaded.', 500, true);
      const raw=[...(newerPage.data ?? []).reverse(), ...(olderPage.data ?? [])] as Record<string,unknown>[];
      const projected=projectConversationRows(raw,{authorizedWebAdult:adultAccess.authorized_web_adult,authorizedPrivateAdultText:adultTextAuthorized});
      const messages=await signProjectedAttachments(db,projected,adultAccess.authorized_web_adult,{request,access:adultAccess,userId:user.id});
      return json({ data: { messages, hasMore: (olderPage.data?.length ?? 0) === half + 1, conversation: projectConversation(owned,adultTextAuthorized), anchorMessageId: anchor.id }, correlationId }, 200, correlationId);
    }
    const fetchLimit=adultTextAuthorized?input.limit+1:Math.min(241,Math.max(input.limit+1,input.limit*4));
    let query = db.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('user_id', user.id).eq('conversation_id', input.conversationId).order('conversation_sequence', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(fetchLimit);
    if (input.beforeSequence !== undefined) query = query.lt('conversation_sequence', input.beforeSequence);
    else if (input.before) query = query.lt('created_at', input.before);
    const{data,error}=await query;
    if (owned.user_archived_at && conversationArchiveExpired(owned.restore_until, new Date())) throw new AppError('NOT_FOUND', 'That archived chat is no longer available.', 404);
    if (error) throw new AppError('INTERNAL_ERROR', 'Messages could not be loaded.', 500, true);
    const readAt=performance.now(),raw=(data??[]) as Record<string,unknown>[];
    const projected=projectConversationRows(raw,{authorizedWebAdult:adultAccess.authorized_web_adult,authorizedPrivateAdultText:adultTextAuthorized});
    const messages=await signProjectedAttachments(db,projected.slice(0,input.limit),adultAccess.authorized_web_adult,{request,access:adultAccess,userId:user.id});
    return timedJson({ data: { messages, hasMore: raw.length===fetchLimit||projected.length>input.limit, conversation: projectConversation(owned,adultTextAuthorized) }, correlationId },correlationId,{requestStarted,authenticatedAt,preparedAt,readAt});
  }

  if (input.action === 'search') {
    const safeQuery = input.query.replace(/[%_]/g, '').trim();
    const searchConversation=input.conversationId?await ownedConversation(db,user.id,continuity.id,input.conversationId):{id:'search',kind:'direct',character_instance_id:input.characterInstanceId};
    const adultTextAuthorized=await privateTextProjectionAuthorizedForConversation({db,userId:user.id,continuityId:continuity.id,conversation:searchConversation,access:adultAccess});
    let query = db.from('together_messages').select('id,conversation_id,role,content,created_at,content_rating,visibility_scope,moderation_version,provider_metadata,together_conversations!inner(title,archived_at,user_archived_at,character_instance_id)').eq('user_id', user.id).eq('together_conversations.character_instance_id', input.characterInstanceId).is('together_conversations.user_archived_at', null).ilike('content', `%${safeQuery}%`).order('created_at', { ascending: false }).limit(50);
    if(!adultAccess.authorized_web_adult)query=query.eq('visibility_scope','all').in('content_rating',adultTextAuthorized?['safe','suggestive','explicit']:['safe','suggestive']);
    if (input.conversationId) query = query.eq('conversation_id', input.conversationId);
    const { data, error } = await query;
    if (error) throw new AppError('INTERNAL_ERROR', 'Conversation search is unavailable.', 500, true);
    await track(db, user.id, 'conversation_search_used', { resultCount: data?.length ?? 0 });
    return json({ data: safeSearchRows(data??[],{authorizedWebAdult:adultAccess.authorized_web_adult,authorizedPrivateAdultText:adultTextAuthorized}), correlationId }, 200, correlationId);
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
    const paths = Array.isArray(data?.storagePaths) ? data.storagePaths.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0) : [];
    await removeStoragePaths(db, user.id, paths);
    await track(db, user.id, input.mode === 'memory' ? 'companion_memories_reset' : input.mode === 'relationship' ? 'relationship_reset' : 'companion_full_reset', { characterInstanceId: input.characterInstanceId });
    const safeData={...(data??{})};delete safeData.storagePaths;
    return json({ data:safeData, correlationId }, 200, correlationId);
  }

  const conversation = await ownedConversation(db, user.id,continuity.id,input.conversationId);
  if (input.action === 'settings') {
    const subscription = await resolveSubscriptionAccess(db, user.id);
    const currentMetadata = (conversation.metadata ?? {}) as Record<string, unknown>;
    const storedPreferences = currentMetadata.chatPreferences;
    const currentPreferences = storedPreferences && typeof storedPreferences === 'object' && !Array.isArray(storedPreferences) ? storedPreferences as Record<string, unknown> : {};
    const reasoningPreference=normalizeReasoningPreference(input.reasoningPreference);
    const existingReasoning=normalizeReasoningPreference(currentPreferences.reasoningPreference);
    if(input.reasoningPreference!==undefined&&reasoningPreference!==existingReasoning&&!reasoningPreferenceAllowedForTier(reasoningPreference,subscription.tier))throw new AppError('PLAN_LIMIT_REACHED',reasoningPreference==='high'?'Deep reasoning is available with Kivelle Max.':'Thoughtful reasoning is available with Kivelle+ or Max.',403,false);
    if (input.voicePreset !== undefined) {
      if (input.voicePreset !== undefined && !subscription.entitlementKeys.includes('voice_notes')) throw new AppError('PLAN_LIMIT_REACHED', 'Custom companion voices are available with Kivelle+ or Max.', 403);
    }
    const voicePreset = input.voicePreset === undefined ? undefined : await validateCompanionVoicePreset(db, String(conversation.character_instance_id), input.voicePreset);
    const storedMode=typeof currentPreferences.contentMode==='string'?currentPreferences.contentMode:'mature';
    const requestedMode=input.contentMode??storedMode;
    let contentMode=requestedMode==='standard'||requestedMode==='romance'||requestedMode==='mature'?requestedMode:'mature';
    if(requestedMode==='explicit'){
      if(!adultAccess.adult_eligibility.allowed)throw new AppError('FORBIDDEN','Confirm your age before changing this private conversation boundary.',403,false);
      const{data:participant,error:participantError}=await db.from('together_character_instances').select('id,together_character_templates(*),together_character_versions(personality_config,communication_style,boundaries)').eq('id',conversation.character_instance_id).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
      if(participantError||!participant)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
      if(characterAdultStatusFromInstance(participant).ageStatus!=='confirmed_adult')throw new AppError('FORBIDDEN','This conversation is not eligible for adult content.',403,false);
      contentMode='explicit';
    }
    const chatDynamism=normalizeChatDynamism(input.chatDynamism??currentPreferences.chatDynamism);
    const storedReasoning=normalizeReasoningPreference(input.reasoningPreference??currentPreferences.reasoningPreference);
    const chatPreferences:Record<string,unknown> = { ...currentPreferences, responseStyle: input.responseStyle, textSize: input.textSize, contentMode, chatDynamism,reasoningPreference:storedReasoning, ...(voicePreset ? { voicePreset } : {}), ...(input.chatLanguage !== undefined ? { chatLanguage: input.chatLanguage } : {}) };
    if (input.voicePreset === null) delete chatPreferences.voicePreset;
    const { data, error } = await db.from('together_conversations').update({ title: input.title, metadata: { ...currentMetadata, chatPreferences }, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Chat settings could not be saved.', 500, true);
    await track(db, user.id, 'chat_settings_updated', { conversationId: conversation.id, responseStyle: input.responseStyle, textSize: input.textSize, contentMode, chatLanguage: input.chatLanguage ?? currentPreferences.chatLanguage ?? 'en', chatDynamism,reasoningPreference:storedReasoning,customSpice: false, customVoice: Boolean(voicePreset) });
    const previousDynamism=normalizeChatDynamism(currentPreferences.chatDynamism),previousReasoning=normalizeReasoningPreference(currentPreferences.reasoningPreference);
    if(previousDynamism!==chatDynamism)await track(db,user.id,'chat_dynamism_changed',{conversationId:conversation.id,conversationMode:'direct',previousValue:previousDynamism,nextValue:chatDynamism});
    if(previousReasoning!==storedReasoning)await track(db,user.id,'reasoning_preference_changed',{conversationId:conversation.id,conversationMode:'direct',previousValue:previousReasoning,nextValue:storedReasoning});
    const adultTextAuthorized=await privateTextProjectionAuthorizedForConversation({db,userId:user.id,continuityId:continuity.id,conversation:data,access:adultAccess});
    return json({ data: projectConversation(data,adultTextAuthorized), correlationId }, 200, correlationId);
  }
  if (input.action === 'read') {
    const now = new Date().toISOString();
    await db.from('together_conversations').update({ last_read_at: now }).eq('id', conversation.id).eq('user_id', user.id);
    return json({ data: { last_read_at: now }, correlationId }, 200, correlationId);
  }
  if (input.action === 'pin') {
    const currentMetadata = conversation.metadata && typeof conversation.metadata === 'object' && !Array.isArray(conversation.metadata)
      ? conversation.metadata as Record<string, unknown>
      : {};
    const { data, error } = await db.from('together_conversations').update({
      metadata: { ...currentMetadata, pinned: input.pinned },
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'That chat could not be pinned.', 500, true);
    await track(db, user.id, 'conversation_pin_changed', { conversationId: conversation.id, pinned: input.pinned });
    return json({ data: projectConversation(data,false), correlationId }, 200, correlationId);
  }
  if (input.action === 'rename') {
    const { data, error } = await db.from('together_conversations').update({ title: input.title, updated_at: new Date().toISOString() }).eq('id', conversation.id).eq('user_id', user.id).select('*').single();
    if (error) throw new AppError('INTERNAL_ERROR', 'The conversation could not be renamed.', 500, true);
    await track(db, user.id, 'conversation_renamed', { conversationId: conversation.id });
    return json({ data: projectConversation(data,false), correlationId }, 200, correlationId);
  }
  if (input.action === 'archive' || input.action === 'delete') {
    const now = new Date();
    const archive = conversationArchiveFields(now);
    const { data, error } = await db.from('together_conversations').update({ ...archive, updated_at: archive.archived_at }).eq('id', conversation.id).eq('user_id', user.id).is('archived_at', null).select('*').maybeSingle();
    if (error || !data) throw new AppError('CONFLICT', 'This chat is already archived.', 409);
    if (conversation.kind === 'group') {
      await db.from('together_dialogue_turns').update({ state:'cancelled',cancelled_at:archive.archived_at,updated_at:archive.archived_at }).eq('conversation_id',conversation.id).in('state',['planning','generating']);
    }
    const{data:attachments,error:attachmentError}=await db.from('together_conversation_attachments').select('id,storage_path').eq('conversation_id',conversation.id).eq('user_id',user.id);
    if(attachmentError)throw new AppError('INTERNAL_ERROR','The chat was archived, but its photos could not be removed yet.',500,true);
    const paths=(attachments??[]).map((attachment)=>attachment.storage_path).filter((path):path is string=>typeof path==='string'&&path.length>0);
    if((attachments??[]).length){
      const{error:deleteAttachmentError}=await db.from('together_conversation_attachments').delete().eq('conversation_id',conversation.id).eq('user_id',user.id);
      if(deleteAttachmentError)throw new AppError('INTERNAL_ERROR','The chat was archived, but its photos could not be removed yet.',500,true);
      await removeStoragePaths(db,user.id,paths);
    }
    await track(db, user.id, 'conversation_archived', { conversationId: conversation.id, requestedAction: input.action, restoreUntil: archive.restore_until });
    return json({ data: projectConversation(data,false), correlationId }, 200, correlationId);
  }

  if (input.action === 'message_favorite') {
    const owned = await ownedConversation(db, user.id,continuity.id,input.conversationId);
    let favoriteQuery=db.from('together_messages').select('id,user_metadata').eq('id',input.messageId).eq('conversation_id',owned.id).eq('user_id',user.id);
    if(!adultAccess.authorized_web_adult)favoriteQuery=favoriteQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
    const {data:message,error:messageError}=await favoriteQuery.maybeSingle();
    if(messageError)throw new AppError('INTERNAL_ERROR','That message could not be updated.',500,true);
    if(!message)throw new AppError('NOT_FOUND','That message is no longer available.',404);
    const userMetadata={...(message.user_metadata&&typeof message.user_metadata==='object'?message.user_metadata:{}),favorite:input.favorite,favoritedAt:input.favorite?new Date().toISOString():null};
    const{data:updated,error}=await db.from('together_messages').update({user_metadata:userMetadata}).eq('id',message.id).eq('conversation_id',owned.id).eq('user_id',user.id).select('*,together_message_reactions(*)').single();
    if(error||!updated)throw new AppError('INTERNAL_ERROR','That saved message could not be updated.',500,true);
    await track(db,user.id,'message_favorite_changed',{conversationId:owned.id,messageId:message.id,favorite:input.favorite});
    return json({data:updated,correlationId},200,correlationId);
  }

  if (input.action === 'restore') {
    if (!conversation.user_archived_at || !conversation.restore_until) throw new AppError('CONFLICT', 'This chat is not in Archived Chats.', 409);
    if (conversationArchiveExpired(conversation.restore_until, new Date())) throw new AppError('ACTION_NOT_AVAILABLE', 'The 30-day restore window for this chat has ended.', 410);
    const access=await resolveSubscriptionAccess(db,user.id);
    const { data, error } = await db.rpc('kivelle_restore_conversation', { p_user_id: user.id, p_conversation_id: conversation.id });
    if (error || !data) {
      if (error?.message?.includes('ARCHIVE_EXPIRED')) throw new AppError('ACTION_NOT_AVAILABLE', 'The 30-day restore window for this chat has ended.', 410);
      if(isActiveConversationLimitDatabaseError(error))throw activeConversationLimitError(access.capabilities);
      throw new AppError('INTERNAL_ERROR', 'The chat could not be restored.', 500, true);
    }
    await track(db, user.id, 'conversation_restored', { conversationId: conversation.id, characterInstanceId: conversation.character_instance_id });
    return json({ data: projectConversation(data,false), correlationId }, 200, correlationId);
  }

  throw new AppError('ACTION_NOT_AVAILABLE', 'That conversation action is unavailable.', 400);
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

function projectConversation(conversation:Record<string,any>,authorizedWebAdult:boolean):Record<string,any>{
  const safe={...conversation};
  const canonicalContext=safe.canonical_context&&typeof safe.canonical_context==='object'&&!Array.isArray(safe.canonical_context)?safe.canonical_context:{};
  const safeContext=safe.safe_context&&typeof safe.safe_context==='object'&&!Array.isArray(safe.safe_context)?safe.safe_context:{};
  delete safe.canonical_context;
  delete safe.safe_context;
  safe.summary=authorizedWebAdult?String(canonicalContext.summary??safe.summary??'')||null:String(safeContext.summary??'')||null;
  return safe;
}

function timedJson(data:unknown,correlationId:string,timing:{requestStarted:number;authenticatedAt:number;preparedAt:number;readAt:number}):Response{
  const completedAt=performance.now(),response=json(data,200,correlationId),duration=(start:number,end:number)=>Math.max(0,end-start).toFixed(1);
  response.headers.set('Server-Timing',[
    `auth;dur=${duration(timing.requestStarted,timing.authenticatedAt)}`,
    `prepare;dur=${duration(timing.authenticatedAt,timing.preparedAt)}`,
    `read;dur=${duration(timing.preparedAt,timing.readAt)}`,
    `project;dur=${duration(timing.readAt,completedAt)}`,
    `total;dur=${duration(timing.requestStarted,completedAt)}`,
  ].join(', '));
  return response;
}

