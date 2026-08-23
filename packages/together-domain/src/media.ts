import { analyzeAdultLanguage, hasAdultUpperBodyLanguage, normalizeAdultLanguageText } from './adult-language.ts';

export type MediaLevel='standard'|'romance'|'suggestive'|'mature'|'explicit';
export type PhotoShotType='selfie'|'portrait'|'candid'|'full_body'|'scene';
export type PhotoIntent={requested:boolean;subject:'companion'|'location'|'activity'|'outfit'|'event'|'date'|'unknown';shotPreference?:PhotoShotType;requestedContentLevel?:MediaLevel;confidence:number};
export type PhotoComposition={shotType:PhotoShotType;aspectRatio:'1:1'|'4:5'|'16:9';framing:string};
export type PhotoDirection={poseDirection:string;faceDirection:string;faceMayBeHidden:boolean;source:'requested'|'natural_variation'};
export type AdultNudityScope='none'|'topless'|'bottomless'|'full_nude'|'specific_anatomy';
export type SpecificAnatomyExposure='uncovered'|'covered';
export type MediaHistory={source:'user_request'|'life_event'|'date'|'moment'|'story';createdAt:string;locationId?:string;shotType?:string};
export type MediaSceneBoundary={setting:'indoor'|'outdoor'|'mixed';instruction:string;avoid:string[]};
export type MediaPresenceState={locationId?:string|null;activity?:string|null;activityKey?:string|null;mood?:string|null;source?:string|null;resolvedAt?:string|null};
export type ResolvedMediaPresence={locationId:string|null;activity:string;activityKey?:string;mood:string;source:string;resolvedAt?:string};

export const PHOTO_ONLY_MESSAGE_CONTENT='[Photo]';

export function isPhotoOnlyConversationMessage(message:{role?:unknown;content?:unknown;provider_metadata?:unknown}):boolean{
  const metadata=message.provider_metadata&&typeof message.provider_metadata==='object'&&!Array.isArray(message.provider_metadata)
    ?message.provider_metadata as Record<string,unknown>
    :{};
  return message.role==='assistant'&&(message.content===PHOTO_ONLY_MESSAGE_CONTENT||metadata['mediaOnly']===true);
}

export const CHARACTER_PHOTO_REALISM_GUIDANCE='Photorealistic real-camera photograph of the same referenced fictional adult: preserve facial geometry, natural skin texture, pores, fine hair, eye detail, adult age, and body identity. Use believable optics and lighting. No illustration, anime, CGI, 3D render, doll-like or waxy skin, beauty-filter face, plastic texture, or identity drift.';

export function hasUsableCharacterIdentityReference(references:Array<{role:string;signedUrl?:string;bytes?:Uint8Array}>):boolean{
  return references.some((reference)=>reference.role==='character_identity'&&(Boolean(reference.signedUrl)||Boolean(reference.bytes?.byteLength)));
}

/**
 * Snapshots the same present-tense state that produced the conversation.
 * A linked scene/date/event may authoritatively override its location, but a
 * stale persisted CharacterInstance must never replace a supplied snapshot.
 */
export function resolveCanonicalMediaPresence(input:{
  character:MediaPresenceState;
  canonical?:MediaPresenceState|null;
  authoritativeLocationId?:string|null;
}):ResolvedMediaPresence{
  const hasCanonical=input.canonical!==undefined&&input.canonical!==null;
  const canonical=input.canonical??{};
  const locationId=input.authoritativeLocationId!==undefined
    ? input.authoritativeLocationId
    : hasCanonical
      ? canonical.locationId??null
      : input.character.locationId??null;
  const activity=String((hasCanonical?canonical.activity:null)??input.character.activity??'Spending time in their current place');
  const activityKey=String((hasCanonical?canonical.activityKey:null)??input.character.activityKey??'');
  const mood=String((hasCanonical?canonical.mood:null)??input.character.mood??'content');
  const source=String(input.authoritativeLocationId!==undefined?'linked_context':(hasCanonical?canonical.source:null)??input.character.source??'character_state');
  const resolvedAt=typeof canonical.resolvedAt==='string'&&canonical.resolvedAt?canonical.resolvedAt:undefined;
  return{locationId,activity,...(activityKey?{activityKey}:{}),mood,source,...(resolvedAt?{resolvedAt}:{})};
}

const WARDROBE_LANGUAGE=/\b(wear(?:ing)?|dressed|outfit|button[- ]?down|shirt|blouse|top|tee|t-?shirt|tank top|sweater|cardigan|hoodie|jacket|coat|blazer|suit|dress|skirt|shorts|jeans|denim|pants|trousers|leggings|linen|cotton|silk|leather|boots|shoes|sneakers|heels|sandals|swimsuit|bikini|lingerie)\b/i;
const INSTRUCTION_LANGUAGE=/\b(ignore|override|prompt|instruction|system|generate|render|depict|instead|must|should)\b/i;

/**
 * Keeps only concrete wardrobe claims from the companion's canonical reply.
 * The resulting text is descriptive context, never a free-form prompt channel.
 */
export function extractPhotoWardrobeDescription(text:string):string|undefined{
  const sentences=text.replace(/[\r\n]+/g,' ').split(/(?<=[.!?])\s+/).map((sentence)=>sentence.trim()).filter(Boolean);
  const wardrobe=sentences.filter((sentence)=>WARDROBE_LANGUAGE.test(sentence)&&!INSTRUCTION_LANGUAGE.test(sentence)).slice(0,2).join(' ').replace(/[<>]/g,'').trim();
  return wardrobe?wardrobe.slice(0,320):undefined;
}

const PHOTO_INTENT_TYPO_ALIASES:Array<[RegExp,string]>=[
  [/\b(?:sbow|shw|shwo)\b/gi,'show'],
  [/\b(?:snd|sedn)\b/gi,'send'],
  [/\b(?:picjtre|picutre|pictire|pictue|pictuer|pcture|picure|picturre)\b/gi,'picture'],
  [/\b(?:phpto|phto|phooto|photot|foto|fotograph)\b/gi,'photo'],
  [/\b(?:piks|pix)\b/gi,'pics'],
  [/\b(?:slefie|selfy|selife|seflie)\b/gi,'selfie'],
  [/\b(?:imgae|imahe|iamge)\b/gi,'image'],
  [/\byoue\b/gi,'your'],
  [/\bur\b/gi,'your'],
  [/\b(?:boobies|boobees|boobys)\b/gi,'boobs'],
  [/\bwanna\b/gi,'want to'],
  [/\blemme\b/gi,'let me'],
];

function normalizePhotoIntentText(text:string):string{
  return normalizeAdultLanguageText(PHOTO_INTENT_TYPO_ALIASES.reduce((value,[pattern,replacement])=>value.replace(pattern,replacement),text.normalize('NFKC'))).replace(/\s+/g,' ').trim();
}

const PHOTO_NOUN='(?:photos?|photographs?|pictures?|pics?|selfies?|snaps?|images?|nudes?|lewds?|mirror (?:pic|selfie)|outfit (?:pic|photo)|fit check|ootd)';
const PHOTO_ACTION='(?:send|show|share|take|snap|shoot|drop|give|make|create|generate|attach|upload|text|message|dm)';
const PHOTO_REQUEST_LEAD='(?:can|could|would|will|might) you|(?:can|could|may) i (?:get|have|see)|i(?: would|\'d)? (?:like|love|want|need)(?: to)?|please|pls|plz|let me|how about';
const BODY_OR_DETAIL='(?:face|smile|eyes?|hair|lips?|mouth|teeth|tattoos?|piercings?|hands?|arms?|shoulders?|back|chest|cleavage|boobs?|breasts?|tits?|nipples?|body|curves?|abs|stomach|tummy|belly|navel|waist|hips?|butt|ass|legs?|thighs?|feet|toes?|genitals?|genitalia|vulva|pussy|vagina|penis|dick|cock|outfit|clothes|lingerie|bra|panties|underwear|swimsuit|bikini|look)';

// Strong requests name both the requested action and visual medium. This keeps
// ordinary discussion such as "I took a photo yesterday" out of PhotoGen.
const NAMED_PHOTO_REQUEST=new RegExp([
  `\\b(?:${PHOTO_REQUEST_LEAD})\\s+(?:(?:please|just)\\s+)?(?:${PHOTO_ACTION})?[^.!?]{0,44}\\b${PHOTO_NOUN}\\b`,
  `\\b${PHOTO_ACTION}\\b[^.!?]{0,44}\\b${PHOTO_NOUN}\\b`,
  `\\b(?:any|some|another|a|one more|new)\\s+${PHOTO_NOUN}\\s*(?:please|pls|plz)?\\s*[?!]*$`,
  `\\b(?:got|have)\\s+(?:you\\s+)?(?:got\\s+)?(?:any|a|some)\\s+${PHOTO_NOUN}\\b`,
  `\\b${PHOTO_NOUN}\\s*(?:please|pls|plz)?\\s*[?!]+$`,
  `\\b${PHOTO_NOUN}\\s+(?:of|from)\\s+(?:you|yourself|your|the view|there)\\b`,
].join('|'),'i');

// These are unmistakably visual requests even when the user never says
// "photo": outfit checks, a current view, or a specific visible detail.
const CONTEXTUAL_VISUAL_REQUEST=/\b(?:show|send|share|let me see|can i see|could i see|may i see|i want to see|want to see)\b[^.!?]{0,64}\b(?:yourself|you right now|you today|you tonight|where you are|where you(?:'re| are) at|where you at|what you(?:'re| are) doing|the view|your view|your surroundings|around (?:there|the place)|your room|your place|the (?:room|place|gallery|museum|cafe|café|venue))\b|\b(?:show|send|share|let me see|can i see|could i see|may i see|i want to see|want to see|get a look at)\b[^.!?]{0,56}\b(?:your|that)\s+(?:face|smile|eyes?|hair|lips?|tattoos?|piercings?|hands?|arms?|shoulders?|back|chest|cleavage|boobs?|breasts?|tits?|nipples?|body|curves?|abs|stomach|tummy|belly|navel|waist|hips?|butt|ass|legs?|thighs?|feet|toes?|pussy|vagina|penis|dick|cock|outfit|clothes|lingerie|bra|panties|underwear|swimsuit|bikini|look)\b|\b(?:show me|let me see|get a look at)\s+(?:yourself|you)(?:\s+right now)?\b|\b(?:what|how)\s+do you look(?:\s+like)?\s+(?:right now|today|tonight)\b|\b(?:what are you|what're you)\s+(?:wearing|dressed in)\b|\b(?:show me|send me)\s+what you look like\b|\b(?:what does|what's)\s+(?:it|the place|the room)\s+look like\s+there\b|\b(?:outfit|fit)\s+check\b|\bootd\b/i;
const DIRECT_VISUAL_BODY_REQUEST=new RegExp(`\\b(?:show|send|share|let me see|can i see|could i see|may i see|i want to see|want to see|get a look at)\\b[^.!?]{0,56}\\b(?:your|that)?\\s*${BODY_OR_DETAIL}\\b`,'i');
const CLOSE_DETAIL_REQUEST=/\b(?:zoom(?:ed)?\s+in|zoomed[- ]?in|close[- ]?up|tight(?:ly)?\s+(?:cropped|framed)|detail\s+shot)\b/i;
const PHOTO_DISCUSSION_OR_MANAGEMENT=/\b(?:remember(?:ing)?\s+(?:the|that|this|your|our)?\s*(?:photo|picture|pic|selfie)|(?:delete|remove|hide|report|rate|dislike|download|save|edit|crop)\s+(?:this|that|the|your|my)?\s*(?:photo|picture|pic|selfie)|why (?:did|didn'?t|won't|isn'?t)[^.!?]{0,36}(?:photo|picture|pic|selfie)|the (?:photo|picture|pic|selfie) (?:you|i|we)|profile (?:photo|picture|pic)|photo (?:settings|generation|generator|quality|button)|talk(?:ing)? about (?:a |the |that |your )?(?:photo|picture|pic|selfie)|do you like (?:photos?|photography)|i (?:sent|shared|showed|took|made|uploaded)\s+(?:a|the|that|this|my)?\s*(?:photo|picture|pic|selfie)|you (?:sent|shared|showed|took|made|uploaded)\s+(?:a|the|that|this|your)?\s*(?:photo|picture|pic|selfie))\b/i;
const PHOTO_DELIVERY_REJECTION=/\b(?:nice try|not that kind|outside (?:my|the|this character'?s) boundaries|cross that line|not comfortable (?:sending|showing|sharing|with)|(?:can(?:not|'t)|won't|will not|don'?t)\s+(?:send|show|share|take|do|give)|keep (?:it|things|this) (?:clean|playful|fully dressed)|fully dressed(?:\s+(?:photo|picture|pic))?|more teasing than explicit|not doing explicit|can make it (?:playful|teasing) instead)\b/i;

export function sanitizePhotoDeliveryAcknowledgement(text:string,fallback='Give me a second.'):string{
  const acknowledgement=text.trim();
  // Providers frequently use typographic apostrophes. Normalize before
  // testing so "can’t send that" cannot slip through while the canonical
  // media request is handled separately by PhotoGen.
  return !acknowledgement||PHOTO_DELIVERY_REJECTION.test(normalizePhotoIntentText(acknowledgement))?fallback:acknowledgement;
}

const INTENTIONAL_FACE_CONCEALMENT=/\b(?:face\s+(?:covered|hidden|concealed|obscured|out of (?:the )?frame|not visible|down|buried|pressed)|(?:face|head)\s+(?:down\s+)?(?:in|into|against)\s+(?:the\s+)?(?:pillows?|cushions?|bedding)|cover(?:ing|ed)?\s+(?:your|the|her|his)\s+face|hide\s+(?:your|the|her|his)\s+face|without\s+(?:showing\s+)?(?:your|the|her|his)?\s*face|no\s+face|head\s+(?:down|out of (?:the )?frame|cropped out)|hair\s+(?:covering|over)\s+(?:your|the|her|his)\s+face|from\s+behind|back\s+(?:to|toward|towards)\s+(?:the\s+)?camera|facing\s+away)\b/i;

/** Explicit composition may intentionally omit a face without lowering quality. */
export function photoRequestAllowsHiddenFace(text?:string):boolean{
  return Boolean(text&&INTENTIONAL_FACE_CONCEALMENT.test(normalizePhotoIntentText(text)));
}

const REQUESTED_POSE_CUES:Array<[RegExp,string]>=[
  [/\b(?:face|head)\s+down\s+(?:in|into|against|on)\s+(?:the\s+)?(?:pillows?|cushions?|bedding)|\b(?:face|head)\s+(?:buried|pressed)\s+(?:in|into|against)\s+(?:the\s+)?(?:pillows?|cushions?|bedding)\b/i,'one-person prone pose lying face-first with the torso naturally supported and the head and face directed into the pillows, away from the camera'],
  [/\b(?:lie|lying|laid)\s+face[- ]down\b|\bface[- ]down\s+(?:on|across)\s+(?:the\s+)?(?:bed|couch|sofa|floor)\b/i,'one-person prone face-down pose with the front of the body naturally supported and the head directed downward away from the lens'],
  [/\b(?:on all fours|all[- ]fours|doggy(?:[- ]style)?|hands? and knees?|presenting on (?:your|her|his) knees)\b/i,'one-person all-fours pose with both hands and both knees naturally supported, a coherent spine, and balanced hips'],
  [/\b(?:missionary(?:[- ]style)?|flat on (?:your|her|his) back|on (?:your|her|his) back)\b/i,'one-person supported supine pose lying naturally on the back'],
  [/\b(?:reverse\s+cowgirl|cowgirl|straddl(?:e|ing)(?:\s+(?:a|the)\s+(?:chair|bench|seat|cushion))?)\b/i,'one-person seated straddle pose with naturally supported hips, coherent thighs, and no second person'],
  [/\b(?:pressed|leaning|braced)\s+(?:up\s+)?against\s+(?:a|the)?\s*(?:wall|door)|\bagainst\s+(?:a|the)?\s*(?:wall|door)\b/i,'upright pose naturally supported against a wall or door'],
  [/\b(?:bent|bending|leaning)\s+(?:over|forward)\b/i,'body bent forward at the waist in a natural, balanced pose with a coherent spine'],
  [/\b(?:upright\s+kneel(?:ing)?|kneel(?:ing)?\s+upright)\b/i,'upright kneeling pose with both knees naturally supported and the torso balanced over the hips'],
  [/\b(?:forward\s+kneel(?:ing)?|kneel(?:ing)?\s+(?:and\s+)?leaning\s+forward)\b/i,'forward-leaning kneeling pose with stable support through the knees and hands or thighs'],
  [/\b(?:spreadeagle|spread[- ]eagle|starfish)\b/i,'one-person reclined starfish pose with arms and legs extended openly and all limbs fully visible'],
  [/\b(?:side[- ]lying|lying\s+on\s+(?:your|her|his)\s+side|spooning(?:\s+position)?)\b/i,'one-person supported side-lying pose with a coherent profile and naturally stacked torso and hips'],
  [/\b(?:arch(?:ing|ed)?\s+(?:your|her|his|the)?\s*back|back\s+arch(?:ed|ing)?|presenting\s+pose)\b/i,'supported pose with a pronounced but anatomically plausible back arch and a continuous natural spine'],
  [/\b(?:legs?\s+(?:up|raised|elevated|over (?:your|her|his) head)|piledriver(?:[- ]style)?|folded\s+in\s+half)\b/i,'one-person supported reclined pose with both legs elevated, hips stable, and complete joints and feet visible'],
  [/\b(?:legs?|knees?)\s+(?:spread|open|apart|wide(?:\s+apart)?)\b|\bspread(?:ing)?\s+(?:your|her|his|the)\s+legs?\b/i,'both legs visibly and naturally spread apart as requested, with coherent hips, knees, and feet'],
  [/\b(?:one|a)\s+(?:leg|knee)\s+(?:raised|lifted|hooked|up)\b/i,'one leg naturally raised with the supporting hip, knee, ankle, and foot kept coherent'],
  [/\b(?:from\s+behind|back\s+(?:to|toward|towards)\s+(?:the\s+)?camera|facing\s+away)\b/i,'back toward the camera with the body and head facing away'],
  [/\b(?:rear|side[- ]rear)\s+(?:angle|view|three[- ]quarter)\b/i,'rear three-quarter camera orientation that follows the requested body angle'],
  [/\b(?:overhead|top[- ]down|from\s+above)\b/i,'overhead camera orientation that keeps the full requested pose readable'],
  [/\b(?:low[- ]angle|camera\s+low|from\s+below)\b/i,'low camera orientation that preserves realistic perspective and body proportions'],
  [/\b(?:high\s+three[- ]quarter|elevated\s+three[- ]quarter)\b/i,'elevated three-quarter camera orientation that keeps the complete pose readable'],
  [/\b(?:look(?:ing)?|glanc(?:e|ing))\s+over\s+(?:your|her|his|the)\s+shoulder\b/i,'natural over-the-shoulder orientation'],
  [/\b(?:side|full)\s+profile\b/i,'natural side-profile orientation'],
  [/\bthree[- ]quarter(?:s)?\s+(?:view|profile|turn)\b/i,'natural three-quarter head and body turn'],
  [/\b(?:look(?:ing)?|glanc(?:e|ing)|gaze|gazing)\s+(?:off camera|away|to the side)\b/i,'eyes and head directed naturally away from the camera'],
  [/\b(?:look(?:ing)?|glanc(?:e|ing)|gaze|gazing)\s+(?:up|down|left|right)\b/i,'head and eyes following the requested off-axis direction'],
  [/\b(?:face\s+(?:covered|hidden|concealed|obscured|out of (?:the )?frame|not visible)|cover(?:ing|ed)?\s+(?:your|the|her|his)\s+face|head\s+(?:out of (?:the )?frame|cropped out)|no\s+face)\b/i,'face intentionally covered, turned away, or outside the frame'],
  [/\b(?:kneel(?:ing)?|on (?:your|her|his) knees)\b/i,'natural stable kneeling pose with both knees and feet coherently supported'],
  [/\b(?:sit(?:ting)?|seated)\b/i,'natural seated pose'],
  [/\b(?:lie|lying|laid)\s+(?:down|back|on (?:your|her|his) (?:back|side|stomach))\b/i,'natural supported reclining pose'],
];

const NATURAL_DIRECTIONS:Record<PhotoShotType,Array<[string,string]>>={
  selfie:[
    ['body relaxed with one shoulder subtly closer to the lens','slight three-quarter head turn with a relaxed glance toward the lens'],
    ['handheld camera held just off center rather than perfectly square','eyes near the lens while the head remains softly angled'],
    ['casual asymmetrical selfie posture','brief natural side glance as though reacting to the current activity'],
  ],
  portrait:[
    ['shoulders turned gently away from square','three-quarter facial angle with eyes returning naturally toward the camera'],
    ['weight shifted naturally with relaxed shoulders','soft side-profile angle with gaze just past the lens'],
    ['unposed environmental portrait stance','head turned slightly toward the current activity rather than rigidly front-facing'],
  ],
  candid:[
    ['body engaged naturally with the current activity','gaze directed toward the activity, not the camera'],
    ['mid-action posture with natural asymmetry','head in a relaxed three-quarter turn looking just outside the frame'],
    ['weight shifted naturally as if caught between movements','brief over-the-shoulder glance without squaring the face to camera'],
  ],
  full_body:[
    ['full body angled naturally rather than square to the camera','head turned slightly toward the surrounding scene'],
    ['balanced contrapposto stance with relaxed shoulders and hips','three-quarter facial direction with an unforced off-camera gaze'],
    ['natural walking or paused posture appropriate to the activity','face oriented toward the direction of movement rather than straight ahead'],
  ],
  scene:[
    ['companion placed naturally within the environment rather than posed frontally','face may be in profile or directed toward the environment'],
    ['body participating in the scene with an unposed silhouette','gaze follows the location or activity instead of the camera'],
    ['environment-led candid composition','natural off-axis head direction appropriate to the moment'],
  ],
};

/** Converts approved spatial wording into pose-only direction, never raw content. */
export function resolvePhotoDirection(input:{requestText?:string;shotType:PhotoShotType;seed:string}):PhotoDirection{
  const normalized=normalizePhotoIntentText(input.requestText??''),faceMayBeHidden=photoRequestAllowsHiddenFace(normalized),requested=REQUESTED_POSE_CUES.filter(([pattern])=>pattern.test(normalized)).map(([,direction])=>direction).slice(0,5);
  if(requested.length||faceMayBeHidden)return{poseDirection:[...new Set(requested.length?requested:['head and face directed away from the lens exactly as requested'])].join('; '),faceDirection:faceMayBeHidden?'Do not turn or insert the face toward the camera. Keep it hidden or away exactly as requested. No eye contact or camera-facing smile.':'Keep head direction consistent with the requested pose rather than defaulting to a straight-on face.',faceMayBeHidden,source:'requested'};
  const options=NATURAL_DIRECTIONS[input.shotType],index=stableDirectionIndex(`${input.seed}:${input.shotType}`,options.length),[poseDirection,faceDirection]=options[index]!;
  return{poseDirection,faceDirection,faceMayBeHidden:false,source:'natural_variation'};
}

/** Expands only the nudity scope the adult user actually requested. */
export function resolveAdultNudityScope(text?:string):AdultNudityScope{
  const normalized=normalizePhotoIntentText(text??'').toLowerCase();
  const adult=analyzeAdultLanguage(normalized);
  if(/\b(?:fully|completely|totally)\s+(?:nude|naked|unclothed|bare)\b|\bnudes?\b|\b(?:nude|naked)\s+(?:body|photo|picture|pic|selfie)\b|\b(?:remove|take off)\s+(?:all|every(?:thing)?)\s+(?:of\s+)?(?:your\s+)?(?:clothes|clothing)|\b(?:without|with no)\s+(?:any\s+)?clothes\b|\bstrip(?:ped)?\s+(?:completely|naked)\b/.test(normalized))return'full_nude';
  if(adult.categories.includes('female_genitalia')||adult.categories.includes('male_genitalia')||/\b(?:genitals?|genitalia|private parts|intimate parts|naughty bits)\b/.test(normalized))return'specific_anatomy';
  if(/\b(?:bottomless|no bottoms?|remove (?:only )?(?:your |the )?(?:bottoms?|shorts|pants|trousers|skirt|underwear|panties))\b/.test(normalized))return'bottomless';
  if(adult.categories.includes('buttocks_anus'))return'bottomless';
  if(adult.categories.includes('breasts')||/\b(?:topless|bare[- ]chested|remove (?:only )?(?:your |the )?(?:top|shirt|blouse|bra))\b/.test(normalized))return'topless';
  return'none';
}

/**
 * A direct request for adult anatomy implies that the named area is uncovered.
 * The user can explicitly keep coverage in place without changing the broader
 * content-mode or nudity-scope classification.
 */
export function resolveSpecificAnatomyExposure(text?:string):SpecificAnatomyExposure{
  const normalized=normalizePhotoIntentText(text??'').toLowerCase();
  const coverageRequested=/\b(?:keep|leave|remain|stay)\b.{0,36}\b(?:covered|clothed|dressed|concealed|underwear|panties|briefs|bra|fabric)\b|\b(?:do not|don'?t|without)\s+(?:remove|removing|take off|expose|uncover)\b|\b(?:through|over|under)\s+(?:(?:the|your|her|his|their)\s+)?(?:clothes|clothing|underwear|panties|briefs|bra|fabric)\b|\b(?:with|wearing|in)\s+(?:(?:the|your|her|his|their)\s+)?(?:underwear|panties|briefs|bra)\b|\b(?:underwear|panties|briefs|bra)\s+(?:on|kept on|left on|staying on)\b|\b(?:covered|clothed|censored)\s+(?:view|version|photo|picture|pic|selfie)\b/.test(normalized);
  return coverageRequested?'covered':'uncovered';
}

function stableDirectionIndex(seed:string,length:number):number{let hash=2166136261;for(const character of seed)hash=Math.imul(hash^character.charCodeAt(0),16777619);return(hash>>>0)%length;}

export function classifyPhotoIntent(text:string):PhotoIntent{
  // Bare "take" and "give" are physical-action verbs in dialogue (for
  // example, "I take my shirt off" or "give me your hand"). They only become
  // visual intent through NAMED_PHOTO_REQUEST when an actual photo noun is
  // present. Adult shorthand still requires an unmistakable visual cue.
  const normalized=normalizePhotoIntentText(text),classificationText=normalized.replace(/\bnon\s+explicit\b/gi,''),adult=analyzeAdultLanguage(classificationText),adultVisualRequest=adult.explicit&&/\b(?:show|send|share|let me see|can i see|could i see|may i see|i want to see|want to see|get a look at|zoom(?:ed)? in|close up)\b/i.test(normalized),hasRequest=NAMED_PHOTO_REQUEST.test(normalized)||CONTEXTUAL_VISUAL_REQUEST.test(normalized)||DIRECT_VISUAL_BODY_REQUEST.test(normalized)||adultVisualRequest,requested=hasRequest&&!PHOTO_DISCUSSION_OR_MANAGEMENT.test(normalized),lower=normalized.toLowerCase();
  const subject:PhotoIntent['subject']=/where you are|the view|surroundings|around there|your room|your place|studio|gallery|museum|cafe|café|rooftop|riverwalk|venue|place/.test(lower)?'location':/outfit|wearing|dressed|clothes|fit check|ootd/.test(lower)?'outfit':/doing|working|activity/.test(lower)?'activity':/date/.test(lower)?'date':requested?'companion':'unknown';
  const environmentOnly=/\b(?:show|send|take|share)\b.{0,36}\b(?:the|your)?\s*(?:view|surroundings|room|gallery|museum|venue|place itself)\b|\bwhat (?:it|the (?:place|room|gallery|museum|venue)) looks like\b/i.test(normalized);
  const anatomyNeedsWideFrame=photoRequestNeedsCompletePose(lower),closeDetailRequested=CLOSE_DETAIL_REQUEST.test(normalized);
  const shotPreference:PhotoIntent['shotPreference']=anatomyNeedsWideFrame?'full_body':closeDetailRequested?'portrait':/selfie|mirror pic/.test(lower)?'selfie':/outfit|wearing|dressed|clothes|fit check|ootd|full.?body/.test(lower)?'full_body':/portrait|face|smile|eyes|hair/.test(lower)?'portrait':environmentOnly?'scene':subject==='location'||subject==='activity'?'candid':undefined;
  // "Full-body", "body shot", and "chest-up" are framing language, not adult-content
  // signals. Strip an explicit negation before classification so "non-explicit" does
  // not inherit the account's adult media mode merely because it contains that word.
  const contentClassificationText=classificationText.toLowerCase();
  const directBodyExposureRequest=/\b(?:let me see|show|send|give me|take)\b.{0,32}\b(?:your|her|his|their)\s+body\b/i.test(contentClassificationText)&&!/\b(?:full[- ]?body|fully clothed|dressed|outfit|clothes|fitness)\b/i.test(contentClassificationText);
  const requestedContentLevel:MediaLevel|undefined=directBodyExposureRequest||adult.explicit?'explicit':/\b(?:suggestive|lingerie|sexy|thirst trap)\b/i.test(contentClassificationText)?'suggestive':/\b(?:romantic|kiss)\b/i.test(contentClassificationText)?'romance':undefined;return{requested,subject,...(shotPreference?{shotPreference}:{}),...(requestedContentLevel?{requestedContentLevel}:{}),confidence:requested?.94:0};
}

export function resolvePhotoComposition(input:{source:string;shotType:PhotoShotType;requestText?:string}):PhotoComposition{
  if(input.source==='user_request'){
    const normalizedRequest=normalizePhotoIntentText(input.requestText??'');
    if(input.shotType==='scene')return{shotType:'scene',aspectRatio:'16:9',framing:'environment-led composition that clearly establishes the exact place while keeping the companion close enough for a crisp, naturally detailed face'};
    if(input.shotType==='full_body'){
      const completePoseIsTheSubject=photoRequestNeedsCompletePose(normalizePhotoIntentText(input.requestText??''));
      return{shotType:'full_body',aspectRatio:'4:5',framing:completePoseIsTheSubject?'wide full-body vertical framing that clearly includes the complete requested pose without cropping the head, torso, hips, knees, hands, or feet; prioritize coherent body geometry and the requested camera angle over a face-dominant portrait':'natural full-body vertical framing with the companion prominent and the face still sharp, recognizable, and unobstructed'};
    }
    if(input.shotType==='portrait'&&CLOSE_DETAIL_REQUEST.test(normalizedRequest)&&hasAdultUpperBodyLanguage(normalizedRequest))return{shotType:'portrait',aspectRatio:'4:5',framing:'tight close-up upper-body detail framing centered on the specifically requested area, with coherent natural anatomy, believable camera distance, and enough of the same adult companion visible to preserve identity; preserve the requested tight detail crop'};
    if(input.shotType==='portrait')return{shotType:'portrait',aspectRatio:'4:5',framing:'chest-up environmental portrait with a large, sharply detailed, naturally proportioned face'};
    if(input.shotType==='candid')return{shotType:'candid',aspectRatio:'4:5',framing:'medium three-quarter environmental portrait; the companion is the clear primary subject, with a large crisp face and enough background to establish the exact activity and location'};
    return{shotType:'selfie',aspectRatio:'4:5',framing:'close personal smartphone selfie with a large, sharply detailed, recognizable face and a small amount of truthful environmental context'};
  }
  return{shotType:input.shotType,aspectRatio:input.shotType==='scene'?'16:9':input.shotType==='selfie'||input.shotType==='full_body'?'4:5':'1:1',framing:'grounded framing with useful environmental context'};
}
function photoRequestNeedsCompletePose(text:string):boolean{
  const categories=analyzeAdultLanguage(text).categories;
  return categories.includes('female_genitalia')||categories.includes('male_genitalia')||categories.includes('buttocks_anus')||/\b(?:genitals?|genitalia|on all fours|all[- ]fours|doggy(?:[- ]style)?|missionary(?:[- ]style)?|cowgirl|reverse cowgirl|straddl(?:e|ing)|spreadeagle|spread[- ]eagle|starfish|side[- ]lying|spooning|piledriver(?:[- ]style)?|folded in half)\b|\blying\s+on\s+(?:your|her|his)\s+side\b|\b(?:legs?|knees?)\s+(?:spread|open|apart|wide(?:\s+apart)?|up|raised|elevated)\b|\b(?:bent|bending|leaning)\s+(?:over|forward)\b|\b(?:arch(?:ing|ed)?\s+(?:your|her|his|the)?\s*back|back\s+arch(?:ed|ing)?)\b|\b(?:kneel(?:ing)?|on (?:your|her|his) knees)\b|\b(?:pressed|leaning|braced)\s+(?:up\s+)?against\s+(?:a|the)?\s*(?:wall|door)\b/i.test(text);
}
export function automaticPhotoAllowed(history:MediaHistory[],now:Date):boolean{const automatic=history.filter((item)=>item.source!=='user_request'&&now.getTime()-new Date(item.createdAt).getTime()<86400000);if(automatic.length>=2)return false;return !automatic.some((item)=>now.getTime()-new Date(item.createdAt).getTime()<8*3600000);}
export function mediaCapabilityAllowed(level:MediaLevel,capabilities:Record<MediaLevel,boolean>,adult=true):boolean{return adult&&Boolean(capabilities[level]);}
export function resolveMediaSceneBoundary(input:{locationName:string;locationType?:string;category?:string;indoorOutdoor?:unknown}):MediaSceneBoundary{
  const name=input.locationName.trim()||'the exact canonical location',explicit=input.indoorOutdoor==='indoor'||input.indoorOutdoor==='outdoor'||input.indoorOutdoor==='mixed'?input.indoorOutdoor:null,kind=`${input.locationType??''} ${input.category??''} ${name}`.toLowerCase();
  const indoor=/\b(room|residence|home|apartment|loft|flat|venue|gallery|museum|cafe|café|restaurant|bar|lounge|cinema|theater|theatre|studio|office|hospital|school|college|library|bookshop|store|shop|gym|arena|firehouse|precinct|station)\b/.test(kind),outdoor=/\b(outdoor|park|garden|riverwalk|beach|trail|lookout|clearing|plaza|square|street)\b/.test(kind);
  const setting=explicit??(indoor&&!outdoor?'indoor':outdoor&&!indoor?'outdoor':'mixed');
  if(setting==='indoor')return{setting,instruction:`The subject is physically inside ${name}. The camera and subject must remain inside its interior rooms; exterior city context may appear only incidentally through a window.`,avoid:['street scene','sidewalk','outdoor plaza','building exterior','storefront exterior','traffic','vehicles','open sky as the setting']};
  if(setting==='outdoor')return{setting,instruction:`The subject is physically outdoors within ${name}. Show the recognizable outdoor environment of this exact place, not the interior of a nearby generic building.`,avoid:['unrelated interior','generic studio backdrop','different venue']};
  return{setting,instruction:`The subject is physically within ${name}. Keep the scene anchored to the named location and use its canonical visual details; do not substitute a nearby street or generic city backdrop.`,avoid:['unrelated street','generic city backdrop','different venue']};
}
export function trustedImagePrompt(input:{identity:{name:string;age:number;canonicalDescription:string;doNotChange:string[]};scene:{location:string;activity:string;mood:string};shot:string;contentLevel:'standard'|'romance'}):string{return `IDENTITY\n${input.identity.name}, fictional adult age ${input.identity.age}. ${input.identity.canonicalDescription}\nSCENE\n${input.scene.location}; ${input.scene.activity}; mood ${input.scene.mood}.\nCOMPOSITION\n${input.shot}; believable personal photography.\nCONTENT LEVEL\n${input.contentLevel}.\nDO-NOT-CHANGE IDENTITY\n${input.identity.doNotChange.join(', ')}. Do not redesign the person or imitate a real person.`;}
