import type { DialogueContentMode } from './ai-routing.ts';
import { hasSexualDialogueLanguage } from './ai-routing.ts';
import { chatLanguagePromptInstruction, chatLanguageUserDraftFallback, resolveChatLanguageForText, type ChatLanguagePreference } from './chat-language.ts';

export type AutoDialogueTurn={role:string;content:string};

export const autoDialoguePreferences=['natural','shorter','detailed','romantic','assertive'] as const;
export type AutoDialoguePreference=typeof autoDialoguePreferences[number];

export const autoDialogueIntents=['answer','repair','support','celebrate','flirt','follow_up','coordinate_plan','advance_scene','close_scene','engage_group','curious'] as const;
export type AutoDialogueIntent=typeof autoDialogueIntents[number];

export type AutoDialogueInput={
  characterName:string;latestAssistantMessage:string;recent:AutoDialogueTurn[];preference?:AutoDialoguePreference;
  scene:{interactionMode:'remote'|'co_present';location:string;activity:string;mood?:string;energy?:string;availability?:string;interruptibility?:string;departurePressure?:boolean;nextObligation?:string;participantNames?:string[]};
  relationshipStage:string;
  chatLanguage?:ChatLanguagePreference;
  contentMode?:DialogueContentMode;
  intimacyOutcome?:'accepted'|'pacing_delay'|'context_limit'|'declined'|'withdrawn';
  relationship?:{romanceEnabled?:boolean;friendsOnly?:boolean;conflict?:number;chemistryHeat?:number;spiceLevel?:number;trust?:number;comfort?:number};
  userName?:string;openThread?:string;upcomingCommitment?:string;activePlan?:string;activeDate?:string;activeStory?:string;conversationFocus?:string;emotionalTone?:string;voiceHints?:string[];
};

export type AutoDialogueStyle={targetLength:'short'|'medium'|'long';usesActions:boolean;actionFrequency:'never'|'sometimes'|'often';emojiPreference:'none'|'sometimes';register:'casual'|'neutral';averageLength:number};

const MAX_SUGGESTION_LENGTH=600;

export function inferAutoDialogueStyle(recent:AutoDialogueTurn[],preference:AutoDialoguePreference='natural'):AutoDialogueStyle{
  const userMessages=recent.filter((turn)=>turn.role==='user').slice(-12).map((turn)=>turn.content.trim()).filter((message)=>Boolean(message)&&!message.startsWith('['));
  const average=userMessages.length?userMessages.reduce((sum,message)=>sum+message.length,0)/userMessages.length:90;
  const actionCount=userMessages.filter((message)=>/\*[^*]{1,160}\*/.test(message)).length;
  const actionRatio=userMessages.length?actionCount/userMessages.length:0;
  const emojiCount=userMessages.filter((message)=>/\p{Extended_Pictographic}/u.test(message)).length;
  const casualCount=userMessages.filter((message)=>/\b(?:lol|lmao|haha|yeah|yep|nah|gonna|wanna|kinda|idk)\b|\b\w+'(?:m|re|ve|ll|d|s|t)\b/i.test(message)).length;
  const inferred=average<=72?'short':average<=220?'medium':'long';
  return{targetLength:preference==='shorter'?'short':preference==='detailed'?'long':inferred,usesActions:actionCount>0,actionFrequency:actionRatio>=.45?'often':actionRatio>0?'sometimes':'never',emojiPreference:emojiCount>=Math.max(2,Math.ceil(userMessages.length*.3))?'sometimes':'none',register:casualCount>=Math.max(2,Math.ceil(userMessages.length*.3))?'casual':'neutral',averageLength:Math.round(average)};
}

export function inferAutoDialogueIntents(input:AutoDialogueInput):AutoDialogueIntent[]{
  const latest=input.latestAssistantMessage.toLowerCase(),relationship=input.relationship??{},scene=input.scene,intents:AutoDialogueIntent[]=[];
  const add=(intent:AutoDialogueIntent)=>{if(!intents.includes(intent))intents.push(intent);};
  if(Number(relationship.conflict??0)>=35||/\b(sorry|apologi[sz]e|hurt|upset|angry|wrong)\b/.test(latest))add('repair');
  if(/\b(tired|exhausted|overwhelmed|sad|anxious|rough|hard day|scared|worried)\b/.test(latest)||input.emotionalTone&&/sad|anxious|tense|hurt|low/i.test(input.emotionalTone))add('support');
  if(/\b(excited|amazing|great news|finally|proud|celebrat)\b/.test(latest))add('celebrate');
  if(input.preference==='romantic'&&romanceIsAvailable(input))add('flirt');
  if(input.upcomingCommitment||input.activePlan||input.activeDate||input.conversationFocus)add('coordinate_plan');
  if(scene.participantNames&&scene.participantNames.length>1)add('engage_group');
  if(scene.interactionMode==='co_present')add('advance_scene');
  if(scene.departurePressure)add('close_scene');
  if(input.openThread)add('follow_up');
  if(input.latestAssistantMessage.trim().endsWith('?'))add('answer');
  add('curious');
  return intents.slice(0,4);
}

export function buildAutoDialoguePrompt(input:AutoDialogueInput):string{
  const preference=input.preference??'natural',style=inferAutoDialogueStyle(input.recent,preference),intents=inferAutoDialogueIntents(input),transcript=input.recent.slice(-14).map((turn)=>`${turn.role.toUpperCase()}: ${turn.content}`).join('\n');
  const relationship=input.relationship??{},participants=input.scene.participantNames?.filter((name)=>name!==input.characterName)??[];
  const lengthGuidance=style.targetLength==='short'?'prefer under 100 characters and one sentence':style.targetLength==='long'?'prefer 220–560 characters and two or three sentences':'prefer 100–320 characters and one or two sentences';
  const intimacyGuidance='Keep the draft within non-sexual romance. Flirting, affection, kissing, and a fade-to-black transition are allowed when relationship context supports them. Never draft a sexual request, sexual act, nudity request, or explicit anatomy. Do not invent user consent or physical intimacy.';
  return `Write one plausible next message for the USER in an AI companion conversation. Return JSON only as {"text":"..."}.

The text is an editable draft, not an autonomous action. Write only the user's words or the user's first-person roleplay action. Never write the companion's reply, thoughts, actions, or consent. Never invent user facts, memories, identity, promises, purchases, completed plans, or relationship decisions. ${intimacyGuidance} Do not copy or closely paraphrase the companion's latest message. Do not request paid media unless the user's recent messages clearly establish that intent.

OUTPUT LANGUAGE
${chatLanguagePromptInstruction(input.chatLanguage)} This is a user-authored draft, so write it naturally in the selected language without explaining or naming the language.

React specifically to the latest companion message and preserve scene continuity. Create a rich conversational handoff with two beats when length allows: first respond to what the companion actually said or did, then add one concrete emotional or scene-aware hook that gives them something meaningful to answer. Do not default to a generic interviewer question. A reaction, observation, playful challenge, vulnerable admission, or brief first-person action may lead; use a question only when it feels natural.

Primary response intentions, in order: ${intents.join(', ')}. Choose the first one that produces a natural reply. User control: ${preference}. ${preferenceGuidance(preference,romanceIsAvailable(input))}

VOICE MATCH
- Typical sent message length: about ${style.averageLength} characters; target ${style.targetLength}.
- Roleplay actions: ${style.actionFrequency}. ${style.usesActions?'If used, keep the action concise and strictly first-person.':'Prefer dialogue without roleplay actions.'}
- Register: ${style.register}; emoji use: ${style.emojiPreference}.
- ${lengthGuidance}.
${input.voiceHints?.length?`- Subtle learned voice preferences: ${input.voiceHints.slice(0,4).join(' | ')}\n`:''}
CHARACTER: ${input.characterName}
USER: ${input.userName??'the user'}
RELATIONSHIP: ${input.relationshipStage}; romance ${relationship.romanceEnabled===false||relationship.friendsOnly?'unavailable':'available'}; conflict ${Math.round(Number(relationship.conflict??0))}; chemistry ${Math.round(Number(relationship.chemistryHeat??0))}; romantic boldness ${Math.max(1,Math.min(3,Number(relationship.spiceLevel??2)))} of 3
CONTENT CEILING: non-sexual romance; latest intimacy outcome: ${input.intimacyOutcome??'none'}
SCENE: ${input.scene.interactionMode}; ${input.scene.location}; ${input.scene.activity}; mood ${input.scene.mood??'unknown'}; energy ${input.scene.energy??'unknown'}; availability ${input.scene.interruptibility??input.scene.availability??'unknown'}${input.scene.departurePressure?'; the scene is ending soon':''}
${input.scene.nextObligation?`NEXT OBLIGATION: ${input.scene.nextObligation}\n`:''}${participants.length?`OTHER PEOPLE PRESENT: ${participants.join(', ')}. Do not speak or act for them.\n`:''}${input.openThread?`OPEN THREAD: ${input.openThread}\n`:''}${input.upcomingCommitment?`UPCOMING COMMITMENT: ${input.upcomingCommitment}\n`:''}${input.activePlan?`ACTIVE PLAN: ${input.activePlan}\n`:''}${input.activeDate?`ACTIVE DATE: ${input.activeDate}\n`:''}${input.activeStory?`ACTIVE STORY: ${input.activeStory}\n`:''}${input.conversationFocus?`CONVERSATION FOCUS: ${input.conversationFocus}\n`:''}${input.emotionalTone?`EMOTIONAL CARRYOVER: ${input.emotionalTone}\n`:''}LATEST COMPANION MESSAGE: ${input.latestAssistantMessage}

RECENT TRANSCRIPT
${transcript}`;
}

export function deterministicAutoDialogue(input:AutoDialogueInput):string{
  const latest=input.latestAssistantMessage.trim(),lower=latest.toLowerCase(),fallback=fallbackForScene(input),intent=inferAutoDialogueIntents(input)[0];
  const userLanguage=resolveChatLanguageForText(input.chatLanguage,input.recent.filter((turn)=>turn.role==='user').at(-1)?.content,[...input.recent].reverse().filter((turn)=>turn.role==='user').map((turn)=>turn.content));
  if(userLanguage!=='en')return chatLanguageUserDraftFallback(userLanguage);
  if(intent==='repair')return normalizeAutoDialogueText("I appreciate you saying that. I don't want to skate past it—can we talk through what happened?",fallback,input);
  if(intent==='support')return normalizeAutoDialogueText("You sound like you have a lot on your mind. You don't have to make it sound okay for me—what happened?",fallback,input);
  if(intent==='celebrate')return normalizeAutoDialogueText("Okay, that deserves more than a quick congratulations. Tell me the moment you realized you'd actually pulled it off.",fallback,input);
  if(intent==='flirt')return normalizeAutoDialogueText("You're making it very hard not to flirt with you. Keep going—what are you hoping I'll say?",fallback,input);
  if(intent==='coordinate_plan'&&input.upcomingCommitment)return normalizeAutoDialogueText(`I'm looking forward to ${sentenceFragment(input.upcomingCommitment)}. What would make it feel especially good for you?`,fallback,input);
  if(intent==='engage_group')return normalizeAutoDialogueText("Okay, catch me up—what did I walk into, and whose side am I supposed to be on?",fallback,input);
  if(input.openThread)return normalizeAutoDialogueText(`I've still been wondering about ${sentenceFragment(input.openThread)}. What happened after we left it there?`,fallback,input);
  if(/\b(thank you|thanks)\b/.test(lower))return normalizeAutoDialogueText("Of course. I'm glad I could be here for it—how are you feeling now?",fallback,input);
  if(/\b(finished|finally done|wrapped up|completed)\b/.test(lower))return normalizeAutoDialogueText("You made it through. Now that the pressure is off, what part are you proudest of?",fallback,input);
  if(input.preference==='assertive')return normalizeAutoDialogueText("Be direct with me. What do you want from this moment?",fallback,input);
  if(latest.endsWith('?'))return normalizeAutoDialogueText("I'm still thinking about that. My first instinct is to be honest with you—what answer are you hoping for?",fallback,input);
  return fallback;
}

export function parseAutoDialogueSuggestion(value:unknown,fallback:string,input?:AutoDialogueInput):string{
  const candidate=typeof value==='string'?value:isRecord(value)&&typeof value['text']==='string'?value['text']:'';
  return normalizeAutoDialogueText(candidate,fallback,input);
}

export function normalizeAutoDialogueText(value:string,fallback:string,input?:AutoDialogueInput):string{
  const cleaned=value.replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim().replace(/^(?:user|me)\s*:\s*/i,'').replace(/^['"]|['"]$/g,'').replace(/\s+/g,' ');
  if(!cleaned||hasSexualDialogueLanguage(cleaned)||looksLikeCompanionReply(cleaned,input?.characterName)||assertsHighAgencyChoice(cleaned)||input&&tooSimilar(cleaned,input.latestAssistantMessage))return safeFallback(fallback);
  const clipped=cleaned.length<=MAX_SUGGESTION_LENGTH?cleaned:`${cleaned.slice(0,MAX_SUGGESTION_LENGTH-1).trimEnd()}…`;
  return clipped||safeFallback(fallback);
}

function fallbackForScene(input:AutoDialogueInput):string{
  const style=inferAutoDialogueStyle(input.recent,input.preference),activity=sentenceFragment(input.scene.activity||'your day');
  if(input.scene.departurePressure)return 'Before you go, is there anything you wanted to tell me?';
  if(input.scene.interactionMode==='co_present')return style.usesActions?`*I settle in beside ${input.characterName}.* “How is ${activity} going?”`:`I settle into the moment with you. How is ${activity} really going?`;
  return `I've been picturing you at ${input.scene.location}. How is ${activity} really going?`;
}

function preferenceGuidance(preference:AutoDialoguePreference,romanceAvailable:boolean):string{
  if(preference==='shorter')return 'Make the reply notably shorter than the user’s usual message while keeping one specific hook.';
  if(preference==='detailed')return 'Use two or three sentences with emotional and situational specificity, without inventing facts.';
  if(preference==='romantic')return romanceAvailable?'Use non-sexual romantic or flirty energy appropriate to the established relationship and authored pacing.':'Romance is unavailable here; produce a warm but clearly non-romantic reply.';
  if(preference==='assertive')return 'Be direct and confident without making commitments, issuing pressure, or speaking for anyone else.';
  return 'Match the user’s established voice and make the exchange easy for the companion to continue richly.';
}

function romanceIsAvailable(input:AutoDialogueInput):boolean{return input.relationship?.romanceEnabled!==false&&!input.relationship?.friendsOnly;}
function safeFallback(value:string):string{const normalized=value.trim().slice(0,MAX_SUGGESTION_LENGTH);return normalized||'Tell me more about that.';}
function looksLikeCompanionReply(value:string,characterName?:string):boolean{
  if(/^(assistant|companion|character|ai)\s*:/i.test(value)||/\b(?:as an ai|i am your (?:ai|companion))\b/i.test(value))return true;
  if(characterName){const escaped=characterName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp(`^(?:\\*\\s*)?${escaped}\\s+(?:smiles?|laughs?|says?|asks?|leans?|looks?|replies?)\\b`,'i').test(value))return true;}
  return /^\*(?:you|they|she|he|the companion)\s+/i.test(value);
}
function assertsHighAgencyChoice(value:string):boolean{return /\b(?:i (?:promise|swear|consent|forgive you|love you|hate you|bought|booked|paid for|ordered|sent you)|we(?:'re| are) (?:dating|exclusive|engaged)|let's (?:get married|move in together))\b/i.test(value);}
function tooSimilar(left:string,right:string):boolean{const a=wordSet(left),b=wordSet(right);if(a.size<4||b.size<4)return false;let overlap=0;for(const word of a)if(b.has(word))overlap++;return overlap/Math.min(a.size,b.size)>=.78;}
function wordSet(value:string):Set<string>{
  const normalized=value.toLocaleLowerCase().normalize('NFKC'),tokens=normalized.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu)??[],result=new Set<string>();
  for(const token of tokens){
    if(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token)){
      const characters=[...token];
      if(characters.length<=2)result.add(token);
      else for(let index=0;index<characters.length-1;index+=1)result.add(characters.slice(index,index+2).join(''));
    }else if([...token].length>2)result.add(token);
  }
  return result;
}
function sentenceFragment(value:string):string{return value.trim().replace(/[.!?]+$/,'').replace(/^./,(character)=>character.toLowerCase());}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
