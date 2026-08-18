import { z } from 'zod';
import { creatorReadiness, routineConflicts, type CreatorRoutineBlock } from '../../../packages/together-domain/src/index.ts';
import { AppError } from './types.ts';
import { ConfiguredModerationProvider } from './together-ai.ts';
import { ConfiguredCharacterCreationProvider, appearanceCandidates, type CharacterDraftProposal } from './together-creator.ts';
import { activeContinuity } from './together-continuity.ts';
import { resolvePlaceContext, resolveWorldAccess } from './together-place.ts';
import { kickMediaDispatcher, routeImageProvider, type CanonicalImageGenerationRequest } from './together-media.ts';
import { envBoolean } from './wavespeed.ts';
import { enforceCustomCompanionLimit, refundCredits, resolveSubscriptionState, spendCredits } from './kivelle-subscription.ts';
import { track } from './together.ts';

const identitySchema = z.object({
  name: z.string().trim().min(1).max(50),
  age: z.number().int().min(18).max(99),
  pronouns: z.string().trim().max(40).optional().default(''),
  occupation: z.string().trim().min(1).max(100),
  biography: z.string().trim().min(20).max(1000),
  interests: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  traits: z.array(z.string().trim().min(1).max(40)).min(2).max(8),
  ambitions: z.array(z.string().trim().min(1).max(160)).max(5).default([]),
});
const personalitySchema = z.object({
  warmth: z.number().min(0).max(1), humor: z.number().min(0).max(1), directness: z.number().min(0).max(1),
  independence: z.number().min(0).max(1), spontaneity: z.number().min(0).max(1), socialEnergy: z.number().min(0).max(1),
  note: z.string().trim().max(600).optional().default(''),
});
const communicationSchema = z.object({
  messageLength: z.enum(['concise', 'balanced', 'expressive']).default('balanced'),
  initiative: z.number().min(0).max(1).default(.55),
  humorStyle: z.enum(['subtle', 'dry', 'natural', 'playful']).default('natural'),
  emotionalOpenness: z.number().min(0).max(1).default(.5),
  conflictDirectness: z.number().min(0).max(1).default(.55),
});
const connectionSchema = z.object({
  pace: z.number().min(0).max(1).default(.45),
  affection: z.number().min(0).max(1).default(.55),
  initiative: z.number().min(0).max(1).default(.55),
  spiceLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  conflictStyle: z.enum(['gentle', 'direct', 'reflective', 'needs_space']).default('reflective'),
  boundaries: z.array(z.string().trim().min(2).max(120)).max(8).default([]),
});
const appearanceSchema = z.object({ description: z.string().trim().min(20).max(1000) });
const lifeSchema = z.object({
  homeWorldId: z.string().uuid(), homeLocationId: z.string().uuid(), workLocationId: z.string().uuid().nullable().optional(),
  lifestyle: z.string().trim().min(3).max(300), preferredActivities: z.array(z.string().trim().min(1).max(80)).max(10),
  scheduleStyle: z.string().trim().min(3).max(200),
});
const routineBlockSchema = z.object({
  id: z.string().uuid(), dayOfWeek: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440), locationId: z.string().uuid(), activity: z.string().trim().min(2).max(160),
  availability: z.enum(['available', 'limited', 'busy']), energyDelta: z.number().int().min(-3).max(3), moodInfluence: z.string().trim().max(80).optional(),
}).refine((value) => value.endMinute > value.startMinute, 'Routine end time must be after its start time.');
const routineSchema = z.object({ blocks: z.array(routineBlockSchema).min(1).max(28), source: z.string().optional(), generatedAt: z.string().optional() });

type Db = any;
type StudioAction = Record<string, any> & { action: string };
const studioActions = new Set(['create_draft', 'get_draft', 'list_drafts', 'update_draft_section', 'regenerate_draft_section', 'generate_draft_appearance', 'select_draft_appearance', 'select_first_meeting', 'finalize_draft', 'archive_draft']);
const provider = new ConfiguredCharacterCreationProvider();
const moderation = new ConfiguredModerationProvider();

export function isCreatorStudioAction(action: string): boolean { return studioActions.has(action); }

export async function handleCreatorStudioAction(input: {
  db: Db; userId: string; action: StudioAction; now: string;
}): Promise<Record<string, unknown>> {
  const { db, userId, action, now } = input;
  if (action.action === 'list_drafts') {
    const { data, error } = await db.from('together_creator_drafts').select('*').eq('user_id', userId).neq('status', 'archived').order('updated_at', { ascending: false }).limit(20);
    if (error) throw new AppError('INTERNAL_ERROR', 'Your creations could not be loaded.', 500, true);
    return { drafts: await Promise.all((data ?? []).map((draft: Record<string, any>) => serializeDraft(db, draft, false))) };
  }
  if (action.action === 'create_draft') return createDraft(db, userId, action, now);
  const draft = await ownedDraft(db, userId, String(action.draftId ?? ''));
  if (action.action === 'get_draft') return { draft: await serializeDraft(db, draft, true) };
  if (action.action === 'archive_draft') {
    if (draft.status === 'finalized') throw new AppError('CONFLICT', 'A character you have finalized should be managed from their profile.', 409);
    const { error } = await db.from('together_creator_drafts').update({ status: 'archived', archived_at: now, updated_at: now, revision: draft.revision + 1 }).eq('id', draft.id).eq('user_id', userId);
    if (error) throw new AppError('INTERNAL_ERROR', 'This draft could not be archived.', 500, true);
    await track(db, userId, 'custom_companion_draft_archived', { creator_draft_id: draft.id });
    return { archived: true, draftId: draft.id };
  }
  if (draft.status === 'finalized') return { draft: await serializeDraft(db, draft, true), finalized: true };
  if (action.action === 'update_draft_section') return updateDraftSection(db, userId, draft, action, now);
  if (action.action === 'regenerate_draft_section') return regenerateSection(db, userId, draft, action, now);
  if (action.action === 'generate_draft_appearance') return generateAppearance(db, userId, draft, action, now);
  if (action.action === 'select_draft_appearance') return selectAppearance(db, userId, draft, action, now);
  if (action.action === 'select_first_meeting') return selectFirstMeeting(db, userId, draft, action, now);
  if (action.action === 'finalize_draft') return finalizeDraft(db, userId, draft, action, now);
  throw new AppError('VALIDATION_ERROR', 'Unknown Creator Studio action.', 400);
}

async function createDraft(db: Db, userId: string, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const requestId = String(input.requestId ?? '');
  const concept = String(input.concept ?? '').trim();
  if (!z.string().uuid().safeParse(requestId).success || concept.length < 20 || concept.length > 1200) throw new AppError('VALIDATION_ERROR', 'Describe an original adult in at least a few words.', 400);
  const existing = await db.from('together_creator_drafts').select('*').eq('user_id', userId).eq('create_request_id', requestId).maybeSingle();
  if (existing.data) return { draft: await serializeDraft(db, existing.data, true), idempotent: true };
  const subscription = await resolveSubscriptionState(db, userId);
  await enforceCustomCompanionLimit(db, userId, subscription.capabilities);
  const activeDraftCount = await db.from('together_creator_drafts').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['concept', 'editing', 'ready']);
  if (activeDraftCount.error) throw new AppError('INTERNAL_ERROR', 'Creator availability could not be checked.', 500, true);
  if (Number(activeDraftCount.count ?? 0) >= 3) throw new AppError('PLAN_LIMIT_REACHED', 'Finish or archive one of your three active character drafts first.', 409);
  assertOriginalFictionalPerson(concept);
  await moderateText(concept);
  const worldId = String(input.worldId ?? '');
  const access = await resolveWorldAccess({ db, userId, worldId });
  if (access === 'locked') throw new AppError('FORBIDDEN', 'That world is not available for character creation.', 403);
  const { data: world } = await db.from('together_worlds').select('id,name,default_arrival_location_id').eq('id', worldId).eq('published', true).maybeSingle();
  if (!world) throw new AppError('NOT_FOUND', 'Choose an available world.', 404);
  const proposal = await provider.propose(concept);
  const locations = await worldLocations(db, worldId);
  const home = chooseHomeArea(locations, world.default_arrival_location_id);
  if (!home) throw new AppError('CONFLICT', 'That world needs an authored district or neighborhood before someone can live there.', 409);
  const work = chooseWorkLocation(locations, proposal.occupation, proposal.interests, home.id);
  const identity = identitySchema.parse({
    name: proposal.displayName, age: proposal.age, pronouns: proposal.pronouns ?? '', occupation: proposal.occupation,
    biography: proposal.biography, interests: proposal.interests, traits: proposal.traits,
    ambitions: [`Build a meaningful life as ${article(proposal.occupation)} ${proposal.occupation.toLowerCase()}.`],
  });
  const personality = personalitySchema.parse({ ...proposal.personality, note: '' });
  const communication = communicationSchema.parse(normalizeCommunication(proposal));
  const connection = connectionSchema.parse(normalizeConnection(proposal));
  const life = lifeSchema.parse({
    homeWorldId: worldId, homeLocationId: home.id, workLocationId: work?.id ?? null,
    lifestyle: String(proposal.lifestyleHints.scheduleStyle ?? 'A grounded independent life with flexible evenings.'),
    preferredActivities: proposal.lifestyleHints.preferredActivities ?? proposal.interests.slice(0, 6),
    scheduleStyle: String(proposal.lifestyleHints.scheduleStyle ?? 'Weekday responsibilities with flexible evenings.'),
  });
  const routine = buildRoutine(identity, personality, life, locations, now);
  const firstMeeting = buildFirstMeetings(identity, personality, locations, worldId);
  const continuity = await activeContinuity(db, userId);
  const relationshipGoal = ['friendship', 'romance', 'either'].includes(String(input.relationshipGoal)) ? String(input.relationshipGoal) : 'either';
  const inserted = await db.from('together_creator_drafts').insert({
    user_id: userId, target_continuity_id: continuity.id, world_id: worldId, status: 'editing', current_step: 'identity',
    create_request_id: requestId, source_concept: concept, relationship_goal: relationshipGoal,
    identity_config: identity, personality_config: personality, communication_config: communication, connection_config: connection,
    appearance_config: { description: proposal.appearanceDescription }, life_config: life, routine_config: routine,
    first_meeting_config: firstMeeting, metadata: { providerMode: 'configured', contextVersion: 2 }, created_at: now, updated_at: now,
  }).select('*').single();
  if (inserted.error || !inserted.data) {
    const retry = await db.from('together_creator_drafts').select('*').eq('user_id', userId).eq('create_request_id', requestId).maybeSingle();
    if (retry.data) return { draft: await serializeDraft(db, retry.data, true), idempotent: true };
    throw new AppError('INTERNAL_ERROR', 'Your character draft could not be saved.', 500, true);
  }
  await track(db, userId, 'custom_companion_draft_created', { creator_draft_id: inserted.data.id, world_id: worldId, tier: subscription.tier });
  return { draft: await serializeDraft(db, inserted.data, true), idempotent: false };
}

async function updateDraftSection(db: Db, userId: string, draft: Record<string, any>, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const expected = Number(input.expectedRevision ?? draft.revision);
  const section = String(input.section ?? '');
  let column: string;
  let config: Record<string, unknown>;
  if (section === 'identity') { config = identitySchema.parse(input.config); column = 'identity_config'; }
  else if (section === 'appearance') { config = { ...draft.appearance_config, ...appearanceSchema.parse(input.config) }; column = 'appearance_config'; }
  else if (section === 'personality') { config = personalitySchema.parse(input.config); column = 'personality_config'; }
  else if (section === 'communication') { config = communicationSchema.parse(input.config); column = 'communication_config'; }
  else if (section === 'connection') { config = connectionSchema.parse(input.config); column = 'connection_config'; }
  else if (section === 'life') {
    config = lifeSchema.parse(input.config); column = 'life_config';
    if (String(config.homeWorldId) !== String(draft.world_id)) throw new AppError('VALIDATION_ERROR', 'The home area must remain in the selected world.', 400);
    await validateLocationIds(db, draft.world_id, [String(config.homeLocationId), ...(config.workLocationId ? [String(config.workLocationId)] : [])]);
    const home = await db.from('together_locations').select('location_type').eq('id', config.homeLocationId).maybeSingle();
    if (!home.data || !['region', 'district', 'neighborhood'].includes(String(home.data.location_type))) throw new AppError('VALIDATION_ERROR', 'Choose a district or neighborhood as the home area.', 400);
  } else if (section === 'routine') {
    config = routineSchema.parse(input.config); column = 'routine_config';
    if (routineConflicts(config.blocks as CreatorRoutineBlock[]).length) throw new AppError('VALIDATION_ERROR', 'Routine blocks cannot overlap.', 400);
    await validateLocationIds(db, draft.world_id, (config.blocks as CreatorRoutineBlock[]).map((block) => block.locationId));
  } else throw new AppError('VALIDATION_ERROR', 'Choose a valid creator section.', 400);
  await moderateText(JSON.stringify(config));
  const patch: Record<string, unknown> = { [column]: config, updated_at: now, revision: expected + 1, status: 'editing' };
  if (input.currentStep) patch.current_step = input.currentStep;
  if (section === 'connection' && ['friendship', 'romance', 'either'].includes(String(input.relationshipGoal))) patch.relationship_goal = input.relationshipGoal;
  const updated = await db.from('together_creator_drafts').update(patch).eq('id', draft.id).eq('user_id', userId).eq('revision', expected).select('*').maybeSingle();
  if (updated.error || !updated.data) throw new AppError('CONFLICT', 'This draft changed somewhere else. Reload it and try again.', 409, true);
  const ready = await readiness(db, updated.data);
  const finalDraft = ready.ready ? await setDraftStatus(db, updated.data, 'ready', now) : updated.data;
  return { draft: await serializeDraft(db, finalDraft, true), readiness: ready };
}

async function regenerateSection(db: Db, userId: string, draft: Record<string, any>, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const target = String(input.section ?? '');
  const locations = await worldLocations(db, draft.world_id);
  let patch: Record<string, unknown>;
  if (target === 'routine') patch = { routine_config: buildRoutine(identitySchema.parse(draft.identity_config), personalitySchema.parse(draft.personality_config), lifeSchema.parse(draft.life_config), locations, now) };
  else if (target === 'first_meetings') patch = { first_meeting_config: buildFirstMeetings(identitySchema.parse(draft.identity_config), personalitySchema.parse(draft.personality_config), locations, draft.world_id) };
  else throw new AppError('VALIDATION_ERROR', 'Only the routine or first meeting can be regenerated here.', 400);
  const updated = await db.from('together_creator_drafts').update({ ...patch, status: 'editing', revision: draft.revision + 1, updated_at: now }).eq('id', draft.id).eq('user_id', userId).eq('revision', draft.revision).select('*').maybeSingle();
  if (!updated.data) throw new AppError('CONFLICT', 'This draft changed somewhere else. Reload it and try again.', 409, true);
  return { draft: await serializeDraft(db, updated.data, true) };
}

async function generateAppearance(db: Db, userId: string, draft: Record<string, any>, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const requestId = String(input.requestId ?? '');
  if (!z.string().uuid().safeParse(requestId).success) throw new AppError('VALIDATION_ERROR', 'A valid generation request is required.', 400);
  const existing = await db.from('together_creator_assets').select('*').eq('draft_id', draft.id).eq('user_id', userId).eq('group_request_id', requestId).neq('status', 'archived').order('created_at');
  if ((existing.data ?? []).length) return { draft: await serializeDraft(db, draft, true), idempotent: true };
  const subscription = await resolveSubscriptionState(db, userId);
  const charged = await spendCredits(db, { userId, action: 'creator_appearance_set', idempotencyKey: `creator-draft-appearance:${draft.id}:${requestId}`, referenceType: 'creator_draft', referenceId: draft.id, metadata: { requestId, tier: subscription.tier } });
  const uploaded: Array<Record<string, any>> = [];
  try {
    const identity = identitySchema.parse(draft.identity_config);
    const proposal = proposalFromDraft(draft);
    const candidateSet = appearanceCandidates(proposal).slice(0, 3).map((candidate, index) => ({ ...candidate, label: ['Natural', 'Polished', 'Distinctive'][index] ?? candidate.label }));
    const meetingLocationId = selectedMeeting(draft)?.locationId ?? draft.life_config?.homeLocationId;
    const place = await resolvePlaceContext({ db, locationId: String(meetingLocationId), userId });
    if (envBoolean('KIVELLE_WAVESPEED_CREATOR_ENABLED') && envBoolean('KIVELLE_WAVESPEED_ENABLED') && Boolean(Deno.env.get('WAVESPEED_API_KEY'))) {
      const queued = candidateSet.map((candidate) => ({ id: candidate.id, user_id: userId, draft_id: draft.id, asset_type: 'appearance_candidate', status: 'queued', label: candidate.label, description: candidate.description, group_request_id: requestId, metadata: { visualDoNotChange: candidate.visualDoNotChange ?? [], creditTransactionId: charged.transactionId, placeContextVersion: place.contextVersion } }));
      const created = await db.from('together_creator_assets').insert(queued).select('*');
      if (created.error) throw new AppError('INTERNAL_ERROR', 'Appearance options could not be queued.', 500, true);
      const updated = await db.from('together_creator_drafts').update({ appearance_config: { ...draft.appearance_config, lastGroupRequestId: requestId }, current_step: 'appearance', revision: draft.revision + 1, updated_at: now }).eq('id', draft.id).eq('user_id', userId).select('*').single();
      await track(db, userId, 'custom_companion_appearance_candidates_queued', { creator_draft_id: draft.id, count: queued.length, creditCost: charged.cost, tier: subscription.tier });
      await kickMediaDispatcher();
      return { draft: await serializeDraft(db, updated.data ?? draft, true), creditCost: charged.cost, creditBalance: charged.balance, asynchronous: true };
    }
    const imageProvider = routeImageProvider('standard');
    for (const candidate of candidateSet) {
      const mediaRequest: CanonicalImageGenerationRequest = {
        mediaId: candidate.id,
        companion: { templateId: draft.id, versionId: draft.id, name: identity.name, age: identity.age },
        visualIdentity: { canonicalDescription: candidate.description, age: identity.age, referenceStoragePaths: [], identifyingFeatures: [], fashionStyle: candidate.label, visualDoNotChange: candidate.visualDoNotChange ?? [] },
        referenceImages: [], context: { place, activity: 'a neutral canonical identity portrait', mood: 'natural, self-possessed, approachable', timeOfDay: place.clock.daypart },
        composition: { shotType: 'portrait', framing: 'waist-up portrait, face clearly visible, natural posture, uncluttered background', aspectRatio: '4:5' }, contentLevel: 'standard', qualityTier: 'standard',
      };
      const image = await imageProvider.generate(mediaRequest);
      const extension = image.contentType === 'image/webp' ? 'webp' : image.contentType === 'image/jpeg' ? 'jpg' : 'png';
      const storagePath = `${userId}/creator-drafts/${draft.id}/appearance-${candidate.id}.${extension}`;
      const storage = await db.storage.from('kivelle-character-reference').upload(storagePath, image.bytes, { contentType: image.contentType, upsert: true, cacheControl: '31536000' });
      if (storage.error) throw new AppError('INTERNAL_ERROR', 'Appearance options could not be stored.', 500, true);
      uploaded.push({ id: candidate.id, user_id: userId, draft_id: draft.id, asset_type: 'appearance_candidate', status: 'ready', label: candidate.label, description: candidate.description, storage_path: storagePath, content_type: image.contentType, width: image.width, height: image.height, provider: imageProvider.id, model: image.model, group_request_id: requestId, metadata: { visualDoNotChange: candidate.visualDoNotChange ?? [], creditTransactionId: charged.transactionId } });
    }
    const created = await db.from('together_creator_assets').insert(uploaded).select('*');
    if (created.error) throw new AppError('INTERNAL_ERROR', 'Appearance options could not be prepared.', 500, true);
    const updated = await db.from('together_creator_drafts').update({ appearance_config: { ...draft.appearance_config, lastGroupRequestId: requestId }, current_step: 'appearance', revision: draft.revision + 1, updated_at: now }).eq('id', draft.id).eq('user_id', userId).select('*').single();
    await track(db, userId, 'custom_companion_appearance_candidates_created', { creator_draft_id: draft.id, count: uploaded.length, provider: imageProvider.id, creditCost: charged.cost, tier: subscription.tier });
    return { draft: await serializeDraft(db, updated.data ?? draft, true), creditCost: charged.cost, creditBalance: charged.balance };
  } catch (error) {
    if (uploaded.length) await db.storage.from('kivelle-character-reference').remove(uploaded.map((item) => item.storage_path));
    await refundCredits(db, { userId, transactionId: charged.transactionId, idempotencyKey: `refund:${charged.transactionId}`, metadata: { reason: 'creator_draft_appearance_failed', requestId } });
    throw error;
  }
}

async function selectAppearance(db: Db, userId: string, draft: Record<string, any>, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const assetId = String(input.assetId ?? '');
  const asset = await db.from('together_creator_assets').select('*').eq('id', assetId).eq('draft_id', draft.id).eq('user_id', userId).eq('status', 'ready').maybeSingle();
  if (!asset.data) throw new AppError('NOT_FOUND', 'That appearance is no longer available.', 404);
  await db.from('together_creator_assets').update({ selected: false, updated_at: now }).eq('draft_id', draft.id).eq('user_id', userId).eq('asset_type', 'appearance_candidate');
  const selected = await db.from('together_creator_assets').update({ selected: true, updated_at: now }).eq('id', assetId).eq('user_id', userId).select('*').single();
  if (selected.error) throw new AppError('INTERNAL_ERROR', 'That appearance could not be selected.', 500, true);
  const updated = await db.from('together_creator_drafts').update({ appearance_config: { ...draft.appearance_config, selectedAssetId: assetId, canonicalDescription: asset.data.description, referenceStoragePaths: [asset.data.storage_path] }, revision: draft.revision + 1, updated_at: now }).eq('id', draft.id).eq('user_id', userId).select('*').single();
  const ready = await readiness(db, updated.data ?? draft);
  const finalDraft = ready.ready ? await setDraftStatus(db, updated.data, 'ready', now) : updated.data;
  return { draft: await serializeDraft(db, finalDraft, true), readiness: ready };
}

async function selectFirstMeeting(db: Db, userId: string, draft: Record<string, any>, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const meetingId = String(input.meetingId ?? '');
  const options = Array.isArray(draft.first_meeting_config?.options) ? draft.first_meeting_config.options : [];
  if (!options.some((option: Record<string, unknown>) => option.id === meetingId)) throw new AppError('NOT_FOUND', 'That first meeting is no longer available.', 404);
  const updated = await db.from('together_creator_drafts').update({ first_meeting_config: { ...draft.first_meeting_config, selectedId: meetingId }, current_step: 'meeting', revision: draft.revision + 1, updated_at: now }).eq('id', draft.id).eq('user_id', userId).select('*').single();
  const ready = await readiness(db, updated.data ?? draft);
  const finalDraft = ready.ready ? await setDraftStatus(db, updated.data, 'ready', now) : updated.data;
  return { draft: await serializeDraft(db, finalDraft, true), readiness: ready };
}

async function finalizeDraft(db: Db, userId: string, draft: Record<string, any>, input: StudioAction, now: string): Promise<Record<string, unknown>> {
  const requestId = String(input.requestId ?? '');
  if (!z.string().uuid().safeParse(requestId).success) throw new AppError('VALIDATION_ERROR', 'A valid finalization request is required.', 400);
  const ready = await readiness(db, draft);
  if (!ready.ready) throw new AppError('CONFLICT', `Finish ${ready.missing.join(', ').replace('first_meeting', 'first meeting')} before meeting this companion.`, 409);
  await moderateText([draft.identity_config?.biography, draft.personality_config?.note, draft.appearance_config?.description, ...(draft.connection_config?.boundaries ?? [])].filter(Boolean).join('\n'));
  const access = await resolveWorldAccess({ db, userId, worldId: draft.world_id });
  if (access === 'locked') throw new AppError('FORBIDDEN', 'This character’s home world is no longer available.', 403);
  const result = await db.rpc('kivelle_finalize_creator_draft', { p_user_id: userId, p_draft_id: draft.id, p_request_id: requestId });
  if (result.error || !result.data) throw new AppError('CONFLICT', safeDatabaseMessage(result.error?.message, 'This companion could not be finalized.'), 409);
  const selectedAssetId = String(draft.appearance_config?.selectedAssetId ?? '');
  if (selectedAssetId && result.data.characterVersionId) {
    const selected = await db.from('together_creator_assets').select('*').eq('id', selectedAssetId).eq('draft_id', draft.id).eq('user_id', userId).eq('status', 'ready').maybeSingle();
    if (selected.data?.storage_path) {
      const sourceKey = `custom:${result.data.characterVersionId}:canonical-identity`;
      await db.from('together_media_reference_assets').upsert({ asset_role: 'character_identity', character_version_id: result.data.characterVersionId, source_key: sourceKey, storage_bucket: 'kivelle-character-reference', storage_path: selected.data.storage_path, content_type: selected.data.content_type ?? 'image/jpeg', width: selected.data.width, height: selected.data.height, revision: 1, active: true, metadata: { creatorDraftId: draft.id, creatorAssetId: selected.data.id, provider: selected.data.provider, model: selected.data.model } }, { onConflict: 'asset_role,source_key,revision' });
    }
  }
  await track(db, userId, 'custom_companion_ready', { creator_draft_id: draft.id, character_template_id: result.data.characterTemplateId, world_id: draft.world_id });
  const finalized = await ownedDraft(db, userId, draft.id);
  void now;
  return { result: result.data, draft: await serializeDraft(db, finalized, true) };
}

async function readiness(db: Db, draft: Record<string, any>) {
  const selected = await db.from('together_creator_assets').select('id', { count: 'exact', head: true }).eq('draft_id', draft.id).eq('user_id', draft.user_id).eq('selected', true).eq('status', 'ready');
  return creatorReadiness({ identity: draft.identity_config ?? {}, appearance: draft.appearance_config ?? {}, routine: draft.routine_config ?? { blocks: [] }, firstMeeting: draft.first_meeting_config ?? { options: [] }, hasSelectedAsset: Number(selected.count ?? 0) > 0, hasLegacyReference: Array.isArray(draft.appearance_config?.referenceStoragePaths) && draft.appearance_config.referenceStoragePaths.length > 0 });
}

async function serializeDraft(db: Db, draft: Record<string, any>, includeContext: boolean): Promise<Record<string, unknown>> {
  const assetsResult = await db.from('together_creator_assets').select('*').eq('draft_id', draft.id).eq('user_id', draft.user_id).neq('status', 'archived').order('created_at');
  const assets = assetsResult.data ?? [];
  const paths = assets.map((asset: Record<string, unknown>) => String(asset.storage_path ?? '')).filter(Boolean);
  const signed = paths.length ? await db.storage.from('kivelle-character-reference').createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map(paths.map((path: string, index: number) => [path, signed.data?.[index]?.signedUrl ?? null]));
  const serializedAssets = assets.map((asset: Record<string, any>) => ({ ...asset, signedUrl: asset.storage_path ? urlByPath.get(asset.storage_path) ?? null : null }));
  let portraitUrl = serializedAssets.find((asset: Record<string, any>) => asset.selected)?.signedUrl ?? null;
  if (!portraitUrl) {
    const legacyPath = Array.isArray(draft.appearance_config?.referenceStoragePaths) ? String(draft.appearance_config.referenceStoragePaths[0] ?? '') : '';
    if (legacyPath) portraitUrl = (await db.storage.from('kivelle-character-reference').createSignedUrl(legacyPath, 3600)).data?.signedUrl ?? null;
  }
  const base = { ...draft, connection_config: connectionSchema.parse(draft.connection_config ?? {}), assets: serializedAssets, portraitUrl };
  if (!includeContext) return base;
  const [world, locations] = await Promise.all([
    db.from('together_worlds').select('id,name,slug,timezone,access_type').eq('id', draft.world_id).maybeSingle(),
    db.from('together_locations').select('id,world_id,parent_location_id,name,slug,location_type,category,description,possible_activities,hours,metadata,sort_order').eq('world_id', draft.world_id).order('sort_order'),
  ]);
  return { ...base, world: world.data ?? null, locations: locations.data ?? [] };
}

async function ownedDraft(db: Db, userId: string, draftId: string): Promise<Record<string, any>> {
  if (!z.string().uuid().safeParse(draftId).success) throw new AppError('VALIDATION_ERROR', 'Choose a valid character draft.', 400);
  const result = await db.from('together_creator_drafts').select('*').eq('id', draftId).eq('user_id', userId).maybeSingle();
  if (!result.data) throw new AppError('NOT_FOUND', 'That character draft is unavailable.', 404);
  return result.data;
}

async function setDraftStatus(db: Db, draft: Record<string, any>, status: string, now: string): Promise<Record<string, any>> {
  if (draft.status === status) return draft;
  const result = await db.from('together_creator_drafts').update({ status, updated_at: now }).eq('id', draft.id).select('*').single();
  return result.data ?? { ...draft, status };
}

async function moderateText(value: string): Promise<void> {
  if (!value.trim()) return;
  assertOriginalFictionalPerson(value);
  const safety = await moderation.check(value);
  if (!safety.allowed) throw new AppError('VALIDATION_ERROR', 'Keep this character fictional, adult, and within Kivelle’s safety rules.', 400);
}

function assertOriginalFictionalPerson(value: string): void {
  if (/\b(exactly like|identical to|clone of|look like|copy of|same face as)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/i.test(value)) throw new AppError('VALIDATION_ERROR', 'Create an original fictional person rather than copying a real person.', 400);
}

async function worldLocations(db: Db, worldId: string): Promise<Array<Record<string, any>>> {
  const result = await db.from('together_locations').select('*').eq('world_id', worldId).order('sort_order');
  if (result.error) throw new AppError('INTERNAL_ERROR', 'World places could not be loaded.', 500, true);
  return result.data ?? [];
}

async function validateLocationIds(db: Db, worldId: string, locationIds: string[]): Promise<void> {
  const unique = [...new Set(locationIds.filter(Boolean))];
  if (!unique.length) return;
  const result = await db.from('together_locations').select('id').eq('world_id', worldId).in('id', unique);
  if (result.error || (result.data ?? []).length !== unique.length) throw new AppError('VALIDATION_ERROR', 'One of those places is not available in this world.', 400);
}

function chooseHomeArea(locations: Array<Record<string, any>>, fallback?: string | null): Record<string, any> | null {
  return locations.find((location) => location.location_type === 'neighborhood')
    ?? locations.find((location) => location.location_type === 'district')
    ?? locations.find((location) => location.location_type === 'region')
    ?? locations.find((location) => location.id === fallback)
    ?? null;
}

function chooseWorkLocation(locations: Array<Record<string, any>>, occupation: string, interests: string[], homeId: string): Record<string, any> | null {
  const terms = `${occupation} ${interests.join(' ')}`.toLowerCase();
  const compatible = locations.filter((location) => !['residence', 'district', 'neighborhood', 'region', 'transit'].includes(String(location.location_type)));
  const scored = compatible.map((location) => {
    const haystack = `${location.name} ${location.category} ${(location.metadata?.tags ?? []).join(' ')} ${location.description}`.toLowerCase();
    let score = 0;
    for (const term of terms.split(/\s+/).filter((item) => item.length > 3)) if (haystack.includes(term)) score += 3;
    if (/architect|design/.test(terms) && /studio|design|gallery|culture/.test(haystack)) score += 6;
    if (/photo/.test(terms) && /photo|studio|gallery|park|outdoor/.test(haystack)) score += 6;
    if (/music|musician/.test(terms) && /music|bar|nightlife|record|karaoke/.test(haystack)) score += 6;
    if (/chef|food/.test(terms) && /food|restaurant|cafe|bakery/.test(haystack)) score += 6;
    return { location, score };
  }).sort((left, right) => right.score - left.score || Number(left.location.sort_order ?? 0) - Number(right.location.sort_order ?? 0));
  const best = scored[0];
  return best && best.score > 0 ? best.location : locations.find((location) => location.id === homeId) ?? null;
}

function chooseSocialLocation(locations: Array<Record<string, any>>, interests: string[], socialEnergy: number, excluded: string[]): Record<string, any> {
  const terms = interests.join(' ').toLowerCase();
  const candidates = locations.filter((location) => !excluded.includes(location.id) && !['residence', 'district', 'neighborhood', 'region', 'transit'].includes(String(location.location_type)));
  return candidates.map((location) => {
    const haystack = `${location.name} ${location.category} ${(location.metadata?.tags ?? []).join(' ')} ${location.description}`.toLowerCase();
    let score = 0;
    for (const term of terms.split(/\s+/).filter((item) => item.length > 3)) if (haystack.includes(term)) score += 2;
    const energy = String(location.metadata?.social_energy ?? 'medium');
    if (socialEnergy >= .65 && energy === 'high') score += 3;
    if (socialEnergy < .5 && ['low', 'medium'].includes(energy)) score += 3;
    return { location, score };
  }).sort((left, right) => right.score - left.score || Number(left.location.sort_order ?? 0) - Number(right.location.sort_order ?? 0))[0]?.location ?? candidates[0] ?? locations[0]!;
}

function buildRoutine(identity: z.infer<typeof identitySchema>, personality: z.infer<typeof personalitySchema>, life: z.infer<typeof lifeSchema>, locations: Array<Record<string, any>>, now: string) {
  const workLocation = locations.find((location) => location.id === life.workLocationId) ?? locations.find((location) => location.id === life.homeLocationId)!;
  const socialLocation = chooseSocialLocation(locations, identity.interests, personality.socialEnergy, [life.homeLocationId, workLocation.id]);
  const start = /late|night/i.test(life.scheduleStyle) ? 660 : personality.spontaneity > .7 ? 600 : 570;
  const end = Math.min(start + 480, 1080);
  const blocks: CreatorRoutineBlock[] = [];
  for (let day = 1; day <= 5; day += 1) blocks.push({ id: crypto.randomUUID(), dayOfWeek: day, startMinute: start, endMinute: end, locationId: workLocation.id, activity: `Working as ${article(identity.occupation)} ${identity.occupation.toLowerCase()}`, availability: 'busy', energyDelta: -1, moodInfluence: 'focused' });
  for (const day of personality.socialEnergy >= .6 ? [2, 4] : [3]) blocks.push({ id: crypto.randomUUID(), dayOfWeek: day, startMinute: 1110, endMinute: 1260, locationId: socialLocation.id, activity: `Making time for ${identity.interests[0]?.toLowerCase() ?? 'something personal'}`, availability: 'available', energyDelta: 0, moodInfluence: personality.humor >= .65 ? 'playful' : 'relaxed' });
  blocks.push({ id: crypto.randomUUID(), dayOfWeek: 6, startMinute: personality.spontaneity >= .65 ? 720 : 660, endMinute: 930, locationId: socialLocation.id, activity: 'Keeping Saturday flexible', availability: 'available', energyDelta: 1, moodInfluence: 'open' });
  blocks.push({ id: crypto.randomUUID(), dayOfWeek: 0, startMinute: 600, endMinute: 900, locationId: life.homeLocationId, activity: 'Having a slow morning at home', availability: 'limited', energyDelta: 1, moodInfluence: 'rested' });
  return { blocks, source: 'creator_studio', generatedAt: now };
}

function buildFirstMeetings(identity: z.infer<typeof identitySchema>, personality: z.infer<typeof personalitySchema>, locations: Array<Record<string, any>>, worldId: string) {
  const ranked = locations.filter((location) => !['residence', 'region', 'district', 'neighborhood', 'transit'].includes(String(location.location_type))).map((location) => {
    const haystack = `${location.name} ${location.category} ${(location.metadata?.tags ?? []).join(' ')} ${location.description}`.toLowerCase();
    let score = 0;
    for (const interest of identity.interests) if (haystack.includes(interest.toLowerCase())) score += 3;
    if (/architect|design|artist/.test(identity.occupation.toLowerCase()) && /gallery|culture|design|studio/.test(haystack)) score += 5;
    if (/music/.test(identity.occupation.toLowerCase()) && /music|record|nightlife|bar/.test(haystack)) score += 5;
    if (['cafe', 'culture', 'outdoor', 'food', 'entertainment'].includes(String(location.category))) score += 2;
    return { location, score };
  }).sort((left, right) => right.score - left.score || Number(left.location.sort_order ?? 0) - Number(right.location.sort_order ?? 0)).slice(0, 3);
  const options = ranked.map(({ location }, index) => {
    const hook = Array.isArray(location.canonical_lore?.conversationHooks) ? location.canonical_lore.conversationHooks[0] : null;
    const setup = index === 0
      ? `You notice ${identity.name} at ${location.name}, absorbed in ${hook ?? `something connected to ${identity.interests[0]}`}.`
      : `${identity.name} is spending time at ${location.name} when the two of you end up reacting to the same small moment.`;
    const openingLine = personality.directness >= .68
      ? `I need an honest opinion. What would you do with this?`
      : personality.humor >= .68
        ? `You looked like you had a comment. I promise to only judge it a little.`
        : `I was wondering if anyone else noticed that. What do you think?`;
    return { id: crypto.randomUUID(), worldId, locationId: location.id, locationName: location.name, title: `First meeting at ${location.name}`, setup, companionActivity: `Spending time at ${location.name}`, mood: personality.warmth >= .65 ? 'warmly curious' : 'observant', openingLine, suggestedPrompts: ['What caught your attention?', 'Do you come here often?', 'Tell me what you really think.'] };
  });
  return { options, selectedId: options[0]?.id ?? null, generatedAt: new Date().toISOString() };
}

function normalizeCommunication(proposal: CharacterDraftProposal) {
  const raw = proposal.communicationStyle ?? {};
  return {
    messageLength: raw.messageLength === 'short_to_medium' ? 'balanced' : ['concise', 'balanced', 'expressive'].includes(String(raw.messageLength)) ? raw.messageLength : 'balanced',
    initiative: Number(raw.initiative ?? proposal.personality.spontaneity * .5 + .25),
    humorStyle: ['subtle', 'dry', 'natural', 'playful'].includes(String(raw.humor)) ? raw.humor : proposal.personality.humor >= .7 ? 'playful' : 'natural',
    emotionalOpenness: proposal.personality.warmth * .7,
    conflictDirectness: proposal.personality.directness,
  };
}

function normalizeConnection(proposal: CharacterDraftProposal) {
  const pace = String(proposal.relationshipStyle?.pace ?? '').includes('slow') ? .3 : .5;
  return { pace, affection: Number(proposal.relationshipStyle?.affection ?? proposal.personality.warmth), initiative: Number(proposal.relationshipStyle?.initiative ?? proposal.personality.spontaneity * .5 + .25), spiceLevel: 2, conflictStyle: proposal.personality.directness >= .7 ? 'direct' : 'reflective', boundaries: [] };
}

function proposalFromDraft(draft: Record<string, any>): CharacterDraftProposal {
  const identity = identitySchema.parse(draft.identity_config);
  const personality = personalitySchema.parse(draft.personality_config);
  return {
    displayName: identity.name, age: identity.age, pronouns: identity.pronouns || undefined, occupation: identity.occupation,
    biography: identity.biography, interests: identity.interests, traits: identity.traits, personality,
    communicationStyle: draft.communication_config ?? {}, relationshipStyle: draft.connection_config ?? {},
    appearanceDescription: String(draft.appearance_config?.description ?? `An original fictional adult appearance for ${identity.name}.`),
    lifestyleHints: { preferredActivities: draft.life_config?.preferredActivities ?? identity.interests, scheduleStyle: draft.life_config?.scheduleStyle },
  };
}

function selectedMeeting(draft: Record<string, any>): Record<string, any> | null {
  const options = Array.isArray(draft.first_meeting_config?.options) ? draft.first_meeting_config.options : [];
  return options.find((option: Record<string, unknown>) => option.id === draft.first_meeting_config?.selectedId) ?? null;
}

function article(value: string): string { return /^[aeiou]/i.test(value) ? 'an' : 'a'; }
function safeDatabaseMessage(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  const safe = ['appearance', 'routine', 'first meeting', 'home area', 'character name', 'biography', 'adult', 'draft'].find((term) => message.toLowerCase().includes(term));
  return safe ? message.replace(/^.*?:\s*/, '') : fallback;
}
