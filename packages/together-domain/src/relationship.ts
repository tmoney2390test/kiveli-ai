import { relationshipMetricNames, relationshipStages, type ChemistryBand, type ChemistrySignal, type ChemistryUpdate, type ChemistryUpdateInput, type ConversationEngagementEvaluation, type ConversationEngagementInput, type FlirtExpressionStyle, type InteractionQuality, type RelationshipChangeSource, type RelationshipEvidenceSummary, type RelationshipHealth, type RelationshipMetrics, type RelationshipMilestoneProposal, type RelationshipPacingConfig, type RelationshipPresentationContext, type RelationshipProgressionEvaluation, type RelationshipStage, type RelationshipState, type SpiceLevel } from './types.ts';

export const STRANGER_ENGAGEMENT_THRESHOLD=6;
export const STRANGER_GENUINE_TURN_THRESHOLD=3;
export const TRIVIAL_ENGAGEMENT_CAP=1.75;
export const ACQUAINTANCE_TRUST_THRESHOLD=14;
export const ACQUAINTANCE_HISTORY_FAMILIARITY_THRESHOLD=15;
export const ACQUAINTANCE_NATURAL_THRESHOLDS={fast:{engagementScore:10,genuineTurns:7,familiarity:11},balanced:{engagementScore:12,genuineTurns:9,familiarity:12},slow:{engagementScore:15,genuineTurns:12,familiarity:14}} as const;
export const defaultRelationship:RelationshipState={stage:'stranger',trust:8,comfort:6,attraction:8,affinity:8,familiarity:0,respect:10,conflict:0,romantic_interest:0,commitment:0,conversationCount:0,conversationSessionCount:0,meaningfulInteractionCount:0,engagementScore:0,genuineBackAndForthTurns:0,trivialEngagementScore:0,chemistryHeat:0,physicalTension:0,userFlirtSignals:0,characterFlirtSignals:0,mutualFlirtSignals:0,attractionAcknowledged:false,activeMajorConflict:false,romanceEnabled:true,romancePathStatus:'open'};
const maxDelta:Record<RelationshipChangeSource,number>={ordinary_chat:2,meaningful_disclosure:4,date:8,life_event:3,introduction:3,debug:100};
const qualityLimit:Record<InteractionQuality,number>={trivial:0,normal:1,meaningful:4,shared_experience:8,major_relationship_event:10};

export function clampMetric(value:number):number{return Math.max(0,Math.min(100,Math.round(value)));}
export function applyRelationshipProposal(state:RelationshipState,proposal:Partial<RelationshipMetrics>,source:RelationshipChangeSource):RelationshipState{return applyBoundedChanges(state,proposal,maxDelta[source]);}
export function applyInteractionProposal(state:RelationshipState,proposal:Partial<RelationshipMetrics>,quality:InteractionQuality,options:{recentLowSignalTurns?:number;romanceEnabled?:boolean;romanticSignal?:boolean}={}):RelationshipState{
  const romanceEnabled=options.romanceEnabled??state.romanceEnabled!==false;
  const repetitionMultiplier=quality==='trivial'?0:(options.recentLowSignalTurns??0)>=8?.1:(options.recentLowSignalTurns??0)>=4?.5:1;
  const sanitized={...proposal};
  if(!options.romanticSignal){delete sanitized.attraction;delete sanitized.romantic_interest;delete sanitized.commitment;}
  if(!romanceEnabled){sanitized.attraction=Math.min(0,Number(sanitized.attraction??0));sanitized.romantic_interest=Math.min(0,Number(sanitized.romantic_interest??0));sanitized.commitment=Math.min(0,Number(sanitized.commitment??0));}
  return applyBoundedChanges(state,Object.fromEntries(Object.entries(sanitized).map(([key,value])=>[key,Number(value)*repetitionMultiplier])),qualityLimit[quality]);
}
function applyBoundedChanges(state:RelationshipState,proposal:Partial<RelationshipMetrics>,limit:number):RelationshipState{const next={...state};for(const metric of relationshipMetricNames){const requested=Number(proposal[metric]??0);const delta=Math.max(-limit,Math.min(limit,Number.isFinite(requested)?requested:0));next[metric]=clampMetric(state[metric]+delta);}return next;}

const trivialAcknowledgment=/^(?:hey|hi|hello|lol|lmao|cool|yeah|yea|yep|nope|sure|k|ok|okay|nice|haha|sup|what'?s up|hola|sí|si|claro|vale|jaja|salut|bonjour|oui|d['’]accord|mdr|ciao|sì|certo|va bene|hallo|ja|klar|olá|ola|oi|sim|tá|ta|はい|うん|そう|了解|笑|네|응|그래|알겠어|ㅋㅋ|是|好|嗯|好的|哈哈)[!?.。！？，¿¡\s]*$/iu;
const relationshipDisclosure=/\b(i feel|i'm scared|i am scared|i need to tell you|i've never told|i am worried|i'm worried|thank you for|i was wrong|i'm sorry|i don't usually tell|rough breakup|make this easy to talk|nervous about|afraid that|i love you|i really like you)\b/i;
const question=/[?？¿]|\b(?:who|what|when|where|why|how|which|would|could|do you|are you|did you|will you|have you|tell me|quién|qué|cuándo|dónde|por qué|cómo|qui|quoi|quand|où|pourquoi|comment|chi|cosa|quando|dove|perché|come|wer|was|wann|wo|warum|wie|quem|o que|quando|onde|por que|como)\b|(?:誰|何|いつ|どこ|なぜ|どう|누구|뭐|언제|어디|왜|어떻게|谁|什么|什么时候|哪里|为什么|怎么)/iu;

export function scoreConversationEngagement(input:ConversationEngagementInput):ConversationEngagementEvaluation{
  const text=input.message.trim();const lower=text.toLowerCase();const recent=input.recentUserMessages??[];
  if(input.majorEvent)return{quality:'major_relationship_event',score:4,trivialScore:0,genuineTurn:true,directlyResponsive:true,newInformation:true,relationshipSignificant:true,reasonCodes:['major_event']};
  if(input.sharedExperience)return{quality:'shared_experience',score:3,trivialScore:0,genuineTurn:true,directlyResponsive:true,newInformation:true,relationshipSignificant:true,reasonCodes:['shared_experience']};
  const preceding=String(input.precedingAssistantMessage??'').trim();const precedingQuestion=question.test(preceding);
  const repeated=recent.filter((item)=>normalizeEngagementText(item)===normalizeEngagementText(text)).length;
  const trivial=trivialAcknowledgment.test(text);const contextualYesNo=trivial&&precedingQuestion&&/^(?:yeah|yea|yep|nope|sure|ok|okay|sí|si|no|claro|vale|oui|non|d['’]accord|sì|certo|ja|nein|klar|sim|não|nao|はい|いいえ|うん|네|아니|응|是|不是|好|嗯)[!?.。！？，¿¡\s]*$/iu.test(text);
  const tokens=lower.match(/[\p{L}\p{N}']+/gu)??[];const newInformation=!trivial&&tokens.some((token)=>[...token].length>2&&!['probably','maybe','really','just','think','guess'].includes(token));
  const flirtSignal=detectFlirtSignal(lower);const significant=Boolean(input.relationshipSignificant||input.repair||relationshipDisclosure.test(lower)||['affectionate','attraction'].includes(flirtSignal.kind));
  if(significant)return{quality:'meaningful',score:2,trivialScore:0,genuineTurn:true,directlyResponsive:precedingQuestion,newInformation:true,relationshipSignificant:true,reasonCodes:[input.repair?'repair':'personal_depth']};
  if(trivial&&!contextualYesNo){const score=repeated===0?.28:repeated===1?.14:repeated===2?.06:0;return{quality:'trivial',score,trivialScore:score,genuineTurn:false,directlyResponsive:false,newInformation:false,relationshipSignificant:false,reasonCodes:[repeated?'repeated_acknowledgment':'generic_acknowledgment']};}
  if(contextualYesNo){const score=repeated>=2?.45:.72;return{quality:'normal',score,trivialScore:0,genuineTurn:true,directlyResponsive:true,newInformation:false,relationshipSignificant:false,reasonCodes:['contextual_short_answer']};}
  if(precedingQuestion&&newInformation){const score=text.length<40?1:1.15;return{quality:'normal',score,trivialScore:0,genuineTurn:true,directlyResponsive:true,newInformation:true,relationshipSignificant:false,reasonCodes:['direct_answer','new_information']};}
  if(input.memoryWorthy)return{quality:'normal',score:1,trivialScore:0,genuineTurn:true,directlyResponsive:precedingQuestion,newInformation:true,relationshipSignificant:false,reasonCodes:['ordinary_personal_fact']};
  return{quality:'normal',score:newInformation?1:.7,trivialScore:0,genuineTurn:true,directlyResponsive:precedingQuestion,newInformation,relationshipSignificant:false,reasonCodes:[newInformation?'conversation_contribution':'responsive_contribution']};
}

export function applyConversationEngagement(state:RelationshipState,evaluation:ConversationEngagementEvaluation):RelationshipState{
  const priorTrivial=Math.max(0,Number(state.trivialEngagementScore??0));
  const acceptedTrivial=Math.min(evaluation.trivialScore,Math.max(0,TRIVIAL_ENGAGEMENT_CAP-priorTrivial));
  const contribution=evaluation.trivialScore>0?acceptedTrivial:evaluation.score;
  return{...state,engagementScore:round2(Math.max(0,Number(state.engagementScore??0))+contribution),trivialEngagementScore:round2(Math.min(TRIVIAL_ENGAGEMENT_CAP,priorTrivial+acceptedTrivial)),genuineBackAndForthTurns:Math.max(0,Number(state.genuineBackAndForthTurns??0))+(evaluation.genuineTurn?1:0)};
}

/**
 * The model may add nuance to post-turn relationship analysis, but it must not
 * erase the deterministic progress earned by a genuine, non-negative exchange.
 * Explicitly negative trust/conflict proposals remain authoritative so a fight,
 * deception, boundary violation, or other trust event can still move backward.
 */
export function mergeRelationshipAnalysisChanges(input:{deterministic:Record<string,number>;analyzed:Record<string,number>}):Record<string,number>{
  const base=input.deterministic,analyzed=input.analyzed;
  if(Number(base['conflict']??0)!==0)return{...base};
  const negativeTrustEvent=Number(base['trust']??0)<0||Number(base['conflict']??0)>0||Number(analyzed['trust']??0)<0||Number(analyzed['conflict']??0)>0;
  if(negativeTrustEvent)return{...analyzed};
  return{...analyzed,trust:Math.max(0,Number(base['trust']??0),Number(analyzed['trust']??0)),familiarity:Math.max(0,Number(base['familiarity']??0),Number(analyzed['familiarity']??0))};
}

export function strangerEngagementEligibility(state:{engagementScore?:number;genuineBackAndForthTurns?:number}):{eligible:boolean;blockers:string[]}{const blockers:string[]=[];if(Number(state.engagementScore??0)<STRANGER_ENGAGEMENT_THRESHOLD)blockers.push('needs_more_engagement');if(Number(state.genuineBackAndForthTurns??0)<STRANGER_GENUINE_TURN_THRESHOLD)blockers.push('needs_more_reciprocal_turns');return{eligible:!blockers.length,blockers};}

export function classifyInteractionQuality(message:string,signals:{hasMemory?:boolean;hasOpenThread?:boolean;repair?:boolean;sharedExperience?:boolean;majorEvent?:boolean;precedingAssistantMessage?:string;recentUserMessages?:string[];relationshipSignificant?:boolean}={}):InteractionQuality{return scoreConversationEngagement({message,...(signals.precedingAssistantMessage!==undefined?{precedingAssistantMessage:signals.precedingAssistantMessage}:{}),...(signals.recentUserMessages!==undefined?{recentUserMessages:signals.recentUserMessages}:{}),...(signals.hasMemory!==undefined||signals.hasOpenThread!==undefined?{memoryWorthy:Boolean(signals.hasMemory||signals.hasOpenThread)}:{}),...(signals.relationshipSignificant!==undefined?{relationshipSignificant:signals.relationshipSignificant}:{}),...(signals.repair!==undefined?{repair:signals.repair}:{}),...(signals.sharedExperience!==undefined?{sharedExperience:signals.sharedExperience}:{}),...(signals.majorEvent!==undefined?{majorEvent:signals.majorEvent}:{})}).quality;}

export function detectFlirtSignal(text:string):ChemistrySignal{
  const value=text.trim().toLowerCase();if(!value)return{strength:0,kind:'none',reasonCodes:[]};
  if(/(?:\b(?:just friends|stay friends|not interested|stop flirting|don't flirt|do not flirt|no romance|solo amigos|seamos amigos|no me interesa|deja de coquetear|juste amis|restons amis|pas intéressé|arrête de flirter|solo amici|restiamo amici|non mi interessa|smetti di flirtare|nur freunde|bleiben wir freunde|nicht interessiert|hör auf zu flirten|só amigos|vamos ser amigos|não tenho interesse|pare de flertar)\b|友達のまま|恋愛は無理|口説くのはやめ|친구로만|관심 없어|플러팅 그만|只做朋友|没兴趣|别调情)/u.test(value))return{strength:1,kind:'rejection',reasonCodes:['explicit_rejection']};
  if(/(?:\b(?:i(?: am|'m) (?:really )?(?:attracted to|into) you|i want to kiss you|kiss me|you turn me on|more than friends|i have a crush on you|me atraes|me gustas mucho|quiero besarte|bésame|me excitas|más que amigos|je suis attiré par toi|tu me plais beaucoup|je veux t['’]embrasser|embrasse-moi|tu m['’]excites|plus que des amis|sono attratt[oa] da te|mi piaci molto|voglio baciarti|baciami|mi ecciti|più che amici|ich fühle mich zu dir hingezogen|ich steh auf dich|ich will dich küssen|küss mich|du machst mich an|mehr als freunde|me sinto atraíd[oa] por você|gosto muito de você|quero te beijar|me beija|você me excita|mais que amigos)\b|あなたに惹かれてる|キスしたい|キスして|友達以上|너한테 끌려|키스하고 싶어|키스해 줘|친구 이상|被你吸引|想吻你|吻我|不只是朋友)/u.test(value))return{strength:.95,kind:'attraction',reasonCodes:['direct_attraction']};
  if(/(?:\b(?:i love you|i really like you|te amo|te quiero mucho|je t['’]aime|je t['’]adore|ti amo|mi piaci davvero|ich liebe dich|ich mag dich wirklich|eu te amo|gosto muito de você)\b|愛してる|大好き|사랑해|정말 좋아해|我爱你|真的很喜欢你)/u.test(value))return{strength:.85,kind:'affectionate',reasonCodes:['direct_affection']};
  if(/(?:\b(?:are you single|would you date me|go on a date|take you out|date with me|estás solter[oa]|saldrías conmigo|tener una cita|es-tu célibataire|sortirais-tu avec moi|un rendez-vous|sei single|usciresti con me|un appuntamento|bist du single|würdest du mit mir ausgehen|ein date|você está solteir[oa]|sairia comigo|um encontro)\b|付き合って|デートしよう|싱글이야|데이트할래|你单身吗|和我约会)/u.test(value))return{strength:.8,kind:'date',reasonCodes:['romantic_interest']};
  if(/(?:\b(?:beautiful|gorgeous|stunning|sexy|handsome|hot|attractive|hermos[oa]|guap[oa]|bell[oa]|sexy|magnifique|beau|belle|séduisant|séduisante|bell[oa]|attraente|wunderschön|hübsch|attraktiv|lind[oa]|bonit[oa])\b|綺麗|きれい|かっこいい|セクシー|예뻐|잘생겼|섹시|漂亮|帅|性感)/u.test(value))return{strength:.65,kind:'compliment',reasonCodes:['appearance_compliment']};
  if(/(?:\b(?:flirt|kiss|cuddle|hold your hand|miss you|thinking about you|coquetear|beso|abrazar|te extraño|pienso en ti|flirter|baiser|câlin|tu me manques|je pense à toi|flirtare|bacio|coccole|mi manchi|penso a te|flirten|kuss|kuscheln|vermisse dich|denke an dich|flertar|beijo|abraçar|saudade de você|pensando em você)\b|キス|抱きしめ|会いたい|君のことを考え|키스|안아|보고 싶어|네 생각|亲吻|拥抱|想你|想着你)/u.test(value))return{strength:.55,kind:'affectionate',reasonCodes:['affectionate_language']};
  if(/\b(bet you can't|prove it|make me|dangerous|trouble|tempting)\b/.test(value)&&/\b(you|we|us)\b/.test(value))return{strength:.4,kind:'teasing',reasonCodes:['charged_teasing']};
  return{strength:0,kind:'none',reasonCodes:[]};
}

export function chemistryBand(heat:number):ChemistryBand{return heat>=80?'electric':heat>=58?'strong':heat>=30?'flirty':heat>=10?'little':'none';}
export function spiceChemistryMultiplier(level:SpiceLevel):number{return level===1?.6:level===3?1.8:1;}
export function deriveFlirtExpressionStyle(personality:Record<string,unknown>={}):FlirtExpressionStyle{const score=(key:string)=>Number(personality[key]??0);if(score('playfulness')>=.65||score('humor')>=.7)return'playful';if(score('competitiveness')>=.65)return'competitive';if(score('directness')>=.68)return'direct';if(score('spontaneity')>=.72||score('adventurousness')>=.68)return'adventurous';if(score('warmth')>=.65)return'warm';return'subtle';}
export function canInitiateFlirt(input:{state:RelationshipState;spiceLevel:SpiceLevel;personality?:Record<string,unknown>;contextFit?:number}):boolean{if(input.state.romanceEnabled===false||input.state.romancePathStatus==='friends_only'||input.state.activeMajorConflict)return false;const heat=Number(input.state.chemistryHeat??0),context=Math.max(0,Math.min(1,input.contextFit??.5)),initiative=Number(input.personality?.['initiative']??input.personality?.['directness']??.5);if(input.spiceLevel===3)return context>=.45&&(heat>=8||initiative>=.65);if(input.spiceLevel===2)return context>=.55&&(heat>=22||['friend','flirting','dating','exclusive','long_term'].includes(input.state.stage));return context>=.65&&heat>=38&&Number(input.state.trust)>=18&&!['stranger'].includes(input.state.stage);}
export function classifyChemistryResponseIntent(input:{message:string;state:RelationshipState;spiceLevel:SpiceLevel;personality?:Record<string,unknown>;contextFit?:number}):'flirty'|'playful'|undefined{const signal=detectFlirtSignal(input.message);if(signal.kind==='rejection'||input.state.romanceEnabled===false||input.state.romancePathStatus==='friends_only')return undefined;if(signal.strength>=.35)return'flirty';const playful=/(?:\b(?:lol|haha|jaja|mdr|ahaha|bet|dare|prove it|trouble|tease|competitive)\b|笑|ふふ|ㅋㅋ|ㅎㅎ|哈哈|嘿嘿)/iu.test(input.message);if(playful&&canInitiateFlirt(input))return input.spiceLevel===3&&Number(input.state.chemistryHeat??0)>=8?'flirty':'playful';return undefined;}
export function updateChemistry(input:ChemistryUpdateInput):ChemistryUpdate{
  const now=input.now??new Date(),state=input.state,romanceActive=state.romanceEnabled!==false&&state.romancePathStatus!=='friends_only';const prior=Math.max(0,Math.min(100,Number(state.chemistryHeat??0)));
  const last=state.lastChemistryChangeAt?new Date(state.lastChemistryChangeAt):null;const elapsedDays=last&&Number.isFinite(last.getTime())?Math.max(0,(now.getTime()-last.getTime())/86400000):0;const cooled=Math.max(0,prior-Math.min(12,elapsedDays*.65));
  const user=input.userSignal,character=input.characterSignal,mutual=user.kind==='rejection'?0:Math.min(user.strength,character.strength);let delta=0;const reasons:string[]=[];
  if(!romanceActive){delta=-Math.max(2,cooled*.35);reasons.push('romance_suppressed');}
  else if(user.kind==='rejection'){delta=-Math.max(8,cooled*.45);reasons.push('interest_rejected');}
  else{const context=Math.max(0,Math.min(1,input.contextFit??.65));delta=(user.strength*2.5+mutual*4.5+Math.max(0,character.strength-user.strength)*.8)*spiceChemistryMultiplier(input.spiceLevel)*context;if(user.strength===0&&character.strength>.25){delta=-Math.min(2,cooled*.08);reasons.push('not_reciprocated');}else if(mutual>.2)reasons.push('mutual_flirtation');else if(user.strength>.2)reasons.push('user_interest');}
  if(Number(state.conflict)>45)delta-=3;const heat=round2(Math.max(0,Math.min(100,cooled+delta)));const tension=round2(Math.max(0,Math.min(100,Number(state.physicalTension??0)+(mutual*5*spiceChemistryMultiplier(input.spiceLevel))+(delta<0?delta*.5:0))));const signalAt=user.strength>.2||character.strength>.2?now.toISOString():state.lastFlirtSignalAt;
  const nextState={...state,chemistryHeat:heat};return{chemistryHeat:heat,physicalTension:tension,userFlirtSignals:Number(state.userFlirtSignals??0)+(user.strength>=.35?1:0),characterFlirtSignals:Number(state.characterFlirtSignals??0)+(character.strength>=.35?1:0),mutualFlirtSignals:Number(state.mutualFlirtSignals??0)+(mutual>=.3?1:0),attractionAcknowledged:Boolean(state.attractionAcknowledged)||(heat>=45&&Math.max(user.strength,character.strength)>=.65),...(Math.abs(heat-prior)>=.01?{lastChemistryChangeAt:now.toISOString()}:state.lastChemistryChangeAt?{lastChemistryChangeAt:state.lastChemistryChangeAt}:{}),...(signalAt?{lastFlirtSignalAt:signalAt}:{}),heatDelta:round2(heat-prior),canInitiateFlirt:canInitiateFlirt({state:nextState,spiceLevel:input.spiceLevel,...(input.personality?{personality:input.personality}:{}),...(input.contextFit!==undefined?{contextFit:input.contextFit}:{})}),expressionStyle:deriveFlirtExpressionStyle(input.personality),band:chemistryBand(heat),reasonCodes:reasons};
}

export function recordConversation(state:RelationshipState):RelationshipState{return{...state,conversationCount:state.conversationCount+1};}
export function canTransitionStage(from:RelationshipStage,to:RelationshipStage):boolean{return relationshipStages.indexOf(to)-relationshipStages.indexOf(from)===1;}
export function transitionStage(state:RelationshipState,to:RelationshipStage):RelationshipState{if(!canTransitionStage(state.stage,to))throw new Error(`Invalid relationship transition: ${state.stage} -> ${to}`);return{...state,stage:to};}

function progressionCount(state:RelationshipState):number{return state.meaningfulInteractionCount??state.conversationCount;}
export function firstDateEligibility(state:RelationshipState):{eligible:boolean;reasons:string[]}{const reasons:string[]=[];if(state.romanceEnabled===false)reasons.push('romance_disabled');if(state.romancePathStatus==='friends_only')reasons.push('friends_only');if(state.familiarity<28)reasons.push('needs_more_familiarity');if(state.trust<24)reasons.push('needs_more_trust');if(state.attraction<22)reasons.push('needs_more_attraction');if(progressionCount(state)<5)reasons.push('needs_more_meaningful_interactions');if((state.conversationSessionCount??1)<1)reasons.push('needs_more_conversation_sessions');if(state.activeMajorConflict||state.conflict>45)reasons.push('active_conflict');if(!['friend','flirting'].includes(state.stage))reasons.push('stage_not_ready');return{eligible:reasons.length===0,reasons};}
export function describeRelationship(state:RelationshipState):string{if(state.activeMajorConflict||state.conflict>45)return'Things feel a little tense right now.';if(['dating','exclusive','long_term'].includes(state.stage))return'You two have gotten noticeably closer.';if(state.trust>=35||state.comfort>=35)return'They are starting to open up to you.';if(state.stage==='friend'||state.stage==='flirting')return'There is an easy warmth between you.';return'You are still getting to know each other.';}

// Compatibility selector used by older surfaces. Database progression is guarded by Relationship Engine V2.
export function nextRelationshipMilestone(state:RelationshipState):RelationshipMilestoneProposal|null{
  const count=progressionCount(state);
  if(state.activeMajorConflict||state.conflict>45)return{kind:'repair',fromStage:state.stage,tone:'honest',presentationKey:'relationship.repair'};
  if(state.stage==='stranger'&&strangerEngagementEligibility(state).eligible)return{kind:'keep_in_touch',fromStage:'stranger',toStage:'acquaintance',tone:'warm_slightly_vulnerable',presentationKey:'relationship.keep_in_touch'};
  if(state.stage==='acquaintance'&&acquaintanceFriendshipEligibility({state,evidence:{progressionInteractions:count,distinctActiveDays:0,engagementScore:Number(state.engagementScore??0),genuineBackAndForthTurns:Number(state.genuineBackAndForthTurns??0)},pace:'balanced',compatibilityMode:true}).eligible)return{kind:'friendship_deepened',fromStage:'acquaintance',toStage:'friend',tone:'warm',presentationKey:'relationship.friendship_deepened'};
  if(state.romanceEnabled!==false&&state.romancePathStatus!=='friends_only'&&state.stage==='friend'&&count>=8&&state.attraction>=18&&state.comfort>=18)return{kind:'romantic_spark',fromStage:'friend',toStage:'flirting',tone:'playful_open',presentationKey:'relationship.romantic_spark'};
  if(firstDateEligibility(state).eligible)return{kind:'first_date_invitation',fromStage:state.stage,tone:'inviting',presentationKey:'relationship.first_date_invitation'};
  return null;
}

export function acquaintanceFriendshipEligibility(input:{state:Pick<RelationshipState,'trust'|'familiarity'|'engagementScore'|'genuineBackAndForthTurns'>;evidence:Pick<RelationshipEvidenceSummary,'progressionInteractions'|'distinctActiveDays'> & Partial<Pick<RelationshipEvidenceSummary,'engagementScore'|'genuineBackAndForthTurns'>>;pace?:'slow'|'balanced'|'fast';compatibilityMode?:boolean}):{eligible:boolean;path:'natural_conversation'|'shared_history'|null;blockers:string[]}{
  const pace=input.pace??'balanced',thresholds=ACQUAINTANCE_NATURAL_THRESHOLDS[pace],friendshipDays=pace==='fast'?1:pace==='slow'?3:2;
  const engagement=Number(input.evidence.engagementScore??input.state.engagementScore??0),genuineTurns=Number(input.evidence.genuineBackAndForthTurns??input.state.genuineBackAndForthTurns??0);
  const naturalConversation=input.state.familiarity>=thresholds.familiarity&&engagement>=thresholds.engagementScore&&genuineTurns>=thresholds.genuineTurns;
  const historyInteractions=input.compatibilityMode?5:3;
  const sharedHistory=input.state.familiarity>=ACQUAINTANCE_HISTORY_FAMILIARITY_THRESHOLD&&input.evidence.progressionInteractions>=historyInteractions&&(input.compatibilityMode||input.evidence.distinctActiveDays>=friendshipDays);
  const blockers:string[]=[];
  if(input.state.trust<ACQUAINTANCE_TRUST_THRESHOLD)blockers.push('needs_more_trust');
  if(!naturalConversation&&!sharedHistory){
    if(input.state.familiarity<Math.min(thresholds.familiarity,ACQUAINTANCE_HISTORY_FAMILIARITY_THRESHOLD))blockers.push('needs_more_familiarity');
    if(engagement<thresholds.engagementScore||genuineTurns<thresholds.genuineTurns)blockers.push('needs_more_reciprocal_turns');
    if(input.evidence.progressionInteractions<historyInteractions)blockers.push('needs_more_shared_history');
    if(!input.compatibilityMode&&input.evidence.distinctActiveDays<friendshipDays)blockers.push('needs_more_time');
  }
  const path=naturalConversation?'natural_conversation':sharedHistory?'shared_history':null;
  return{eligible:blockers.length===0&&path!==null,path,blockers};
}

export function relationshipHealth(state:RelationshipState,unresolvedMisses=0):RelationshipHealth{
  if(state.activeMajorConflict||state.conflict>45||unresolvedMisses>0)return'strained';
  if(state.conflict>25||state.trust<25||state.respect<25)return'uncertain';
  if(state.trust>=60&&state.comfort>=55&&state.respect>=50&&state.conflict<20)return'close';
  if(state.trust>=35&&state.comfort>=30&&state.conflict<30)return'warm';
  return'steady';
}

export function relationshipMilestonePresentationReady(kind:RelationshipMilestoneProposal['kind'],state:RelationshipState,context:RelationshipPresentationContext={}):{ready:boolean;blockers:string[]}{
  const blockers:string[]=[];const activity=String(context.activity??'').toLowerCase(),mood=String(context.mood??'').toLowerCase();
  if(context.activeCommitment)blockers.push('active_commitment');
  if(context.waitingOnMissResolution&&kind!=='repair')blockers.push('unresolved_missed_commitment');
  if(context.availability==='busy'||/\b(sleep|working|client|meeting|commut|driving|running late|waiting for you|getting ready)\b/.test(activity))blockers.push('companion_busy');
  if(kind!=='repair'&&context.energy==='low'&&/\b(stress|upset|angry|overwhelmed|exhaust|tired)\b/.test(mood))blockers.push('poor_moment');
  const now=context.now??new Date(),last=state.lastMajorMilestoneAt?new Date(state.lastMajorMilestoneAt):null;if(last&&!Number.isNaN(last.getTime())&&now.getTime()-last.getTime()<6*3600000)blockers.push('milestone_cooldown');
  return{ready:blockers.length===0,blockers};
}

export function evaluateRelationshipProgression(input:{state:RelationshipState;evidence:RelationshipEvidenceSummary;pacing?:RelationshipPacingConfig;presentation?:RelationshipPresentationContext}):RelationshipProgressionEvaluation{
  const{state,evidence}=input,pacing=input.pacing??{},health=relationshipHealth(state,evidence.unresolvedMisses),pace=pacing.pace??'balanced';
  const exclusiveDays=pace==='fast'?2:pace==='slow'?5:3,longTermDays=pace==='fast'?5:pace==='slow'?10:7;
  const romanceTrust=Math.round(14+((pacing.needsTrustBeforeRomance??.5)-.5)*8),romanceComfort=Math.round(18+((pacing.needsTrustBeforeRomance??.5)-.5)*6);
  const exclusiveCommitment=Math.round(28+((pacing.needsComfortBeforeCommitment??.5)-.5)*8-((pacing.exclusivityPreference??.5)-.5)*6);
  const longTermCommitment=Math.round(50+((pacing.needsComfortBeforeCommitment??.5)-.5)*8-((pacing.longTermOrientation??.5)-.5)*8);
  const daysSinceDating=elapsedDays(state.datingStartedAt,input.presentation?.now),daysSinceExclusive=elapsedDays(state.exclusiveAt,input.presentation?.now);
  let proposal:RelationshipMilestoneProposal|null=null;const blockers:string[]=[];
  if(state.activeMajorConflict||state.conflict>45)proposal={kind:'repair',fromStage:state.stage,tone:'honest',presentationKey:'relationship.repair'};
  else if(state.stage==='stranger'){
    const engagement=strangerEngagementEligibility({engagementScore:Number(evidence.engagementScore??state.engagementScore??0),genuineBackAndForthTurns:Number(evidence.genuineBackAndForthTurns??state.genuineBackAndForthTurns??0)});blockers.push(...engagement.blockers);if(!blockers.length)proposal={kind:'keep_in_touch',fromStage:'stranger',toStage:'acquaintance',tone:'warm_slightly_vulnerable',presentationKey:'relationship.keep_in_touch'};
  }else if(state.stage==='acquaintance'){
    const friendship=acquaintanceFriendshipEligibility({state,evidence,pace});blockers.push(...friendship.blockers);
    if(!blockers.length)proposal={kind:'friendship_deepened',fromStage:'acquaintance',toStage:'friend',tone:'warm',presentationKey:'relationship.friendship_deepened'};
  }else if(state.stage==='friend'){
    if(state.romanceEnabled===false||state.romancePathStatus==='friends_only')return{stage:state.stage,health,nextMilestone:null};
    if(state.trust<romanceTrust)blockers.push('needs_more_trust');if(state.attraction<18)blockers.push('needs_more_attraction');if(state.comfort<romanceComfort)blockers.push('needs_more_comfort');if(evidence.romanticSignals<2&&evidence.positiveDates<1)blockers.push('needs_mutual_romantic_signal');
    if(!blockers.length)proposal={kind:'romantic_spark',fromStage:'friend',toStage:'flirting',tone:'playful_open',presentationKey:'relationship.romantic_spark'};
  }else if(state.stage==='flirting'){
    if(state.romanceEnabled===false||state.romancePathStatus==='friends_only')return{stage:state.stage,health,nextMilestone:null};
    if(evidence.definingDateCompleted&&evidence.definingDatePositive)proposal={kind:'dating_start',fromStage:'flirting',toStage:'dating',tone:'warm_direct',presentationKey:'relationship.dating_start'};
    else if(!state.relationshipDefiningDateSessionId){if(state.familiarity<28)blockers.push('needs_more_familiarity');if(state.trust<24)blockers.push('needs_more_trust');if(state.attraction<22)blockers.push('needs_more_attraction');if(evidence.progressionInteractions<5)blockers.push('needs_more_shared_history');if(!blockers.length)proposal={kind:'first_date_invitation',fromStage:'flirting',tone:'inviting',presentationKey:'relationship.first_date_invitation'};}
  }else if(state.stage==='dating'){
    if(state.trust<42)blockers.push('needs_more_trust');if(state.comfort<40)blockers.push('needs_more_comfort');if(state.romantic_interest<40)blockers.push('needs_more_romantic_interest');if(state.commitment<exclusiveCommitment)blockers.push('needs_more_commitment');if(state.respect<35)blockers.push('needs_more_respect');if(state.conflict>35||state.activeMajorConflict)blockers.push('active_conflict');if(evidence.unresolvedMisses>0)blockers.push('unresolved_missed_commitment');if(daysSinceDating<exclusiveDays)blockers.push('needs_more_time');if(evidence.sharedExperiencesAfterStage<2)blockers.push('needs_more_shared_experiences');
    if(!blockers.length)proposal={kind:'exclusivity',fromStage:'dating',toStage:'exclusive',tone:'intentional',presentationKey:'relationship.exclusivity'};
  }else if(state.stage==='exclusive'){
    if(state.trust<58)blockers.push('needs_more_trust');if(state.comfort<55)blockers.push('needs_more_comfort');if(state.respect<50)blockers.push('needs_more_respect');if(state.commitment<longTermCommitment)blockers.push('needs_more_commitment');if(state.conflict>30||state.activeMajorConflict)blockers.push('active_conflict');if(evidence.unresolvedMisses>0)blockers.push('unresolved_missed_commitment');if(daysSinceExclusive<longTermDays)blockers.push('needs_more_time');if(evidence.sharedExperiencesAfterStage<3)blockers.push('needs_more_shared_experiences');if(evidence.futurePlanningAfterStage<1)blockers.push('needs_future_planning');if(state.majorConflictStartedAt&&evidence.repairsAfterMajorConflict<1)blockers.push('needs_conflict_repair');
    if(!blockers.length)proposal={kind:'long_term',fromStage:'exclusive',toStage:'long_term',tone:'deeply_committed',presentationKey:'relationship.long_term'};
  }
  if(!proposal)return{stage:state.stage,health,nextMilestone:null};
  const presentation=relationshipMilestonePresentationReady(proposal.kind,state,{...input.presentation,waitingOnMissResolution:evidence.unresolvedMisses>0});
  return{stage:state.stage,health,nextMilestone:{kind:proposal.kind,eligible:true,presentationReady:presentation.ready,blockers:presentation.blockers,proposal}};
}

function elapsedDays(value?:string,now=new Date()):number{if(!value)return 0;const date=new Date(value);if(Number.isNaN(date.getTime()))return 0;return Math.max(0,(now.getTime()-date.getTime())/86400000);}
function normalizeEngagementText(value:string):string{return value.toLowerCase().replace(/[^a-z0-9']+/g,' ').trim();}
function round2(value:number):number{return Math.round(value*100)/100;}

export function relationshipCue(state:RelationshipState):{label:string;detail:string;tone:'warm'|'spark'|'tense'|'steady'}{if(state.activeMajorConflict||state.conflict>45)return{label:'A little distance',detail:'Something feels unresolved. An honest conversation could help.',tone:'tense'};if(state.stage==='long_term')return{label:'Deeply connected',detail:'You have built a steady shared history together.',tone:'warm'};if(state.stage==='exclusive')return{label:'Choosing each other',detail:'This relationship feels intentional and secure.',tone:'warm'};if(state.stage==='dating')return{label:'Growing closer',detail:'Shared experiences are turning into something meaningful.',tone:'warm'};if(state.stage==='flirting')return{label:'There\u2019s a spark',detail:'The relationship now has a recognized playful romantic direction.',tone:'spark'};if(state.stage==='friend')return{label:'Easy closeness',detail:'Trust is growing and they are opening up naturally.',tone:'warm'};const heat=Number(state.chemistryHeat??0);if(heat>=80)return{label:'Electric chemistry',detail:'The attraction is hard to miss, even though your shared history is still developing.',tone:'spark'};if(heat>=58)return{label:'Strong chemistry',detail:'There is clear tension here without any assumption of commitment.',tone:'spark'};if(heat>=30)return{label:'Flirty energy',detail:'Getting to know each other has picked up a playful edge.',tone:'spark'};if(heat>=10)return{label:'A little chemistry',detail:'There is a hint of attraction beneath the conversation.',tone:'spark'};if(state.stage==='acquaintance')return{label:'Getting acquainted',detail:'You are beginning to understand each other.',tone:'steady'};return{label:'A first impression',detail:'Your shared story is just beginning.',tone:'steady'};}
