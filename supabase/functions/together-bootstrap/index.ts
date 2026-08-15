import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot, resolveLifeState, TOGETHER_IDS, track } from '../_shared/together.ts';
import { getActiveConversation } from '../_shared/together-conversation.ts';

const schema = z.object({
  ageConfirmed: z.literal(true),
  displayName: z.string().trim().min(1).max(50).optional(),
  characterTemplateId: z.string().uuid().optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  goals: z.array(z.enum(['Dating','Friendship','Stories','Social worlds'])).max(4).default([]),
  experienceTimezone:z.string().trim().min(1).max(80).default('UTC'),
});

serve(async (request, correlationId) => {
  if (request.method === 'GET') {
    const { user, db } = await authenticated(request);
    const requestedTimezone=request.headers.get('x-kivelle-timezone');
    if(requestedTimezone){try{new Intl.DateTimeFormat('en-US',{timeZone:requestedTimezone}).format(new Date());const updatedAt=new Date().toISOString();await Promise.all([db.from('together_profiles').update({experience_timezone:requestedTimezone,updated_at:updatedAt}).eq('user_id',user.id),db.from('together_notification_preferences').update({timezone:requestedTimezone,updated_at:updatedAt}).eq('user_id',user.id)]);}catch{/* ignore malformed client timezone */}}
    return json({ data: await buildSnapshot(db, user.id), correlationId }, 200, correlationId);
  }
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_bootstrap', 20, 3600);
  const input = await parseBody(request, schema);
  const now = new Date().toISOString();
  const selectedTemplateId = input.characterTemplateId ?? TOGETHER_IDS.maya;
  const { data: selectedTemplate, error: selectedTemplateError } = await db
    .from('together_character_templates')
    .select('id,name,slug,current_published_version,published,can_be_selected')
    .eq('id', selectedTemplateId)
    .eq('published', true)
    .eq('can_be_selected', true)
    .maybeSingle();
  if (selectedTemplateError || !selectedTemplate) throw new AppError('VALIDATION_ERROR', 'Choose an available companion to continue.', 400);
  const { data: selectedVersion, error: selectedVersionError } = await db
    .from('together_character_versions')
    .select('id')
    .eq('character_template_id', selectedTemplate.id)
    .eq('version', selectedTemplate.current_published_version)
    .maybeSingle();
  if (selectedVersionError || !selectedVersion) throw new AppError('INTERNAL_ERROR', 'That companion is not ready to meet yet.', 500, true);
  let experienceTimezone='UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:input.experienceTimezone}).format(new Date());experienceTimezone=input.experienceTimezone;}catch{/* use UTC */}
  const { error: profileError } = await db.from('together_profiles').upsert({ user_id: user.id, display_name: input.displayName ?? user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'You', age_verified_at: now, interests: input.interests, experience_goals: input.goals, experience_timezone:experienceTimezone, onboarding_completed_at: now, updated_at: now }, { onConflict: 'user_id' });
  if (profileError) throw new AppError('INTERNAL_ERROR', 'Could not start your Kivelle story.', 500, true);

  const templates = [
    { template: selectedTemplate.id, version: selectedVersion.id, mood: 'curious', location: TOGETHER_IDS.juniper, activity: 'waiting for coffee', introduced: now, contact: now },
    { template: TOGETHER_IDS.chloe, version: TOGETHER_IDS.chloeVersion, mood: 'adventurous', location: TOGETHER_IDS.rooftop, activity: 'heading to Skyline Rooftop', introduced: null, contact: null },
    { template: TOGETHER_IDS.alex, version: TOGETHER_IDS.alexVersion, mood: 'thoughtful', location: TOGETHER_IDS.riverwalk, activity: 'finishing a photo walk', introduced: null, contact: null },
  ];
  for (const character of templates) {
    const { error } = await db.from('together_character_instances').upsert({ user_id: user.id, character_template_id: character.template, character_version_id: character.version, relationship_stage: 'stranger', current_mood: character.mood, current_location_id: character.location, current_activity: character.activity, current_energy: 'medium', introduced_at: character.introduced, contact_added_at: character.contact, updated_at: now }, { onConflict: 'user_id,character_template_id', ignoreDuplicates: true });
    if (error) throw new AppError('INTERNAL_ERROR', 'Could not create your Juniper City characters.', 500, true);
  }
  const { data: instances, error: instanceError } = await db.from('together_character_instances').select('id,character_template_id').eq('user_id', user.id);
  if (instanceError || !instances?.length) throw new AppError('INTERNAL_ERROR', 'Could not load your characters.', 500, true);
  for (const instance of instances) await db.from('together_relationship_states').upsert({ character_instance_id: instance.id, user_id: user.id }, { onConflict: 'character_instance_id', ignoreDuplicates: true });
  const companion = instances.find((item) => item.character_template_id === selectedTemplate.id);
  if (!companion) throw new AppError('INTERNAL_ERROR', `${selectedTemplate.name} could not enter Juniper City.`, 500, true);
  await db.from('together_profiles').update({ active_companion_instance_id: companion.id, updated_at: now }).eq('user_id', user.id);

  await getActiveConversation(db, user.id, companion.id, true);
  const { data: dateTemplates } = await db.from('together_date_templates').select('id').eq('active', true);
  for (const template of dateTemplates ?? []) await db.from('together_date_sessions').upsert({ user_id: user.id, character_instance_id: companion.id, date_template_id: template.id, status: 'locked' }, { onConflict: 'user_id,character_instance_id,date_template_id', ignoreDuplicates: true });
  await db.from('together_notification_preferences').upsert({ user_id: user.id, timezone:experienceTimezone }, { onConflict: 'user_id' });
  await db.from('together_entitlements').upsert({ user_id: user.id, revenuecat_app_user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });

  const { data: schedules } = await db.from('together_schedule_templates').select('*,together_locations(name)').eq('character_version_id', selectedVersion.id);
  const life = schedules?.length
    ? resolveLifeState(schedules as Array<Record<string, unknown>>,new Date(),experienceTimezone)
    : { mood: 'curious', locationId: TOGETHER_IDS.juniper, activity: 'waiting for coffee', energy: 'medium' };
  await db.from('together_character_instances').update({ current_mood: life.mood, current_location_id: life.locationId, current_activity: life.activity, current_energy: life.energy, last_simulated_at: now, updated_at: now }).eq('id', companion.id);
  await track(db, user.id, 'onboarding_started', { world: 'juniper-city' });
  await track(db, user.id, 'companion_selected', { character_template_id: selectedTemplate.id, character_slug: selectedTemplate.slug, source: 'onboarding' });
  await track(db, user.id, 'onboarding_completed', { world: 'juniper-city', character_template_id: selectedTemplate.id });
  return json({ data: await buildSnapshot(db, user.id), correlationId }, 201, correlationId);
});
