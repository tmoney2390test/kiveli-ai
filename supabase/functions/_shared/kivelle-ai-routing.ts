import { classifyDialogueContent, routeKivelleDialogue, type DialogueContentMode, type DialogueRoutingDecision, type NormalizedModerationResult } from '../../../packages/together-domain/src/index.ts';

export function configuredDialogueProviders(){return{
  openai:Boolean(Deno.env.get('OPENAI_API_KEY')),
  xai:Boolean(Deno.env.get('XAI_API_KEY')),
  gemini:Boolean(Deno.env.get('GEMINI_API_KEY')),
  xaiEnabled:Deno.env.get('KIVELLE_XAI_ENABLED')==='true',
  xaiExplicitEnabled:Deno.env.get('KIVELLE_XAI_EXPLICIT_ENABLED')==='true',
};}

export function resolveDialogueRouting(input:{message:string;recentTurns?:Array<{role:string;content:string}>;requestedMode?:DialogueContentMode;ageVerified:boolean;characterAge?:number|null;relationshipAllowsExplicit?:boolean;moderation?:NormalizedModerationResult}):DialogueRoutingDecision{
  const classification=classifyDialogueContent({message:input.message,recentTurns:input.recentTurns,requestedMode:input.requestedMode,moderation:input.moderation});
  return routeKivelleDialogue({classification,requestedMode:input.requestedMode,ageVerified:input.ageVerified,characterAge:input.characterAge,relationshipAllowsExplicit:input.relationshipAllowsExplicit,providers:configuredDialogueProviders()});
}
