import { classifyDialogueContent, routeKivelleDialogue, type DialogueContentMode, type DialogueRoutingDecision, type NormalizedModerationResult } from '../../../packages/together-domain/src/index.ts';

export function configuredDialogueProviders(){return{
  openai:Boolean(Deno.env.get('OPENAI_API_KEY')),
  xai:Boolean(Deno.env.get('XAI_API_KEY')),
  gemini:Boolean(Deno.env.get('GEMINI_API_KEY')),
  xaiEnabled:enabled('KIVELLE_XAI_ENABLED'),
  xaiExplicitEnabled:enabled('KIVELLE_XAI_EXPLICIT_ENABLED')&&privateAdultTextEnabled(),
};}

export function resolveDialogueRouting(input:{message:string;recentTurns?:Array<{role:string;content:string}>;requestedMode?:DialogueContentMode;ageVerified:boolean;adultAuthorized?:boolean;characterAge?:number|null;relationshipAllowsExplicit?:boolean;photoRequest?:boolean;photoAdultRequest?:boolean;photoSafetyBlocked?:boolean;moderation?:NormalizedModerationResult}):DialogueRoutingDecision{
  const requestedMode:DialogueContentMode=input.adultAuthorized&&input.requestedMode==='explicit'?'explicit':input.requestedMode==='romance'?'romance':'mature';
  const classification=classifyDialogueContent({message:input.message,recentTurns:input.recentTurns,requestedMode,moderation:input.moderation});
  const adultRequest=classification==='adult_intimacy'||classification==='explicit_adult';
  // PhotoGen owns adult-media authorization after the request is recognized.
  // Private-text rollout state must not turn an otherwise valid adult photo
  // request into a scripted consent/safety refusal before PhotoGen can apply
  // the website-session, subscription, character, and media feature gates.
  const routeAgeVerified=input.photoRequest
    ? input.ageVerified
    : adultRequest
    ? Boolean(input.adultAuthorized&&input.ageVerified)
    : input.ageVerified;
  return routeKivelleDialogue({classification,requestedMode,ageVerified:routeAgeVerified,characterAge:input.characterAge,relationshipAllowsExplicit:input.relationshipAllowsExplicit,photoRequest:input.photoRequest,photoAdultRequest:input.photoAdultRequest,photoSafetyBlocked:input.photoSafetyBlocked,providers:configuredDialogueProviders()});
}

function enabled(name:string):boolean{return Deno.env.get(name)?.trim().toLowerCase()==='true';}
function privateAdultTextEnabled():boolean{return Deno.env.get('KIVELLE_PRIVATE_ADULT_TEXT_MODE')?.trim().toLowerCase()==='on';}
