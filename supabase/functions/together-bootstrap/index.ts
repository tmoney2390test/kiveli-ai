import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot, resolveLifeState, TOGETHER_IDS, track } from '../_shared/together.ts';

const schema = z.object({
  ageConfirmed: z.literal(true),
  displayName: z.string().trim().min(1).max(50).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  goals: z.array(z.enum(['Dating','Friendship','Stories','Social worlds'])).max(4).default([]),
});

serve(async (request, correlationId) => {
  if (request.method === 'GET') {
    const { user, db } = await authenticated(request);
    return json({ data: await buildSnapshot(db, user.id), correlationId }, 200, correlationId);
  }
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_bootstrap', 20, 3600);
  const input = await parseBody(request, schema);
  const now = new Date().toISOString();
  const { error: profileError } = await db.from('together_profiles').upsert({ user_id: user.id, display_name: input.displayName ?? user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'You', age_verified_at: now, interests: input.interests, experience_goals: input.goals, onboarding_completed_at: now, updated_at: now }, { onConflict: 'user_id' });
  if (profileError) throw new AppError('INTERNAL_ERROR', 'Could not start your Together story.', 500, true);

  const templates = [
    { template: TOGETHER_IDS.maya, version: TOGETHER_IDS.mayaVersion, mood: 'curious', location: TOGETHER_IDS.juniper, activity: 'waiting for coffee', introduced: now, contact: null },
    { template: TOGETHER_IDS.chloe, version: TOGETHER_IDS.chloeVersion, mood: 'adventurous', location: TOGETHER_IDS.rooftop, activity: 'heading to Skyline Rooftop', introduced: null, contact: null },
    { template: TOGETHER_IDS.alex, version: TOGETHER_IDS.alexVersion, mood: 'thoughtful', location: TOGETHER_IDS.riverwalk, activity: 'finishing a photo walk', introduced: null, contact: null },
  ];
  for (const character of templates) {
    const { error } = await db.from('together_character_instances').upsert({ user_id: user.id, character_template_id: character.template, character_version_id: character.version, relationship_stage: 'stranger', current_mood: character.mood, current_location_id: character.location, current_activity: character.activity, current_energy: 'medium', introduced_at: character.introduced, contact_added_at: character.contact, updated_at: now }, { onConflict: 'user_id,character_template_id', ignoreDuplicates: true });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not create your City Life characters.', 500, true);
  }
  const { data: instances, error: instanceError } = await db.from('together_character_instances').select('id,character_template_id').eq('user_id', user.id);
  if (instanceError || !instances?.length) throw new AppError('INTERNAL_ERROR', 'Could not load your characters.', 500, true);
  for (const instance of instances) await db.from('together_relationship_states').upsert({ character_instance_id: instance.id, user_id: user.id }, { onConflict: 'character_instance_id', ignoreDuplicates: true });
  const maya = instances.find((item) => item.character_template_id === TOGETHER_IDS.maya);
  if (!maya) throw new AppError('INTERNAL_ERROR', 'Maya could not enter City Life.', 500, true);
  await db.from('together_profiles').update({ active_companion_instance_id: maya.id, updated_at: now }).eq('user_id', user.id).is('active_companion_instance_id', null);

  const { data: conversation } = await db.from('together_conversations').select('id').eq('user_id', user.id).eq('character_instance_id', maya.id).is('archived_at', null).maybeSingle();
  if (!conversation) await db.from('together_conversations').insert({ user_id: user.id, character_instance_id: maya.id, kind: 'first_meeting', title: 'Juniper Café' });
  const { data: dateTemplates } = await db.from('together_date_templates').select('id').eq('active', true);
  for (const template of dateTemplates ?? []) await db.from('together_date_sessions').upsert({ user_id: user.id, character_instance_id: maya.id, date_template_id: template.id, status: String(template.id) === TOGETHER_IDS.dinner ? 'locked' : 'locked' }, { onConflict: 'user_id,character_instance_id,date_template_id', ignoreDuplicates: true });
  await db.from('together_notification_preferences').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  await db.from('together_entitlements').upsert({ user_id: user.id, revenuecat_app_user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });

  const { data: schedules } = await db.from('together_schedule_templates').select('*,together_locations(name)').eq('character_version_id', TOGETHER_IDS.mayaVersion);
  const life = resolveLifeState((schedules ?? []) as Array<Record<string, unknown>>);
  await db.from('together_character_instances').update({ current_mood: life.mood, current_location_id: life.locationId, current_activity: life.activity, current_energy: life.energy, last_simulated_at: now, updated_at: now }).eq('id', maya.id);
  await track(db, user.id, 'onboarding_started', { world: 'city-life' });
  await track(db, user.id, 'onboarding_completed', { world: 'city-life' });
  return json({ data: await buildSnapshot(db, user.id), correlationId }, 201, correlationId);
});
