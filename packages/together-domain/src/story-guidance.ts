import {
  availableStoryApproaches,
  availableStoryEndings,
  availableStoryInteractions,
  resolveStoryCharacterLocation,
  storyCharactersAtLocation,
  storyRequirementMet,
  type StoryCampaignState,
  type StoryDefinition,
} from './stories.ts';

export type StoryGuidanceLevel = 'subtle' | 'balanced' | 'direct';
export type StoryNarrativePhase = 'discovery' | 'investigation' | 'confrontation' | 'resolution';
export type StoryLeadKind = 'conversation' | 'investigation' | 'location' | 'finale';

export interface StoryGuidanceLead {
  id: string;
  kind: StoryLeadKind;
  title: string;
  reason: string;
  actionLabel: string;
  sourceId: string;
  characterId?: string;
  locationId?: string;
  interactionId?: string;
  approachId?: string;
  endingId?: string;
  availableNow: boolean;
  priority: number;
}

export interface StoryInvestigationTrack {
  id: string;
  title: string;
  question: string;
  description: string;
  requiredCount: number;
  discoveredCount: number;
  completed: boolean;
  status: 'unopened' | 'active' | 'resolved';
}

export interface StoryCaseGuidance {
  phase: StoryNarrativePhase;
  phaseLabel: string;
  objective: string;
  objectiveReason: string;
  hintLevel: 0 | 1 | 2;
  stalledActions: number;
  leads: StoryGuidanceLead[];
}

function uniqueLeads(leads: StoryGuidanceLead[]): StoryGuidanceLead[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = `${lead.kind}:${lead.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveStoryNarrativePhase(definition: StoryDefinition, state: StoryCampaignState): StoryNarrativePhase {
  if (state.status === 'completed' || availableStoryEndings(definition, state).length || state.deductionIds.includes('release')) return 'resolution';
  if (state.deductionIds.includes('anchor') || state.deductionIds.includes('motive') || state.deductionIds.length >= 3) return 'confrontation';
  if (state.deductionIds.includes('incident') || state.evidenceIds.length >= Math.max(3, Math.ceil(definition.evidence.length * .1))) return 'investigation';
  return 'discovery';
}

export function storyInvestigationTracks(definition: StoryDefinition, state: StoryCampaignState): StoryInvestigationTrack[] {
  return definition.deductions.map((deduction) => {
    const discoveredCount = deduction.requiredEvidenceIds.filter((id) => state.evidenceIds.includes(id)).length;
    const completed = state.deductionIds.includes(deduction.id);
    return {
      id: deduction.id,
      title: deduction.title,
      question: deduction.question ?? `What does the evidence reveal about ${deduction.title.toLowerCase()}?`,
      description: completed ? deduction.description : deduction.objective ?? 'Find and connect the evidence needed to resolve this line of inquiry.',
      requiredCount: deduction.requiredEvidenceIds.length,
      discoveredCount,
      completed,
      status: completed ? 'resolved' : discoveredCount ? 'active' : 'unopened',
    };
  });
}

export function resolveStoryCaseGuidance(input: {
  definition: StoryDefinition;
  state: StoryCampaignState;
  guidanceLevel?: StoryGuidanceLevel;
  stalledActions?: number;
}): StoryCaseGuidance {
  const { definition, state } = input;
  const phase = resolveStoryNarrativePhase(definition, state);
  const tracks = storyInvestigationTracks(definition, state);
  const currentTrack = tracks.find((track) => track.status === 'active') ?? tracks.find((track) => !track.completed) ?? tracks.at(-1);
  const stalledActions = Math.max(0, Math.min(8, Math.trunc(input.stalledActions ?? 0)));
  const hintLevel: 0 | 1 | 2 = stalledActions >= 4 ? 2 : stalledActions >= 2 ? 1 : 0;
  const guidanceLevel = input.guidanceLevel ?? 'balanced';
  const presentIds = new Set(storyCharactersAtLocation(definition, state).map((character) => character.id));
  const incompleteEvidence = new Set(definition.deductions
    .filter((deduction) => !state.deductionIds.includes(deduction.id))
    .flatMap((deduction) => deduction.requiredEvidenceIds)
    .filter((id) => !state.evidenceIds.includes(id)));
  const leads: StoryGuidanceLead[] = [];

  for (const ending of availableStoryEndings(definition, state)) {
    leads.push({ id: `ending:${ending.id}`, kind: 'finale', title: ending.title, reason: 'Your deductions support a final choice.', actionLabel: 'Choose ending', sourceId: ending.id, endingId: ending.id, availableNow: true, priority: 130 });
  }

  for (const interaction of availableStoryInteractions(definition, state)) {
    const advancesTrack = interaction.discoverEvidenceIds.some((id) => incompleteEvidence.has(id));
    const hasNewInformation = interaction.discoverEvidenceIds.some((id) => !state.evidenceIds.includes(id));
    leads.push({
      id: `interaction:${interaction.id}`,
      kind: 'investigation',
      title: interaction.title,
      reason: advancesTrack ? `This may advance ${currentTrack?.title ?? 'the investigation'}.` : hasNewInformation ? 'This could reveal something new.' : 'This may change the current scene.',
      actionLabel: 'Do this', sourceId: interaction.id, interactionId: interaction.id, locationId: state.currentLocationId,
      availableNow: true, priority: advancesTrack ? 110 : hasNewInformation ? 82 : 35,
    });
  }

  for (const character of definition.characters) {
    const schedule = resolveStoryCharacterLocation(definition, state, character.id);
    if (!schedule) continue;
    const approaches = availableStoryApproaches(definition, state, character.id)
      .filter((approach) => !state.characterStates[character.id]?.usedTopicIds?.includes(approach.id));
    for (const approach of approaches) {
      const advancesTrack = approach.discoverEvidenceIds.some((id) => incompleteEvidence.has(id));
      const hasNewInformation = approach.discoverEvidenceIds.some((id) => !state.evidenceIds.includes(id));
      if (!advancesTrack && !hasNewInformation && hintLevel < 2) continue;
      const here = presentIds.has(character.id);
      const location = definition.locations.find((item) => item.id === schedule.locationId);
      if (!here && (!location || !storyRequirementMet(definition, state, location.unlock))) continue;
      leads.push({
        id: `approach:${approach.id}`,
        kind: 'conversation',
        title: `${approach.label} with ${character.name.split(' ')[0]}`,
        reason: here ? `${character.name.split(' ')[0]} is here and may have relevant context.` : `${character.name.split(' ')[0]} is known to be at ${location?.name ?? 'another location'}.`,
        actionLabel: here ? 'Talk' : 'View map', sourceId: approach.id, characterId: character.id, approachId: approach.id, locationId: schedule.locationId,
        availableNow: here, priority: (advancesTrack ? 105 : 76) + (here ? 12 : 0),
      });
    }
  }

  // Offer a route to a useful investigation elsewhere without visually marking the map itself.
  for (const location of definition.locations) {
    if (location.id === state.currentLocationId || !storyRequirementMet(definition, state, location.unlock)) continue;
    const projected = { ...state, currentLocationId: location.id };
    const interaction = availableStoryInteractions(definition, projected).find((item) => item.discoverEvidenceIds.some((id) => incompleteEvidence.has(id)));
    if (!interaction) continue;
    leads.push({
      id: `location:${location.id}:${interaction.id}`,
      kind: 'location',
      title: `Look into ${location.name}`,
      reason: guidanceLevel === 'direct' || hintLevel === 2 ? interaction.title : `An unresolved line of inquiry reaches ${location.name}.`,
      actionLabel: 'View map', sourceId: interaction.id, interactionId: interaction.id, locationId: location.id,
      availableNow: false, priority: 66 + (hintLevel * 8),
    });
  }

  const maximumLeads = hintLevel === 2 || guidanceLevel === 'direct' ? 3 : guidanceLevel === 'subtle' ? 1 : 2;
  const selected = uniqueLeads(leads.sort((left, right) => right.priority - left.priority)).slice(0, maximumLeads);
  const objectiveByPhase: Record<StoryNarrativePhase, { title: string; reason: string }> = {
    discovery: { title: 'Work out what is wrong with tonight', reason: 'Notice what repeats, what changes, and who reacts as if they remember.' },
    investigation: { title: currentTrack ? `Resolve ${currentTrack.title}` : 'Connect the evidence', reason: currentTrack?.question ?? 'Follow the strongest contradiction instead of searching every room.' },
    confrontation: { title: currentTrack ? `Turn ${currentTrack.title} into a plan` : 'Test your theory against the people involved', reason: 'You know enough to challenge motives, warn those at risk, and coordinate allies.' },
    resolution: { title: 'Decide how this night ends', reason: 'Your choices now determine what survives the final midnight.' },
  };
  const objective = objectiveByPhase[phase];
  return {
    phase,
    phaseLabel: phase === 'discovery' ? 'Discovery' : phase === 'investigation' ? 'Investigation' : phase === 'confrontation' ? 'Confrontation' : 'Resolution',
    objective: objective.title,
    objectiveReason: hintLevel === 2 && selected[0] ? `${objective.reason} Best next step: ${selected[0].title}.` : objective.reason,
    hintLevel,
    stalledActions,
    leads: selected,
  };
}
