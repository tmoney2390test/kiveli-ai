import { evaluateBehaviorPattern } from '../../../packages/together-domain/src/index.ts';

type Row = Record<string, any>;

type PatternObservation = {
  patternKey: string;
  category: 'activity_preference'|'location_preference'|'social_energy'|'planning_style'|'competition_play'|'music_choice'|'food_choice'|'conversation_pacing';
  summary: string;
  sourceId: string;
  sceneId: string;
  occurredAt: string;
  weight?: number;
};

/**
 * Behavioral patterns are deliberately conservative. A completed scene can
 * support an observation, but the pattern does not become usable until the
 * pure domain evaluator sees repeated evidence across scenes and days.
 */
export async function supportBehaviorPatterns(input: {
  db: any;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  observations: PatternObservation[];
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  for (const observation of input.observations) {
    const { data: existing } = await input.db
      .from('together_companion_user_patterns')
      .select('*')
      .eq('user_id', input.userId)
      .eq('character_instance_id', input.characterInstanceId)
      .eq('pattern_key', observation.patternKey)
      .maybeSingle();

    const prior = Array.isArray(existing?.metadata?.observations) ? existing.metadata.observations : [];
    const observations = [...prior, observation]
      .filter((item, index, all) => item && typeof item === 'object' && all.findIndex((other) => other?.sourceId === item.sourceId) === index)
      .slice(-16);
    const evaluation = evaluateBehaviorPattern(observations, now);
    const payload = {
      user_id: input.userId,
      continuity_id: input.continuityId,
      character_instance_id: input.characterInstanceId,
      pattern_key: observation.patternKey,
      category: observation.category,
      summary: observation.summary,
      confidence: evaluation.confidence,
      support_count: evaluation.supportCount,
      supporting_source_ids: observations.map((item: PatternObservation) => item.sourceId),
      first_supported_at: observations[0]?.occurredAt ?? observation.occurredAt,
      last_supported_at: observation.occurredAt,
      status: evaluation.eligible ? 'active' : 'candidate',
      metadata: { version: 1, observations, reasonCodes: evaluation.reasonCodes },
      updated_at: now.toISOString(),
    };
    if (existing) {
      await input.db.from('together_companion_user_patterns').update(payload).eq('id', existing.id).eq('user_id', input.userId);
    } else {
      await input.db.from('together_companion_user_patterns').insert(payload);
    }
  }
}

/** Extract only non-sensitive, action-backed behavioral observations. */
export function observationsFromScene(input: { scene: Row; actions: Row[] }): PatternObservation[] {
  const occurredAt = String(input.scene.ended_at ?? new Date().toISOString());
  const source = (action: Row) => String(action.id);
  const observations: PatternObservation[] = [];
  for (const action of input.actions) {
    const key = String(action.interaction_key ?? '');
    if (/go_somewhere_quieter|step_outside/.test(key)) observations.push({ patternKey: 'prefers_quieter_followups_after_nightlife', category: 'social_energy', summary: 'The user often chooses a quieter follow-up after nightlife.', sourceId: source(action), sceneId: String(input.scene.id), occurredAt, weight: .9 });
    if (/karaoke\.|live_music\./.test(key)) observations.push({ patternKey: 'enjoys_music_together', category: 'music_choice', summary: 'The user often chooses music-centered activities together.', sourceId: source(action), sceneId: String(input.scene.id), occurredAt, weight: .7 });
    if (/arcade\.|trivia\.|challenge|rematch/.test(key)) observations.push({ patternKey: 'likes_playful_competition', category: 'competition_play', summary: 'The user often chooses playful competition together.', sourceId: source(action), sceneId: String(input.scene.id), occurredAt, weight: .7 });
    if (/walk|hiking|scenic|park/.test(key)) observations.push({ patternKey: 'enjoys_outdoor_time_together', category: 'activity_preference', summary: 'The user often chooses outdoor time together.', sourceId: source(action), sceneId: String(input.scene.id), occurredAt, weight: .65 });
  }
  return observations;
}
