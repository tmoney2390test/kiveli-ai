import type { SupabaseClient } from '@supabase/supabase-js';
import {
  availableStoryApproaches,
  availableStoryEndings,
  availableStoryInteractions,
  formatStoryTime,
  minutesToMidnight,
  resolveStoryDepartureForecast,
  resolveStoryFollowPlan,
  resolveStoryCharacterLocation,
  storyCharactersAtLocation,
  storyEvidenceClientView,
  storyRequirementMet,
  STORY_DIALOGUE_MINUTES,
  type StoryActionResult,
  type StoryCampaignState,
  type StoryDefinition,
  type StoryPresenceTransition,
} from '../../../packages/together-domain/src/stories.ts';
import { resolveStoryProactiveBeat } from '../../../packages/together-domain/src/story-director.ts';
import { resolveStoryCaseGuidance, storyInvestigationTracks, type StoryGuidanceLevel } from '../../../packages/together-domain/src/story-guidance.ts';
import { AppError } from './types.ts';

type Row = Record<string, any>;

export function kivelliStoriesEnabled(): boolean {
  return Deno.env.get('KIVELLE_STORIES_ENABLED') !== 'false';
}

export async function requireStoriesAccess(db: SupabaseClient, userId: string): Promise<void> {
  if (!kivelliStoriesEnabled()) throw new AppError('ACTION_NOT_AVAILABLE', 'Kivelli Stories is not available right now.', 404);
  const required = Deno.env.get('KIVELLE_STORIES_ACCESS_ENTITLEMENT')?.trim();
  if (!required) return;
  const { data, error } = await db.from('together_entitlements').select('entitlement_keys').eq('user_id', userId).maybeSingle();
  if (error) throw new AppError('INTERNAL_ERROR', 'Story access could not be checked.', 500, true);
  if (!Array.isArray(data?.entitlement_keys) || !data.entitlement_keys.includes(required)) throw new AppError('FORBIDDEN', 'This story is not included with your account.', 403);
}

export function campaignStateFromRow(row: Row): StoryCampaignState {
  return {
    storySlug: String(row.story_slug),
    status: String(row.status) as StoryCampaignState['status'],
    currentLoop: Number(row.current_loop),
    currentMinute: Number(row.current_time_minute),
    currentLocationId: String(row.current_location_slug),
    evidenceIds: strings(row.evidence_ids),
    deductionIds: strings(row.deduction_ids),
    inventoryIds: strings(row.inventory_ids),
    persistentFlags: strings(row.persistent_flags),
    loopFlags: strings(row.loop_flags),
    witnessedEventIds: strings(row.witnessed_event_ids),
    loopDiscoveredEvidenceIds: strings(row.loop_discovered_evidence_ids),
    loopVisitedLocationIds: strings(row.loop_visited_location_ids),
    characterStates: record(row.character_state) as StoryCampaignState['characterStates'],
    loopHistory: Array.isArray(row.loop_history) ? row.loop_history : [],
    discoveredEndingIds: strings(row.discovered_ending_ids),
    completedEndingId: typeof row.completed_ending_id === 'string' ? row.completed_ending_id : null,
    pinnedEvidenceId: typeof row.pinned_evidence_id === 'string' ? row.pinned_evidence_id : null,
    pinnedCharacterId: typeof row.pinned_character_id === 'string' ? row.pinned_character_id : null,
    pinnedEventId: typeof row.pinned_event_id === 'string' ? row.pinned_event_id : null,
    contentVersion: Number(row.content_version ?? 1),
    persistencePolicy: typeof row.persistence_policy === 'string' ? row.persistence_policy : 'knowledge-persists-loop-resets',
  };
}

export function campaignInsert(definition: StoryDefinition, state: StoryCampaignState, userId: string, storyDefinitionId: string, requestId: string): Row {
  return {
    user_id: userId,
    story_definition_id: storyDefinitionId,
    story_slug: state.storySlug,
    content_version: definition.version ?? 1,
    persistence_policy: definition.persistencePolicy ?? 'knowledge-persists-loop-resets',
    ...campaignStateColumns(state),
    settings: { textSize: 'medium', sound: true, motion: true, content: 'standard', guidance: 'balanced' },
    last_checkpoint: { source: 'campaign_start', requestId },
  };
}

export function campaignStateColumns(state: StoryCampaignState): Row {
  return {
    status: state.status,
    current_loop: state.currentLoop,
    current_time_minute: state.currentMinute,
    current_location_slug: state.currentLocationId,
    evidence_ids: state.evidenceIds,
    deduction_ids: state.deductionIds,
    inventory_ids: state.inventoryIds,
    persistent_flags: state.persistentFlags,
    loop_flags: state.loopFlags,
    witnessed_event_ids: state.witnessedEventIds,
    loop_discovered_evidence_ids: state.loopDiscoveredEvidenceIds,
    loop_visited_location_ids: state.loopVisitedLocationIds,
    character_state: state.characterStates,
    loop_history: state.loopHistory,
    discovered_ending_ids: state.discoveredEndingIds,
    completed_ending_id: state.completedEndingId,
    pinned_evidence_id: state.pinnedEvidenceId,
    pinned_character_id: state.pinnedCharacterId,
    pinned_event_id: state.pinnedEventId,
  };
}

export async function persistStoryAction(input: {
  db: SupabaseClient;
  userId: string;
  campaign: Row;
  clientActionId: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  result: StoryActionResult;
  settings?: Record<string, unknown>;
  resultMetadata?: Record<string, unknown>;
}): Promise<{ campaign: Row; result: Record<string, unknown> }> {
  const state = input.result.state;
  const priorCheckpoint = record(input.campaign.last_checkpoint);
  const gameplayAction = !['pin', 'settings', 'abandon'].includes(input.actionType);
  const madeProgress = Boolean(
    input.result.evidenceDiscovered.length
    || input.result.deductionsCompleted.length
    || input.result.eventsWitnessed.length
    || input.result.endingReached
    || input.result.resetSummary,
  );
  const priorStallCount = Number.isFinite(Number(priorCheckpoint.guidanceStallCount)) ? Number(priorCheckpoint.guidanceStallCount) : 0;
  const guidanceStallCount = gameplayAction ? (madeProgress ? 0 : Math.min(8, priorStallCount + 1)) : priorStallCount;
  const guidanceOutcome = gameplayAction ? {
    actionType: input.actionType,
    madeProgress,
    evidenceDiscovered: input.result.evidenceDiscovered,
    deductionsCompleted: input.result.deductionsCompleted,
    eventsWitnessed: input.result.eventsWitnessed,
    endingReached: input.result.endingReached ?? null,
    timeAdvanced: input.result.timeAdvanced,
  } : record(priorCheckpoint.guidanceOutcome);
  const persistedResult = {
    ...actionResultPayload(input.result),
    ...(input.resultMetadata ?? {}),
    guidanceStallCount,
    guidanceOutcome,
  };
  const { data, error } = await input.db.rpc('apply_together_story_action', {
    p_campaign_id: input.campaign.id,
    p_user_id: input.userId,
    p_expected_version: Number(input.campaign.version),
    p_client_action_id: input.clientActionId,
    p_action_type: input.actionType,
    p_action_payload: input.actionPayload,
    p_status: state.status,
    p_current_loop: state.currentLoop,
    p_current_time_minute: state.currentMinute,
    p_current_location_slug: state.currentLocationId,
    p_evidence_ids: state.evidenceIds,
    p_deduction_ids: state.deductionIds,
    p_inventory_ids: state.inventoryIds,
    p_persistent_flags: state.persistentFlags,
    p_loop_flags: state.loopFlags,
    p_witnessed_event_ids: state.witnessedEventIds,
    p_loop_discovered_evidence_ids: state.loopDiscoveredEvidenceIds,
    p_loop_visited_location_ids: state.loopVisitedLocationIds,
    p_character_state: state.characterStates,
    p_loop_history: state.loopHistory,
    p_discovered_ending_ids: state.discoveredEndingIds,
    p_completed_ending_id: state.completedEndingId,
    p_pinned_evidence_id: state.pinnedEvidenceId,
    p_pinned_character_id: state.pinnedCharacterId,
    p_pinned_event_id: state.pinnedEventId,
    p_settings: input.settings ?? record(input.campaign.settings),
    p_action_result: persistedResult,
  });
  if (error) {
    if (error.message.includes('STORY_VERSION_CONFLICT')) throw new AppError('CONFLICT', 'The story moved forward on another device. Refreshing will restore the latest checkpoint.', 409, true);
    if (error.message.includes('STORY_CAMPAIGN_NOT_FOUND')) throw new AppError('NOT_FOUND', 'That story campaign is unavailable.', 404);
    throw new AppError('INTERNAL_ERROR', 'The story could not be saved.', 500, true);
  }
  const payload = record(data);
  return { campaign: record(payload.campaign), result: payload };
}

export async function ownedStoryCampaign(db: SupabaseClient, userId: string, campaignId: string): Promise<Row> {
  const { data, error } = await db.from('together_story_campaigns').select('*').eq('id', campaignId).eq('user_id', userId).maybeSingle();
  if (error) throw new AppError('INTERNAL_ERROR', 'The story could not be loaded.', 500, true);
  if (!data) throw new AppError('NOT_FOUND', 'That story campaign is unavailable.', 404);
  return data;
}

export function storyOpeningMessageRows(definition: StoryDefinition, campaignId: string, userId: string): Row[] {
  const openingCharacter = storyCharactersAtLocation(definition, initialStateForOpening(definition), definition.startLocationId).find((item) => item.storyProfile?.authoredOpeningBeats?.length);
  const system = { campaign_id: campaignId, user_id: userId, role: 'system', content: definition.openingNarration ?? `The story begins at ${formatStoryTime(definition.loopStartMinute)}.`, loop_number: 0, story_minute: definition.loopStartMinute, location_slug: definition.startLocationId, metadata: { kind: 'opening', canonical: true, contentVersion: definition.version ?? 1 } };
  if (!openingCharacter) return [system];
  return [system, { campaign_id: campaignId, user_id: userId, role: 'character', character_slug: openingCharacter.id, content: openingCharacter.storyProfile!.authoredOpeningBeats![0]!, loop_number: 0, story_minute: definition.loopStartMinute, location_slug: definition.startLocationId, metadata: { kind: 'opening_reply', canonical: true, contentVersion: definition.version ?? 1 } }];
}

export function storyPresenceTransitionsFromResult(value: unknown): StoryPresenceTransition[] {
  const source = record(value).presenceTransitions;
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    const row = record(item);
    const type = row.type === 'arrived' || row.type === 'departed' ? row.type : null;
    const characterId = typeof row.characterId === 'string' ? row.characterId : '';
    const storyMinute = Number(row.storyMinute);
    if (!type || !characterId || !Number.isFinite(storyMinute)) return [];
    return [{
      type,
      characterId,
      originLocationId: typeof row.originLocationId === 'string' ? row.originLocationId : null,
      destinationLocationId: typeof row.destinationLocationId === 'string' ? row.destinationLocationId : null,
      storyMinute,
      activity: typeof row.activity === 'string' ? row.activity : 'Moving through the story',
      witnessed: row.witnessed === true,
      reason: row.reason === 'story_branch' || row.reason === 'loop_reset' ? row.reason : 'schedule',
    } satisfies StoryPresenceTransition];
  });
}

export function storyPresenceTransitionMessageRows(input: {
  definition: StoryDefinition;
  campaignId: string;
  userId: string;
  clientActionId: string;
  loopNumber: number;
  transitions: StoryPresenceTransition[];
  focusCharacterId?: string;
}): Row[] {
  const visible = input.transitions
    .filter((transition) => transition.witnessed && (transition.reason !== 'loop_reset' || transition.type === 'arrived'))
    .sort((left, right) => {
      const priority = (transition: StoryPresenceTransition) => transition.characterId === input.focusCharacterId
        ? 0
        : input.definition.characters.find((item) => item.id === transition.characterId)?.storyProfile?.participationTier === 'core'
          ? 1
          : input.definition.characters.find((item) => item.id === transition.characterId)?.storyProfile?.participationTier === 'supporting'
            ? 2
            : 3;
      return priority(left) - priority(right) || left.storyMinute - right.storyMinute;
    });
  const detailed = visible.filter((transition) => input.definition.characters.find((item) => item.id === transition.characterId)?.storyProfile?.participationTier !== 'ambient').slice(0, 3);
  const summarized = visible.filter((transition) => !detailed.includes(transition));
  const rows: Row[] = detailed.map((transition, index) => {
      const character = input.definition.characters.find((item) => item.id === transition.characterId);
      const characterName = character?.name.split(' ')[0] ?? transition.characterId;
      const origin = input.definition.locations.find((item) => item.id === transition.originLocationId);
      const destination = input.definition.locations.find((item) => item.id === transition.destinationLocationId);
      const content = transition.reason === 'loop_reset'
        ? `The loop resets with ${characterName} back at ${destination?.name ?? 'the beginning'}`
        : transition.type === 'departed'
          ? `${characterName} left${destination ? ` for ${destination.name}` : origin ? ` ${origin.name}` : ''}`
          : `${characterName} arrived${destination ? ` at ${destination.name}` : ''}${origin ? ` from ${origin.name}` : ''}`;
      return {
        campaign_id: input.campaignId,
        user_id: input.userId,
        client_message_id: `${input.clientActionId}:presence:${transition.type}:${transition.characterId}:${transition.storyMinute}:${index}`,
        role: 'system',
        character_slug: transition.characterId,
        content,
        loop_number: input.loopNumber,
        story_minute: transition.storyMinute,
        location_slug: transition.type === 'departed'
          ? transition.originLocationId ?? transition.destinationLocationId ?? input.definition.startLocationId
          : transition.destinationLocationId ?? transition.originLocationId ?? input.definition.startLocationId,
        metadata: {
          kind: 'presence_transition',
          canonical: true,
          transitionType: transition.type,
          characterId: transition.characterId,
          originLocationId: transition.originLocationId,
          destinationLocationId: transition.destinationLocationId,
          activity: transition.activity,
          reason: transition.reason,
        },
      };
    });
  if (summarized.length) {
    const minute = Math.max(...summarized.map((item) => item.storyMinute));
    const arrivals = summarized.filter((item) => item.type === 'arrived').length;
    const departures = summarized.length - arrivals;
    const movement = [arrivals ? `${arrivals} ${arrivals === 1 ? 'arrival' : 'arrivals'}` : '', departures ? `${departures} ${departures === 1 ? 'departure' : 'departures'}` : ''].filter(Boolean).join(' and ');
    rows.push({
      campaign_id: input.campaignId,
      user_id: input.userId,
      client_message_id: `${input.clientActionId}:presence:summary:${minute}`,
      role: 'system',
      character_slug: null,
      content: `Other movement passes through the scene — ${movement}`,
      loop_number: input.loopNumber,
      story_minute: minute,
      location_slug: summarized.find((item) => item.destinationLocationId)?.destinationLocationId ?? summarized[0]?.originLocationId ?? input.definition.startLocationId,
      metadata: { kind: 'presence_transition_summary', canonical: true, transitionCount: summarized.length },
    });
  }
  return rows;
}

export async function persistStoryPresenceTransitionMessages(input: {
  db: SupabaseClient;
  definition: StoryDefinition;
  campaignId: string;
  userId: string;
  clientActionId: string;
  loopNumber: number;
  transitions: StoryPresenceTransition[];
  focusCharacterId?: string;
}): Promise<void> {
  const rows = storyPresenceTransitionMessageRows(input);
  if (!rows.length) return;
  const { error } = await input.db.from('together_story_messages').upsert(rows, { onConflict: 'campaign_id,client_message_id', ignoreDuplicates: true });
  if (error) throw new AppError('INTERNAL_ERROR', 'The story advanced, but a character movement marker could not be saved.', 500, true);
}

export function storyActionEventMessageRows(input: {
  definition: StoryDefinition;
  campaignId: string;
  userId: string;
  clientActionId: string;
  loopNumber: number;
  result: StoryActionResult;
}): Row[] {
  if (input.result.followOutcome) {
    const outcome = input.result.followOutcome;
    return [{
      campaign_id: input.campaignId,
      user_id: input.userId,
      client_message_id: `${input.clientActionId}:follow-outcome`,
      role: 'system',
      character_slug: outcome.characterId,
      content: outcome.trace,
      loop_number: input.loopNumber,
      story_minute: input.result.state.currentMinute,
      location_slug: input.result.state.currentLocationId,
      metadata: { kind: 'follow_outcome', canonical: true, ...outcome },
    }];
  }
  if (input.result.absenceOutcome) {
    const outcome = input.result.absenceOutcome;
    return [{
      campaign_id: input.campaignId,
      user_id: input.userId,
      client_message_id: `${input.clientActionId}:absence:${outcome.choice}`,
      role: 'system',
      character_slug: outcome.characterId,
      content: outcome.content,
      loop_number: input.loopNumber,
      story_minute: input.result.state.currentMinute,
      location_slug: input.result.state.currentLocationId,
      metadata: { kind: 'absence_action', canonical: true, ...outcome },
    }];
  }
  return [];
}

export async function persistStoryActionEventMessages(input: Parameters<typeof storyActionEventMessageRows>[0] & { db: SupabaseClient }): Promise<void> {
  const rows = storyActionEventMessageRows(input);
  if (!rows.length) return;
  const { error } = await input.db.from('together_story_messages').upsert(rows, { onConflict: 'campaign_id,client_message_id', ignoreDuplicates: true });
  if (error) throw new AppError('INTERNAL_ERROR', 'The story advanced, but its encounter marker could not be saved.', 500, true);
}

export async function storyCampaignView(db: SupabaseClient, definition: StoryDefinition, campaign: Row, includeMessages = true): Promise<Record<string, unknown>> {
  const state = compatibleStoryCampaignState(definition, campaignStateFromRow(campaign));
  const currentLocation = definition.locations.find((location) => location.id === state.currentLocationId) ?? definition.locations.find((location) => location.id === definition.startLocationId)!;
  const alteredLocation = state.loopFlags.some((flag) => flag.startsWith(`location:${currentLocation.id}:`) || definition.interactions.some((interaction) => interaction.locationId === currentLocation.id && flag === `interaction:${interaction.id}:completed`));
  const authoredLocationState = currentLocation.environmentalStates?.find((item) => storyRequirementMet(definition, state, item.requirements));
  const locationDescription = authoredLocationState?.narration ?? (state.currentMinute >= definition.loopEndMinute - 40
    ? currentLocation.lateNightNarration ?? currentLocation.description
    : alteredLocation
      ? currentLocation.alteredNarration ?? currentLocation.description
      : currentLocation.arrivalNarration ?? currentLocation.description);
  const locationState = authoredLocationState?.id ?? (state.currentMinute >= definition.loopEndMinute - 40 ? 'late_night' : alteredLocation ? 'altered' : 'normal');
  const discovered = definition.evidence.filter((item) => state.evidenceIds.includes(item.id));
  const previouslyWitnessed = new Set(state.loopHistory.flatMap((loop) => loop.eventsWitnessed));
  state.witnessedEventIds.forEach((id) => previouslyWitnessed.add(id));
  const messages = includeMessages
    ? await db.from('together_story_messages').select('id,role,character_slug,content,loop_number,story_minute,location_slug,metadata,created_at').eq('campaign_id', campaign.id).order('created_at').limit(250)
    : { data: [] as Row[], error: null };
  if (messages.error) throw new AppError('INTERNAL_ERROR', 'The story transcript could not be loaded.', 500, true);
  const compatibleMessages = compatibleStoryMessages(definition, campaign, messages.data ?? []);
  const campaignSettings = record(campaign.settings);
  const checkpoint = record(campaign.last_checkpoint);
  const configuredGuidance = campaignSettings.guidance === 'subtle' || campaignSettings.guidance === 'direct' ? campaignSettings.guidance : 'balanced';
  const guidance = resolveStoryCaseGuidance({ definition, state, guidanceLevel: configuredGuidance as StoryGuidanceLevel, stalledActions: Number(checkpoint.guidanceStallCount ?? 0) });
  const outcome = record(checkpoint.guidanceOutcome);
  const outcomeEvidence = strings(outcome.evidenceDiscovered).map((id) => definition.evidence.find((item) => item.id === id)?.title).filter((title): title is string => Boolean(title));
  const outcomeDeductions = strings(outcome.deductionsCompleted).map((id) => definition.deductions.find((item) => item.id === id)?.title).filter((title): title is string => Boolean(title));
  const recentOutcome = typeof outcome.actionType === 'string' ? {
    madeProgress: outcome.madeProgress === true,
    title: outcomeDeductions.length ? `Line resolved: ${outcomeDeductions.join(', ')}` : outcomeEvidence.length ? `New lead: ${outcomeEvidence.join(', ')}` : outcome.endingReached ? 'The night has changed' : 'The trail continues',
    detail: outcomeDeductions.length
      ? 'Your evidence now supports a formal deduction.'
      : outcomeEvidence.length
        ? 'This changes which people and places are worth your attention.'
        : 'No new evidence surfaced, so the strongest remaining paths have been adjusted.',
    next: guidance.leads[0]?.title ?? guidance.objective,
  } : null;
  const present = storyCharactersAtLocation(definition, state);
  const knownCharacterIds = new Set(definition.characters.filter((character) =>
    (state.characterStates[character.id]?.conversationCount ?? 0) > 0
    || state.evidenceIds.some((id) => definition.evidence.find((item) => item.id === id)?.relatedCharacterIds.includes(character.id))
    || present.some((person) => person.id === character.id)
    || compatibleMessages.some((message) => message.character_slug === character.id || record(message.metadata).targetCharacterId === character.id)
  ).map((character) => character.id));
  const knownCharacterLocations = new Map(definition.characters.flatMap((character) => {
    if (!knownCharacterIds.has(character.id)) return [];
    const schedule = resolveStoryCharacterLocation(definition, state, character.id);
    return schedule ? [[character.id, schedule.locationId] as const] : [];
  }));
  const knownTimeline = definition.timedEvents.map((event) => {
    const witnessed = previouslyWitnessed.has(event.id);
    return witnessed
      ? { id: event.id, title: event.title, time: formatStoryTime(event.minute), minute: event.minute, locationId: event.locationId, witnessed: state.witnessedEventIds.includes(event.id), known: true, changedThisLoop: Boolean(event.changedByFlag && state.loopFlags.includes(event.changedByFlag)), pinned: state.pinnedEventId === event.id }
      : { id: event.id, title: 'Undiscovered event', time: '???', minute: null, locationId: null, witnessed: false, known: false, changedThisLoop: false, pinned: false };
  });
  const visiblePresent = present.filter((character) => character.storyProfile?.participationTier !== 'ambient' && character.storyProfile?.participationTier !== 'excluded');
  const ambientPresent = present.filter((character) => character.storyProfile?.participationTier === 'ambient');
  const proactiveBeat = resolveStoryProactiveBeat({ definition, state, presentCharacterIds: visiblePresent.map((character) => character.id) });
  const departureFor = (characterId: string) => {
    const forecast = resolveStoryDepartureForecast(definition, state, characterId, 10);
    return forecast ? { minutesUntil: forecast.minutesUntil, departureMinute: forecast.departureMinute, time: formatStoryTime(forecast.departureMinute) } : null;
  };
  const followFor = (characterId: string) => {
    const plan = resolveStoryFollowPlan(definition, state, characterId);
    if (!plan) return null;
    const target = definition.locations.find((item) => item.id === plan.targetLocationId);
    return { targetLocationId: plan.targetLocationId, targetLocationName: target?.name ?? plan.targetLocationId, travelMinutes: plan.travelMinutes, arrivalMinute: plan.arrivalMinute, arrivalTime: formatStoryTime(plan.arrivalMinute), catchable: plan.catchable, mayMoveBeforeArrival: plan.mayMoveBeforeArrival };
  };
  const recentArrival = [...compatibleMessages].reverse().find((message) => {
    const metadata = record(message.metadata);
    return metadata.kind === 'presence_transition' && metadata.transitionType === 'arrived' && message.location_slug === state.currentLocationId && Number(message.loop_number) === state.currentLoop && state.currentMinute - Number(message.story_minute) <= 5;
  });
  const arrivalCharacter = recentArrival?.character_slug ? definition.characters.find((item) => item.id === recentArrival.character_slug) : null;
  const arrivalIndex = recentArrival ? compatibleMessages.indexOf(recentArrival) : -1;
  const arrivalAlreadyAcknowledged = Boolean(arrivalCharacter && arrivalIndex >= 0 && compatibleMessages.slice(arrivalIndex + 1).some((message) => message.role === 'character' && message.character_slug === arrivalCharacter.id));
  return {
    id: campaign.id,
    storySlug: state.storySlug,
    worldId: definition.worldId ?? null,
    title: definition.title,
    subtitle: definition.subtitle,
    status: state.status,
    version: Number(campaign.version),
    contentVersion: definition.version ?? 1,
    compatibility: Number(campaign.content_version ?? 1) < (definition.version ?? 1) ? { migratedInMemory: true, fromVersion: Number(campaign.content_version ?? 1), toVersion: definition.version ?? 1, message: 'This campaign uses a compatible earlier checkpoint and will upgrade on its next saved action.' } : null,
    theme: definition.theme ?? null,
    loop: state.currentLoop,
    currentMinute: state.currentMinute,
    currentTime: formatStoryTime(state.currentMinute),
    minutesToMidnight: minutesToMidnight(definition, state),
    currentLocation: { id: currentLocation.id, name: currentLocation.name, subtitle: currentLocation.subtitle, description: locationDescription, artworkKey: currentLocation.artworkKey ?? null, state: locationState, sensoryVocabulary: currentLocation.sensoryVocabulary ?? [] },
    factsDiscovered: state.evidenceIds.length,
    factsTotal: definition.evidence.length,
    deductionsCompleted: state.deductionIds.length,
    deductionsTotal: definition.deductions.length,
    endingsDiscovered: state.discoveredEndingIds.length,
    endingsTotal: definition.endings.length,
    evidence: discovered.map((item) => ({ ...storyEvidenceClientView(item), presentedTo: definition.characters.filter((character) => state.characterStates[character.id]?.presentedEvidenceIds.includes(item.id)).map((character) => character.name), discoveredThisLoop: state.loopDiscoveredEvidenceIds.includes(item.id), pinned: state.pinnedEvidenceId === item.id })),
    deductions: storyInvestigationTracks(definition, state),
    guidance: { ...guidance, recentOutcome },
    locations: definition.locations.map((location) => ({ id: location.id, name: location.name, subtitle: location.subtitle, description: location.description, unlocked: storyRequirementMet(definition, state, location.unlock), travelMinutes: currentLocation.travelMinutes[location.id] ?? (location.id === currentLocation.id ? 0 : null), current: location.id === currentLocation.id, visitedThisLoop: state.loopVisitedLocationIds.includes(location.id), knownCharacters: definition.characters.filter((character) => knownCharacterLocations.get(character.id) === location.id).map((character) => ({ id: character.id, name: character.name, portraitSlug: character.portraitSlug, activity: resolveStoryCharacterLocation(definition, state, character.id)?.activity, departureWarning: departureFor(character.id) })) })),
    presentCharacters: visiblePresent.map((character) => ({ id: character.id, name: character.name, role: character.publicRole ?? 'Vespormoor resident', portraitSlug: character.portraitSlug, biography: character.publicBiography ?? 'A resident caught in tonight’s strange weather.', activity: resolveStoryCharacterLocation(definition, state, character.id)?.activity, departureWarning: departureFor(character.id), trust: state.characterStates[character.id]?.trust ?? character.baselineTrust, suspicion: state.characterStates[character.id]?.suspicion ?? character.baselineSuspicion, emotionalState: state.characterStates[character.id]?.emotionalState ?? character.storyProfile?.initialEmotionalState ?? 'calm', relationshipCue: state.characterStates[character.id]?.continuity?.relationshipCue ?? null, participationTier: character.storyProfile?.participationTier ?? 'core', pinned: state.pinnedCharacterId === character.id, approaches: availableStoryApproaches(definition, state, character.id).filter((approach) => !state.characterStates[character.id]?.usedTopicIds?.includes(approach.id)).map((approach) => ({ id: approach.id, label: approach.label, timeCost: STORY_DIALOGUE_MINUTES })) })),
    othersNearby: ambientPresent.map((character) => ({ id: character.id, name: character.name, role: character.publicRole ?? 'Vespormoor resident', portraitSlug: character.portraitSlug, biography: character.publicBiography ?? 'A resident moving through an ordinary part of the night.', activity: resolveStoryCharacterLocation(definition, state, character.id)?.activity, trust: state.characterStates[character.id]?.trust ?? character.baselineTrust, suspicion: state.characterStates[character.id]?.suspicion ?? character.baselineSuspicion, emotionalState: state.characterStates[character.id]?.emotionalState ?? 'calm', participationTier: 'ambient', pinned: false, approaches: [] })),
    dossiers: definition.characters.filter((character) => character.storyProfile?.participationTier !== 'ambient' && character.storyProfile?.participationTier !== 'excluded').map((character) => ({ id: character.id, name: character.name, role: character.publicRole ?? 'Vespormoor resident', portraitSlug: character.portraitSlug, biography: state.evidenceIds.some((id) => definition.evidence.find((item) => item.id === id)?.relatedCharacterIds.includes(character.id)) ? character.publicBiography ?? character.biography : 'You have not learned enough to understand their role tonight.', currentLocationId: knownCharacterLocations.get(character.id) ?? null, activity: resolveStoryCharacterLocation(definition, state, character.id)?.activity, departureWarning: departureFor(character.id), followPlan: knownCharacterIds.has(character.id) ? followFor(character.id) : null, trust: state.characterStates[character.id]?.trust ?? character.baselineTrust, suspicion: state.characterStates[character.id]?.suspicion ?? character.baselineSuspicion, emotionalState: state.characterStates[character.id]?.emotionalState ?? character.storyProfile?.initialEmotionalState ?? 'calm', relationshipCue: state.characterStates[character.id]?.continuity?.relationshipCue ?? null, participationTier: character.storyProfile?.participationTier ?? 'core', pinned: state.pinnedCharacterId === character.id })),
    arrivalOpportunity: arrivalCharacter && !arrivalAlreadyAcknowledged && visiblePresent.some((item) => item.id === arrivalCharacter.id) ? { characterId: arrivalCharacter.id, name: arrivalCharacter.name, portraitSlug: arrivalCharacter.portraitSlug, activity: resolveStoryCharacterLocation(definition, state, arrivalCharacter.id)?.activity ?? null } : null,
    proactiveBeat,
    interactions: availableStoryInteractions(definition, state).map((interaction) => ({ id: interaction.id, title: interaction.title, description: interaction.description, timeCost: interaction.timeCost, newInformation: interaction.discoverEvidenceIds.some((id) => !state.evidenceIds.includes(id)) })),
    timeline: knownTimeline,
    availableEndings: availableStoryEndings(definition, state).map((ending) => ({ id: ending.id, title: ending.title, description: ending.description })),
    completedEnding: state.completedEndingId ? definition.endings.find((ending) => ending.id === state.completedEndingId) ?? null : null,
    discoveredEndingIds: state.discoveredEndingIds,
    endingArchive: definition.endings.map((ending) => ({ id: ending.id, title: ending.title, discovered: state.discoveredEndingIds.includes(ending.id) })),
    majorChoices: storyMajorChoices(state),
    loopHistory: state.loopHistory,
    inventory: state.inventoryIds,
    settings: campaignSettings,
    messages: compatibleMessages,
  };
}

function initialStateForOpening(definition: StoryDefinition): StoryCampaignState {
  return { storySlug: definition.slug, status: 'active', currentLoop: 0, currentMinute: definition.loopStartMinute, currentLocationId: definition.startLocationId, evidenceIds: [], deductionIds: [], inventoryIds: [], persistentFlags: [], loopFlags: [], witnessedEventIds: [], loopDiscoveredEvidenceIds: [], loopVisitedLocationIds: [definition.startLocationId], characterStates: {}, loopHistory: [], discoveredEndingIds: [], completedEndingId: null, pinnedEvidenceId: null, pinnedCharacterId: null, pinnedEventId: null };
}

function compatibleStoryMessages(definition: StoryDefinition, campaign: Row, source: Row[]): Row[] {
  const rows = [...source];
  const opening = rows.find((item) => record(item.metadata).kind === 'opening');
  if (!opening || rows.some((item) => record(item.metadata).kind === 'opening_reply')) return rows;
  const canonical = storyOpeningMessageRows(definition, String(campaign.id), String(campaign.user_id)).find((item) => item.role === 'character');
  if (!canonical) return rows;
  const index = rows.indexOf(opening);
  rows.splice(index + 1, 0, { id: `compat-opening-${campaign.id}`, ...canonical, created_at: opening.created_at, metadata: { ...record(canonical.metadata), compatibilityFallback: true } });
  return rows;
}

export function compatibleStoryCampaignState(definition: StoryDefinition, source: StoryCampaignState): StoryCampaignState {
  const state = structuredClone(source);
  if (!definition.locations.some((item) => item.id === state.currentLocationId)) state.currentLocationId = definition.startLocationId;
  for (const character of definition.characters) {
    const existing = state.characterStates[character.id];
    state.characterStates[character.id] = {
      trust: existing?.trust ?? character.baselineTrust,
      suspicion: existing?.suspicion ?? character.baselineSuspicion,
      presentedEvidenceIds: existing?.presentedEvidenceIds ?? [],
      conversationCount: existing?.conversationCount ?? 0,
      emotionalState: existing?.emotionalState ?? character.storyProfile?.initialEmotionalState ?? 'calm',
      exhaustedFactIds: existing?.exhaustedFactIds ?? [],
      usedTopicIds: existing?.usedTopicIds ?? [],
      ...(existing?.continuity ? { continuity: {
        ...existing.continuity,
        recentExchangeSummaries: existing.continuity.recentExchangeSummaries ?? [],
        openThreads: existing.continuity.openThreads ?? [],
        recentMoves: existing.continuity.recentMoves ?? [],
        residue: existing.continuity.residue ?? [],
      } } : {}),
    };
  }
  state.contentVersion = definition.version ?? state.contentVersion ?? 1;
  state.persistencePolicy = definition.persistencePolicy ?? state.persistencePolicy ?? 'knowledge-persists-loop-resets';
  return state;
}

function storyMajorChoices(state: StoryCampaignState): string[] {
  const labels: Record<string, string> = {
    'owen-warned': 'You warned Owen about the Anchor.',
    'celeste-can-release': 'You gave Celeste a reason to release Gabriel.',
    'eleanor-record-restored': 'You restored Eleanor Vale to the historical record.',
    'allies-coordinated': 'You coordinated Vespormoor’s witnesses for the final night.',
  };
  return [...new Set([...state.persistentFlags, ...state.loopFlags])].flatMap((flag) => labels[flag] ? [labels[flag]!] : []);
}

function actionResultPayload(result: StoryActionResult): Record<string, unknown> {
  return {
    timeAdvanced: result.timeAdvanced,
    evidenceDiscovered: result.evidenceDiscovered,
    deductionsCompleted: result.deductionsCompleted,
    eventsWitnessed: result.eventsWitnessed,
    presenceTransitions: result.presenceTransitions,
    ...(result.followOutcome ? { followOutcome: result.followOutcome } : {}),
    ...(result.absenceOutcome ? { absenceOutcome: result.absenceOutcome } : {}),
    ...(result.endingReached ? { endingReached: result.endingReached } : {}),
    ...(result.resetSummary ? { resetSummary: result.resetSummary } : {}),
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
