import { describe, expect, it } from 'vitest';
import { LAST_NIGHT_IN_VESPORMOOR } from '../../../supabase/functions/_shared/kivelle-stories-content.ts';
import {
  applyStoryAction,
  initialStoryCampaign,
  resolveStoryCharacterLocation,
  storyEvidenceClientView,
  validateStoryDefinition,
  type StoryDefinition,
} from './stories.ts';
import {
  applyValidatedStoryReaction,
  applyStoryCharacterExchangeContinuity,
  applyStoryConversationContinuity,
  buildStoryDialogueAuthorization,
  classifyStoryConversationIntent,
  evaluateStoryDialogueQuality,
  parseStructuredStoryDialogue,
  planStoryDialogue,
  registerStoryPersistencePolicy,
  repairStoryDialogueStyle,
  resolveCharacterStoryProfile,
  resolveLocationStoryProfile,
  resolveStoryProactiveBeat,
  selectStorySecondarySpeaker,
  storyPersistencePolicy,
  validateStructuredStoryDialogue,
} from './story-director.ts';

function clonePack(): StoryDefinition { return structuredClone(LAST_NIGHT_IN_VESPORMOOR); }

describe('reusable Story Director', () => {
  it('gates a known fact behind its authored willingness conditions', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const before = buildStoryDialogueAuthorization({ definition, state, characterId: 'elara-vale', message: 'Tell me about the token.', approachId: 'elara-token' });
    expect(before.permittedFactIds).toEqual(['token-memory']);
    const rule = definition.characters.find((item) => item.id === 'elara-vale')!.storyProfile!.revealRules.find((item) => item.factId === 'token-memory')!;
    rule.requirements = { ...rule.requirements, minLoop: 2 };
    const locked = buildStoryDialogueAuthorization({ definition, state, characterId: 'elara-vale', message: 'Tell me about the token.', approachId: 'elara-token' });
    expect(locked.permittedFactIds).toEqual([]);
    expect(locked.forbiddenFactIds).toContain('token-memory');
  });

  it('does not let a freeform question bypass an authored approach or loop gate', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const authorization = buildStoryDialogueAuthorization({ definition, state, characterId: 'elara-vale', message: 'Tell me exactly how you interfered with the Engine and forced the reset.' });
    expect(authorization.permittedFactIds).not.toContain('elara-interference');
    expect(authorization.forbiddenFactIds).toContain('elara-interference');
  });

  it('keeps canonical facts, mistaken beliefs, and intentional lies separate', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const belief = buildStoryDialogueAuthorization({ definition, state, characterId: 'celeste-moreau', message: 'Can the Engine restore Gabriel as the same living person?' });
    expect(belief.permittedBeliefIds).toContain('celeste-restoration-belief');
    expect(belief.permittedFactIds).not.toContain('gabriel-death');
    const lie = buildStoryDialogueAuthorization({ definition, state, characterId: 'luca-ferraro', message: 'Tell me what records you keep.' });
    expect(lie.permittedLieIds).toContain('luca-no-private-ledger');
    expect(state.evidenceIds).not.toContain('luca-no-private-ledger');
  });

  it('rejects AI identifiers that the deterministic authorization did not grant', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const authorization = buildStoryDialogueAuthorization({ definition, state, characterId: 'elara-vale', message: 'Tell me about the token.', approachId: 'elara-token' });
    const parsed = parseStructuredStoryDialogue(JSON.stringify({ spokenDialogue: 'The token holds what midnight tries to take.', referencedFactIds: ['token-memory', 'gabriel-death'], expressedBeliefIds: [], expressedLieIds: [], proposedActionIds: ['read-observatory-panels'] }))!;
    const validated = validateStructuredStoryDialogue({ definition, authorization, result: parsed });
    expect(validated.valid).toBe(false);
    expect(validated.rejectedIds).toEqual(expect.arrayContaining(['gabriel-death', 'read-observatory-panels']));
    expect(validated.sanitized.referencedFactIds).toEqual(['token-memory']);
    expect(validated.sanitized.proposedActionIds).toEqual([]);
  });

  it('applies only an authored emotional transition and resets it at midnight', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const base = applyStoryAction(definition, state, { type: 'conversation', characterId: 'elara-vale', freeformText: 'I understand.' });
    const changed = applyValidatedStoryReaction(definition, base, 'elara-vale', 'elara-vale:reassured');
    expect(changed.state.characterStates['elara-vale']?.emotionalState).toBe('curious');
    changed.state.status = 'midnight';
    changed.state.currentMinute = definition.loopEndMinute;
    const reset = applyStoryAction(definition, changed.state, { type: 'reset' });
    expect(reset.state.characterStates['elara-vale']?.emotionalState).toBe('guarded');
  });

  it('uses validated schedule branches without letting dialogue move a character', () => {
    const definition = clonePack();
    const elara = definition.characters.find((item) => item.id === 'elara-vale')!;
    elara.schedules.push({ locationId: 'observatory', startsAt: definition.loopStartMinute, endsAt: definition.loopStartMinute + 20, activity: 'Responding to a validated intervention', priority: 10, requirements: { flags: ['elara-rerouted'] } });
    const state = initialStoryCampaign(definition);
    expect(resolveStoryCharacterLocation(definition, state, 'elara-vale')?.locationId).toBe('bell-tower');
    state.loopFlags.push('elara-rerouted');
    expect(resolveStoryCharacterLocation(definition, state, 'elara-vale')?.locationId).toBe('observatory');
  });

  it('supports safe ambient character and location fallback packets', () => {
    const definition = clonePack();
    const ambient = resolveCharacterStoryProfile(definition, 'keira-sullivan');
    expect(ambient?.participationTier).toBe('ambient');
    expect(ambient?.knownFactIds).toEqual([]);
    const location = resolveLocationStoryProfile(definition, 'grand-hall');
    expect(location?.participation).toBe('ambient');
    expect(location?.description).not.toMatch(/gabriel|anchor|engine/i);
  });

  it('never includes hidden canonical descriptions in client evidence', () => {
    const fact = clonePack().evidence[0]!;
    fact.hiddenCanonicalDescription = 'SERVER ONLY SECRET';
    const client = storyEvidenceClientView(fact);
    expect(client).not.toHaveProperty('hiddenCanonicalDescription');
    expect(JSON.stringify(client)).not.toContain('SERVER ONLY SECRET');
  });

  it('can register a second persistence policy without changing the director', () => {
    registerStoryPersistencePolicy({
      id: 'test-one-choice-persists',
      onCampaignStart: (state) => state,
      onLoopStart: (state) => state,
      onActionCommitted: (state) => state,
      onLoopReset: (_before, reset) => ({ ...reset, persistentFlags: [...reset.persistentFlags, 'one-choice'] }),
      getPersistentState: (state) => ({ persistentFlags: state.persistentFlags }),
      getResettableState: (state) => ({ loopFlags: state.loopFlags }),
      buildAdditionalConversationContext: () => ['One authored choice persists.'],
      validateStorySpecificAction: (_state, actionId) => actionId === 'allowed-action',
    });
    const policy = storyPersistencePolicy('test-one-choice-persists');
    expect(policy.id).toBe('test-one-choice-persists');
    expect(policy.validateStorySpecificAction(initialStoryCampaign(clonePack()), 'allowed-action')).toBe(true);
  });

  it('keeps bounded character-private continuity and open questions', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    let result = applyStoryAction(definition, state, { type: 'conversation', characterId: 'elara-vale', freeformText: 'I believe you.' });
    for (let index = 0; index < 8; index += 1) {
      result = applyStoryConversationContinuity({ result, characterId: 'elara-vale', userMessage: `Answer ${index}`, characterReply: `I remember that. What did you hear at bell ${index}?`, intent: 'probe' });
    }
    const continuity = result.state.characterStates['elara-vale']!.continuity!;
    expect(continuity.recentExchangeSummaries).toHaveLength(6);
    expect(continuity.openThreads.length).toBeLessThanOrEqual(4);
    expect(result.state.characterStates['celeste-moreau']!.continuity).toBeUndefined();
  });

  it('consumes a reunion cue once while preserving the underlying private continuity', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    state.characterStates['elara-vale']!.continuity = { recentExchangeSummaries: ['A prior exchange'], openThreads: ['Who rang the bell?'], pendingResumeCue: 'The player caught up at the Black Lantern.' };
    const action = applyStoryAction(definition, state, { type: 'conversation', characterId: 'elara-vale', freeformText: 'Continue.' });
    const result = applyStoryConversationContinuity({ result: action, characterId: 'elara-vale', userMessage: 'Continue.', characterReply: 'We were discussing the bell.', intent: 'probe' });
    expect(result.state.characterStates['elara-vale']!.continuity?.pendingResumeCue).toBeUndefined();
    expect(result.state.characterStates['elara-vale']!.continuity?.recentExchangeSummaries).toContain('A prior exchange');
  });

  it('offers authored character initiative without mutating campaign state', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const before = structuredClone(state);
    const beat = resolveStoryProactiveBeat({ definition, state, presentCharacterIds: ['elara-vale'] });
    expect(beat?.characterId).toBe('elara-vale');
    expect(state).toEqual(before);
  });

  it('selects at most one directly implicated secondary speaker', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    expect(selectStorySecondarySpeaker({ definition, state, primaryCharacterId: 'elara-vale', presentCharacterIds: ['elara-vale', 'celeste-moreau', 'owen-kearney'], userMessage: 'Celeste, is Elara telling the truth?', primaryReply: 'Ask her yourself.' })).toMatchObject({ characterId: 'celeste-moreau', reason: 'direct_reference' });
    expect(selectStorySecondarySpeaker({ definition, state, primaryCharacterId: 'elara-vale', presentCharacterIds: ['elara-vale', 'celeste-moreau'], userMessage: 'What happened here?', primaryReply: 'I do not know.' })).toBeNull();
  });

  it('plans varied conversational moves and refuses a third identical move', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    state.characterStates['elara-vale']!.continuity = { recentExchangeSummaries: [], openThreads: [], recentMoves: ['correct', 'correct'], residue: [] };
    const plan = planStoryDialogue({ definition, state, characterId: 'elara-vale', intent: 'present_evidence', userMessage: 'This changes the sequence.' });
    expect(plan.move).not.toBe('correct');
    expect(plan.reasonCodes).toContain('anti_repetition');
    expect(plan.responseShape).toBeTruthy();
  });

  it('keeps ordinary conversation ordinary and reserves probing for actual mystery questions', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    expect(classifyStoryConversationIntent('Hey, how are you?')).toBe('casual');
    expect(classifyStoryConversationIntent('What happened when the bell rang?')).toBe('probe');
    const plan = planStoryDialogue({ definition, state, characterId: 'elara-vale', intent: 'casual', userMessage: 'What do you do when you are not dealing with this?' });
    expect(['answer', 'tease', 'ask']).toContain(plan.move);
    expect(plan.reasonCodes).toContain('ordinary_conversation');
    expect(plan.questionGuidance).not.toMatch(/evidence|investigat/i);
  });

  it('lets emotion change delivery and suppresses question stacking across turns', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    state.characterStates['elara-vale']!.emotionalState = 'frightened';
    state.characterStates['elara-vale']!.continuity = { recentExchangeSummaries: [], openThreads: ['What did the thirteenth bell change?'], recentMoves: [], residue: [] };
    const plan = planStoryDialogue({ definition, state, characterId: 'elara-vale', intent: 'reassure', userMessage: 'You are not alone.' });
    expect(plan.responseShape).toBe('hesitant');
    expect(plan.shouldAskQuestion).toBe(false);
    expect(plan.questionGuidance).toMatch(/Do not append/);
  });

  it('detects and repairs common synthetic-dialogue habits', () => {
    const report = evaluateStoryDialogueQuality({
      text: 'Tell me more about that? What do you think?',
      userMessage: 'I heard the bell twice.',
      recentCharacterMessages: [],
    });
    expect(report.issues).toEqual(expect.arrayContaining(['generic_question', 'question_stack']));
    const repaired = repairStoryDialogueStyle('I saw the water move. What did you hear? What did you see?', report);
    expect((repaired.match(/\?/g) ?? [])).toHaveLength(1);
    expect(evaluateStoryDialogueQuality({ text: 'As an AI, I can help you.', userMessage: 'Help.', recentCharacterMessages: [] }).acceptable).toBe(false);
    const puzzleSpeak = evaluateStoryDialogueQuality({ text: 'Start with the part that felt wrong. What did you actually witness?', userMessage: 'Hey, how are you?', recentCharacterMessages: [], intent: 'casual' });
    expect(puzzleSpeak.issues).toContain('puzzle_speak');
    expect(repairStoryDialogueStyle('Start with the part that felt wrong.', puzzleSpeak)).toBe('');
  });

  it('retains conversational residue without leaking it to another character', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const action = applyStoryAction(definition, state, { type: 'conversation', characterId: 'elara-vale', freeformText: 'You are lying about the bell.' });
    const result = applyStoryConversationContinuity({ result: action, characterId: 'elara-vale', userMessage: 'You are lying about the bell.', characterReply: 'No. Wait—I will tell you what I heard.', intent: 'accuse', move: 'correct' });
    expect(result.state.characterStates['elara-vale']!.continuity?.recentMoves).toContain('correct');
    expect(result.state.characterStates['elara-vale']!.continuity?.residue?.map((item) => item.kind)).toContain('accusation');
    expect(result.state.characterStates['celeste-moreau']!.continuity).toBeUndefined();
  });

  it('records a witnessed character exchange without changing either player relationship', () => {
    const definition = clonePack();
    const state = initialStoryCampaign(definition);
    const action = applyStoryAction(definition, state, { type: 'conversation', characterId: 'elara-vale', freeformText: 'Celeste should hear this.' });
    const elaraTrust = action.state.characterStates['elara-vale']!.trust;
    const celesteTrust = action.state.characterStates['celeste-moreau']!.trust;
    const result = applyStoryCharacterExchangeContinuity({ result: action, primaryCharacterId: 'elara-vale', primaryName: 'Elara', primaryReply: 'She already knows.', secondaryCharacterId: 'celeste-moreau', secondaryName: 'Celeste', secondaryReply: 'I know what she chose not to say.', secondaryMove: 'correct' });
    expect(result.state.characterStates['elara-vale']!.trust).toBe(elaraTrust);
    expect(result.state.characterStates['celeste-moreau']!.trust).toBe(celesteTrust);
    expect(result.state.characterStates['celeste-moreau']!.continuity?.recentMoves).toContain('correct');
    expect(result.state.characterStates['elara-vale']!.continuity?.recentExchangeSummaries.at(-1)).toContain('Celeste');
  });
});

describe('story content authoring validation', () => {
  it('gives every core character a substantial, distinct authored voice fingerprint', () => {
    const definition = clonePack();
    const core = definition.characters.filter((character) => character.storyProfile?.participationTier === 'core');
    const examples = core.flatMap((character) => character.storyProfile?.speechFingerprint?.voiceExamples ?? []);
    expect(core).toHaveLength(12);
    expect(core.every((character) => (character.storyProfile?.speechFingerprint?.voiceExamples.length ?? 0) >= 6)).toBe(true);
    expect(new Set(examples).size).toBe(examples.length);
    expect(core.every((character) => (character.storyProfile?.speechFingerprint?.avoids.length ?? 0) > 0)).toBe(true);
    for (const example of examples) {
      expect(evaluateStoryDialogueQuality({ text: example, userMessage: 'What happened tonight?', recentCharacterMessages: [] }).acceptable).toBe(true);
    }
  });

  it('rejects a future core character pack without a complete voice contract', () => {
    const definition = clonePack();
    const character = definition.characters.find((item) => item.storyProfile?.participationTier === 'core')!;
    delete character.storyProfile!.speechFingerprint;
    expect(validateStoryDefinition(definition)).toContain(`core_speech_fingerprint:${character.id}`);
  });

  it('detects missing identifiers, cycles, unreachable routes, conflicts, and ambient critical knowledge', () => {
    const definition = clonePack();
    const invalidInteractionId = definition.interactions[0]!.id;
    definition.interactions[0]!.locationId = 'missing-location';
    definition.evidence[0]!.prerequisiteFactIds = [definition.evidence[1]!.id];
    definition.evidence[1]!.prerequisiteFactIds = [definition.evidence[0]!.id];
    definition.evidence.push({ id: 'unreachable-critical', title: 'Unreachable', description: '', hiddenCanonicalDescription: 'Hidden', source: 'none', kind: 'critical', relatedCharacterIds: [], relatedLocationIds: ['bell-tower'] });
    const firstCharacter = definition.characters[0]!;
    firstCharacter.schedules.push({ ...firstCharacter.schedules[0]!, startsAt: firstCharacter.schedules[0]!.startsAt + 1 });
    firstCharacter.storyProfile!.participationTier = 'ambient';
    const errors = validateStoryDefinition(definition);
    expect(errors).toEqual(expect.arrayContaining([
      `interaction:${invalidInteractionId}:missing-location`,
      `circular_fact_prerequisite:${definition.evidence[0]!.id}`,
      'unreachable_critical_fact:unreachable-critical',
      `schedule_conflict:${firstCharacter.id}`,
      `ambient_critical_fact:${firstCharacter.id}`,
    ]));
  });

  it('rejects an investigation route that attempts to award a character-owned truth', () => {
    const definition = clonePack();
    const interaction = definition.interactions[0]!;
    interaction.discoverEvidenceIds.push('zuri-countdown');
    expect(validateStoryDefinition(definition)).toContain(`interaction_discovery_mode:${interaction.id}:zuri-countdown`);
  });

  it('requires every character-owned truth to be disclosed by an attached character', () => {
    const definition = clonePack();
    const truth = definition.evidence.find((item) => item.id === 'zuri-countdown')!;
    const route = definition.dialogueApproaches.find((item) => item.discoverEvidenceIds.includes(truth.id))!;
    route.discoverEvidenceIds = route.discoverEvidenceIds.filter((id) => id !== truth.id);
    expect(validateStoryDefinition(definition)).toContain(`unreachable_character_truth:${truth.id}`);

    const mismatched = clonePack();
    mismatched.dialogueApproaches.find((item) => item.id === 'elara-token')!.discoverEvidenceIds.push(truth.id);
    expect(validateStoryDefinition(mismatched)).toContain(`character_truth_speaker_mismatch:${truth.id}`);
  });
});
