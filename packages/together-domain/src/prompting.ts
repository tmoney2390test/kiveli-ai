export type PromptInteractionQuality='trivial'|'normal'|'meaningful'|'shared_experience'|'major_relationship_event';
export type DirectorPolicy='major_only'|'meaningful'|'normal_and_up';
export type RelationshipStance={
  stage:string;
  summary:string;
  affectionBoundary:string;
  vulnerabilityPosture:string;
  conflictPosture:string;
  autonomyRule:string;
};
export type CharacterGoals={currentGoal:string;currentConcern:string;mediumTermAmbition:string;source:'story'|'bible'|'relationship'|'life'};
export type ResponseBrief={
  mode:'casual'|'playful'|'supportive'|'vulnerable'|'conflicted'|'repair'|'practical'|'storytelling'|'affectionate';
  emotionalPosture:string;
  initiative:'low'|'medium'|'high';
  callbackCandidate?:string;
  selfDisclosure:'none'|'small'|'moderate';
  shouldAskQuestion:boolean;
  actionCandidate?:'none'|'plan'|'memory_followup'|'relationship'|'story';
  avoid:string[];
  autonomy:string;
};

type ReflectionLike={companionView?:string;relationshipSummary?:string;unresolvedTension?:string[];recurringDynamics?:string[];sharedReferences?:string[];emotionalExpectations?:string[]};
type RelationshipLike={stage?:string;relationship_stage?:string;trust?:number;comfort?:number;attraction?:number;affinity?:number;familiarity?:number;respect?:number;conflict?:number;romantic_interest?:number;commitment?:number;active_major_conflict?:boolean;romanceEnabled?:boolean;romance_enabled?:boolean};

export function compileRelationshipStance(relationship:RelationshipLike,reflection:ReflectionLike={}):RelationshipStance{
  const stage=String(relationship.relationship_stage??relationship.stage??'stranger');
  const trust=number(relationship.trust),comfort=number(relationship.comfort),attraction=number(relationship.attraction),conflict=number(relationship.conflict),commitment=number(relationship.commitment);
  const romanceEnabled=relationship.romance_enabled===undefined?relationship.romanceEnabled!==false:Boolean(relationship.romance_enabled);
  const tense=Boolean(relationship.active_major_conflict)||conflict>=45||Boolean(reflection.unresolvedTension?.length);
  const familiarity=number(relationship.familiarity);
  const closeness=average(trust,comfort,familiarity);
  const summary=reflection.companionView?.trim()||reflection.relationshipSummary?.trim()||stageSummary(stage,closeness,tense,romanceEnabled);
  const affectionBoundary=!romanceEnabled?'Keep affection clearly platonic. Friendship may deepen without turning romantic.':stage==='stranger'||stage==='acquaintance'?'Warmth and curiosity are appropriate; romantic certainty, possessiveness, and commitment language are premature.':stage==='friend'?'Affection may be warm and personal. Romantic escalation requires an actual romantic signal or application-controlled milestone.':stage==='flirting'?'A spark can be acknowledged through teasing, attraction, and selective vulnerability. Do not speak as if exclusivity or commitment already exists.':stage==='dating'?'Romantic affection is established, but keep commitment proportional to what has actually happened.':stage==='exclusive'||stage==='long_term'?'Established affection and shared-history callbacks are natural. Keep the character independent rather than fused with the user.':'Keep affection proportional to canonical relationship history.';
  const vulnerabilityPosture=comfort>=65&&trust>=60?'Comfortable sharing meaningful feelings when relevant, without turning every exchange into a confession.':comfort>=35&&trust>=30?'Can reveal small personal truths and uncertainty, but still protects more vulnerable parts of their life.':'Still guarded. Let trust be earned through real interactions rather than instant disclosure.';
  const conflictPosture=tense?'There is unresolved tension. Do not reset to effortless warmth. Acknowledge the strain, keep dignity, and allow repair only when the conversation earns it.':conflict>=20?'Some friction remains. The character can be warm without pretending the disagreement never happened.':'No major unresolved conflict is controlling the interaction.';
  const attractionNote=romanceEnabled&&attraction>=60&&commitment<35?' Attraction is stronger than commitment; chemistry must not be mistaken for promises.':'';
  return{stage,summary:`${summary}${attractionNote}`.trim(),affectionBoundary,vulnerabilityPosture,conflictPosture,autonomyRule:'Maintain an independent point of view. The character may disagree, decline, be busy, prefer something else, redirect, tease, or leave a question unanswered without becoming cold or punitive.'};
}

export function compileCharacterGoals(input:{occupation?:string;currentActivity?:string;bible?:Record<string,unknown>;activeStory?:{title?:string;chapterTitle?:string;knownSummary?:string}|null;reflection?:ReflectionLike;recentLifeEvents?:Array<{title?:string;summary?:string}>}):CharacterGoals{
  const bible=input.bible??{};
  const ambitions=strings(bible['ambitions']??bible['goals']);
  const concerns=strings(bible['concerns']??bible['currentConcerns']);
  const activeStory=input.activeStory;
  if(activeStory?.title){return{currentGoal:`Move through ${activeStory.title}${activeStory.chapterTitle?` (${activeStory.chapterTitle})`:''} without inventing future story outcomes.`,currentConcern:input.reflection?.unresolvedTension?.[0]??activeStory.knownSummary??'The current story is still unresolved.',mediumTermAmbition:ambitions[0]??occupationAmbition(input.occupation),source:'story'};}
  const currentGoals=strings(bible['currentGoals']);
  const currentGoal=currentGoals[0]??(input.currentActivity?`Handle the current part of the day: ${input.currentActivity}.`:occupationGoal(input.occupation));
  const currentConcern=input.reflection?.unresolvedTension?.[0]??concerns[0]??input.recentLifeEvents?.[0]?.summary??'No specific current concern is established.';
  const mediumTermAmbition=ambitions[0]??occupationAmbition(input.occupation);
  const source:CharacterGoals['source']=currentGoals.length||ambitions.length?'bible':input.reflection?.unresolvedTension?.length?'relationship':'life';
  return{currentGoal,currentConcern,mediumTermAmbition,source};
}

export function antiRepetitionGuidance(recentAssistantMessages:string[]):string[]{
  const recent=recentAssistantMessages.map((text)=>text.trim()).filter(Boolean).slice(-8);
  const avoid:string[]=[];
  const openings=recent.map((text)=>normalizePhrase(text.split(/[.!?]/)[0]??'')).filter(Boolean);
  const repeatedOpening=mostRepeated(openings);if(repeatedOpening&&count(openings,repeatedOpening)>=2)avoid.push(`Do not reuse the recent opening pattern “${short(repeatedOpening)}”.`);
  const questionEndings=recent.filter((text)=>/\?\s*$/.test(text)).length;if(questionEndings>=Math.max(3,recent.length-2))avoid.push('Do not end this reply with another question unless a question is genuinely necessary.');
  const generic=/\b(tell me more|how does that make you feel|what about you|i'm here for you|that sounds like a lot)\b/i;const genericHits=recent.filter((text)=>generic.test(text)).length;if(genericHits>=2)avoid.push('Avoid generic validation/support phrases used recently; respond to the specific substance instead.');
  const petNames=['babe','baby','love','sweetheart','handsome','beautiful'];for(const pet of petNames){const hits=recent.filter((text)=>new RegExp(`\\b${pet}\\b`,'i').test(text)).length;if(hits>=3)avoid.push(`Use “${pet}” less often; do not make it a verbal tic.`);}
  return avoid.slice(0,4);
}

export function compileResponseBrief(input:{message:string;interactionQuality:PromptInteractionQuality;relationshipStance:RelationshipStance;responseIntent?:string;openThread?:string;nextCommitment?:string;activeStory?:string;recentAssistantMessages?:string[]}):ResponseBrief{
  const lower=input.message.toLowerCase();const intent=String(input.responseIntent??'casual');const recent=input.recentAssistantMessages??[];
  const planRelevant=planCallbackRelevant(input.message,input.nextCommitment);
  const threadRelevant=callbackMentionsCandidate(input.message,input.openThread);
  const storyRelevant=storyCallbackRelevant(input.message,input.activeStory);
  const mode:ResponseBrief['mode']=/\b(sorry|apolog)/.test(lower)?'repair':/\b(hurt|angry|upset|fight|leave me alone)\b/.test(lower)?'conflicted':/\b(scared|sad|anxious|overwhelmed|terrible|rough day)\b/.test(lower)?'supportive':(planRelevant||/\b(plan|schedule|cancel|reschedule)\b/.test(lower))?'practical':storyRelevant?'storytelling':/\b(feel|honestly|afraid|personal|admit)\b/.test(lower)?'vulnerable':/\b(lol|haha|tease|joke)\b/.test(lower)||intent==='playful'?'playful':['flirty','romantic','affectionate'].includes(intent)?'affectionate':'casual';
  const meaningful=input.interactionQuality==='meaningful'||input.interactionQuality==='shared_experience'||input.interactionQuality==='major_relationship_event';
  const initiative:ResponseBrief['initiative']=input.interactionQuality==='trivial'?'low':input.interactionQuality==='major_relationship_event'||storyRelevant?'high':'medium';
  const callbackCandidate=threadRelevant?input.openThread:planRelevant?input.nextCommitment:storyRelevant?input.activeStory:undefined;
  const askQuestion=!/\?$/.test(input.message.trim())&&input.interactionQuality!=='trivial'&&(mode==='supportive'||mode==='vulnerable'||mode==='practical')&&antiRepetitionGuidance(recent).every((line)=>!line.includes('Do not end'));
  const actionCandidate:NonNullable<ResponseBrief['actionCandidate']>=mode==='practical'&&/\b(plan|schedule|cancel|reschedule)\b/.test(lower)?'plan':threadRelevant&&/\b(went|finished|done|over|happened|result|results)\b/.test(lower)?'memory_followup':input.interactionQuality==='major_relationship_event'?'relationship':storyRelevant?'story':'none';
  const conceptualAvoid:string[]=[];
  if(input.nextCommitment&&recentlyMentioned(input.nextCommitment,recent)&&!planRelevant)conceptualAvoid.push(`Do not bring up “${short(input.nextCommitment)}” again unless the user reopens that plan.`);
  if(input.openThread&&recentlyMentioned(input.openThread,recent)&&!threadRelevant)conceptualAvoid.push(`Do not repeat the recent “${short(input.openThread)}” follow-up unless the user brings it back up.`);
  if(input.activeStory&&recentlyMentioned(input.activeStory,recent)&&!storyRelevant)conceptualAvoid.push(`Keep “${short(input.activeStory)}” in the background unless the user returns to that story.`);
  const avoid=[...conceptualAvoid,...antiRepetitionGuidance(recent)].slice(0,4);
  return{mode,emotionalPosture:emotionalPosture(mode,input.relationshipStance),initiative,...(callbackCandidate?{callbackCandidate}:{}),selfDisclosure:meaningful?(input.relationshipStance.stage==='stranger'?'small':'moderate'):'none',shouldAskQuestion:askQuestion,actionCandidate,avoid,autonomy:'Contribute an independent reaction before accommodating the user. Agreement is optional; honesty and character consistency matter more than approval.'};
}

export function shouldUseDirector(policy:DirectorPolicy,quality:PromptInteractionQuality,input?:{pendingMilestone?:boolean;activeConflict?:boolean;activeStory?:boolean}):boolean{
  if(input?.pendingMilestone||input?.activeConflict)return true;
  if(policy==='normal_and_up')return quality!=='trivial';
  if(policy==='meaningful')return quality==='meaningful'||quality==='shared_experience'||quality==='major_relationship_event'||Boolean(input?.activeStory);
  return quality==='major_relationship_event';
}

function planCallbackRelevant(message:string,candidate?:string):boolean{
  if(!candidate)return false;
  if(callbackMentionsCandidate(message,candidate))return true;
  const lower=message.toLowerCase();
  const direct=/\b(still on|still good|are we still|what time (?:are|were) we|when (?:are|were) we|where (?:are|were) we|cancel(?: our| the)?|reschedule(?: our| the)?|move it|move the plan|change our plan|change the time)\b/.test(lower);
  const sharedPlan=/\b(our|we|us)\b[^.!?]{0,40}\b(plans?|schedule|meet|meeting|doing|going)\b|\b(plans?|schedule|meet|meeting)\b[^.!?]{0,40}\b(our|we|us)\b/.test(lower);
  const sharedTime=/\b(tonight|tomorrow|this weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)&&/\b(we|us|our|meet|meeting|seeing each other)\b/.test(lower);
  return direct||sharedPlan||sharedTime;
}
function storyCallbackRelevant(message:string,candidate?:string):boolean{return Boolean(candidate)&&(callbackMentionsCandidate(message,candidate)||/\b(story|chapter|what happened next|what happens next|continue (?:the |our )?story|pick up where we left off)\b/i.test(message));}
function callbackMentionsCandidate(message:string,candidate?:string):boolean{
  if(!candidate)return false;
  const haystack=normalizePhrase(message),needle=normalizePhrase(candidate);if(!haystack||!needle)return false;
  if(haystack.includes(needle))return true;
  const tokens=callbackTokens(candidate);if(!tokens.length)return false;
  const matches=tokens.filter((token)=>new RegExp(`\\b${escapeRegExp(token)}\\b`,'i').test(haystack)).length;
  return tokens.length===1?matches===1:matches>=2;
}
function recentlyMentioned(candidate:string,recentAssistantMessages:string[]):boolean{return recentAssistantMessages.slice(-4).some((message)=>callbackMentionsCandidate(message,candidate));}
function callbackTokens(value:string):string[]{const stop=new Set(['the','and','with','from','this','that','your','our','plan','plans','date','drinks','drink','coffee','dinner','movie','movies','walk','meeting','meet']);return[...new Set(normalizePhrase(value).split(' ').filter((token)=>token.length>2&&!stop.has(token)))];}
function escapeRegExp(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function stageSummary(stage:string,closeness:number,tense:boolean,romanceEnabled:boolean){if(tense)return'The relationship matters, but unresolved tension is shaping the current interaction.';if(stage==='stranger')return'They have just met. Interest should come from curiosity rather than assumed closeness.';if(stage==='acquaintance')return'They recognize each other’s rhythms, but trust and intimacy are still being established.';if(stage==='friend')return romanceEnabled?'There is real trust and familiarity. Friendship is established; any romance still needs a genuine spark.':'There is real trust and familiarity, and the bond is clearly platonic.';if(stage==='flirting')return'There is mutual chemistry and playful tension, but the relationship is not yet an established partnership.';if(stage==='dating')return'They are intentionally dating and can draw naturally on shared romantic experiences.';if(stage==='exclusive')return'They have chosen exclusivity and expect more consistency from each other while remaining independent people.';if(stage==='long_term')return'They have substantial shared history and can speak from established trust, routines, and commitment.';return closeness>60?'They are comfortable and familiar with each other.':'Keep closeness proportional to what has actually happened.';}
function emotionalPosture(mode:ResponseBrief['mode'],stance:RelationshipStance){if(mode==='repair'||mode==='conflicted')return stance.conflictPosture;if(mode==='supportive')return'Grounded and specific. Offer support without turning into a therapist or reflexively validating every interpretation.';if(mode==='vulnerable')return stance.vulnerabilityPosture;if(mode==='affectionate')return stance.affectionBoundary;return'Natural and present. Let mood, personality, and current circumstances shape the response.';}
function occupationGoal(occupation?:string){return occupation?`Continue the ordinary responsibilities of being ${article(occupation)} ${occupation}.`:'Continue the character’s established day without inventing a new major objective.';}
function occupationAmbition(occupation?:string){return occupation?`Grow meaningfully in ${occupation} over time, only through events Kivelle makes canonical.`:'Build a fuller independent life through canonical events over time.';}
function article(value:string){return/^[aeiou]/i.test(value.trim())?'an':'a';}
function strings(value:unknown):string[]{return Array.isArray(value)?value.map(String).map((item)=>item.trim()).filter(Boolean):typeof value==='string'&&value.trim()?[value.trim()]:[];}
function number(value:unknown){const parsed=Number(value??0);return Number.isFinite(parsed)?parsed:0;}
function average(...values:number[]){return values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);}
function normalizePhrase(value:string){return value.toLowerCase().replace(/[^a-z0-9' ]+/g,' ').replace(/\s+/g,' ').trim();}
function mostRepeated(values:string[]){return values.sort((a,b)=>count(values,b)-count(values,a))[0]??'';}
function count(values:string[],target:string){return values.filter((value)=>value===target).length;}
function short(value:string){return value.length>64?`${value.slice(0,61)}…`:value;}
