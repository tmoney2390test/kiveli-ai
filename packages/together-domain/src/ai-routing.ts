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

const explicitActPattern = /\b(?:strip(?:ping)?|horny|orgasm|masturbat(?:e|ing|ion)|fuck(?:ing|ed)?|sex(?:ual|ually)?|oral sex|anal sex|blowjob|handjob|go down on|eat (?:me|you|her|him|them) out|ride (?:me|you|her|him|them)|finger(?:ing|ed)?|cum|penetrat(?:e|ion|ing)|bdsm|bondage|spank(?:ing|ed)?|dominant|submissive|safe\s*word|cnc|consensual non[- ]?consent|sixty[- ]?nine)\b/i;
const adultIntimacyIntentPattern = /(?:\b(?:have sex|sex with (?:me|you)|sleep (?:with|together)|make love|hook up|come to bed|go to bed with|spend the night|be intimate|take me to bed|tener sexo|acostarnos juntos|hacer el amor|coucher (?:ensemble|avec (?:moi|toi))|faire l['’]amour|andare a letto insieme|fare (?:l['’]amore|sesso)|miteinander schlafen|liebe machen|sex mit (?:mir|dir)|fazer sexo|dormir juntos|fazer amor)\b|セックスしたい|一緒に寝たい|愛し合いたい|섹스하고 싶|같이 자고 싶|사랑을 나누|想做爱|想和你睡|一起过夜)/iu;
const explicitAdvancePattern = /^(?:i (?:really )?(?:want|need) you(?: right now| so badly| so bad| tonight)?)\s*[.!?]*$|(?:\b(?:take off (?:your|my) clothes|undress (?:me|yourself)|touch me|let me touch you|put your hands on me|get on top of me|come under the covers|quítate la ropa|desvísteme|tócame|déjame tocarte|déshabille-toi|déshabille-moi|touche-moi|spogliati|spogliami|toccami|zieh dich aus|fass mich an|tire a roupa|me despe|me toca)\b|脱いで|触って|옷 벗어|만져 줘|脱掉衣服|摸我)/iu;
export const hasSexualDialogueLanguage=(text:string)=>explicitActPattern.test(text)||adultIntimacyIntentPattern.test(text)||explicitAdvancePattern.test(text)||hasExplicitAdultLanguage(text);
const romanticPattern = /\b(?:kiss(?:ing|ed)?|date|romantic|flirt(?:ing)?|crush|love you|hold (?:me|you)|cuddle|chemistry)\b/i;
const maturePattern = /\b(?:desire|intimate|sensual|turned on|make out|bedroom)\b/i;
const continuationPattern = /^(?:(?:yes(?: please)?|yeah|okay|more|keep going|continue|don'?t stop|go on|please(?: continue)?|pretty please|do it|again)|(?:sí|si|claro|más|continúa|no pares|oui|encore|continue|ne t['’]arrête pas|sì|si|ancora|continua|non fermarti|ja|mehr|weiter|hör nicht auf|sim|mais|continua|não para)|(?:はい|もっと|続けて|やめないで|응|네|더|계속해|멈추지 마|是|好|继续|再来|别停))[.!?。！？\s]*$/iu;
const explicitContextContinuationPattern = /(?:\b(?:how (?:does|did|would|will) (?:that|it|this) feel|what does (?:that|it|this) feel like|describe (?:that|it|the sensation)|tell me (?:how|what) (?:that|it|this)|do you like (?:that|it|this)|harder|faster|slower|deeper|inside (?:me|you)|keep (?:doing|touching)|don'?t (?:slow|stop)|make me (?:finish|come)|i'?m close|más fuerte|más rápido|más despacio|más profundo|plus fort|plus vite|plus lentement|plus profond|più forte|più veloce|più piano|più profondo|härter|schneller|langsamer|tiefer|mais forte|mais rápido|mais devagar|mais fundo)\b|もっと強く|もっと速く|ゆっくり|もっと深く|더 세게|더 빨리|천천히|더 깊게|用力一点|快一点|慢一点|深一点)/iu;
const minorPattern = /\b(?:minor|child(?:ren)?|underage|preteen|teen(?:ager)?|young girl|young boy|schoolgirl|schoolboy|(?:[0-9]|1[0-7])[- ]?year[- ]?old)\b/i;
const coercionPattern = /\b(?:rape|raping|forc(?:e|ed|ing)\s+(?:her|him|them|me|you)|forced sex|without consent|non[- ]?consensual|unconscious|drugged|blackmail(?:ed)? into|can'?t say no)\b/i;
const directSexualCoercionPattern = /\b(?:rape|raping|forced sex|sex without consent|non[- ]?consensual sex)\b/i;
const incestPattern = /\bincest\b|\b(?:have sex with|fuck|sleep with|make love to|hook up with)\s+(?:(?:my|your|his|her|their|the)\s+)?(?:mother|father|mom|dad|sister|brother|daughter|son|aunt|uncle|cousin)\b|\b(?:mother|father|mom|dad|sister|brother|daughter|son|aunt|uncle|cousin)\s+(?:sex|sexual|naked|nude)\b/i;
const exploitationPattern = /\b(?:traffick(?:ing|ed)?|sexual exploitation|sexual slavery|exploited? for sex|bestiality|zoophilia|sex with (?:an? )?animal)\b/i;
const exploitativeSexSlaveryPattern = /(?:\b(?:kidnap(?:ped|ping)?|abduct(?:ed|ing)?|traffic(?:k|ked|king)?|sell|sold|buy|bought|force(?:d|ing)?|enslave(?:d|ment)?)\b.{0,80}\bsex slave\b)|(?:\bsex slave\b.{0,80}\b(?:without consent|against (?:her|his|their) will|can'?t say no|cannot say no|forc(?:e|ed|ing)|sell|sold|traffic(?:k|ked|king)?)\b)/i;
const incapableConsentPattern = /\b(?:drug(?:ged|ging)|unconscious|passed out|asleep|blackmail(?:ed)? into)\b/i;
const thirdPartySexualTargetPattern = /\b(?:rape|force|forced sex|sex without consent|non[- ]?consensual sex)\b.{0,80}\b(?:her|him|them|someone|a woman|a man|that woman|that man)\b|\b(?:her|him|them|someone|a woman|a man|that woman|that man)\b.{0,80}\b(?:rape|forced sex|sex without consent|non[- ]?consensual sex)\b/i;

export function isDialogueContinuation(message:string):boolean{return continuationPattern.test(message.trim());}

export function hasConsentWithdrawalSignal(message:string):boolean{
  const value=message.trim();
  if(isDialogueContinuation(value))return false;
  return /(?:\b(?:stop|wait|slow down|pause|no sex|not now|don'?t want|do not want|not comfortable|changed my mind|para|espera|más despacio|ahora no|no quiero|cambié de opinión|arrête|attends|doucement|pas maintenant|je ne veux pas|changé d['’]avis|fermati|aspetta|più piano|non ora|non voglio|cambiato idea|stopp|warte|langsamer|nicht jetzt|ich will nicht|anders überlegt|pare|espera|mais devagar|agora não|não quero|mudei de ideia)\b|やめて|待って|今は(?:だめ|やめて)|したくない|気が変わった|그만|기다려|지금은 안 돼|원하지 않아|마음이 바뀌었|停下|等等|现在不要|我不想|我改变主意)/iu.test(value);
}

export function isDirectAdultAdvance(message:string):boolean{
  return /(?:\b(?:can|could|may|would|will)\s+(?:i|you|we)\b|\b(?:i|we)\s+(?:want|need|would like|want to|need to)\b|\b(?:let me|make me|take me|touch me|kiss me|fuck me|ride me|use me|show me|tell me|care to|quiero|quiero que|déjame|hazme|tócame|bésame|fóllame|cógeme|je veux|laisse-moi|fais-moi|touche-moi|embrasse-moi|baise-moi|voglio|lasciami|fammi|toccami|baciami|scopami|ich will|lass mich|mach mich|berühr mich|küss mich|fick mich|eu quero|quero que|deixa eu|me faz|me toca|me beija|me fode)\b|してほしい|させて|触って|キスして|抱いて|하고 싶어|해 줘|만져 줘|키스해 줘|안아 줘|我想|让我|摸我|吻我|抱我)/iu.test(message);
}

export function isConsensualNonConsentFantasy(message:string):boolean{
  const explicitlyFramed=/\b(?:cnc|consensual non[- ]?consent|consensual force fantasy|consensual coercion fantasy|consensual (?:role[- ]?play|fantasy)|role[- ]?play\b.{0,50}\b(?:safe\s*word|consensual)|safe\s*word\b.{0,50}\brole[- ]?play)\b/i.test(message);
  const firstPersonScene=/\b(?:me|my|myself|us|our|ours|you|your|yours)\b/i.test(message);
  return explicitlyFramed&&firstPersonScene&&!thirdPartySexualTargetPattern.test(message)&&!incapableConsentPattern.test(message);
}

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
  const sexual=hasSexualDialogueLanguage(input.message)||Boolean(input.moderation?.categories.some((category)=>category==='sexual'||category==='sexual/adult'||category==='sexual/minors'));
  const consensualFantasy=isConsensualNonConsentFantasy(input.message);
  return moderationHardBlock(input.moderation)||incestPattern.test(input.message)||exploitationPattern.test(input.message)||exploitativeSexSlaveryPattern.test(input.message)||(sexual&&incapableConsentPattern.test(input.message))||thirdPartySexualTargetPattern.test(input.message)||(sexual&&minorPattern.test(input.message))||(!consensualFantasy&&(directSexualCoercionPattern.test(input.message)||(sexual&&coercionPattern.test(input.message))));
}

export function classifyDialogueContent(input: {
  message: string;
  recentTurns?: Array<{ role: string; content: string }>;
  requestedMode?: DialogueContentMode;
  moderation?: NormalizedModerationResult;
}): DialogueContentClass {
  const message = input.message.trim();
  const recent = (input.recentTurns ?? []).slice(-4).map((turn) => turn.content).join('\n');
  const sexual = hasSexualDialogueLanguage(message) || Boolean(input.moderation?.categories.some((category) => category === 'sexual' || category === 'sexual/adult'));
  const adultIntimacyIntent=adultIntimacyIntentPattern.test(message)||(input.requestedMode==='explicit'&&explicitAdvancePattern.test(message));
  const contextualExplicit = input.requestedMode === 'explicit' && hasSexualDialogueLanguage(recent) && (continuationPattern.test(message) || explicitContextContinuationPattern.test(message));
  if (isDialogueHardBlocked({message,...(input.moderation?{moderation:input.moderation}:{})})) return 'hard_block';
  if (adultIntimacyIntent) return 'adult_intimacy';
  if (sexual || contextualExplicit) return 'explicit_adult';
  if (maturePattern.test(message)) return 'mature';
  if (romanticPattern.test(message)) return 'romantic';
  return 'standard';
}

/** Detect a provider/capability disclaimer, not a genuine character boundary. */
export function isCapabilityStyleExplicitRefusal(text:string):boolean{
  const normalized=text.replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
  return /\b(?:i\s+)?(?:can'?t|cannot|am unable to|won'?t)\b.{0,100}\b(?:describe|provide|continue|engage|write)\b.{0,100}\b(?:explicit|graphic|genital|sexual|anatomical)\b/i.test(normalized)
    || /\b(?:keep|stay|make)\s+(?:it\s+)?(?:sensual|non[- ]?graphic)\b/i.test(normalized)&&/\b(?:instead|without|rather than|but)\b/i.test(normalized);
}

/**
 * Detect a refusal that contradicts an already-resolved accepted intimacy turn.
 * Callers must only use this after Kivelle has independently resolved consent,
 * relationship eligibility, availability, and authored boundaries as willing.
 */
export function isContradictoryAcceptedIntimacyRefusal(text:string):boolean{
  const normalized=text.replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
  if(isCapabilityStyleExplicitRefusal(normalized))return true;
  if(/\b(?:won'?t|will not|don'?t|do not|not going to|not gonna)\s+(?:stop|slow down|hold back|wait any longer)\b/i.test(normalized))return false;
  if(/\b(?:said|told you)\b.{0,50}\bno\b.{0,80}\b(?:explicit|graphic|sexual|sex|oral|mouth|touch|ride|suck|fuck)\b/i.test(normalized))return true;
  if(/\b(?:no|not|won'?t|will not|refuse)\b.{0,80}\b(?:explicit|graphic|sexual)\s+(?:content|detail|dialogue|play|description)\b/i.test(normalized))return true;
  const refusal=/\b(?:i(?:'m| am) not|i won'?t|i will not|i don'?t want to|i do not want to|i refuse to|not doing)\b/i.test(normalized);
  const requestedAct=/\b(?:wrap(?:ping)? my mouth|mouth around|suck|blowjob|oral sex|ride (?:you|him|her|them)|touch (?:you|him|her|them)|have sex|fuck (?:you|him|her|them)|go down on)\b/i.test(normalized);
  return refusal&&requestedAct;
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
