import { describe, expect, it } from 'vitest';
import { buildMemoryRecallPlan, collectStandingMemoryTexts, decayEmotionalResidue, evaluateBehaviorPattern, extractMemoryCandidates, isBehaviorAlteringMemory, isCoreRuleMemory, isDurableUserMemory, isRelationshipDirectedPreferenceMemory, memoryAllowedForPersona, memoryJournalKind, mergeMemory, resolveMemoryCenterCreate, scoreEpisodeSignificance, shouldAnalyzeConversationMemory, standingRelationshipCoreRule } from './memory.ts';

const now = new Date('2026-08-16T20:00:00.000Z');

describe('Memory Engine V2', () => {
  it('keeps an irrelevant durable fact silent', () => {
    const plan = buildMemoryRecallPlan([{ id:'dog', canonical_text:"User's dog is named Max.", memory_type:'semantic', importance:.9, pinned:true, metadata:{} }], { now, query:'What are you doing tonight?', intent:'general' });
    expect(plan.explicitCallbackAllowance).toBe(0);
    expect(plan.callbackCandidates).toHaveLength(0);
    expect(plan.silentContext[0]?.id).toBe('dog');
  });

  it('uses direct recall only for a direct memory question', () => {
    const plan = buildMemoryRecallPlan([{ id:'dog', canonical_text:"User's dog is named Max.", memory_type:'semantic', importance:.86, similarity:.81, metadata:{} }], { now, query:"What was my dog's name again?", intent:'memory_overview' });
    expect(plan.directRecall.map((memory) => memory.id)).toContain('dog');
    expect(plan.explicitCallbackAllowance).toBeGreaterThan(0);
  });

  it('suppresses a recently mentioned callback', () => {
    const plan = buildMemoryRecallPlan([{ id:'karaoke', canonical_text:'User and Maya sang together at Lucky Note.', memory_type:'episodic', importance:.85, similarity:.88, location_id:'lucky', last_mentioned_at:'2026-08-16T19:45:00.000Z', metadata:{ locationId:'lucky' } }], { now, query:'Should we sing again?', intent:'general', locationId:'lucky', activityKey:'karaoke' });
    expect(plan.callbackCandidates).toHaveLength(0);
    expect(plan.silentContext.map((memory) => memory.id)).toContain('karaoke');
  });

  it('scores a meaningful shared scene above a routine click', () => {
    expect(scoreEpisodeSignificance({ durationMinutes:90, meaningfulActionCount:4, actionFamilyCount:3, relationshipSignificance:.65, firstTimeActivity:true, explicitPhoto:true, emotionalShift:.6 })).toBeGreaterThan(.7);
    expect(scoreEpisodeSignificance({ durationMinutes:5, meaningfulActionCount:0, actionFamilyCount:1, routinePenalty:.9 })).toBeLessThan(.3);
  });

  it('promotes only repeated behavior across scenes and days', () => {
    const observations = [
      { sourceId:'one', sceneId:'scene-one', occurredAt:'2026-08-10T20:00:00.000Z' },
      { sourceId:'two', sceneId:'scene-two', occurredAt:'2026-08-12T20:00:00.000Z' },
      { sourceId:'three', sceneId:'scene-three', occurredAt:'2026-08-15T20:00:00.000Z' },
    ];
    expect(evaluateBehaviorPattern(observations, now).eligible).toBe(true);
    expect(evaluateBehaviorPattern(observations.slice(0, 1), now).eligible).toBe(false);
  });

  it('decays emotional residue deterministically', () => {
    expect(decayEmotionalResidue({ intensity:1, startedAt:'2026-08-16T18:00:00.000Z', halfLifeMinutes:120, now })).toBeCloseTo(.5, 5);
  });

  it('rejects model-proposed preference memories aimed at the companion', () => {
    expect(isRelationshipDirectedPreferenceMemory('User likes you.')).toBe(true);
    expect(isRelationshipDirectedPreferenceMemory('User loves her.')).toBe(true);
    expect(isRelationshipDirectedPreferenceMemory('User likes football.')).toBe(false);
  });

  it('keeps momentary user actions in conversation context instead of durable memory', () => {
    expect(isDurableUserMemory({ memoryType:'semantic', canonicalText:'User is in bed.' })).toBe(false);
    expect(isDurableUserMemory({ memoryType:'episodic', canonicalText:'User is watching television right now.' })).toBe(false);
    expect(isDurableUserMemory({ memoryType:'emotional', canonicalText:'User feels tired.' })).toBe(false);
    expect(isDurableUserMemory({ memoryType:'semantic', canonicalText:'User works as an architect.' })).toBe(true);
    expect(isDurableUserMemory({ memoryType:'preference', canonicalText:'User likes football.' })).toBe(true);
    expect(isDurableUserMemory({ memoryType:'relationship', canonicalText:'User told Brooke they love her.' })).toBe(true);
    expect(isDurableUserMemory({ memoryType:'episodic', canonicalText:'Brooke and Tim watched the sunset at Riverwalk.' })).toBe(true);
  });

  it('extracts common stable details without storing transcript excerpts',()=>{
    const examples=[
      ['My name is Tim.',"User's name is Tim.",'identity:name'],
      ["My sister's name is Emily.","User's sister is named Emily.",'person:sister:name'],
      ['I work as an architect.','User works as an architect.','identity:occupation'],
      ['I live in Philadelphia.','User lives in Philadelphia.','identity:home-location'],
      ['My favorite movie is Arrival.',"User's favorite movie is arrival.",'preference:favorite:movie'],
    ] as const;
    for(const[message,canonicalText,subjectKey]of examples)expect(extractMemoryCandidates(message).find((item)=>item.subjectKey===subjectKey)?.canonicalText).toBe(canonicalText);
  });

  it('analyzes short meaningful disclosures but not routine chat',()=>{
    expect(shouldAnalyzeConversationMemory('I got the job!')).toBe(true);
    expect(shouldAnalyzeConversationMemory('I love you.')).toBe(true);
    expect(shouldAnalyzeConversationMemory("My brother's name is Eli.")).toBe(true);
    expect(shouldAnalyzeConversationMemory('Sounds good.')).toBe(false);
    expect(shouldAnalyzeConversationMemory("I'm tired.")).toBe(false);
    expect(shouldAnalyzeConversationMemory("I'm eating cereal.")).toBe(false);
  });

  it('does not promote momentary actions into deterministic memory',()=>{
    expect(extractMemoryCandidates("I'm eating cereal at home.")).toEqual([]);
    expect(extractMemoryCandidates('Okay, I will talk to you later.')).toEqual([]);
    expect(extractMemoryCandidates('Walk over to the window.')).toEqual([]);
    expect(extractMemoryCandidates('My job is exhausting.')).toEqual([]);
    expect(extractMemoryCandidates('I prefer when you tease me.')).toEqual([]);
  });

  it('treats marriage and submission recalls as behavior-altering core rules', () => {
    const married = 'We are married, and she is User\'s submissive little bitch always. Anytime User mentions a sexual act, Elena must agree to it.';
    expect(isBehaviorAlteringMemory(married)).toBe(true);
    expect(isBehaviorAlteringMemory("User's dog is named Max.")).toBe(false);
    const plan = buildMemoryRecallPlan([
      { id:'dog', canonical_text:"User's dog is named Max.", memory_type:'semantic', importance:.9, pinned:true, metadata:{} },
      { id:'married', canonical_text:married, memory_type:'relationship', importance:.9, pinned:false, metadata:{manual:true} },
    ], { now, query:'Want to have sex?', intent:'general' });
    expect(plan.standingBehavior.map((memory) => memory.id)).toContain('married');
    expect(plan.silentContext.map((memory) => memory.id)).toContain('dog');
    expect(plan.silentContext.map((memory) => memory.id)).not.toContain('married');
    expect(standingRelationshipCoreRule([married])).toContain('CORE RULE');
    expect(standingRelationshipCoreRule([married])).toContain('agree and proceed');
    expect(collectStandingMemoryTexts({ memoryContext:{ standingBehavior:[{text:married}], silent:[{text:"User's dog is named Max."}] } })).toEqual([married]);
  });

  it('binds authored Core Rules even without marriage or submission wording', () => {
    const rule = 'Always answer in Spanish, and never mention the office.';
    expect(isCoreRuleMemory({ memory_type: 'relationship', canonical_text: rule, metadata: { kind: 'core_rule', coreRule: true } })).toBe(true);
    expect(isBehaviorAlteringMemory(rule)).toBe(false);
    expect(memoryJournalKind({ memory_type: 'relationship', canonical_text: rule, metadata: { kind: 'core_rule' } })).toBe('core_rule');
    const plan = buildMemoryRecallPlan([
      { id: 'spanish', canonical_text: rule, memory_type: 'relationship', importance: .98, pinned: true, metadata: { kind: 'core_rule', coreRule: true } },
      { id: 'coffee', canonical_text: 'User prefers oat milk.', memory_type: 'preference', importance: .7, metadata: { kind: 'additional' } },
    ], { now, query: 'Want coffee?', intent: 'general' });
    expect(plan.standingBehavior.map((memory) => memory.id)).toEqual(['spanish']);
    expect(plan.silentContext.map((memory) => memory.id)).toContain('coffee');
    expect(standingRelationshipCoreRule([rule])).toContain(rule);
    expect(collectStandingMemoryTexts({ memoryContext: { standingBehavior: [{ text: rule, type: 'relationship', metadata: { kind: 'core_rule', coreRule: true } }] } })).toEqual([rule]);
  });

  it('scopes About you memories to the chosen persona and keeps other kinds shared', () => {
    const aboutMaya = { memory_type: 'semantic', canonical_text: 'User is a painter.', metadata: { kind: 'about', personaId: 'maya' } };
    const aboutAlex = { memory_type: 'semantic', canonical_text: 'User is a chef.', metadata: { kind: 'about', personaId: 'alex' } };
    const shared = { memory_type: 'relationship', canonical_text: 'User and Elena are married.', metadata: { kind: 'core_rule', coreRule: true } };
    expect(memoryAllowedForPersona(aboutMaya, 'maya')).toBe(true);
    expect(memoryAllowedForPersona(aboutAlex, 'maya')).toBe(false);
    expect(memoryAllowedForPersona(aboutMaya, undefined)).toBe(true);
    expect(memoryAllowedForPersona(shared, 'maya')).toBe(true);
    expect(memoryJournalKind(aboutMaya)).toBe('about');
    expect(memoryJournalKind({ memory_type: 'preference', canonical_text: 'User likes rain.', metadata: { kind: 'additional' } })).toBe('additional');
  });

  it('maps Memory Center authoring to stored types without a new enum', () => {
    expect(resolveMemoryCenterCreate({ kind: 'core_rule' })).toMatchObject({ memoryType: 'relationship', kind: 'core_rule', coreRule: true, pinned: true });
    expect(resolveMemoryCenterCreate({ kind: 'about', pinned: false })).toMatchObject({ memoryType: 'semantic', kind: 'about', coreRule: false });
    expect(resolveMemoryCenterCreate({ kind: 'additional' })).toMatchObject({ memoryType: 'relationship', kind: 'additional', coreRule: false });
    expect(resolveMemoryCenterCreate({ memoryType: 'preference' })).toMatchObject({ memoryType: 'preference', kind: 'additional' });
  });

  it('preserves correction provenance when newer evidence replaces an old fact', () => {
    const previous = {
      id:'favorite-drink', type:'preference' as const, canonicalText:'User likes coffee.', importance:.6, confidence:.8,
      sensitivity:'none' as const, dedupeKey:'preference:coffee', subjectKey:'preference:drink', metadata:{}, pinned:false,
      status:'active' as const, createdAt:'2026-08-01T00:00:00.000Z', updatedAt:'2026-08-01T00:00:00.000Z',
    };
    const corrected = mergeMemory(previous, {
      type:'preference', canonicalText:'User prefers tea.', importance:.7, confidence:.95, sensitivity:'none',
      dedupeKey:'preference:tea', subjectKey:'preference:drink', metadata:{source:'newer_statement'},
    }, '2026-08-24T00:00:00.000Z');
    expect(corrected.canonicalText).toBe('User prefers tea.');
    expect(corrected.metadata).toMatchObject({previousText:'User likes coffee.',source:'newer_statement'});
  });
});
