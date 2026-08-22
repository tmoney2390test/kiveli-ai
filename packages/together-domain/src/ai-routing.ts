import { hasExplicitAdultLanguage } from './adult-language.ts';

export type DialogueProviderName = 'openai' | 'xai' | 'gemini' | 'deterministic';
export type DialogueContentMode = 'standard' | 'romance' | 'mature' | 'explicit';
export type DialogueContentClass = 'standard' | 'romantic' | 'mature' | 'adult_intimacy' | 'explicit_adult' | 'hard_block';

export type DialogueRouteReason =
  | 'standard_default'
  | 'romance_default'
  | 'adult_intimacy'
  | 'adult_explicit'
  | 'adult_expression_downgrade'
  | 'relationship_boundary'
  | 'provider_unavailable'
  | 'provider_fallback'
  | 'safety_block';

export type NormalizedModerationResult = {
  allowed: boolean;
  flagged: boolean;
  categories: string[];
  categoryScores: Record<string, number>;
};

export type DialogueRoutingDecision = {
  provider: DialogueProviderName;
  requestedMode: DialogueContentMode;
  resolvedMode: DialogueContentMode;
  reason: DialogueRouteReason;
  explicit: boolean;
  adultEligible: boolean;
  hardBlocked: boolean;
  classification: DialogueContentClass;
};

export type DialogueProviderAvailability = {
  openai: boolean;
  xai: boolean;
  gemini: boolean;
  xaiEnabled: boolean;
  xaiExplicitEnabled: boolean;
};

export const dialogueProviderCapabilities: Record<DialogueProviderName, { romance: boolean; matureThemes: boolean; explicitSexualText: boolean }> = {
  openai: { romance: true, matureThemes: true, explicitSexualText: false },
  xai: { romance: true, matureThemes: true, explicitSexualText: true },
  gemini: { romance: true, matureThemes: true, explicitSexualText: false },
  deterministic: { romance: true, matureThemes: false, explicitSexualText: false },
};

const explicitActPattern = /\b(?:strip(?:ping)?|horny|orgasm|masturbat(?:e|ing|ion)|fuck(?:ing|ed)?|sex(?:ual|ually)?|oral sex|anal sex|blowjob|handjob|go down on|eat (?:me|you|her|him|them) out|ride (?:me|you|her|him|them)|finger(?:ing|ed)?|cum|penetrat(?:e|ion|ing)|bdsm|bondage|spank(?:ing|ed)?|dominant|submissive|safe\s*word|sixty[- ]?nine)\b/i;
const hasExplicitDialogueLanguage=(text:string)=>explicitActPattern.test(text)||hasExplicitAdultLanguage(text);
const adultIntimacyIntentPattern = /\b(?:have sex|sex with (?:me|you)|sleep (?:with|together)|make love|hook up|come to bed|go to bed with|spend the night|be intimate|take me to bed)\b/i;
const explicitAdvancePattern = /^(?:i (?:really )?(?:want|need) you(?: right now| so badly| so bad| tonight)?)\s*[.!?]*$|\b(?:take off (?:your|my) clothes|undress (?:me|yourself)|touch me|let me touch you|put your hands on me|get on top of me|come under the covers)\b/i;
const romanticPattern = /\b(?:kiss(?:ing|ed)?|date|romantic|flirt(?:ing)?|crush|love you|hold (?:me|you)|cuddle|chemistry)\b/i;
const maturePattern = /\b(?:desire|intimate|sensual|turned on|make out|bedroom)\b/i;
const continuationPattern = /^(?:yes|yeah|more|keep going|continue|don'?t stop|go on|please continue|do it|again)[.!?\s]*$/i;
const minorPattern = /\b(?:minor|child(?:ren)?|underage|preteen|teen(?:ager)?|young girl|young boy|schoolgirl|schoolboy|(?:[0-9]|1[0-7])[- ]?year[- ]?old)\b/i;
const coercionPattern = /\b(?:rape|raping|forc(?:e|ed|ing)\s+(?:her|him|them|me|you)|forced sex|without consent|non[- ]?consensual|unconscious|drugged|blackmail(?:ed)? into|can'?t say no)\b/i;
const directSexualCoercionPattern = /\b(?:rape|raping|forced sex|sex without consent|non[- ]?consensual sex)\b/i;
const incestPattern = /\bincest\b|\b(?:have sex with|fuck|sleep with|make love to|hook up with)\s+(?:(?:my|your|his|her|their|the)\s+)?(?:mother|father|mom|dad|sister|brother|daughter|son|aunt|uncle|cousin)\b|\b(?:mother|father|mom|dad|sister|brother|daughter|son|aunt|uncle|cousin)\s+(?:sex|sexual|naked|nude)\b/i;
const exploitationPattern = /\b(?:traffick(?:ing|ed)?|sex slave|sexual exploitation|exploited? for sex|bestiality|zoophilia|sex with (?:an? )?animal)\b/i;

const hardBlockModerationCategories = new Set([
  'sexual/minors',
  'self-harm/instructions',
  'illicit/violent',
]);

export function moderationHardBlock(result?: NormalizedModerationResult): boolean {
  if (!result?.flagged) return false;
  // Moderation flags are broad signals, not all-purpose dialogue bans. Let the
  // companion respond safely to ordinary romance, conflict, and other benign
  // language while reserving scripted refusal for unequivocal hard boundaries.
  return result.categories.some((category) => hardBlockModerationCategories.has(category));
}

export function isDialogueHardBlocked(input:{message:string;moderation?:NormalizedModerationResult}):boolean{
  const sexual=hasExplicitDialogueLanguage(input.message)||Boolean(input.moderation?.categories.some((category)=>category==='sexual'||category==='sexual/adult'||category==='sexual/minors'));
  return moderationHardBlock(input.moderation)||directSexualCoercionPattern.test(input.message)||incestPattern.test(input.message)||exploitationPattern.test(input.message)||(sexual&&(minorPattern.test(input.message)||coercionPattern.test(input.message)));
}

export function classifyDialogueContent(input: {
  message: string;
  recentTurns?: Array<{ role: string; content: string }>;
  requestedMode?: DialogueContentMode;
  moderation?: NormalizedModerationResult;
}): DialogueContentClass {
  const message = input.message.trim();
  const recent = (input.recentTurns ?? []).slice(-4).map((turn) => turn.content).join('\n');
  const sexual = hasExplicitDialogueLanguage(message) || Boolean(input.moderation?.categories.some((category) => category === 'sexual' || category === 'sexual/adult'));
  const adultIntimacyIntent=adultIntimacyIntentPattern.test(message)||(input.requestedMode==='explicit'&&explicitAdvancePattern.test(message));
  const contextualExplicit = input.requestedMode === 'explicit' && continuationPattern.test(message) && hasExplicitDialogueLanguage(recent);
  if (isDialogueHardBlocked({message,...(input.moderation?{moderation:input.moderation}:{})})) return 'hard_block';
  if (adultIntimacyIntent) return 'adult_intimacy';
  if (sexual || contextualExplicit) return 'explicit_adult';
  if (maturePattern.test(message)) return 'mature';
  if (romanticPattern.test(message)) return 'romantic';
  return 'standard';
}

export function routeKivelleDialogue(input: {
  classification: DialogueContentClass;
  requestedMode?: DialogueContentMode;
  ageVerified: boolean;
  characterAge?: number | null;
  relationshipAllowsExplicit?: boolean;
  photoRequest?: boolean;
  providers: DialogueProviderAvailability;
}): DialogueRoutingDecision {
  const requestedMode = input.requestedMode ?? 'standard';
  const adultEligible = input.ageVerified && Number.isFinite(input.characterAge) && Number(input.characterAge) >= 18;
  if (input.classification === 'hard_block') return { provider: 'deterministic', requestedMode, resolvedMode: 'standard', reason: 'safety_block', explicit: false, adultEligible, hardBlocked: true, classification: input.classification };

  // PhotoGen owns photo permission and delivery. The prose provider should
  // only produce a short acknowledgement, not reject a valid media request
  // because explicit dialogue or relationship-stage routing is unavailable.
  // Preserve adult-age and hard-safety checks before taking this branch.
  if (input.photoRequest) {
    if ((input.classification === 'adult_intimacy' || input.classification === 'explicit_adult') && !adultEligible) return { provider: 'deterministic', requestedMode, resolvedMode: 'romance', reason: 'safety_block', explicit: false, adultEligible, hardBlocked: true, classification: input.classification };
    const resolvedMode: DialogueContentMode = requestedMode === 'standard' ? 'standard' : 'romance';
    const reason: DialogueRouteReason = resolvedMode === 'romance' ? 'romance_default' : 'standard_default';
    if (input.providers.openai) return { provider: 'openai', requestedMode, resolvedMode, reason, explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
    if (input.providers.gemini) return { provider: 'gemini', requestedMode, resolvedMode, reason: 'provider_fallback', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
    return { provider: 'deterministic', requestedMode, resolvedMode, reason: 'provider_unavailable', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
  }

  if (input.classification === 'adult_intimacy' || input.classification === 'explicit_adult') {
    if (!adultEligible) return { provider: 'deterministic', requestedMode, resolvedMode: 'romance', reason: 'safety_block', explicit: false, adultEligible, hardBlocked: true, classification: input.classification };
    const relationshipBoundary=input.relationshipAllowsExplicit===false;
    if (!relationshipBoundary&&requestedMode === 'explicit'&&input.providers.xaiEnabled&&input.providers.xaiExplicitEnabled&&input.providers.xai) return { provider: 'xai', requestedMode, resolvedMode: 'explicit', reason: 'adult_explicit', explicit: true, adultEligible, hardBlocked: false, classification: input.classification };
    const resolvedMode:DialogueContentMode=relationshipBoundary?(requestedMode==='standard'?'standard':'romance'):(requestedMode==='explicit'?'mature':requestedMode);
    const reason:DialogueRouteReason=relationshipBoundary?'relationship_boundary':requestedMode==='explicit'?'adult_expression_downgrade':'adult_intimacy';
    if(input.providers.openai)return{provider:'openai',requestedMode,resolvedMode,reason,explicit:false,adultEligible,hardBlocked:false,classification:input.classification};
    if(input.providers.gemini)return{provider:'gemini',requestedMode,resolvedMode,reason:'provider_fallback',explicit:false,adultEligible,hardBlocked:false,classification:input.classification};
    return{provider:'deterministic',requestedMode,resolvedMode,reason:'provider_unavailable',explicit:false,adultEligible,hardBlocked:false,classification:input.classification};
  }

  const resolvedMode: DialogueContentMode = requestedMode === 'explicit' ? 'mature' : requestedMode;
  const reason: DialogueRouteReason = input.classification === 'romantic' || resolvedMode === 'romance' ? 'romance_default' : 'standard_default';
  if (input.providers.openai) return { provider: 'openai', requestedMode, resolvedMode, reason, explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
  if (input.providers.gemini) return { provider: 'gemini', requestedMode, resolvedMode, reason: 'provider_fallback', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
  return { provider: 'deterministic', requestedMode, resolvedMode, reason: 'provider_unavailable', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
}
