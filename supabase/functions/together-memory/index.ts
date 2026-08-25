import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { resolveSubscriptionState } from '../_shared/kivelle-subscription.ts';
import { manualMemoryText, memorySourceContext, resolveMemoryProductAccess } from '../_shared/kivelle-memory-access.ts';

type Row = Record<string, any>;

const categoryPreferences = z.object({
  semantic: z.boolean().optional(),
  preference: z.boolean().optional(),
  episodic: z.boolean().optional(),
  relationship: z.boolean().optional(),
  emotional: z.boolean().optional(),
  open_thread: z.boolean().optional(),
}).strict();

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('overview'), characterInstanceId: z.string().uuid(), privacyMode: z.boolean().default(false) }),
  z.object({ action: z.literal('edit'), memoryId: z.string().uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('forget'), memoryId: z.string().uuid() }),
  z.object({ action: z.literal('pin'), memoryId: z.string().uuid(), pinned: z.boolean() }),
  z.object({ action: z.literal('preferences'), categories: categoryPreferences }),
  z.object({ action: z.literal('forget_all'), characterInstanceId: z.string().uuid().optional() }),
  z.object({ action: z.literal('remember_message'), messageId: z.string().uuid(), characterInstanceId: z.string().uuid() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_memory', 120, 3600);
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);

  if (input.action === 'overview') {
    const companion = await loadCompanion(db, user.id, continuity.id, input.characterInstanceId);
    const subscription = await resolveSubscriptionState(db, user.id);
    const access = resolveMemoryProductAccess(subscription.tier, subscription.entitlementKeys);
    if (!input.privacyMode && !access.inspector) {
      const countQuery = await db.from('together_memories').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('continuity_id', continuity.id).eq('character_instance_id', companion.id).eq('status', 'active');
      if (countQuery.error) throw new AppError('INTERNAL_ERROR', 'Memories could not be counted.', 500, true);
      return json({ data: { access, tier: subscription.tier, count: Number(countQuery.count ?? 0), memories: [], categories: {}, insights: null }, correlationId }, 200, correlationId);
    }
    const query = await db.from('together_memories').select([
      'id','character_instance_id','memory_type','canonical_text','importance','confidence','pinned','status',
      'source_id','source_message_id','source_type','learned_via','location_id','supersedes_memory_id',
      'last_retrieved_at','last_mentioned_at','retrieval_count','mention_count','reinforcement_count','metadata','created_at','updated_at',
    ].join(','), { count: 'exact' }).eq('user_id', user.id).eq('continuity_id', continuity.id).eq('character_instance_id', companion.id).eq('status', 'active').order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(250);
    if (query.error) throw new AppError('INTERNAL_ERROR', 'Memories could not be loaded.', 500, true);
    const rows = query.data ?? [];
    const count = Number(query.count ?? rows.length);

    const locationIds = [...new Set(rows.map(memoryLocationId).filter(Boolean))];
    const locations = locationIds.length ? await db.from('together_locations').select('id,name').in('id', locationIds) : { data: [], error: null };
    if (locations.error) throw new AppError('INTERNAL_ERROR', 'Memory places could not be loaded.', 500, true);
    const locationNames = new Map((locations.data ?? []).map((location: Row) => [String(location.id), String(location.name)]));
    const memories = rows.map((row: Row) => safeMemory(row, locationNames.get(memoryLocationId(row)), input.privacyMode));
    const insights = access.maxInsights && !input.privacyMode ? await loadMaxInsights(db, user.id, continuity.id, companion.id, rows) : null;
    return json({ data: { access, tier: subscription.tier, count, memories, categories: categoryCounts(rows), insights }, correlationId }, 200, correlationId);
  }

  if (input.action === 'preferences') {
    const { error } = await db.from('together_profiles').update({ memory_categories: input.categories, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not update memory preferences.', 500, true);
    return json({ data: { categories: input.categories }, correlationId }, 200, correlationId);
  }

  if (input.action === 'forget_all') {
    const companion = input.characterInstanceId
      ? await loadCompanion(db, user.id, continuity.id, input.characterInstanceId)
      : null;
    const { data, error } = await db.rpc('kivelle_forget_memory_scope', {
      p_user_id: user.id,
      p_continuity_id: continuity.id,
      p_character_instance_id: companion?.id ?? null,
    });
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Remembered information could not be erased.', 500, true);
    await track(db, user.id, 'memory_deleted', { scope: companion ? 'companion' : 'life', characterInstanceId: companion?.id ?? null });
    return json({ data, correlationId }, 200, correlationId);
  }

  const subscription = await resolveSubscriptionState(db, user.id);
  const access = resolveMemoryProductAccess(subscription.tier, subscription.entitlementKeys);
  if (['edit', 'pin', 'remember_message'].includes(input.action) && !access.manualControl) {
    throw new AppError('PLAN_LIMIT_REACHED', 'Memory curation is available with Kivelle+.', 403);
  }

  if (input.action === 'remember_message') {
    const companion = await loadCompanion(db, user.id, continuity.id, input.characterInstanceId);
    const { data: message, error: messageError } = await db.from('together_messages').select('id,conversation_id,role,content,character_instance_id,speaker_character_instance_id,created_at').eq('id', input.messageId).eq('user_id', user.id).maybeSingle();
    if (messageError || !message || !['user', 'assistant'].includes(String(message.role)) || !String(message.content ?? '').trim()) throw new AppError('NOT_FOUND', 'That message is unavailable.', 404);
    const { data: conversation, error: conversationError } = await db.from('together_conversations').select('id,kind,continuity_id,character_instance_id').eq('id', message.conversation_id).eq('user_id', user.id).eq('continuity_id', continuity.id).maybeSingle();
    if (conversationError || !conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    if (conversation.kind === 'group') {
      const { data: participant } = await db.from('together_conversation_participants').select('id').eq('conversation_id', conversation.id).eq('character_instance_id', companion.id).is('left_at', null).maybeSingle();
      if (!participant) throw new AppError('VALIDATION_ERROR', 'Choose a companion in this conversation.', 400);
    } else if (String(conversation.character_instance_id) !== companion.id) throw new AppError('VALIDATION_ERROR', 'That message belongs to another relationship.', 400);
    if (message.role === 'assistant' && String(message.speaker_character_instance_id ?? message.character_instance_id ?? '') !== companion.id) {
      throw new AppError('VALIDATION_ERROR', 'That message belongs to another companion.', 400);
    }
    const authored = manualMemoryText({ role: String(message.role), content: String(message.content), characterName: companion.name });
    const now = new Date().toISOString();
    const { data, error } = await db.from('together_memories').upsert({
      user_id: user.id,
      continuity_id: continuity.id,
      character_instance_id: companion.id,
      memory_type: authored.memoryType,
      canonical_text: authored.canonicalText,
      dedupe_key: `manual-message:${message.id}`,
      subject_key: `manual-message:${message.id}`,
      importance: .9,
      confidence: 1,
      pinned: true,
      status: 'active',
      source_message_id: message.id,
      source_type: 'manual',
      source_id: message.id,
      learned_via: message.role === 'user' ? 'direct_user' : 'system_event',
      shareability: 'private',
      valid_from: message.created_at ?? now,
      metadata: { manual: true, originalRole: message.role },
      updated_at: now,
    }, { onConflict: 'character_instance_id,dedupe_key' }).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'That message could not be remembered.', 500, true);
    await track(db, user.id, 'memory_created', { memoryId: data.id, type: data.memory_type, source: 'manual_message' });
    return json({ data: safeMemory(data, null, false), correlationId }, 200, correlationId);
  }

  const { data: existing, error: existingError } = await db.from('together_memories').select('*').eq('id', input.memoryId).eq('user_id', user.id).eq('continuity_id', continuity.id).maybeSingle();
  if (existingError) throw new AppError('INTERNAL_ERROR', 'That memory could not be checked.', 500, true);
  if (!existing) throw new AppError('NOT_FOUND', 'That memory no longer exists.', 404);
  const now = new Date().toISOString();
  const patch = input.action === 'edit'
    ? { canonical_text: input.text, embedding: null, metadata: { ...(existing.metadata ?? {}), userEditedAt: now }, updated_at: now }
    : input.action === 'forget'
    ? { status: 'forgotten', embedding: null, valid_to: now, updated_at: now }
    : { pinned: input.pinned, updated_at: now };
  const { data, error } = await db.from('together_memories').update(patch).eq('id', input.memoryId).eq('user_id', user.id).eq('continuity_id', continuity.id).select('*').maybeSingle();
  if (error) throw new AppError('INTERNAL_ERROR', 'Could not update that memory.', 500, true);
  if (!data) throw new AppError('NOT_FOUND', 'That memory no longer exists.', 404);
  await track(db, user.id, input.action === 'forget' ? 'memory_deleted' : 'memory_edited', { memoryId: input.memoryId, action: input.action });
  return json({ data: safeMemory(data, null, false), correlationId }, 200, correlationId);
});

async function loadCompanion(db: any, userId: string, continuityId: string, characterInstanceId: string): Promise<{ id: string; name: string }> {
  const { data, error } = await db.from('together_character_instances').select('id,together_character_templates(name)').eq('id', characterInstanceId).eq('user_id', userId).eq('continuity_id', continuityId).maybeSingle();
  const template = Array.isArray(data?.together_character_templates) ? data.together_character_templates[0] : data?.together_character_templates;
  if (error || !data) throw new AppError('NOT_FOUND', 'That companion is unavailable.', 404);
  return { id: String(data.id), name: String(template?.name ?? 'Your companion') };
}

function safeMemory(row: Row, locationName: string | null | undefined, privacyMode: boolean) {
  const base = {
    id: String(row.id),
    character_instance_id: String(row.character_instance_id),
    memory_type: String(row.memory_type),
    canonical_text: String(row.canonical_text),
    pinned: Boolean(row.pinned),
    status: String(row.status ?? 'active'),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
  if (privacyMode) return base;
  return {
    ...base,
    importance: Number(row.importance ?? 0),
    confidence: Number(row.confidence ?? 0),
    source_type: row.source_type ? String(row.source_type) : null,
    learned_via: row.learned_via ? String(row.learned_via) : null,
    location_id: row.location_id ? String(row.location_id) : null,
    last_retrieved_at: row.last_retrieved_at ? String(row.last_retrieved_at) : null,
    last_mentioned_at: row.last_mentioned_at ? String(row.last_mentioned_at) : null,
    retrieval_count: Number(row.retrieval_count ?? 0),
    mention_count: Number(row.mention_count ?? 0),
    reinforcement_count: Number(row.reinforcement_count ?? 0),
    sourceContext: memorySourceContext(row, locationName),
    knowledgeKind: row.learned_via === 'inferred_pattern' ? 'inferred' : 'direct',
    corrected: Boolean(row.supersedes_memory_id),
  };
}

function memoryLocationId(row: Row): string {
  return String(row.location_id ?? row.metadata?.locationId ?? row.metadata?.location_id ?? '');
}

function categoryCounts(rows: Row[]) {
  return rows.reduce((counts: Record<string, number>, row: Row) => {
    const key = String(row.memory_type ?? 'semantic');
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

async function loadMaxInsights(db: any, userId: string, continuityId: string, characterInstanceId: string, memories: Row[]) {
  const [reflection, patterns] = await Promise.all([
    db.from('together_relationship_reflections').select('relationship_summary,shared_references,updated_at').eq('user_id', userId).eq('continuity_id', continuityId).eq('character_instance_id', characterInstanceId).maybeSingle(),
    db.from('together_companion_user_patterns').select('category,summary,confidence,support_count,updated_at').eq('user_id', userId).eq('continuity_id', continuityId).eq('character_instance_id', characterInstanceId).eq('status', 'active').order('confidence', { ascending: false }).limit(8),
  ]);
  if (reflection.error || patterns.error) throw new AppError('INTERNAL_ERROR', 'Deeper memory insights could not be loaded.', 500, true);
  const recalled = [...memories].filter((memory) => Number(memory.retrieval_count ?? 0) > 0).sort((left, right) => Number(right.retrieval_count ?? 0) - Number(left.retrieval_count ?? 0)).slice(0, 5).map((memory) => String(memory.canonical_text));
  return {
    relationshipSummary: String(reflection.data?.relationship_summary ?? ''),
    sharedReferences: Array.isArray(reflection.data?.shared_references) ? reflection.data.shared_references.map(String).slice(0, 8) : [],
    learnedPatterns: (patterns.data ?? []).map((pattern: Row) => ({ category: String(pattern.category), summary: String(pattern.summary) })),
    recalledReferences: recalled,
  };
}
