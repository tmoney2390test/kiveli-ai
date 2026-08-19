import { describe, expect, it } from 'vitest';
import { classifyDialogueContent, routeKivelleDialogue, type DialogueProviderAvailability } from './ai-routing.ts';

const providers: DialogueProviderAvailability = { openai:true, xai:true, gemini:true, xaiEnabled:true, xaiExplicitEnabled:true };
const route = (message:string, options:Partial<Parameters<typeof routeKivelleDialogue>[0]> = {}, recentTurns:Array<{role:string;content:string}>=[]) => routeKivelleDialogue({ classification:classifyDialogueContent({message,recentTurns,requestedMode:options.requestedMode??'explicit'}), requestedMode:'explicit', ageVerified:true, characterAge:29, providers, ...options });

describe('Kivelle AI routing',()=>{
  it.each(['hey','how was work?','you are funny'])('keeps ordinary dialogue on OpenAI: %s',(message)=>expect(route(message).provider).toBe('openai'));
  it.each(['I love you','kiss me','want to go on a date?'])('keeps romance on OpenAI: %s',(message)=>expect(route(message).provider).toBe('openai'));
  it('does not let a Spice 3 personality imply an explicit provider route',()=>expect(route('You look gorgeous tonight')).toMatchObject({provider:'openai',explicit:false}));
  it('routes permitted adult explicit text to xAI',()=>expect(route('I want to have sex with you').provider).toBe('xai'));
  it('does not route explicit text without explicit preference',()=>expect(route('I want to have sex with you',{requestedMode:'romance'}).provider).toBe('deterministic'));
  it('respects friends-only and character relationship boundaries',()=>expect(route('I want to have sex with you',{relationshipAllowsExplicit:false}).provider).toBe('deterministic'));
  it('requires canonical age verification and an adult character',()=>{
    expect(route('I want to have sex with you',{ageVerified:false}).provider).not.toBe('xai');
    expect(route('I want to have sex with you',{characterAge:17}).hardBlocked).toBe(true);
  });
  it('hard blocks minor and coercive sexual content',()=>{
    expect(route('sexual content with a minor').hardBlocked).toBe(true);
    expect(route('force her to have sex').hardBlocked).toBe(true);
  });
  it('requires both xAI flags and its key',()=>{
    expect(route('I want to have sex with you',{providers:{...providers,xaiEnabled:false}}).provider).not.toBe('xai');
    expect(route('I want to have sex with you',{providers:{...providers,xai:false}}).reason).toBe('provider_unavailable');
  });
  it('uses bounded context for explicit continuation only',()=>{
    expect(route('keep going',{},[{role:'assistant',content:'I want to have sex with you.'}]).provider).toBe('xai');
    expect(route('keep going',{},[{role:'assistant',content:'Tell me more about work.'}]).provider).toBe('openai');
  });
  it('treats broad sexual moderation as routing evidence but minors as a hard block',()=>{
    expect(classifyDialogueContent({message:'keep going',requestedMode:'explicit',moderation:{allowed:true,flagged:true,categories:['sexual'],categoryScores:{sexual:.92}}})).toBe('explicit_adult');
    expect(classifyDialogueContent({message:'keep going',requestedMode:'explicit',moderation:{allowed:false,flagged:true,categories:['sexual/minors'],categoryScores:{'sexual/minors':.99}}})).toBe('hard_block');
  });
});
