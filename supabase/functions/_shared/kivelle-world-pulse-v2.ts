import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { WORLD_PULSE_DISCOVERY_TTL_HOURS, worldPulseIsDiscoverable, type WorldPulseV2Event } from '../../../packages/together-domain/src/world-pulse-v2.ts';
import { isWorldCatalogVisible } from '../../../packages/together-domain/src/world-access.ts';
import { resolveWorldAccess } from './together-place.ts';
import { characterCanSpeak } from '../../../packages/together-domain/src/character-life-state.ts';
import { resolveSubscriptionState } from './kivelle-subscription.ts';

export function worldPulseV2Enabled(): boolean {
  // The per-world service-only settings row is the authoritative rollout
  // switch. An explicit environment false remains an emergency global stop;
  // absence of the optional secret must not consume another project secret.
  return Deno.env.get('KIVELLE_WORLD_PULSE_V2_ENABLED')?.toLowerCase() !== 'false';
}

export async function worldPulseV2EnabledForWorld(db: SupabaseClient, worldId: string): Promise<boolean> {
  if (!worldPulseV2Enabled()) return false;
  const setting = await db.from('together_world_pulse_settings').select('enabled')
    .eq('world_id', worldId).maybeSingle();
  if (setting.error) throw new AppError('INTERNAL_ERROR', 'World Pulse settings could not be loaded.', 500, true);
  return setting.data?.enabled === true;
}

export async function loadWorldPulseV2ConversationLabel(input: { db: SupabaseClient; userId: string; continuityId: string; conversationId: string }): Promise<{ eventId: string; title: string; occurredAt: string; fresh: boolean } | null> {
  const conversation = await input.db.from('together_conversations').select('id').eq('id', input.conversationId)
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId).maybeSingle();
  if (conversation.error || !conversation.data) throw new AppError('NOT_FOUND', 'Chat not found.', 404);
  const link = await input.db.from('together_world_pulse_conversation_links').select('occurrence_id,context_snapshot')
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('conversation_id', input.conversationId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (link.error) throw new AppError('INTERNAL_ERROR', 'Pulse context could not be loaded.', 500, true);
  if (!link.data) return null;
  const occurrence = await input.db.from('together_world_pulse_occurrences').select('id,title_snapshot,occurred_at,status')
    .eq('id', link.data.occurrence_id).maybeSingle();
  if (occurrence.error || !occurrence.data) return null;
  const [display = occurrence.data] = await applyWorldPulseEditorialCorrections(input.db, [occurrence.data]);
  return { eventId: String(occurrence.data.id), title: String(display.title_snapshot),
    occurredAt: String(occurrence.data.occurred_at),
    fresh: occurrence.data.status === 'published' && worldPulseIsDiscoverable(String(occurrence.data.occurred_at), new Date().toISOString()) };
}

type Row = Record<string, any>;
export async function applyWorldPulseEditorialCorrections(db: SupabaseClient, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return rows;
  const result = await db.from('together_world_pulse_editorial_corrections')
    .select('occurrence_id,title,feed_summary,detail_body,group_message,facts,participant_copy')
    .in('occurrence_id', rows.map((row) => String(row.id)));
  if (result.error) throw new AppError('INTERNAL_ERROR', 'World Pulse corrections could not be loaded.', 500, true);
  const byId = new Map((result.data ?? []).map((item) => [String(item.occurrence_id), item as Row]));
  return rows.map((row) => {
    const correction = byId.get(String(row.id));
    if (!correction) return row;
    return { ...row, title_snapshot: correction.title, feed_summary_snapshot: correction.feed_summary,
      detail_body_snapshot: correction.detail_body, group_message_snapshot: correction.group_message,
      facts_snapshot: correction.facts, editorial_participant_copy: correction.participant_copy };
  });
}
const required = <T>(data: T | null, error: { message: string } | null, message: string): T => {
  if (error || data === null) throw new AppError('INTERNAL_ERROR', message, 500, true);
  return data;
};

export async function loadWorldPulseV2(input: {
  db: SupabaseClient; worldId: string; userId: string; continuityId: string; now?: Date;
}): Promise<{ version: 2; worldId: string; serverNow: string; generatedAt: string; events: WorldPulseV2Event[] }> {
  const now = input.now ?? new Date(), serverNow = now.toISOString();
  const access = await resolveWorldAccess({ db: input.db, userId: input.userId, worldId: input.worldId });
  if (access === 'locked' || access === 'available') throw new AppError('FORBIDDEN', 'This world is unavailable.', 403);
  const cutoff = new Date(now.getTime() - WORLD_PULSE_DISCOVERY_TTL_HOURS * 3_600_000).toISOString();
  const recent = () => input.db.from('together_world_pulse_occurrences')
    .select('id,world_id,template_id,title_snapshot,feed_summary_snapshot,event_type_snapshot,occurred_at,ends_at,significance_snapshot,location_id')
    .eq('world_id', input.worldId).eq('status', 'published')
    .gte('occurred_at', cutoff).lte('occurred_at', serverNow)
    .order('occurred_at', { ascending: false }).limit(32);
  let result = await recent();
  let rows = required(result.data, result.error, 'World Pulse could not be loaded.') as Row[];
  if (!rows.length) {
    const settings = await input.db.from('together_world_pulse_settings')
      .select('enabled,last_reserved_at,last_shortage_at').eq('world_id', input.worldId).maybeSingle();
    const recentShortage = settings.data?.last_shortage_at && Date.parse(settings.data.last_shortage_at) > now.getTime() - 3_600_000;
    if (!settings.error && settings.data?.enabled && !recentShortage) {
      const pending = await input.db.from('together_world_pulse_occurrences').select('id')
        .eq('world_id', input.worldId).eq('status', 'reserved')
        .gte('occurred_at', cutoff).lte('occurred_at', serverNow).limit(1);
      const staleReservation = !settings.data.last_reserved_at || Date.parse(settings.data.last_reserved_at) < now.getTime() - 3_600_000;
      // Bounded outage recovery: two days only. Cron owns the full 60-day plan.
      const reserve = pending.data?.length || !staleReservation ? null : await input.db.rpc('kivelle_world_pulse_reserve_world', {
        p_world_id: input.worldId, p_start_date: now.toISOString().slice(0, 10), p_days: 2,
      });
      if ((pending.data?.length || reserve?.data?.reserved) && !reserve?.error) {
        const publish = await input.db.rpc('kivelle_world_pulse_publish_due');
        if (!publish.error) {
          result = await recent();
          rows = required(result.data, result.error, 'World Pulse could not be loaded.') as Row[];
        }
      }
    }
  }
  const fresh = await applyWorldPulseEditorialCorrections(input.db,
    rows.filter((row) => worldPulseIsDiscoverable(String(row.occurred_at), serverNow)));
  console.info(JSON.stringify({ metric: 'world_pulse_v2_feed', worldId: input.worldId, occurrenceCount: fresh.length }));
  return { version: 2, worldId: input.worldId, serverNow, generatedAt: serverNow,
    events: await projectEvents(input.db, fresh, input.userId, input.continuityId) };
}

export async function loadWorldPulseV2Detail(input: {
  db: SupabaseClient; occurrenceId: string; userId: string; continuityId: string; now?: Date;
}): Promise<{ version: 2; serverNow: string; event: WorldPulseV2Event & { detailBody: string; userVisibleFacts: { id: string; text: string }[]; groupMessage: string | null; directMessages: Record<string, string>; allowedActions: { directCharacterTemplateIds: string[]; group: boolean; groupLocked: boolean } } }> {
  const serverNow = (input.now ?? new Date()).toISOString();
  const result = await input.db.from('together_world_pulse_occurrences')
    .select('id,world_id,template_id,title_snapshot,feed_summary_snapshot,detail_body_snapshot,group_message_snapshot,event_type_snapshot,occurred_at,ends_at,significance_snapshot,location_id,facts_snapshot')
    .eq('id', input.occurrenceId).eq('status', 'published').maybeSingle();
  if (result.error) throw new AppError('INTERNAL_ERROR', 'World Pulse could not be loaded.', 500, true);
  const original = result.data as Row | null;
  if (!original) throw new AppError('NOT_FOUND', 'This World Pulse is unavailable.', 404);
  const [row = original] = await applyWorldPulseEditorialCorrections(input.db, [original]);
  if (!worldPulseIsDiscoverable(String(row.occurred_at), serverNow)) {
    console.info(JSON.stringify({ metric: 'world_pulse_v2_expired_detail', occurrenceId: input.occurrenceId }));
    throw new AppError('WORLD_PULSE_EXPIRED', 'This World Pulse has passed.', 410);
  }
  if (!await worldPulseV2EnabledForWorld(input.db, String(row.world_id)))
    throw new AppError('NOT_FOUND', 'This World Pulse is unavailable.', 404);
  const worldResult = await input.db.from('together_worlds').select('id,published,metadata').eq('id', row.world_id).maybeSingle();
  if (worldResult.error || !worldResult.data || !isWorldCatalogVisible(worldResult.data)) throw new AppError('NOT_FOUND', 'This World Pulse is unavailable.', 404);
  const access = await resolveWorldAccess({ db: input.db, userId: input.userId, worldId: String(row.world_id) });
  if (access === 'locked' || access === 'available') throw new AppError('FORBIDDEN', 'This world is unavailable.', 403);
  const events = await projectEvents(input.db, [row], input.userId, input.continuityId);
  const event = events[0];
  if (!event) throw new AppError('NOT_FOUND', 'This World Pulse is unavailable.', 404);
  const participantResult = await input.db.from('together_world_pulse_occurrence_participants')
    .select('character_template_id,default_direct_message_snapshot')
    .eq('occurrence_id', row.id);
  const participants = required(participantResult.data, participantResult.error, 'World Pulse participants could not be loaded.') as Row[];
  const subscription = await resolveSubscriptionState(input.db, input.userId);
  const groupAvailable = event.participants.length > 1 && event.participants.every((item) => item.available);
  const groupEntitled = subscription.entitlementKeys.includes('group_chat');
  const facts = Array.isArray(row.facts_snapshot) ? row.facts_snapshot : [];
  const userVisibleFacts = facts.filter((fact: Row) => fact && fact.userVisible === true)
    .map((fact: Row) => ({ id: String(fact.id ?? ''), text: String(fact.text ?? '') }))
    .filter((fact: { id: string; text: string }) => fact.id && fact.text);
  // A detail open is personal engagement only. It never modifies global
  // occurrence, introductions, relationship state, memory, or schedules.
  const { error: engagementError } = await input.db.rpc('kivelle_world_pulse_open_engagement', {
    p_user_id: input.userId, p_continuity_id: input.continuityId, p_occurrence_id: row.id,
  });
  if (engagementError) throw new AppError('INTERNAL_ERROR', 'World Pulse could not be opened.', 500, true);
  console.info(JSON.stringify({ metric: 'world_pulse_v2_detail', occurrenceId: input.occurrenceId, participantCount: event.participants.length }));
  return { version: 2, serverNow, event: {
    ...event,
    detailBody: String(row.detail_body_snapshot), userVisibleFacts,
    groupMessage: typeof row.group_message_snapshot === 'string' ? row.group_message_snapshot : null,
    directMessages: Object.fromEntries(participants.map((participant) => [String(participant.character_template_id),
      String(row.editorial_participant_copy?.[String(participant.character_template_id)]?.defaultDirectMessage
        ?? participant.default_direct_message_snapshot)])),
    allowedActions: { directCharacterTemplateIds: event.participants.filter((item) => item.available).map((item) => item.characterTemplateId),
      group: groupAvailable && groupEntitled, groupLocked: groupAvailable && !groupEntitled },
  } };
}

async function projectEvents(db: SupabaseClient, rows: Row[], userId: string, continuityId: string): Promise<WorldPulseV2Event[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const locations = [...new Set(rows.map((row) => String(row.location_id)))];
  const [participantResult, locationResult] = await Promise.all([
    db.from('together_world_pulse_occurrence_participants')
      .select('occurrence_id,character_template_id,ordinal,primary_participant,role_label_snapshot')
      .in('occurrence_id', ids).order('ordinal'),
    db.from('together_locations').select('id,slug,name').in('id', locations),
  ]);
  const participants = required(participantResult.data, participantResult.error, 'World Pulse participants could not be loaded.') as Row[];
  const places = required(locationResult.data, locationResult.error, 'World Pulse locations could not be loaded.') as Row[];
  const templateIds = [...new Set(participants.map((item) => String(item.character_template_id)))];
  const [templateResult, instanceResult] = await Promise.all([
    db.from('together_character_templates').select('id,slug,name,public_handle').in('id', templateIds),
    db.from('together_character_instances').select('id,character_template_id,life_state').eq('user_id', userId)
      .eq('continuity_id', continuityId).in('character_template_id', templateIds),
  ]);
  const templates = required(templateResult.data, templateResult.error, 'World Pulse characters could not be loaded.') as Row[];
  const instances = required(instanceResult.data, instanceResult.error, 'World Pulse companions could not be loaded.') as Row[];
  const templateById = new Map(templates.map((item) => [String(item.id), item]));
  const instanceByTemplate = new Map(instances.map((item) => [String(item.character_template_id), item]));
  const placeById = new Map(places.map((item) => [String(item.id), item]));
  return rows.flatMap((row): WorldPulseV2Event[] => {
    const location = placeById.get(String(row.location_id));
    if (!location) return [];
    const ordered = participants.filter((item) => item.occurrence_id === row.id)
      .sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
      .flatMap((item) => {
        const character = templateById.get(String(item.character_template_id));
        if (!character) return [];
        const instance = instanceByTemplate.get(String(character.id));
        return [{ characterTemplateId: String(character.id), characterInstanceId: instance ? String(instance.id) : null,
          slug: String(character.slug), publicHandle: character.public_handle ? String(character.public_handle) : null,
          name: String(character.name), roleLabel: String(row.editorial_participant_copy?.[String(character.id)]?.roleLabel
            ?? item.role_label_snapshot), primary: item.primary_participant === true,
          ordinal: Number(item.ordinal), available: !instance || characterCanSpeak(instance.life_state) }];
      });
    if (!ordered.length) return [];
    return [{ id: String(row.id), worldId: String(row.world_id), templateId: String(row.template_id),
      title: String(row.title_snapshot), feedSummary: String(row.feed_summary_snapshot), eventType: String(row.event_type_snapshot),
      occurredAt: String(row.occurred_at), endsAt: String(row.ends_at), significance: Number(row.significance_snapshot),
      location: { id: String(location.id), slug: String(location.slug), name: String(location.name) }, participants: ordered }];
  });
}
