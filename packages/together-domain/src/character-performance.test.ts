import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isValidCharacterPerformance, normalizeCharacterPerformance, performanceStates, selectCharacterPerformance } from './character-performance.ts';
import { compileCharacterVoiceCard } from './character-depth.ts';
import { assessScenePressure } from './scene-pressure.ts';

describe('character performance for legacy, authored, and future identities', () => {
  it('provides a complete compatible contract without a world/name allowlist', () => {
    for(const bible of [{},{traits:['private'],occupation:'Archivist'},{traits:['playful'],occupation:'Orbital cartographer'},{performance:{version:1,source:'derived'}}]) {
      expect(isValidCharacterPerformance(normalizeCharacterPerformance(bible))).toBe(true);
    }
  });

  it('uses different behavior and examples while preserving each character’s specific motives', () => {
    const soldier=normalizeCharacterPerformance({occupation:'Knight',ambitions:['Protect the queen.'],psychology:{contradictions:['Loyalty conflicts with conscience.'],defenses:['procedure']}});
    const broker=normalizeCharacterPerformance({occupation:'Intelligence broker',ambitions:['Expose the forged ledger.'],psychology:{contradictions:['Evidence could ruin her family.'],defenses:['wit']}});
    expect(soldier.motivation).not.toBe(broker.motivation);
    expect(soldier.states.threatened).not.toEqual(broker.states.threatened);
    expect(soldier.defense).toBe('procedure');
    expect(broker.contradiction).toContain('family');
  });

  it('follows edited legacy identity while retaining explicit authored priorities', () => {
    const derived=normalizeCharacterPerformance({occupation:'Knight',ambitions:['Protect the queen.']});
    expect(normalizeCharacterPerformance({occupation:'Researcher',ambitions:['Finish the survey.'],performance:derived}).motivation).toBe('Finish the survey.');
    const authored=normalizeCharacterPerformance({performance:{motivation:'Keep the archive independent.'}});
    expect(authored.source).toBe('authored');
    expect(normalizeCharacterPerformance({occupation:'Knight',performance:authored}).motivation).toBe('Keep the archive independent.');
  });

  it('preserves authored voice and chooses the appropriate emotional state without repeating recent examples', () => {
    const bible={performance:{states:{aftermath:{behavior:'Checks the cups to hide a tremor.',speech:'Words come slowly.',examples:['The cup can wait.','Give me a moment.']}}}};
    const profile=normalizeCharacterPerformance(bible);
    expect(profile.source).toBe('authored');
    const selected=selectCharacterPerformance({bible,mode:'vulnerable',pressure:assessScenePressure({message:'We escaped.'}),recentAssistantMessages:['The cup can wait.']});
    expect(selected.state).toBe('aftermath');
    expect(selected.behavior).toBe('Checks the cups to hide a tremor.');
    expect(selected.voiceExamples).toEqual(['Give me a moment.']);
  });

  it('does not inject all emotional states or anecdotes into an urgent turn', () => {
    const card=compileCharacterVoiceCard({bible:{occupation:'Knight'},characterName:'New character',message:'We are under attack.',mode:'danger',interactionMode:'co_present'});
    expect(card.performance?.state).toBe('threatened');
    expect(card.responseShape).toBe('short_burst');
    expect(card.anecdote).toBeNull();
    expect(card.verbalTexture).toEqual([]);
  });

  it('compiles every character in the existing Vharadren seed pack in every stress state', () => {
    const sql=readFileSync(new URL('../../../supabase/migrations/202609040009_kivelle_vharadren_world_v1.sql',import.meta.url),'utf8');
    const pack=JSON.parse(sql.match(/\$vharadren_pack\$([\s\S]*?)\$vharadren_pack\$/)![1]!) as {characters:Array<{name:string;occupation:string;characterBible:Record<string,unknown>}>};
    expect(pack.characters.length).toBeGreaterThanOrEqual(49);
    for(const character of pack.characters) {
      const profile=normalizeCharacterPerformance(character.characterBible,{occupation:character.occupation});
      expect(isValidCharacterPerformance(profile),character.name).toBe(true);
      for(const state of performanceStates)expect(profile.states[state].examples.length,`${character.name}:${state}`).toBeGreaterThanOrEqual(2);
    }
  });
});
