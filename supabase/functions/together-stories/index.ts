import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyStoryAction, initialStoryCampaign, StoryRuleError, type StoryActionResult } from '../../../packages/together-domain/src/stories.ts';
import { storyDirectorInspector } from '../../../packages/together-domain/src/story-director.ts';
import { parseBody } from '../_shared/body.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { KIVELLI_STORY_CATALOG, storyDefinition } from '../_shared/kivelle-stories-content.ts';
import {
  campaignInsert,
  campaignStateFromRow,
  compatibleStoryCampaignState,
  ownedStoryCampaign,
  persistStoryAction,
  persistStoryActionEventMessages,
  persistStoryPresenceTransitionMessages,
  requireStoriesAccess,
  storyCampaignView,
  storyOpeningMessageRows,
  storyPresenceTransitionsFromResult,
} from '../_shared/kivelle-stories.ts';
import { track } from '../_shared/together.ts';
import { AppError } from '../_shared/types.ts';

const uuid = z.string().uuid();
const requestId = z.string().trim().min(8).max(160);
const storyAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('travel'), locationId: z.string().min(1).max(100) }),
  z.object({ type: z.literal('follow'), characterId: z.string().min(1).max(100) }),
  z.object({ type: z.literal('absence'), characterId: z.string().min(1).max(100), choice: z.enum(['wait','leave_note','ask_nearby']) }),
  z.object({ type: z.literal('investigate'), interactionId: z.string().min(1).max(120) }),
  z.object({ type: z.literal('wait'), minutes: z.number().int().min(5).max(60) }),
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('finale'), endingId: z.string().min(1).max(100) }),
  z.object({ type: z.literal('present_evidence'), characterId: z.string().min(1).max(100), evidenceId: z.string().min(1).max(100) }),
]);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('library') }),
  z.object({ action: z.literal('campaign'), campaignId: uuid }),
  z.object({ action: z.literal('inspector'), campaignId: uuid, characterId: z.string().min(1).max(100).optional() }),
  z.object({ action: z.literal('start'), storySlug: z.string().min(1).max(120), requestId }),
  z.object({ action: z.literal('restart'), campaignId: uuid, requestId, confirmed: z.literal(true) }),
  z.object({ action: z.literal('apply'), campaignId: uuid, expectedVersion: z.number().int().positive(), clientActionId: requestId, storyAction }),
  z.object({ action: z.literal('pin'), campaignId: uuid, expectedVersion: z.number().int().positive(), clientActionId: requestId, target: z.enum(['evidence','character','event']), id: z.string().max(120).nullable() }),
  z.object({ action: z.literal('settings'), campaignId: uuid, expectedVersion: z.number().int().positive(), clientActionId: requestId, settings: z.object({ textSize: z.enum(['small','medium','large']), sound: z.boolean(), motion: z.boolean(), content: z.enum(['standard','mature']), guidance: z.enum(['subtle','balanced','direct']) }).strict() }),
  z.object({ action: z.literal('abandon'), campaignId: uuid, expectedVersion: z.number().int().positive(), clientActionId: requestId }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await requireStoriesAccess(db, user.id);
  await enforceRateLimit(db, user.id, 'together_stories', 180, 60);
  const input = request.method === 'GET'
    ? { action: 'library' as const }
    : await parseBody(request, schema);

  if (input.action === 'library') {
    const [campaigns, discoveries] = await Promise.all([
      db.from('together_story_campaigns').select('id,story_slug,status,current_loop,evidence_ids,deduction_ids,discovered_ending_ids,completed_ending_id,last_played_at,version').eq('user_id', user.id).order('last_played_at', { ascending: false }),
      db.from('together_story_discoveries').select('story_slug,discovery_type,discovery_key,discovered_at').eq('user_id', user.id),
    ]);
    if (campaigns.error || discoveries.error) throw new AppError('INTERNAL_ERROR', 'The Stories library could not be loaded.', 500, true);
    await track(db, user.id, 'stories_entry_viewed', { storyCount: KIVELLI_STORY_CATALOG.length });
    return json({ data: {
      stories: KIVELLI_STORY_CATALOG.map((story) => {
        const campaign = (campaigns.data ?? []).find((item) => item.story_slug === story.slug && ['active','midnight'].includes(item.status))
          ?? (campaigns.data ?? []).find((item) => item.story_slug === story.slug);
        return { ...story, campaign: campaign ? { id: campaign.id, status: campaign.status, loop: campaign.current_loop, factsDiscovered: Array.isArray(campaign.evidence_ids) ? campaign.evidence_ids.length : 0, factsTotal: story.slug === 'the-last-night-in-vespormoor' ? 40 : null, endingsDiscovered: Array.isArray(campaign.discovered_ending_ids) ? campaign.discovered_ending_ids.length : 0, endingsTotal: story.slug === 'the-last-night-in-vespormoor' ? 4 : null, completedEndingId: campaign.completed_ending_id, lastPlayedAt: campaign.last_played_at, version: campaign.version } : null };
      }),
      discoveries: discoveries.data ?? [],
    }, correlationId }, 200, correlationId);
  }

  if (input.action === 'start') {
    const definition = storyDefinition(input.storySlug);
    if (!definition) throw new AppError('ACTION_NOT_AVAILABLE', 'That Kivelli Story is coming soon.', 409);
    await track(db, user.id, 'story_selected', { storySlug: definition.slug });
    const { data: existing, error: existingError } = await db.from('together_story_campaigns').select('*').eq('user_id', user.id).eq('story_slug', input.storySlug).in('status', ['active','midnight']).maybeSingle();
    if (existingError) throw new AppError('INTERNAL_ERROR', 'The campaign could not be checked.', 500, true);
    if (existing) return json({ data: { campaign: await storyCampaignView(db, definition, existing) }, correlationId }, 200, correlationId);
    const { data: definitionRow, error: definitionError } = await db.from('together_story_definitions').select('id').eq('slug', input.storySlug).eq('status', 'playable').single();
    if (definitionError || !definitionRow) throw new AppError('NOT_FOUND', 'That story definition is unavailable.', 404);
    const state = initialStoryCampaign(definition);
    const { data: inserted, error } = await db.from('together_story_campaigns').insert(campaignInsert(definition, state, user.id, definitionRow.id, input.requestId)).select('*').single();
    const created = Boolean(inserted);
    let campaign = inserted;
    if (error?.code === '23505') {
      const active = await db.from('together_story_campaigns').select('*').eq('user_id', user.id).eq('story_slug', input.storySlug).in('status', ['active','midnight']).maybeSingle();
      if (active.error) throw new AppError('INTERNAL_ERROR', 'The campaign could not be restored.', 500, true);
      campaign = active.data;
    }
    if ((error && error.code !== '23505') || !campaign) throw new AppError('INTERNAL_ERROR', 'The campaign could not be started.', 500, true);
    if (created) {
      await db.from('together_story_messages').insert(storyOpeningMessageRows(definition, campaign.id, user.id));
      await track(db, user.id, 'story_campaign_started', { storySlug: definition.slug, campaignId: campaign.id });
    }
    return json({ data: { campaign: await storyCampaignView(db, definition, campaign) }, correlationId }, 201, correlationId);
  }

  const campaign = await ownedStoryCampaign(db, user.id, input.campaignId);
  const definition = storyDefinition(String(campaign.story_slug));
  if (!definition) throw new AppError('NOT_FOUND', 'That story definition is unavailable.', 404);

  if (input.action === 'campaign') {
    await track(db, user.id, 'story_campaign_resumed', { storySlug: definition.slug, campaignId: campaign.id, loop: campaign.current_loop });
    return json({ data: { campaign: await storyCampaignView(db, definition, campaign) }, correlationId }, 200, correlationId);
  }

  if (input.action === 'inspector') {
    if (Deno.env.get('KIVELLE_STORY_INSPECTOR_ENABLED') !== 'true' || Deno.env.get('KIVELLE_ENVIRONMENT') === 'production') throw new AppError('NOT_FOUND', 'Story inspector is unavailable.', 404);
    const { data: actionRows, error: actionError } = await db.from('together_story_actions').select('action_type,action_payload,result,created_at').eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(25);
    if (actionError) throw new AppError('INTERNAL_ERROR', 'Story inspection history could not be loaded.', 500, true);
    return json({ data: { ...storyDirectorInspector(definition, compatibleStoryCampaignState(definition, campaignStateFromRow(campaign)), input.characterId), lastAction: actionRows?.[0] ?? null, eventLog: actionRows ?? [] }, correlationId }, 200, correlationId);
  }

  if (input.action === 'restart') {
    await db.from('together_story_campaigns').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', campaign.id).eq('user_id', user.id);
    const { data: definitionRow } = await db.from('together_story_definitions').select('id').eq('slug', definition.slug).single();
    if (!definitionRow) throw new AppError('NOT_FOUND', 'That story definition is unavailable.', 404);
    const state = initialStoryCampaign(definition);
    const { data: restarted, error } = await db.from('together_story_campaigns').insert(campaignInsert(definition, state, user.id, definitionRow.id, input.requestId)).select('*').single();
    if (error || !restarted) throw new AppError('INTERNAL_ERROR', 'The campaign could not be restarted.', 500, true);
    await db.from('together_story_messages').insert(storyOpeningMessageRows(definition, restarted.id, user.id));
    await track(db, user.id, 'story_campaign_restarted', { storySlug: definition.slug, previousCampaignId: campaign.id, campaignId: restarted.id });
    return json({ data: { campaign: await storyCampaignView(db, definition, restarted) }, correlationId }, 201, correlationId);
  }

  const current = compatibleStoryCampaignState(definition, campaignStateFromRow(campaign));
  if (input.action === 'apply') {
    let result: StoryActionResult;
    try { result = applyStoryAction(definition, current, input.storyAction); }
    catch (error) { throw storyRuleAppError(error); }
    const persisted = await persistStoryAction({ db, userId: user.id, campaign, clientActionId: input.clientActionId, actionType: input.storyAction.type, actionPayload: input.storyAction, result });
    await persistStoryPresenceTransitionMessages({
      db,
      definition,
      campaignId: campaign.id,
      userId: user.id,
      clientActionId: input.clientActionId,
      loopNumber: Number(persisted.campaign.current_loop),
      transitions: storyPresenceTransitionsFromResult(persisted.result),
      focusCharacterId: 'characterId' in input.storyAction ? input.storyAction.characterId : undefined,
    });
    await persistStoryActionEventMessages({ db, definition, campaignId: campaign.id, userId: user.id, clientActionId: input.clientActionId, loopNumber: Number(persisted.campaign.current_loop), result });
    if (result.endingReached) await db.from('together_story_discoveries').upsert({ user_id: user.id, story_slug: definition.slug, discovery_type: 'ending', discovery_key: result.endingReached, first_campaign_id: campaign.id, metadata: { loop: result.state.currentLoop } }, { onConflict: 'user_id,story_slug,discovery_type,discovery_key', ignoreDuplicates: true });
    await trackStoryAction(db, user.id, campaign.id, input.storyAction.type, result);
    return json({ data: { action: persisted.result, campaign: await storyCampaignView(db, definition, persisted.campaign) }, correlationId }, 200, correlationId);
  }

  if (input.action === 'pin') {
    const state = { ...current, pinnedEvidenceId: input.target === 'evidence' ? input.id : current.pinnedEvidenceId, pinnedCharacterId: input.target === 'character' ? input.id : current.pinnedCharacterId, pinnedEventId: input.target === 'event' ? input.id : current.pinnedEventId };
    const result = unchangedResult(state);
    const persisted = await persistStoryAction({ db, userId: user.id, campaign, clientActionId: input.clientActionId, actionType: 'pin', actionPayload: { target: input.target, id: input.id }, result });
    return json({ data: { campaign: await storyCampaignView(db, definition, persisted.campaign) }, correlationId }, 200, correlationId);
  }

  if (input.action === 'settings') {
    const result = unchangedResult(current);
    const persisted = await persistStoryAction({ db, userId: user.id, campaign, clientActionId: input.clientActionId, actionType: 'settings', actionPayload: { settings: input.settings }, result, settings: input.settings });
    return json({ data: { campaign: await storyCampaignView(db, definition, persisted.campaign) }, correlationId }, 200, correlationId);
  }

  if (input.action === 'abandon') {
    const result = unchangedResult({ ...current, status: 'abandoned' });
    const persisted = await persistStoryAction({ db, userId: user.id, campaign, clientActionId: input.clientActionId, actionType: 'abandon', actionPayload: {}, result });
    await track(db, user.id, 'story_campaign_abandoned', { storySlug: definition.slug, campaignId: campaign.id, loop: current.currentLoop });
    return json({ data: { campaign: await storyCampaignView(db, definition, persisted.campaign) }, correlationId }, 200, correlationId);
  }

  throw new AppError('VALIDATION_FAILED', 'Unsupported story action.', 400);
});

function unchangedResult(state: ReturnType<typeof campaignStateFromRow>): StoryActionResult {
  return { state, timeAdvanced: 0, evidenceDiscovered: [], deductionsCompleted: [], eventsWitnessed: [], presenceTransitions: [] };
}

function storyRuleAppError(error: unknown): AppError {
  if (!(error instanceof StoryRuleError)) return new AppError('INTERNAL_ERROR', 'The story action could not be resolved.', 500, true);
  const status = error.code === 'NOT_PRESENT' ? 409 : error.code === 'INVALID_ACTION' ? 400 : 409;
  return new AppError('ACTION_NOT_AVAILABLE', error.message, status);
}

async function trackStoryAction(db: SupabaseClient, userId: string, campaignId: string, action: string, result: StoryActionResult): Promise<void> {
  await track(db, userId, action === 'reset' ? 'story_loop_completed' : action === 'finale' ? 'story_ending_reached' : result.evidenceDiscovered.length ? 'story_evidence_discovered' : 'story_action_completed', {
    campaignId,
    action,
    loop: result.state.currentLoop,
    timeAdvanced: result.timeAdvanced,
    evidenceCount: result.evidenceDiscovered.length,
    deductionCount: result.deductionsCompleted.length,
    endingId: result.endingReached ?? null,
  });
  if (result.deductionsCompleted.length) await track(db, userId, 'story_deduction_completed', {
    campaignId,
    action,
    loop: result.state.currentLoop,
    deductionIds: result.deductionsCompleted,
  });
}
