import { classifyDialogueContent, routeKivelleDialogue, type DialogueContentMode, type DialogueRoutingDecision, type NormalizedModerationResult } from '../../../packages/together-domain/src/index.ts';

export function configuredDialogueProviders(){return{
  openai:Boolean(Deno.env.get('OPENAI_API_KEY')),
  // xAI remains available to the provider-neutral voice stack, but the chat
  // adapter is deliberately disabled now that explicit dialogue is retired.
  xai:false,
  gemini:Boolean(Deno.env.get('GEMINI_API_KEY')),
  xaiEnabled:false,
  xaiExplicitEnabled:false,
};}

export function resolveDialogueRouting(input:{message:string;recentTurns?:Array<{role:string;content:string}>;requestedMode?:DialogueContentMode;ageVerified:boolean;characterAge?:number|null;relationshipAllowsExplicit?:boolean;photoRequest?:boolean;moderation?:NormalizedModerationResult}):DialogueRoutingDecision{
  const requestedMode:DialogueContentMode=input.requestedMode==='romance'?'romance':'mature';
  const classification=classifyDialogueContent({message:input.message,recentTurns:input.recentTurns,requestedMode,moderation:input.moderation});
  return routeKivelleDialogue({classification,requestedMode,ageVerified:input.ageVerified,characterAge:input.characterAge,relationshipAllowsExplicit:input.relationshipAllowsExplicit,photoRequest:input.photoRequest,providers:configuredDialogueProviders()});
}
