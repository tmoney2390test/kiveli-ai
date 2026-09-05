import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

type Row = Record<string, any>;

export type PublicCharacterConnection = {
  id: string;
  worldId: string;
  direction: 'outgoing' | 'incoming' | 'mutual';
  relationshipLabel: string;
  history: string | null;
  character: {
    id: string;
    name: string;
    slug: string;
    public_handle: string | null;
    age: number;
    occupation: string;
    spice_level: number | null;
    together_character_versions: {
      id: string;
      portrait_asset_key: string | null;
      appearance_config: Record<string, unknown>;
    };
  };
};

export function characterTemplateVisibleToViewer(template: Row, userId: string): boolean {
  if (String(template.creator_id ?? '') === userId) {
    return ['ready', 'published'].includes(String(template.lifecycle_status ?? ''));
  }
  return template.creator_id == null
    && template.published === true
    && template.can_be_selected === true
    && template.visibility !== 'private'
    && template.lifecycle_status !== 'archived';
}

export function projectPublicCharacterConnections(input: {
  sourceTemplateId: string;
  worldId: string;
  viewerUserId: string;
  edges: Row[];
  targets: Row[];
}): PublicCharacterConnection[] {
  const targets = new Map(input.targets
    .filter((target) => characterTemplateVisibleToViewer(target, input.viewerUserId))
    .map((target) => [String(target.id), target]));
  const pairs = new Map<string, { outgoing?: Row; incoming?: Row }>();

  for (const edge of input.edges) {
    if (String(edge.world_id) !== input.worldId) continue;
    const sourceId = String(edge.source_template_id ?? '');
    const targetId = String(edge.target_template_id ?? '');
    const outgoing = sourceId === input.sourceTemplateId && targetId !== input.sourceTemplateId;
    const incoming = targetId === input.sourceTemplateId && sourceId !== input.sourceTemplateId;
    if (!outgoing && !incoming) continue;
    const otherId = outgoing ? targetId : sourceId;
    if (!targets.has(otherId)) continue;
    const pair = pairs.get(otherId) ?? {};
    if (outgoing) pair.outgoing = edge;
    else pair.incoming = edge;
    pairs.set(otherId, pair);
  }

  return [...pairs.entries()].map(([otherId, pair]) => {
    const target = targets.get(otherId)!;
    const versions = Array.isArray(target.together_character_versions) ? target.together_character_versions : [];
    const version = versions.find((item: Row) => Number(item.version) === Number(target.current_published_version)) ?? versions[0] ?? {};
    const primary = pair.outgoing ?? pair.incoming ?? {};
    const scores = [pair.outgoing, pair.incoming].filter(Boolean) as Row[];
    const salience = Math.max(...scores.map((edge) => Math.abs(Number(edge.affinity ?? 50) - 50) + Math.abs(Number(edge.trust ?? 50) - 50)), 0)
      + (pair.outgoing && pair.incoming ? 20 : 0)
      + (String(primary.history ?? '').trim() ? 5 : 0);
    return {
      connection: {
        id: `${input.worldId}:${otherId}`,
        worldId: input.worldId,
        direction: pair.outgoing && pair.incoming ? 'mutual' as const : pair.outgoing ? 'outgoing' as const : 'incoming' as const,
        relationshipLabel: String(primary.relationship_type ?? 'connection').trim().slice(0, 100) || 'connection',
        history: String(primary.history ?? '').trim().slice(0, 500) || null,
        character: {
          id: otherId,
          name: String(target.name ?? 'Unknown character').slice(0, 100),
          slug: String(target.slug ?? otherId).slice(0, 160),
          public_handle: target.public_handle ? String(target.public_handle).slice(0, 160) : null,
          age: Number(target.age ?? 0),
          occupation: String(target.occupation ?? '').slice(0, 160),
          spice_level: Number.isFinite(Number(target.spice_level)) ? Number(target.spice_level) : null,
          together_character_versions: {
            id: String(version.id ?? ''),
            portrait_asset_key: version.portrait_asset_key ? String(version.portrait_asset_key) : null,
            appearance_config: version.appearance_config && typeof version.appearance_config === 'object' && !Array.isArray(version.appearance_config)
              ? version.appearance_config as Record<string, unknown>
              : {},
          },
        },
      },
      salience,
    };
  }).sort((left, right) => right.salience - left.salience || left.connection.character.name.localeCompare(right.connection.character.name))
    .slice(0, 48)
    .map((item) => item.connection);
}

export async function loadCharacterProfileDetails(db: SupabaseClient, viewerUserId: string, characterTemplateId: string, requestedWorldId?: string | null) {
  const { data: template, error: templateError } = await db.from('together_character_templates')
    .select('id,current_published_version,published,can_be_selected,creator_id,visibility,lifecycle_status,first_meeting')
    .eq('id', characterTemplateId).maybeSingle();
  if (templateError || !template || !characterTemplateVisibleToViewer(template, viewerUserId)) {
    throw new AppError('NOT_FOUND', 'That companion profile is unavailable.', 404);
  }

  const { data: version, error: versionError } = await db.from('together_character_versions').select('id')
    .eq('character_template_id', template.id).eq('version', template.current_published_version).maybeSingle();
  if (versionError || !version) throw new AppError('NOT_FOUND', 'That companion profile is unavailable.', 404);

  const { data: schedules, error: scheduleError } = await db.from('together_schedule_templates').select('*')
    .eq('character_version_id', version.id).order('day_of_week').order('start_minute').limit(100);
  if (scheduleError) throw new AppError('INTERNAL_ERROR', 'That companion profile could not be loaded right now.', 500, true);

  let worldId = (requestedWorldId ?? String((template.first_meeting as Row | null)?.world_id ?? '')) || null;
  if (worldId) {
    const { data: world, error: worldError } = await db.from('together_worlds').select('id').eq('id', worldId).eq('published', true).maybeSingle();
    if (worldError || !world) throw new AppError('NOT_FOUND', 'That world is unavailable.', 404);
  }
  if (!worldId) {
    const { data: presence } = await db.from('together_character_world_presence').select('world_id,together_worlds!inner(published)')
      .eq('character_version_id', version.id).neq('presence_type', 'unavailable').eq('together_worlds.published', true).limit(1).maybeSingle();
    worldId = presence?.world_id ? String(presence.world_id) : null;
  }
  if (!worldId) return { characterTemplateId: template.id, characterVersionId: version.id, worldId: null, schedules: schedules ?? [], connections: [] };

  const [outgoing, incoming] = await Promise.all([
    db.from('together_character_relationship_edges').select('world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history')
      .eq('world_id', worldId).eq('source_template_id', template.id).limit(100),
    db.from('together_character_relationship_edges').select('world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history')
      .eq('world_id', worldId).eq('target_template_id', template.id).limit(100),
  ]);
  if (outgoing.error || incoming.error) throw new AppError('INTERNAL_ERROR', 'Character relationships could not be loaded right now.', 500, true);
  const edges = [...(outgoing.data ?? []), ...(incoming.data ?? [])];
  const targetIds = [...new Set(edges.flatMap((edge) => [String(edge.source_template_id), String(edge.target_template_id)]).filter((id) => id !== template.id))];
  const targetsResult = targetIds.length ? await db.from('together_character_templates')
    .select('id,name,slug,public_handle,age,occupation,spice_level,creator_id,current_published_version,published,can_be_selected,visibility,lifecycle_status,together_character_versions(id,version,portrait_asset_key,appearance_config)')
    .in('id', targetIds) : { data: [], error: null };
  if (targetsResult.error) throw new AppError('INTERNAL_ERROR', 'Character relationships could not be loaded right now.', 500, true);

  return {
    characterTemplateId: String(template.id),
    characterVersionId: String(version.id),
    worldId,
    schedules: schedules ?? [],
    connections: projectPublicCharacterConnections({ sourceTemplateId: String(template.id), worldId, viewerUserId, edges, targets: targetsResult.data ?? [] }),
  };
}
