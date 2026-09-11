import { classifyDialogueContent, routeKivelleDialogue, type DialogueContentMode, type DialogueRoutingDecision, type NormalizedModerationResult } from '../../../packages/together-domain/src/index.ts';
import { adultRoutingCarryover, adultRoutingEvidence } from '../../../packages/together-domain/src/dialogue-routing-continuity.ts';

export function configuredDialogueProviders(){return{
  openai:Boolean(Deno.env.get('OPENAI_API_KEY')),
  xai:Boolean(Deno.env.get('XAI_API_KEY')),
  gemini:Boolean(Deno.env.get('GEMINI_API_KEY')),
  xaiEnabled:enabled('KIVELLE_XAI_ENABLED'),
  xaiExplicitEnabled:enabled('KIVELLE_XAI_EXPLICIT_ENABLED')&&privateAdultTextEnabled(),
};}

export function resolveDialogueRouting(input:{message:string;recentTurns?:Array<{role:string;content:string}>;routingHistory?:unknown[];requestedMode?:DialogueContentMode;ageVerified:boolean;adultAuthorized?:boolean;characterAge?:number|null;relationshipAllowsExplicit?:boolean;photoRequest?:boolean;photoAdultRequest?:boolean;photoSafetyBlocked?:boolean;adultAttachment?:boolean;moderation?:NormalizedModerationResult}):DialogueRoutingDecision{
  const requestedMode:DialogueContentMode=input.adultAuthorized&&input.requestedMode==='explicit'?'explicit':input.requestedMode==='romance'?'romance':'mature';
  const freshClassification=classifyDialogueContent({message:input.message,requestedMode,moderation:input.moderation});
  // An attachment must never override a fresh safety block on its caption.
  const classification=freshClassification==='hard_block'?'hard_block':input.adultAttachment&&input.adultAuthorized?'explicit_adult':classifyDialogueContent({message:input.message,recentTurns:input.recentTurns,requestedMode,moderation:input.moderation});
  const adultRouting=adultRoutingEvidence({message:input.message,classification:freshClassification==='hard_block'?'hard_block':input.adultAttachment&&input.adultAuthorized?'explicit_adult':freshClassification,eligible:Boolean(input.adultAuthorized&&input.ageVerified&&requestedMode==='explicit'&&Number(input.characterAge)>=18&&input.relationshipAllowsExplicit!==false),photoRequest:input.photoRequest});
  const carryoverTurnsRemaining=input.photoRequest?0:adultRoutingCarryover(adultRouting,input.routingHistory);
  const adultRequest=classification==='adult_intimacy'||classification==='explicit_adult'||classification==='adult_suggestive'||carryoverTurnsRemaining>0;
  // PhotoGen owns adult-media authorization after the request is recognized.
  // Private-text rollout state must not turn an otherwise valid adult photo
  // request into a scripted consent/safety refusal before PhotoGen can apply
  // the website-session, subscription, character, and media feature gates.
  const routeAgeVerified=input.photoRequest
    ? input.ageVerified
    : adultRequest
    ? Boolean(input.adultAuthorized&&input.ageVerified)
    : input.ageVerified;
  return {...routeKivelleDialogue({classification,requestedMode,ageVerified:routeAgeVerified,characterAge:input.characterAge,relationshipAllowsExplicit:input.relationshipAllowsExplicit,photoRequest:input.photoRequest,photoAdultRequest:input.photoAdultRequest,photoSafetyBlocked:input.photoSafetyBlocked,adultContextCarryover:carryoverTurnsRemaining>0,providers:configuredDialogueProviders()}),adultRouting,carryoverTurnsRemaining};
}

function enabled(name:string):boolean{return Deno.env.get(name)?.trim().toLowerCase()==='true';}
function privateAdultTextEnabled():boolean{return Deno.env.get('KIVELLE_PRIVATE_ADULT_TEXT_MODE')?.trim().toLowerCase()==='on';}
