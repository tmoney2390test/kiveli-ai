import { z } from 'zod';
import { applyStoryAction, storyCharactersAtLocation, StoryRuleError } from '../../../packages/together-domain/src/stories.ts';
import { applyStoryCharacterExchangeContinuity, applyStoryConversationContinuity, applyValidatedStoryReaction, selectStorySecondarySpeaker } from '../../../packages/together-domain/src/story-director.ts';
import { parseBody } from '../_shared/body.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { corsHeaders, serve } from '../_shared/http.ts';
import { generateStoryDialogue } from '../_shared/kivelle-story-dialogue.ts';
import { storyDefinition } from '../_shared/kivelle-stories-content.ts';
import {
  campaignStateFromRow,
  compatibleStoryCampaignState,
  ownedStoryCampaign,
  persistStoryAction,
  persistStoryPresenceTransitionMessages,
  requireStoriesAccess,
  storyCampaignView,
  storyPresenceTransitionsFromResult,
} from '../_shared/kivelle-stories.ts';
import { track } from '../_shared/together.ts';
import { AppError } from '../_shared/types.ts';

const schema = z.object({
  campaignId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  characterId: z.string().min(1).max(100),
  message: z.string().trim().min(1).max(2400),
  approachId: z.string().min(1).max(120).optional(),
  evidenceId: z.string().min(1).max(120).optional(),
  clientMessageId: z.string().trim().min(8).max(160),
}).strict();

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('VALIDATION_FAILED', 'Story dialogue requires POST.', 405);
  const { user, db } = await authenticated(request);
  await requireStoriesAccess(db, user.id);
  await enforceRateLimit(db, user.id, 'together_story_dialogue', 40, 60);
  const input = await parseBody(request, schema);
  let campaign = await ownedStoryCampaign(db, user.id, input.campaignId);
  const definition = storyDefinition(String(campaign.story_slug));
  if (!definition) throw new AppError('NOT_FOUND', 'That story definition is unavailable.', 404);

  const { data: existingAction } = await db.from('together_story_actions').select('result').eq('campaign_id', campaign.id).eq('user_id', user.id).eq('client_action_id', input.clientMessageId).maybeSingle();
  const replayText = typeof existingAction?.result?.responseText === 'string' ? existingAction.result.responseText : null;
  if (replayText) {
    const replayCampaign = existingAction?.result?.campaign && typeof existingAction.result.campaign === 'object' ? existingAction.result.campaign as Record<string, unknown> : campaign;
    const character = definition.characters.find((item) => item.id === input.characterId);
    if (!character) throw new AppError('ACTION_NOT_AVAILABLE', 'That person is not available in this story.', 409);
    const replaySecondaryText = typeof existingAction?.result?.secondaryResponseText === 'string' ? existingAction.result.secondaryResponseText : null;
    const replaySecondaryId = typeof existingAction?.result?.secondaryCharacterId === 'string' ? existingAction.result.secondaryCharacterId : null;
    const repairRows = [
      { campaign_id: campaign.id, user_id: user.id, client_message_id: input.clientMessageId, role: 'user', character_slug: null, content: input.message, loop_number: Number(replayCampaign.current_loop ?? campaign.current_loop), story_minute: Number(replayCampaign.current_time_minute ?? campaign.current_time_minute), location_slug: String(replayCampaign.current_location_slug ?? campaign.current_location_slug), metadata: { replayRepair: true, targetCharacterId: character.id, approachId: input.approachId ?? null, evidenceId: input.evidenceId ?? null } },
      { campaign_id: campaign.id, user_id: user.id, client_message_id: `${input.clientMessageId}:character`, role: 'character', character_slug: character.id, content: replayText, loop_number: Number(replayCampaign.current_loop ?? campaign.current_loop), story_minute: Number(replayCampaign.current_time_minute ?? campaign.current_time_minute), location_slug: String(replayCampaign.current_location_slug ?? campaign.current_location_slug), metadata: { replayRepair: true } },
      ...(replaySecondaryText && replaySecondaryId ? [{ campaign_id: campaign.id, user_id: user.id, client_message_id: `${input.clientMessageId}:secondary`, role: 'character', character_slug: replaySecondaryId, content: replaySecondaryText, loop_number: Number(replayCampaign.current_loop ?? campaign.current_loop), story_minute: Number(replayCampaign.current_time_minute ?? campaign.current_time_minute), location_slug: String(replayCampaign.current_location_slug ?? campaign.current_location_slug), metadata: { replayRepair: true, reactive: true, replyToCharacterId: character.id } }] : []),
    ];
    const { error: repairError } = await db.from('together_story_messages').upsert(repairRows, { onConflict: 'campaign_id,client_message_id', ignoreDuplicates: true });
    if (repairError) throw new AppError('INTERNAL_ERROR', 'The saved story reply could not be restored.', 500, true);
    await persistStoryPresenceTransitionMessages({
      db,
      definition,
      campaignId: campaign.id,
      userId: user.id,
      clientActionId: input.clientMessageId,
      loopNumber: Number(replayCampaign.current_loop ?? campaign.current_loop),
      transitions: storyPresenceTransitionsFromResult(existingAction?.result),
      focusCharacterId: input.characterId,
    });
    campaign = await ownedStoryCampaign(db, user.id, input.campaignId);
    const view = await storyCampaignView(db, definition, campaign);
    return storyDialogueStream(replayText, view, { replayed: true, evidenceDiscovered: [], deductionsCompleted: [] }, correlationId);
  }

  if (Number(campaign.version) !== input.expectedVersion) throw new AppError('CONFLICT', 'The story moved forward on another device. Reload the latest checkpoint.', 409, true);
  const before = compatibleStoryCampaignState(definition, campaignStateFromRow(campaign));
  let result;
  try {
    result = applyStoryAction(definition, before, { type: 'conversation', characterId: input.characterId, freeformText: input.message, ...(input.approachId ? { approachId: input.approachId } : {}), ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}) });
  } catch (error) {
    if (error instanceof StoryRuleError) throw new AppError('ACTION_NOT_AVAILABLE', error.message, 409);
    throw error;
  }
  const { data: recent, error: recentError } = await db.from('together_story_messages').select('role,character_slug,content,loop_number,story_minute,location_slug').eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(12);
  if (recentError) throw new AppError('INTERNAL_ERROR', 'The story transcript could not be loaded.', 500, true);
  const campaignSettings = campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings) ? campaign.settings as Record<string, unknown> : {};
  const generated = await generateStoryDialogue({ db, userId: user.id, correlationId, campaignId: campaign.id, definition, before, result, characterId: input.characterId, userMessage: input.message, contentMode: campaignSettings.content === 'mature' ? 'mature' : 'standard', ...(input.approachId ? { approachId: input.approachId } : {}), ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}), recentMessages: [...(recent ?? [])].reverse() });
  result = applyValidatedStoryReaction(definition, result, input.characterId, generated.structured.proposedReactionId);
  result = applyStoryConversationContinuity({ result, characterId: input.characterId, userMessage: input.message, characterReply: generated.text, intent: generated.authorization.intent, move: generated.plan.move });
  const character = definition.characters.find((item) => item.id === input.characterId)!;
  const departedIds = new Set(result.presenceTransitions.filter((item) => item.type === 'departed').map((item) => item.characterId));
  const arrivedIds = result.presenceTransitions.filter((item) => item.type === 'arrived' && item.destinationLocationId === before.currentLocationId).map((item) => item.characterId);
  const presentIds = [...new Set([...storyCharactersAtLocation(definition, before).map((item) => item.id), ...arrivedIds])].filter((id) => !departedIds.has(id));
  const secondarySelection = selectStorySecondarySpeaker({ definition, state: result.state, primaryCharacterId: input.characterId, presentCharacterIds: presentIds, newlyArrivedCharacterIds: arrivedIds, userMessage: input.message, primaryReply: generated.text, ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}) });
  const secondary = secondarySelection ? await generateStoryDialogue({
    db, userId: user.id, correlationId, campaignId: campaign.id, definition, before, result,
    characterId: secondarySelection.characterId, userMessage: input.message,
    contentMode: campaignSettings.content === 'mature' ? 'mature' : 'standard',
    recentMessages: [...(recent ?? [])].reverse(), reactiveOnly: true,
    reactionTo: { characterId: character.id, characterName: character.name, text: generated.text },
  }) : null;
  if (secondary && secondarySelection) {
    const secondaryCharacter = definition.characters.find((item) => item.id === secondarySelection.characterId)!;
    result = applyStoryCharacterExchangeContinuity({ result, primaryCharacterId: character.id, primaryName: character.name, primaryReply: generated.text, secondaryCharacterId: secondaryCharacter.id, secondaryName: secondaryCharacter.name, secondaryReply: secondary.text, secondaryMove: secondary.plan.move });
  }
  const persisted = await persistStoryAction({ db, userId: user.id, campaign, clientActionId: input.clientMessageId, actionType: 'conversation', actionPayload: { characterId: input.characterId, approachId: input.approachId ?? null, evidenceId: input.evidenceId ?? null }, result, resultMetadata: { responseText: generated.text, provider: generated.provider, model: generated.model, fallback: generated.fallback, conversationalMove: generated.plan.move, responseShape: generated.plan.responseShape, dialoguePlanReasonCodes: generated.plan.reasonCodes, qualityIssues: generated.qualityIssues, referencedFactIds: generated.structured.referencedFactIds, expressedBeliefIds: generated.structured.expressedBeliefIds, expressedLieIds: generated.structured.expressedLieIds, proposedLeadId: generated.structured.proposedLeadId ?? null, proposedActionIds: generated.structured.proposedActionIds, proposedReactionId: generated.structured.proposedReactionId ?? null, rejectedIdentifiers: generated.rejectedIds, secondaryCharacterId: secondarySelection?.characterId ?? null, secondaryResponseText: secondary?.text ?? null, secondaryReason: secondarySelection?.reason ?? null, secondaryConversationalMove: secondary?.plan.move ?? null, secondaryResponseShape: secondary?.plan.responseShape ?? null, secondaryQualityIssues: secondary?.qualityIssues ?? [] } });
  const messageRows = [
    { campaign_id: campaign.id, user_id: user.id, client_message_id: input.clientMessageId, role: 'user', character_slug: null, content: input.message, loop_number: before.currentLoop, story_minute: before.currentMinute, location_slug: before.currentLocationId, metadata: { targetCharacterId: character.id, approachId: input.approachId ?? null, evidenceId: input.evidenceId ?? null } },
    { campaign_id: campaign.id, user_id: user.id, client_message_id: `${input.clientMessageId}:character`, role: 'character', character_slug: character.id, content: generated.text, loop_number: before.currentLoop, story_minute: result.state.currentMinute, location_slug: before.currentLocationId, metadata: { provider: generated.provider, model: generated.model, fallback: generated.fallback, conversationalMove: generated.plan.move, responseShape: generated.plan.responseShape, qualityIssues: generated.qualityIssues, evidenceDiscovered: result.evidenceDiscovered, referencedFactIds: generated.structured.referencedFactIds, expressedBeliefIds: generated.structured.expressedBeliefIds, expressedLieIds: generated.structured.expressedLieIds, proposedLeadId: generated.structured.proposedLeadId ?? null, proposedActionIds: generated.structured.proposedActionIds, stageDirection: generated.structured.stageDirection ?? null, rejectedIdentifiers: generated.rejectedIds } },
    ...(secondary && secondarySelection ? [{ campaign_id: campaign.id, user_id: user.id, client_message_id: `${input.clientMessageId}:secondary`, role: 'character', character_slug: secondarySelection.characterId, content: secondary.text, loop_number: before.currentLoop, story_minute: result.state.currentMinute, location_slug: before.currentLocationId, metadata: { provider: secondary.provider, model: secondary.model, fallback: secondary.fallback, conversationalMove: secondary.plan.move, responseShape: secondary.plan.responseShape, qualityIssues: secondary.qualityIssues, reactive: true, replyToCharacterId: character.id, reason: secondarySelection.reason, stageDirection: secondary.structured.stageDirection ?? null, referencedFactIds: secondary.structured.referencedFactIds, rejectedIdentifiers: secondary.rejectedIds } }] : []),
  ];
  const { error: messageError } = await db.from('together_story_messages').upsert(messageRows, { onConflict: 'campaign_id,client_message_id', ignoreDuplicates: true });
  if (messageError) throw new AppError('INTERNAL_ERROR', 'The reply was created but the story transcript could not be saved.', 500, true);
  await persistStoryPresenceTransitionMessages({
    db,
    definition,
    campaignId: campaign.id,
    userId: user.id,
    clientActionId: input.clientMessageId,
    loopNumber: Number(persisted.campaign.current_loop),
    transitions: storyPresenceTransitionsFromResult(persisted.result),
    focusCharacterId: input.characterId,
  });
  await track(db, user.id, 'story_conversation_started', { campaignId: campaign.id, storySlug: definition.slug, characterId: character.id, loop: before.currentLoop, approach: Boolean(input.approachId), evidencePresented: Boolean(input.evidenceId), provider: generated.provider, fallback: generated.fallback, conversationalMove: generated.plan.move, responseShape: generated.plan.responseShape, qualityIssueCount: generated.qualityIssues.length });
  if (secondary && secondarySelection) await track(db, user.id, 'story_character_interjected', { campaignId: campaign.id, storySlug: definition.slug, primaryCharacterId: character.id, secondaryCharacterId: secondarySelection.characterId, reason: secondarySelection.reason, fallback: secondary.fallback });
  if (generated.fallback) await track(db, user.id, 'story_ai_request_failed', { campaignId: campaign.id, storySlug: definition.slug, characterId: character.id, loop: before.currentLoop, recoveredWithDeterministicFallback: true });
  if (input.evidenceId) await track(db, user.id, 'story_evidence_presented', { campaignId: campaign.id, characterId: character.id, evidenceId: input.evidenceId });
  const view = await storyCampaignView(db, definition, persisted.campaign);
  return storyDialogueStream(generated.text, view, { replayed: false, evidenceDiscovered: result.evidenceDiscovered, deductionsCompleted: result.deductionsCompleted }, correlationId);
});

function storyDialogueStream(text: string, campaign: Record<string, unknown>, metadata: Record<string, unknown>, correlationId: string): Response {
  const encoder = new TextEncoder();
  const chunks = text.match(/\S+\s*/g) ?? [text];
  const stream = new ReadableStream({
    async start(controller) {
      for (const token of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', campaign, ...metadata })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'X-Correlation-ID': correlationId, 'X-Accel-Buffering': 'no' } });
}
