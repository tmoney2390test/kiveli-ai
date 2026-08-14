import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { corsHeaders, errorResponse } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { ConfiguredConversationAnalysisProvider, ConfiguredDialogueProvider, ConfiguredEmbeddingProvider, ConfiguredModerationProvider, dialogueProviderName } from '../_shared/together-ai.ts';
import { classifyContent, routeDialogueProvider } from '../_shared/kivelle-intelligence.ts';
import { clampRelationship, mergeConversationSummary, nextRelationshipMilestone, resolveLifeState, TOGETHER_IDS, track } from '../_shared/together.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { getActiveConversation } from '../_shared/together-conversation.ts';

const schema = z.object({ conversationId: z.string().uuid(), message: z.string().trim().min(1).max(4000), clientRequestId: z.string().min(8).max(100), characterInstanceId: z.string().uuid() });
const dialogue = new ConfiguredDialogueProvider();
const moderation = new ConfiguredModerationProvider();
const embeddings = new ConfiguredEmbeddingProvider();
const analysis = new ConfiguredConversationAnalysisProvider();
const encoder = new TextEncoder();

Deno.serve(async (request) => {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { user, db } = await authenticated(request);
    await enforceRateLimit(db, user.id, 'together_dialogue', 80, 3600);
    const input = await parseBody(request, schema);
    const { data: conversation } = await db.from('together_conversations').select('*,together_character_instances!inner(*,together_character_templates(*),together_character_versions(*))').eq('id', input.conversationId).eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).maybeSingle();
    if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    const activeConversation = await getActiveConversation(db, user.id, input.characterInstanceId);
    if (conversation.archived_at || activeConversation?.id !== conversation.id) throw new AppError('CONVERSATION_ARCHIVED', 'This conversation is no longer active.', 409, true);

    const existing = await db.from('together_messages').select('*').eq('conversation_id', input.conversationId).eq('client_request_id', input.clientRequestId).maybeSingle();
    if (existing.data) {
      const replay = await db.from('together_messages').select('*').eq('conversation_id', input.conversationId).eq('role', 'assistant').gt('created_at', existing.data.created_at).order('created_at').limit(1).maybeSingle();
      if (replay.data) return streamText(replay.data.content, replay.data, correlationId);
      throw new AppError('CONFLICT', 'That message is already being processed.', 409, true);
    }

    const inputSafety = await moderation.check(input.message);
    const contentClassification = classifyContent(input.message);
    const characterName = String((conversation.together_character_instances as Record<string, any>).together_character_templates?.name ?? 'Maya');
    const scriptedBoundary = boundaryResponse(input.message, characterName, contentClassification);
    if (scriptedBoundary || !inputSafety.allowed) {
      const boundary = scriptedBoundary ?? { text: `${characterName} pauses. “I’m not comfortable taking the conversation in that direction. We can change the subject.”`, storeOriginal: false, category: 'moderated_input' };
      const { data: boundaryUserMessage, error: boundaryUserError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'user', content: boundary.storeOriginal ? input.message : '[Message withheld by safety controls]', client_request_id: input.clientRequestId, delivery_status: 'complete', provider_metadata: { safety_redirected: true } }).select('*').single();
      if (boundaryUserError || !boundaryUserMessage) throw new AppError('INTERNAL_ERROR', 'Your message could not be handled safely.', 500, true);
      const { data: boundaryMessage, error: boundaryError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'assistant', content: boundary.text, delivery_status: 'complete', provider_metadata: { provider: 'scripted-boundary', safety_category: boundary.category } }).select('*').single();
      if (boundaryError || !boundaryMessage) throw new AppError('INTERNAL_ERROR', `${characterName} could not respond.`, 500, true);
      await db.from('together_safety_events').insert({ user_id: user.id, character_instance_id: input.characterInstanceId, direction: 'input', categories: [...new Set([...inputSafety.categories, boundary.category])], action: 'redirected' });
      await db.from('together_conversations').update({ last_message_at: boundaryMessage.created_at, updated_at: boundaryMessage.created_at, kind: conversation.kind === 'first_meeting' ? 'direct' : conversation.kind }).eq('id', input.conversationId);
      await track(db, user.id, 'message_sent', { characterInstanceId: input.characterInstanceId, safetyRedirected: true });
      await track(db, user.id, 'character_response_received', { characterInstanceId: input.characterInstanceId, safetyRedirected: true });
      return streamText(boundary.text, boundaryMessage, correlationId);
    }

    const { data: userMessage, error: insertError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'user', content: input.message, client_request_id: input.clientRequestId, delivery_status: 'complete' }).select('*').single();
    if (insertError || !userMessage) throw new AppError('INTERNAL_ERROR', 'Your message could not be saved.', 500, true);

    const instance = conversation.together_character_instances as Record<string, unknown>;
    await runLifeSimulation({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now: new Date(), evaluateProactive: false, trigger: 'conversation_continued' }).catch((error) => {
      console.error(JSON.stringify({ level: 'error', correlationId, operation: 'lazy_conversation_simulation', message: error instanceof Error ? error.message : 'unknown_error' }));
    });
    const queryEmbedding = await embeddings.embed(input.message);
    const [relationshipResult, milestoneResult, memoriesResult, semanticResult, threadsResult, recentResult, schedulesResult, eventsResult] = await Promise.all([
      db.from('together_relationship_states').select('*').eq('character_instance_id', input.characterInstanceId).single(),
      db.from('together_relationship_milestones').select('kind,title,body,prompt').eq('character_instance_id', input.characterInstanceId).eq('status', 'pending').maybeSingle(),
      db.from('together_memories').select('*').eq('character_instance_id', input.characterInstanceId).eq('status', 'active').order('pinned', { ascending: false }).order('importance', { ascending: false }).limit(20),
      queryEmbedding ? db.rpc('together_match_memories_server', { p_user_id: user.id, p_character_instance_id: input.characterInstanceId, p_embedding: queryEmbedding, p_limit: 8 }) : Promise.resolve({ data: [], error: null }),
      db.from('together_open_threads').select('*').eq('character_instance_id', input.characterInstanceId).is('resolved_at', null).order('expected_at', { ascending: true, nullsFirst: false }).limit(8),
      db.from('together_messages').select('role,content,created_at').eq('conversation_id', input.conversationId).order('created_at', { ascending: false }).limit(18),
      db.from('together_schedule_templates').select('*,together_locations(name)').eq('character_version_id', String(instance.character_version_id)),
      db.from('together_life_events').select('narrative_summary').eq('character_instance_id', input.characterInstanceId).order('starts_at', { ascending: false }).limit(3),
    ]);
    if (relationshipResult.error) throw new AppError('INTERNAL_ERROR', 'Relationship state is unavailable.', 500, true);
    const life = resolveLifeState((schedulesResult.data ?? []) as Array<Record<string, unknown>>);
    await db.from('together_character_instances').update({ current_location_id: life.locationId, current_activity: life.activity, current_mood: life.mood, current_energy: life.energy, updated_at: new Date().toISOString() }).eq('id', input.characterInstanceId);
    const now = new Date();
    await db.from('together_open_threads').update({ follow_up_eligible: true, updated_at: now.toISOString() }).eq('character_instance_id', input.characterInstanceId).is('resolved_at', null).lte('expected_at', now.toISOString());
    const characterTemplate = instance.together_character_templates as Record<string, unknown>;
    const relevantMemoryRows = selectRelevantMemoryRows(input.message, memoriesResult.data ?? [], semanticResult.data ?? []);
    const recalledIds = relevantMemoryRows.map((item) => String(item.id)).filter(Boolean);
    if (recalledIds.length) {
      await db.from('together_memories').update({ last_recalled_at: now.toISOString() }).in('id', recalledIds).eq('user_id', user.id);
      await track(db, user.id, 'memory_recalled', { characterInstanceId: input.characterInstanceId, count: recalledIds.length });
    }
    const profileResult = await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id', user.id).maybeSingle();
    const adultEligible = Boolean(profileResult.data?.age_verified_at) && Number(characterTemplate.age ?? 0) >= 18;
    const requestedMode = adultEligible ? profileResult.data?.content_preferences?.contentMode ?? 'standard' : 'standard';
    const route = routeDialogueProvider(dialogueProviderName(), requestedMode);
    const characterVersion = instance.together_character_versions as Record<string, unknown>;
    const dialogueContext = {
      character: { ...characterTemplate, personality_config: characterVersion?.personality_config, communication_style: characterVersion?.communication_style, boundaries: characterVersion?.boundaries },
      life,
      relationship: { ...relationshipResult.data, relationship_stage: instance.relationship_stage },
      progression: milestoneResult.data,
      memories: relevantMemoryRows.map((item) => String(item.canonical_text)).slice(0, 10),
      threads: (threadsResult.data ?? []).map((item) => `${item.follow_up_eligible || (item.expected_at && new Date(item.expected_at) <= now) ? 'Eligible follow-up: ' : ''}${item.topic}`),
      social: (eventsResult.data ?? []).map((item) => item.narrative_summary),
      conversationSummary: typeof conversation.summary === 'string' ? conversation.summary : '',
      recent: (recentResult.data ?? []).reverse().map((item) => ({ role: item.role, content: item.content })),
      userMessage: input.message,
      contentMode: route.resolvedMode,
    };
    if (dialogueProviderName() !== 'deterministic') {
      return streamDialogue({ db, user, input, conversation, instance, relationship: relationshipResult.data, userMessage, context: dialogueContext, correlationId });
    }
    const responseText = await dialogue.generate(dialogueContext);
    const outputSafety = await moderation.check(responseText);
    const safeText = outputSafety.allowed ? responseText : "I want to answer thoughtfully, but I need to steer this conversation somewhere safer. We can talk about what you're feeling without crossing that line.";
    if (!outputSafety.allowed) await db.from('together_safety_events').insert({ user_id: user.id, character_instance_id: input.characterInstanceId, direction: 'output', categories: outputSafety.categories, action: 'replaced' });
    const { data: assistantMessage, error: assistantError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'assistant', content: safeText, delivery_status: 'complete', provider_metadata: { provider: dialogueProviderName(), model: Deno.env.get('TOGETHER_DIALOGUE_MODEL') ?? Deno.env.get('TOGETHER_GEMINI_MODEL') ?? 'configured-default' } }).select('*').single();
    if (assistantError || !assistantMessage) throw new AppError('INTERNAL_ERROR', `${String(characterTemplate.name ?? 'Your companion')} replied, but the response could not be saved.`, 500, true);
    await safelyApplyConversationEffects(db, user.id, input.characterInstanceId, input.conversationId, userMessage.id, input.message, safeText, relationshipResult.data, String(instance.relationship_stage), correlationId);
    await db.from('together_conversations').update({ last_message_at: assistantMessage.created_at, updated_at: assistantMessage.created_at, kind: conversation.kind === 'first_meeting' ? 'direct' : conversation.kind }).eq('id', input.conversationId);
    await track(db, user.id, 'message_sent', { characterInstanceId: input.characterInstanceId });
    await track(db, user.id, 'character_response_received', { characterInstanceId: input.characterInstanceId });
    return streamText(safeText, assistantMessage, correlationId);
  } catch (error) { return errorResponse(error, correlationId); }
});

function streamText(content: string, message: Record<string, unknown>, correlationId: string): Response {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', messageId: message.id })}\n\n`));
      const parts = content.match(/\S+\s*/g) ?? [content];
      for (const token of parts) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`)); await new Promise((resolve) => setTimeout(resolve, 12)); }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', message })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Correlation-ID': correlationId } });
}

function selectRelevantMemoryRows(query: string, stored: Array<Record<string, unknown>>, semantic: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const terms = new Set(query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((term) => term.length > 2));
  const rows = new Map<string, Record<string, unknown>>();
  for (const item of semantic) rows.set(String(item.id ?? item.dedupe_key ?? item.canonical_text), item);
  for (const item of stored) {
    const words = String(item.canonical_text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ');
    const lexicalMatch = words.some((word) => terms.has(word));
    if (item.pinned || lexicalMatch) rows.set(String(item.id ?? item.dedupe_key ?? item.canonical_text), item);
  }
  return [...rows.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.importance ?? 0) - Number(a.importance ?? 0)).slice(0, 10);
}

function boundaryResponse(message: string, characterName: string, classification: ReturnType<typeof classifyContent>): { text: string; storeOriginal: boolean; category: string } | null {
  if (classification.sexual && classification.minorRelated) return { text: `${characterName}’s expression turns serious. “No. I won’t engage with sexual content involving anyone under 18.”`, storeOriginal: false, category: 'sexual_minors' };
  if (classification.sexual && classification.coercive) return { text: `${characterName} pauses. “I’m not going to engage with sexual pressure, coercion, or anything without clear consent.”`, storeOriginal: false, category: 'sexual_coercion' };
  const explicit = /\b(nudes?|naked|strip|tits?|boobs?|breasts?|sex|sexual|horny|pussy|dick|cock|fuck(?:ing)?|ass)\b/i.test(message);
  if (!explicit) return null;
  const minor = /\b(minors?|children?|underage|teen(?:ager)?s?|young girls?|young boys?)\b/i.test(message);
  if (minor) return { text: `${characterName}’s expression turns serious. “No. I won’t engage with sexual content involving anyone under 18.”`, storeOriginal: false, category: 'sexual_minors' };
  return { text: `${characterName} raises an eyebrow. “Bold—but I’m not doing nude photos. You can flirt with me, but keep it non-explicit.”`, storeOriginal: true, category: 'sexual_explicit' };
}

function streamDialogue({ db, user, input, conversation, instance, relationship, userMessage, context, correlationId }: { db: any; user: { id: string }; input: z.infer<typeof schema>; conversation: Record<string, unknown>; instance: Record<string, unknown>; relationship: Record<string, unknown>; userMessage: Record<string, unknown>; context: Parameters<ConfiguredDialogueProvider['generate']>[0]; correlationId: string }): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        emit({ type: 'start', messageId: crypto.randomUUID() });
        let content = '';
        for await (const token of dialogue.stream(context)) {
          content += token;
          emit({ type: 'token', token });
        }
        if (!content.trim()) throw new AppError('PROVIDER_UNAVAILABLE', 'Your companion needs a moment before replying.', 503, true);

        // The configured provider applies source safety settings before tokens are emitted.
        const provider = dialogueProviderName();
        const { data: assistantMessage, error: assistantError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'assistant', content, delivery_status: 'complete', provider_metadata: { provider, model: provider === 'openai' ? (Deno.env.get('KIVELLE_DIALOGUE_MODEL') ?? Deno.env.get('TOGETHER_DIALOGUE_MODEL') ?? 'configured-default') : (Deno.env.get('TOGETHER_GEMINI_MODEL') ?? Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'configured-default'), streamed: true } }).select('*').single();
        if (assistantError || !assistantMessage) throw new AppError('INTERNAL_ERROR', 'Your companion replied, but the response could not be saved.', 500, true);
        await safelyApplyConversationEffects(db, user.id, input.characterInstanceId, input.conversationId, String(userMessage.id), input.message, content, relationship, String(instance.relationship_stage), correlationId);
        await db.from('together_conversations').update({ last_message_at: assistantMessage.created_at, updated_at: assistantMessage.created_at, kind: conversation.kind === 'first_meeting' ? 'direct' : conversation.kind }).eq('id', input.conversationId);
        await track(db, user.id, 'message_sent', { characterInstanceId: input.characterInstanceId });
        await track(db, user.id, 'character_response_received', { characterInstanceId: input.characterInstanceId });
        emit({ type: 'done', message: assistantMessage });
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', correlationId, message: error instanceof Error ? error.message : 'Unknown stream error' }));
        const appError = error instanceof AppError ? error : new AppError('PROVIDER_UNAVAILABLE', 'Your companion needs a moment before replying.', 503, true);
        emit({ type: 'error', error: { code: appError.code, message: appError.message, retryable: appError.retryable } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'X-Correlation-ID': correlationId } });
}

async function safelyApplyConversationEffects(db: any, userId: string, instanceId: string, conversationId: string, sourceMessageId: string, userText: string, assistantText: string, current: Record<string, unknown>, stage: string, correlationId: string): Promise<void> {
  try {
    await applyConversationEffects(db, userId, instanceId, conversationId, sourceMessageId, userText, assistantText, current, stage);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', correlationId, operation: 'together_continuity', message: error instanceof Error ? error.message : 'Unknown continuity error' }));
  }
}

async function applyConversationEffects(db: any, userId: string, instanceId: string, conversationId: string, sourceMessageId: string, userText: string, assistantText: string, current: Record<string, unknown>, stage: string): Promise<void> {
  const [{ data: profile }, { data: existingThreads }] = await Promise.all([
    db.from('together_profiles').select('memory_categories').eq('user_id', userId).maybeSingle(),
    db.from('together_open_threads').select('*').eq('user_id', userId).eq('character_instance_id', instanceId).is('resolved_at', null).limit(20),
  ]);
  const proposal = await analysis.analyze({ userMessage: userText, assistantMessage: assistantText, existingThreads: existingThreads ?? [] });
  const enabled = (profile?.memory_categories ?? {}) as Record<string, boolean>;
  const meaningful = proposal.memoryCandidates.length > 0 || proposal.newThreads.length > 0;
  const next = clampRelationship(current, proposal.relationshipChanges, meaningful ? 4 : 2);
  const conversationCount = Number(current.conversation_count ?? 0) + 1;
  const totalDirection = Object.values(proposal.relationshipChanges).reduce((sum, value) => sum + Number(value || 0), 0);
  const recentDirection = totalDirection > 1 ? 'improving' : totalDirection < -1 ? 'strained' : 'steady';
  await db.from('together_relationship_states').update({ ...next, conversation_count: conversationCount, recent_direction: recentDirection, updated_at: new Date().toISOString() }).eq('character_instance_id', instanceId);
  await db.from('together_character_instances').update({ updated_at: new Date().toISOString() }).eq('id', instanceId);
  for (const candidate of proposal.memoryCandidates) {
    if (enabled[candidate.memory_type] === false) continue;
    const embedding = await embeddings.embed(candidate.canonical_text);
    const { data: sameSubject } = await db.from('together_memories').select('*').eq('user_id', userId).eq('character_instance_id', instanceId).eq('subject_key', candidate.subject_key).eq('status', 'active').order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(10);
    const { data: exact } = sameSubject?.length ? { data: null } : await db.from('together_memories').select('*').eq('character_instance_id', instanceId).eq('dedupe_key', candidate.dedupe_key).maybeSingle();
    const existing = (sameSubject ?? []).find((item: Record<string, unknown>) => item.dedupe_key === candidate.dedupe_key) ?? sameSubject?.[0] ?? exact;
    if (existing) {
      const sameFact = existing.dedupe_key === candidate.dedupe_key;
      const now = new Date().toISOString();
      await db.from('together_memories').update({ canonical_text: candidate.canonical_text, dedupe_key: candidate.dedupe_key, subject_key: candidate.subject_key, importance: Math.max(Number(existing.importance), candidate.importance), confidence: sameFact ? Math.min(1, Math.max(Number(existing.confidence), candidate.confidence) + .02) : candidate.confidence, embedding: embedding ?? existing.embedding, source_message_id: sourceMessageId, status: 'active', metadata: { ...(existing.metadata ?? {}), ...candidate.metadata, ...(!sameFact ? { previous_text: existing.canonical_text, corrected_at: now } : {}) }, updated_at: now }).eq('id', existing.id);
      const supersededIds = (sameSubject ?? []).filter((item: Record<string, unknown>) => item.id !== existing.id).map((item: Record<string, unknown>) => item.id);
      if (supersededIds.length) await db.from('together_memories').update({ status: 'superseded', updated_at: now }).in('id', supersededIds);
    } else {
      const { data, error } = await db.from('together_memories').insert({ user_id: userId, character_instance_id: instanceId, ...candidate, source_message_id: sourceMessageId, embedding, status: 'active' }).select('id').single();
      if (!error && data) await track(db, userId, 'memory_created', { memoryId: data.id, type: candidate.memory_type });
    }
  }
  if (enabled.open_thread !== false) {
    for (const thread of proposal.newThreads) {
      const { data: existing } = await db.from('together_open_threads').select('id').eq('user_id', userId).eq('character_instance_id', instanceId).eq('dedupe_key', thread.dedupe_key).is('resolved_at', null).maybeSingle();
      if (existing) continue;
      const { data } = await db.from('together_open_threads').insert({ user_id: userId, character_instance_id: instanceId, ...thread, source_message_id: sourceMessageId }).select('id').single();
      if (data) await track(db, userId, 'open_thread_created', { threadId: data.id });
    }
  }
  for (const threadId of proposal.resolvedThreadIds) {
    const now = new Date().toISOString();
    const { data: resolved } = await db.from('together_open_threads').update({ resolved_at: now, follow_up_eligible: false, resolution_message_id: sourceMessageId, updated_at: now }).eq('id', threadId).eq('user_id', userId).eq('character_instance_id', instanceId).is('resolved_at', null).select('id').maybeSingle();
    if (resolved) await track(db, userId, 'open_thread_resolved', { threadId });
  }
  await updateConversationSummary(db, userId, conversationId, conversationCount);
  const updated = { ...current, ...next, conversation_count: conversationCount, relationship_stage: stage };
  await ensureRelationshipMilestone(db, userId, instanceId, sourceMessageId, updated);
}

async function ensureRelationshipMilestone(db: any, userId: string, instanceId: string, sourceMessageId: string, state: Record<string, unknown>): Promise<void> {
  const proposal = nextRelationshipMilestone(state);
  if (!proposal) return;
  if (proposal.kind === 'first_date_invitation') {
    const { data: date } = await db.from('together_date_sessions').select('status').eq('user_id', userId).eq('character_instance_id', instanceId).eq('date_template_id', TOGETHER_IDS.dinner).maybeSingle();
    if (!date || !['locked','deferred'].includes(String(date.status))) return;
  }
  const { data: pending } = await db.from('together_relationship_milestones').select('*').eq('character_instance_id', instanceId).eq('status', 'pending').maybeSingle();
  if (pending) {
    if (proposal.kind !== 'repair' || pending.kind === 'repair') return;
    const now = new Date().toISOString();
    await db.from('together_relationship_milestones').update({ status: 'deferred', deferred_until: new Date(Date.now() + 86400000).toISOString(), resolved_at: now, updated_at: now, metadata: { ...(pending.metadata ?? {}), interrupted_by_repair: true } }).eq('id', pending.id).eq('status', 'pending');
  }
  const conversationCount = Number(state.conversation_count ?? 0);
  const eligibilityKey = proposal.kind === 'repair' ? `repair:${proposal.fromStage}:${Math.floor(conversationCount / 5)}` : `${proposal.kind}:${proposal.fromStage}`;
  const { data: existing } = await db.from('together_relationship_milestones').select('*').eq('character_instance_id', instanceId).eq('eligibility_key', eligibilityKey).maybeSingle();
  if (existing?.status === 'declined' || existing?.status === 'accepted' || existing?.status === 'completed') return;
  const now = new Date();
  if (existing?.status === 'deferred') {
    if (existing.deferred_until && new Date(existing.deferred_until) > now) return;
    await db.from('together_relationship_milestones').update({ status: 'pending', chosen_action: null, deferred_until: null, resolved_at: null, source_message_id: sourceMessageId, updated_at: now.toISOString() }).eq('id', existing.id);
    await track(db, userId, 'relationship_milestone_created', { milestoneId: existing.id, kind: proposal.kind, resumed: true });
    return;
  }
  const { data: created, error } = await db.from('together_relationship_milestones').insert({ user_id: userId, character_instance_id: instanceId, kind: proposal.kind, from_stage: proposal.fromStage, to_stage: proposal.toStage ?? null, eligibility_key: eligibilityKey, title: proposal.title, body: proposal.body, prompt: proposal.prompt, choices: proposal.choices, source_message_id: sourceMessageId }).select('id').single();
  if (!error && created) await track(db, userId, 'relationship_milestone_created', { milestoneId: created.id, kind: proposal.kind });
}

async function updateConversationSummary(db: any, userId: string, conversationId: string, conversationCount: number): Promise<void> {
  if (conversationCount !== 1 && conversationCount % 4 !== 0) return;
  const { data: conversation } = await db.from('together_conversations').select('summary,summary_through,summary_message_count').eq('id', conversationId).eq('user_id', userId).maybeSingle();
  let query = db.from('together_messages').select('id,role,content,created_at').eq('user_id', userId).eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(80);
  if (conversation?.summary_through) query = query.gt('created_at', conversation.summary_through);
  const { data: messages, error } = await query;
  if (error || !messages?.length) return;
  const previous = String(conversation?.summary ?? '').trim();
  const summary = mergeConversationSummary(previous, messages);
  const through = messages.at(-1)?.created_at ?? new Date().toISOString();
  await db.from('together_conversations').update({ summary, summary_through: through, summary_message_count: Number(conversation?.summary_message_count ?? 0) + messages.length, updated_at: new Date().toISOString() }).eq('id', conversationId).eq('user_id', userId).is('archived_at', null);
}
