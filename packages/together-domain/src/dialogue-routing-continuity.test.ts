import { describe, expect, it } from 'vitest';
import { adultRoutingCarryover, adultRoutingEvidence } from './dialogue-routing-continuity';
import { classifyDialogueContent, routeKivelleDialogue } from './ai-routing';

const neutral=adultRoutingEvidence({message:'I nod.',classification:'standard',eligible:true});
const fresh=adultRoutingEvidence({message:'[classified input]',classification:'explicit_adult',eligible:true});
const providers={openai:true,xai:true,gemini:true,xaiEnabled:true,xaiExplicitEnabled:true};

describe('bounded adult routing continuity',()=>{
  it('retains exactly three following user turns without self-renewing',()=>{
    const history=[fresh];
    for(const remaining of [3,2,1,0,0]){
      expect(adultRoutingCarryover(neutral,history)).toBe(remaining);
      history.push(neutral);
    }
  });
  it('only fresh classification renews the window',()=>{
    expect(adultRoutingCarryover(neutral,[fresh,neutral,neutral,fresh])).toBe(3);
    expect(adultRoutingCarryover(fresh,[neutral,neutral])).toBe(0);
  });
  it.each(['Stop.','I changed my mind.','Change the subject.','New topic.'])(
    'clears carryover across %s',(message)=>{
      const reset=adultRoutingEvidence({message,classification:'standard',eligible:true});
      expect(adultRoutingCarryover(reset,[fresh])).toBe(0);
      expect(adultRoutingCarryover(neutral,[fresh,reset])).toBe(0);
    });
  it('does not borrow permission across legacy, malformed, restricted, or blocked turns',()=>{
    for(const boundary of [null,{}, {...fresh,version:2},{...fresh,eligible:false},{...fresh,reset:true}]){
      expect(adultRoutingCarryover(neutral,[fresh,boundary])).toBe(0);
    }
    expect(adultRoutingCarryover({...neutral,eligible:false},[fresh])).toBe(0);
    expect(adultRoutingEvidence({message:'[blocked]',classification:'hard_block',eligible:true}).freshAdult).toBe(false);
    expect(adultRoutingEvidence({message:'[photo]',classification:'explicit_adult',eligible:true,photoRequest:true}).freshAdult).toBe(false);
  });
  it('preserves the current classification while changing only the route',()=>{
    expect(routeKivelleDialogue({classification:'standard',requestedMode:'explicit',ageVerified:true,characterAge:30,providers,adultContextCarryover:true})).toMatchObject({provider:'xai',classification:'standard',reason:'adult_context_carryover'});
  });
  it('cannot override a current hard safety block, age, relationship, provider, or photo restriction',()=>{
    const base={classification:'standard' as const,requestedMode:'explicit' as const,ageVerified:true,characterAge:30,providers,adultContextCarryover:true};
    expect(routeKivelleDialogue({...base,classification:'hard_block'})).toMatchObject({hardBlocked:true,provider:'deterministic'});
    for(const patch of [{ageVerified:false},{characterAge:17},{characterAge:null},{relationshipAllowsExplicit:false},{requestedMode:'mature' as const},{providers:{...providers,xaiExplicitEnabled:false}},{photoRequest:true}]){
      expect(routeKivelleDialogue({...base,...patch}).explicit).toBe(false);
    }
  });
});

describe('suggestive dialogue routing',()=>{
  it.each(['That is sensual.','You look seductive.','You are turning me on.','I am really turned on.','I desire you.','I want to make out.','Kiss my neck.'])(
    'routes %s without needing explicit anatomy',(message)=>{
      const classification=classifyDialogueContent({message,requestedMode:'explicit'});
      expect(classification).toBe('adult_suggestive');
      expect(routeKivelleDialogue({classification,requestedMode:'explicit',ageVerified:true,characterAge:30,providers}).provider).toBe('xai');
    });
  it.each(['I turned on the lights.','Can you make out the sign?','My bedroom needs painting.','I desire a quiet dinner.','You look lovely.','I want you to meet my friend.','Hold my hand.'])(
    'does not treat ordinary language as adult routing: %s',(message)=>{
      const classification=classifyDialogueContent({message,requestedMode:'explicit'});
      expect(routeKivelleDialogue({classification,requestedMode:'explicit',ageVerified:true,characterAge:30,providers}).provider).toBe('openai');
    });
  it('preserves non-explicit preference ceilings for suggestive language',()=>{
    for(const requestedMode of ['standard','romance','mature'] as const){
      expect(routeKivelleDialogue({classification:'adult_suggestive',requestedMode,ageVerified:true,characterAge:30,providers})).toMatchObject({provider:'openai',resolvedMode:requestedMode,explicit:false});
    }
  });
});
