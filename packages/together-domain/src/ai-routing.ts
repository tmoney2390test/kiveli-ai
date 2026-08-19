export type DialogueProviderName = 'openai' | 'xai' | 'gemini' | 'deterministic';
export type DialogueContentMode = 'standard' | 'romance' | 'mature' | 'explicit';
export type DialogueContentClass = 'standard' | 'romantic' | 'mature' | 'explicit_adult' | 'hard_block';

export type DialogueRouteReason =
  | 'standard_default'
  | 'romance_default'
  | 'adult_explicit'
  | 'provider_unavailable'
  | 'provider_fallback'
  | 'safety_block'
  | 'feature_disabled';

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

const explicitPattern = /\b(?:nudes?|naked|strip(?:ping)?|tits?|boobs?|breasts?|pussy|dick|cock|penis|vagina|horny|orgasm|masturbat(?:e|ing|ion)|fuck(?:ing|ed)?|sex(?:ual|ually)?|blowjob|handjob|cum|penetrat(?:e|ion|ing))\b/i;
const romanticPattern = /\b(?:kiss(?:ing|ed)?|date|romantic|flirt(?:ing)?|crush|love you|hold (?:me|you)|cuddle|chemistry)\b/i;
const maturePattern = /\b(?:desire|intimate|sensual|turned on|make out|bedroom)\b/i;
const continuationPattern = /^(?:yes|yeah|more|keep going|continue|don'?t stop|go on|please continue|do it|again)[.!?\s]*$/i;
const minorPattern = /\b(?:minor|child(?:ren)?|underage|preteen|teenager|young girl|young boy|schoolgirl|schoolboy|(?:[0-9]|1[0-7])[- ]?year[- ]?old)\b/i;
const coercionPattern = /\b(?:rape|raping|forced?|force her|force him|without consent|non[- ]?consensual|unconscious|drugged|blackmail(?:ed)? into|can'?t say no)\b/i;

function moderationHardBlock(result?: NormalizedModerationResult): boolean {
  if (!result?.flagged) return false;
  return result.categories.some((category) => category !== 'sexual' && category !== 'sexual/adult');
}

export function classifyDialogueContent(input: {
  message: string;
  recentTurns?: Array<{ role: string; content: string }>;
  requestedMode?: DialogueContentMode;
  moderation?: NormalizedModerationResult;
}): DialogueContentClass {
  const message = input.message.trim();
  const recent = (input.recentTurns ?? []).slice(-4).map((turn) => turn.content).join('\n');
  const sexual = explicitPattern.test(message) || Boolean(input.moderation?.categories.some((category) => category === 'sexual' || category === 'sexual/adult'));
  const contextualExplicit = input.requestedMode === 'explicit' && continuationPattern.test(message) && explicitPattern.test(recent);
  if ((sexual && (minorPattern.test(message) || coercionPattern.test(message))) || moderationHardBlock(input.moderation)) return 'hard_block';
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
  providers: DialogueProviderAvailability;
}): DialogueRoutingDecision {
  const requestedMode = input.requestedMode ?? 'standard';
  const adultEligible = input.ageVerified && Number.isFinite(input.characterAge) && Number(input.characterAge) >= 18;
  if (input.classification === 'hard_block') return { provider: 'deterministic', requestedMode, resolvedMode: 'standard', reason: 'safety_block', explicit: false, adultEligible, hardBlocked: true, classification: input.classification };

  if (input.classification === 'explicit_adult') {
    if (!adultEligible) return { provider: 'deterministic', requestedMode, resolvedMode: 'romance', reason: 'safety_block', explicit: false, adultEligible, hardBlocked: true, classification: input.classification };
    if (input.relationshipAllowsExplicit === false) return { provider: 'deterministic', requestedMode, resolvedMode: 'romance', reason: 'feature_disabled', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
    if (requestedMode !== 'explicit' || !input.providers.xaiEnabled || !input.providers.xaiExplicitEnabled) return { provider: 'deterministic', requestedMode, resolvedMode: requestedMode === 'standard' ? 'standard' : 'romance', reason: 'feature_disabled', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
    if (!input.providers.xai) return { provider: 'deterministic', requestedMode, resolvedMode: 'romance', reason: 'provider_unavailable', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
    return { provider: 'xai', requestedMode, resolvedMode: 'explicit', reason: 'adult_explicit', explicit: true, adultEligible, hardBlocked: false, classification: input.classification };
  }

  const resolvedMode: DialogueContentMode = requestedMode === 'explicit' ? 'mature' : requestedMode;
  const reason: DialogueRouteReason = input.classification === 'romantic' || resolvedMode === 'romance' ? 'romance_default' : 'standard_default';
  if (input.providers.openai) return { provider: 'openai', requestedMode, resolvedMode, reason, explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
  if (input.providers.gemini) return { provider: 'gemini', requestedMode, resolvedMode, reason: 'provider_fallback', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
  return { provider: 'deterministic', requestedMode, resolvedMode, reason: 'provider_unavailable', explicit: false, adultEligible, hardBlocked: false, classification: input.classification };
}
