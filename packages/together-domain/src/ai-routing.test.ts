import { describe, expect, it } from 'vitest';
import { classifyDialogueContent, isCapabilityStyleExplicitRefusal, isContradictoryAcceptedIntimacyRefusal, isDialogueHardBlocked, routeKivelleDialogue, type DialogueProviderAvailability } from './ai-routing.ts';
import { classifyPhotoIntent } from './media.ts';

const providers: DialogueProviderAvailability = { openai:true, xai:true, gemini:true, xaiEnabled:true, xaiExplicitEnabled:true };
const route = (message:string, options:Partial<Parameters<typeof routeKivelleDialogue>[0]> = {}, recentTurns:Array<{role:string;content:string}>=[]) => routeKivelleDialogue({ classification:classifyDialogueContent({message,recentTurns,requestedMode:options.requestedMode??'explicit'}), requestedMode:'explicit', ageVerified:true, characterAge:29, providers, ...options });

describe('Kivelle AI routing',()=>{
  it.each(['hey','how was work?','you are funny'])('keeps ordinary dialogue on OpenAI: %s',(message)=>expect(route(message).provider).toBe('openai'));
  it.each(['I love you','kiss me','want to go on a date?'])('keeps romance on OpenAI: %s',(message)=>expect(route(message).provider).toBe('openai'));
  it('does not let a Spice 3 personality imply an explicit provider route',()=>expect(route('You look gorgeous tonight')).toMatchObject({provider:'openai',explicit:false}));
  it('classifies a sexual proposition as adult intimacy and routes explicit expression to xAI',()=>{
    expect(classifyDialogueContent({message:'I want to have sex with you',requestedMode:'explicit'})).toBe('adult_intimacy');
    expect(route('I want to have sex with you')).toMatchObject({provider:'xai',resolvedMode:'explicit',reason:'adult_explicit'});
  });
  it.each(['I want you right now.','Take off your clothes.','Touch me.'])('recognizes a direct Explicit-mode advance: %s',(message)=>expect(route(message)).toMatchObject({provider:'xai',resolvedMode:'explicit',classification:'adult_intimacy'}));
  it.each(['Would you go down on me?','I want oral sex.','Ride me.','Can we sixty-nine?'])('recognizes additional adult sexual acts without filtering them: %s',(message)=>expect(route(message)).toMatchObject({provider:'xai',resolvedMode:'explicit',hardBlocked:false}));
  it.each(['Touch my coochie.','I want your schlong.','Show me your b00bs.','Stroke my d1ck.'])('routes shared adult slang and obfuscations consistently: %s',(message)=>expect(route(message)).toMatchObject({provider:'xai',resolvedMode:'explicit',hardBlocked:false}));
  it.each(['I cooked chicken breast.','The golf balls are in my package delivery.','My kitty likes peach cobbler.'])('keeps ambiguous everyday language on the standard route: %s',(message)=>expect(route(message)).toMatchObject({provider:'openai',classification:'standard'}));
  it('does not misroute an ordinary sentence beginning with “I want you”',()=>expect(route('I want you to come to dinner.')).toMatchObject({provider:'openai',classification:'standard'}));
  it.each([['standard','standard'],['romance','romance'],['mature','mature']] as const)('lets the character answer adult intimacy naturally in %s mode', (requestedMode,resolvedMode)=>{
    expect(route('I want to have sex with you',{requestedMode})).toMatchObject({provider:'openai',resolvedMode,reason:'adult_intimacy',hardBlocked:false});
  });
  it('downgrades graphic adult wording to the selected non-explicit ceiling instead of filtering it',()=>expect(route('Fuck me.',{requestedMode:'romance'})).toMatchObject({provider:'openai',resolvedMode:'romance',reason:'adult_intimacy',hardBlocked:false}));
  it('turns friends-only and character relationship boundaries into an in-character model response',()=>expect(route('I want to have sex with you',{relationshipAllowsExplicit:false})).toMatchObject({provider:'openai',resolvedMode:'romance',reason:'relationship_boundary',hardBlocked:false}));
  it('lets PhotoGen own eligible adult-photo policy instead of treating it as explicit dialogue',()=>{
    expect(route('send me a nude photo',{relationshipAllowsExplicit:false,photoRequest:true})).toMatchObject({provider:'openai',hardBlocked:false,explicit:false});
    expect(route('send me a nude photo',{providers:{...providers,xaiEnabled:false},photoRequest:true})).toMatchObject({provider:'openai',hardBlocked:false});
    const shorthand='show me your boobs';
    expect(route(shorthand,{relationshipAllowsExplicit:false,photoRequest:classifyPhotoIntent(shorthand).requested})).toMatchObject({provider:'openai',hardBlocked:false,explicit:false});
  });
  it('retains adult-age and hard-safety blocks for photo requests',()=>{
    expect(route('send me a nude photo',{ageVerified:false,photoRequest:true}).hardBlocked).toBe(true);
    expect(route('force her to send a nude photo',{photoRequest:true}).hardBlocked).toBe(true);
  });
  it('requires canonical age verification and an adult character',()=>{
    expect(route('I want to have sex with you',{ageVerified:false}).provider).not.toBe('xai');
    expect(route('I want to have sex with you',{characterAge:17}).hardBlocked).toBe(true);
  });
  it('hard blocks minor and coercive sexual content',()=>{
    expect(route('sexual content with a minor').hardBlocked).toBe(true);
    expect(route('force her to have sex').hardBlocked).toBe(true);
  });
  it('requires both xAI flags and its key',()=>{
    expect(route('I want to have sex with you',{providers:{...providers,xaiEnabled:false}})).toMatchObject({provider:'openai',resolvedMode:'mature',reason:'adult_expression_downgrade'});
    expect(route('I want to have sex with you',{providers:{...providers,xai:false}})).toMatchObject({provider:'openai',resolvedMode:'mature',reason:'adult_expression_downgrade'});
  });
  it('uses bounded context for explicit continuation only',()=>{
    expect(route('keep going',{},[{role:'assistant',content:'I want to have sex with you.'}]).provider).toBe('xai');
    expect(route('What does that feel like?',{},[{role:'assistant',content:'I want to have sex with you.'}]).provider).toBe('xai');
    expect(route('keep going',{},[{role:'assistant',content:'Tell me more about work.'}]).provider).toBe('openai');
    expect(route('How was work?',{},[{role:'assistant',content:'I want to have sex with you.'}]).provider).toBe('openai');
  });
  it.each(['please','pretty please','yes please','okay'])('keeps a short adult continuation on xAI: %s',(message)=>expect(route(message,{},[{role:'assistant',content:'I want oral sex.'}])).toMatchObject({provider:'xai',classification:'explicit_adult'}));
  it('recognizes capability-style adult refusals without treating an authored no as provider failure',()=>{
    expect(isCapabilityStyleExplicitRefusal("I can't describe explicit genital sensations in detail. I can keep it sensual without becoming graphic.")).toBe(true);
    expect(isCapabilityStyleExplicitRefusal("No. I don't want that tonight.")).toBe(false);
  });
  it('detects refusals that contradict an already-accepted intimacy turn',()=>{
    expect(isContradictoryAcceptedIntimacyRefusal("That line's cute until you remember I already said no graphic play. My mouth stays empty.")).toBe(true);
    expect(isContradictoryAcceptedIntimacyRefusal("I'm not wrapping my mouth around that.")).toBe(true);
    expect(isContradictoryAcceptedIntimacyRefusal("I can't describe explicit sexual detail.")).toBe(true);
    expect(isContradictoryAcceptedIntimacyRefusal("I won't stop touching you.")).toBe(false);
    expect(isContradictoryAcceptedIntimacyRefusal("No. I don't want that tonight.")).toBe(false);
  });
  it('treats broad sexual moderation as routing evidence but minors as a hard block',()=>{
    expect(classifyDialogueContent({message:'keep going',requestedMode:'explicit',moderation:{allowed:true,flagged:true,categories:['sexual'],categoryScores:{sexual:.92}}})).toBe('explicit_adult');
    expect(classifyDialogueContent({message:'keep going',requestedMode:'explicit',moderation:{allowed:false,flagged:true,categories:['sexual/minors'],categoryScores:{'sexual/minors':.99}}})).toBe('hard_block');
  });
  it('allows consensual adult kink while retaining coercion, incest, exploitation, and animal abuse blocks',()=>{
    expect(route('Would you be into consensual bondage if we use a safe word?')).toMatchObject({hardBlocked:false,provider:'xai'});
    expect(isDialogueHardBlocked({message:'I want to force her to have sex'})).toBe(true);
    expect(isDialogueHardBlocked({message:'rape her'})).toBe(true);
    expect(isDialogueHardBlocked({message:'I was forced to work overtime, so I am too tired for sex.'})).toBe(false);
    expect(isDialogueHardBlocked({message:'I was drugged at a party and need to talk.'})).toBe(false);
    expect(isDialogueHardBlocked({message:'I want to have sex with my sister'})).toBe(true);
    expect(isDialogueHardBlocked({message:'sexual exploitation through trafficking'})).toBe(true);
    expect(isDialogueHardBlocked({message:'sex with an animal'})).toBe(true);
  });
  it('does not turn benign romantic idioms into hard safety refusals',()=>{
    for(const category of ['illicit','violence','harassment']){
      const classification=classifyDialogueContent({message:'Good place to steal a kiss?',requestedMode:'romance',moderation:{allowed:false,flagged:true,categories:[category],categoryScores:{[category]:.72}}});
      expect(classification).toBe('romantic');
      expect(routeKivelleDialogue({classification,requestedMode:'romance',ageVerified:true,characterAge:29,providers})).toMatchObject({provider:'openai',reason:'romance_default',hardBlocked:false});
    }
  });
  it.each(['self-harm/instructions','illicit/violent'])('retains hard safety routing for %s',(category)=>{
    expect(classifyDialogueContent({message:'keep going',moderation:{allowed:false,flagged:true,categories:[category],categoryScores:{[category]:.99}}})).toBe('hard_block');
  });
});
