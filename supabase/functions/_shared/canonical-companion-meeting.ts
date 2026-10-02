import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { resolveWorldAccess } from './together-place.ts';

const relationOne = (value: unknown): Record<string, any> | null => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === 'object' ? item as Record<string, any> : null;
};

/** Shared canonical contact/instance preparation for normal meeting and Pulse.
 * This does not create a conversation, scene, or active-companion switch. */
export async function ensureCanonicalCompanionInstance(input: {
  db: SupabaseClient; userId: string; continuityId: string;
  template: Record<string, any>; version: Record<string, any>;
  existing?: Record<string, any> | null; preferredWorldId?: string; now?: string;
}): Promise<Record<string, any>> {
  const { db, userId, continuityId, template, version } = input;
  const now = input.now ?? new Date().toISOString();
  let instance = input.existing;
  if (instance === undefined) {
    const result = await db.from('together_character_instances').select('*')
      .eq('user_id', userId).eq('continuity_id', continuityId)
      .eq('character_template_id', template.id).maybeSingle();
    if (result.error) throw new AppError('INTERNAL_ERROR', 'Companion could not be prepared.', 500, true);
    instance = result.data;
  }
  if (!instance) {
    const meeting = (template.first_meeting ?? {}) as Record<string, unknown>;
    let locationId = typeof (meeting.location_id ?? meeting.locationId) === 'string' ? String(meeting.location_id ?? meeting.locationId) : null;
    let worldId: string | null = null;
    if (locationId) {
      const { data: valid } = await db.from('together_locations').select('id,world_id').eq('id', locationId).maybeSingle();
      if (!valid || (input.preferredWorldId && valid.world_id !== input.preferredWorldId)) locationId = null;
      else worldId = String(valid.world_id);
    }
    if (!locationId) {
      const presences = await db.from('together_character_world_presence')
        .select('world_id,home_location_id,together_worlds(default_arrival_location_id)')
        .eq('character_version_id', version.id)
        .neq('presence_type', 'unavailable')
        .order('presence_type', { ascending: true }).limit(20);
      if (presences.error) throw new AppError('INTERNAL_ERROR', 'Companion home could not be loaded.', 500, true);
      for (const presence of presences.data ?? []) {
        if (input.preferredWorldId && presence.world_id !== input.preferredWorldId) continue;
        const access = await resolveWorldAccess({ db, userId, worldId: String(presence.world_id) });
        if (access === 'locked' || access === 'available') continue;
        locationId = presence.home_location_id ?? relationOne(presence.together_worlds)?.default_arrival_location_id ?? null;
        if (locationId) { worldId = String(presence.world_id); break; }
      }
    }
    if (!locationId) throw new AppError('CONFLICT', 'This companion does not have a published first-meeting place yet.', 409);
    if (worldId) {
      const access = await resolveWorldAccess({ db, userId, worldId });
      if (access === 'locked' || access === 'available') throw new AppError('NOT_FOUND', 'That companion is not available yet.', 404);
    }
    const created = await db.from('together_character_instances').insert({
      user_id: userId, continuity_id: continuityId,
      character_template_id: template.id, character_version_id: version.id,
      relationship_stage: 'stranger', current_mood: String(meeting.mood ?? 'curious'),
      current_location_id: locationId, current_activity: String(meeting.companion_activity ?? 'meeting someone new'),
      current_energy: 'medium', introduced_at: now, contact_added_at: now,
      metadata: { first_meeting_title: meeting.title ?? null }, updated_at: now,
    }).select('*').single();
    if (created.error || !created.data) {
      const retry = await db.from('together_character_instances').select('*')
        .eq('user_id', userId).eq('continuity_id', continuityId)
        .eq('character_template_id', template.id).maybeSingle();
      if (!retry.data) throw new AppError('INTERNAL_ERROR', 'Your first meeting could not begin.', 500, true);
      instance = retry.data;
    } else instance = created.data;
  } else {
    const updated = await db.from('together_character_instances').update({
      introduced_at: instance.introduced_at ?? now, contact_added_at: instance.contact_added_at ?? now, updated_at: now,
    }).eq('id', instance.id).eq('user_id', userId).eq('continuity_id', continuityId).select('*').single();
    if (updated.error || !updated.data) throw new AppError('INTERNAL_ERROR', 'Companion could not be prepared.', 500, true);
    instance = updated.data;
  }
  if (!instance) throw new AppError('INTERNAL_ERROR', 'Companion could not be prepared.', 500, true);
  const { error: relationshipError } = await db.from('together_relationship_states')
    .upsert({ character_instance_id: instance.id, user_id: userId }, { onConflict: 'character_instance_id', ignoreDuplicates: true });
  if (relationshipError) throw new AppError('INTERNAL_ERROR', 'Companion relationship could not be prepared.', 500, true);
  return instance;
}
