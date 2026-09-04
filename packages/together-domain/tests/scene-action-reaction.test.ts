import{describe,expect,it}from'vitest';
import{buildSceneActionReactionInstruction,sceneActionReactionFallback}from'../../../supabase/functions/_shared/scene-action-reaction.ts';

describe('scene action reaction direction',()=>{
  it('turns conversational choices into a live topic instead of a recap',()=>{
    const instruction=buildSceneActionReactionInstruction({decision:'accepted',family:'talk',label:'Talk about the set',requestedLabel:'Talk about the set'});
    expect(instruction).toContain('beginning now');
    expect(instruction).toContain('Actually open the subject now');
    expect(instruction).toContain('Do not recap');
    expect(instruction).not.toContain('just did this together');
  });

  it('keeps countered choices active and declined choices canonical',()=>{
    expect(buildSceneActionReactionInstruction({decision:'countered',family:'activity',label:'Stay for another song',requestedLabel:'Step outside'})).toContain('counter-suggestion');
    expect(buildSceneActionReactionInstruction({decision:'declined',label:'Step outside',requestedLabel:'Step outside'})).toContain('without pretending the declined activity occurred');
  });

  it('uses a present-tense safety fallback',()=>{
    const fallback=sceneActionReactionFallback({decision:'accepted',family:'talk',label:'Talk about the set',requestedLabel:'Talk about the set'});
    expect(fallback).toContain('Let’s talk about the set');
    expect(fallback).not.toMatch(/we (?:talked|chose|did|finished)/i);
  });
});
