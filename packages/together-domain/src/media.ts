export type MediaLevel='standard'|'romance'|'suggestive'|'mature'|'explicit';
export type PhotoShotType='selfie'|'portrait'|'candid'|'full_body'|'scene';
export type PhotoIntent={requested:boolean;subject:'companion'|'location'|'activity'|'outfit'|'event'|'date'|'unknown';shotPreference?:PhotoShotType;requestedContentLevel?:MediaLevel;confidence:number};
export type PhotoComposition={shotType:PhotoShotType;aspectRatio:'1:1'|'4:5'|'16:9';framing:string};
export type MediaHistory={source:'user_request'|'life_event'|'date'|'moment'|'story';createdAt:string;locationId?:string;shotType?:string};
export type MediaSceneBoundary={setting:'indoor'|'outdoor'|'mixed';instruction:string;avoid:string[]};

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

export function classifyPhotoIntent(text:string):PhotoIntent{
  const requested=/\b(send|show|take|share|see|want|lemme|let me)\b.{0,40}\b(photo|picture|pic|selfie|outfit|look|where you are|what you(?:'re| are) doing|what .{0,20}looks like)\b|\b(selfie|photo|picture|pic)\s*\??$/i.test(text),lower=text.toLowerCase();
  const subject:PhotoIntent['subject']=/where you are|studio|gallery|museum|cafe|café|rooftop|riverwalk|venue|place/.test(lower)?'location':/outfit|wearing|look/.test(lower)?'outfit':/doing|working|activity/.test(lower)?'activity':/date/.test(lower)?'date':requested?'companion':'unknown';
  const environmentOnly=/\b(?:show|send|take|share)\b.{0,36}\b(?:the|your)?\s*(?:view|surroundings|room|gallery|museum|venue|place itself)\b|\bwhat (?:it|the (?:place|room|gallery|museum|venue)) looks like\b/i.test(text);
  const shotPreference:PhotoIntent['shotPreference']=/selfie/.test(lower)?'selfie':/outfit|full.?body/.test(lower)?'full_body':/portrait/.test(lower)?'portrait':environmentOnly?'scene':subject==='location'||subject==='activity'?'candid':undefined;
  const requestedContentLevel:MediaLevel|undefined=/nude|naked|topless|explicit|tits?|boobs?/i.test(text)?'explicit':/suggestive|lingerie|sexy/i.test(text)?'suggestive':/romantic|kiss/i.test(text)?'romance':undefined;return{requested,subject,...(shotPreference?{shotPreference}:{}),...(requestedContentLevel?{requestedContentLevel}:{}),confidence:requested?.94:0};
}

export function resolvePhotoComposition(input:{source:string;shotType:PhotoShotType}):PhotoComposition{
  if(input.source==='user_request'){
    if(input.shotType==='scene')return{shotType:'scene',aspectRatio:'16:9',framing:'environment-led composition that clearly establishes the exact place while keeping the companion close enough for a crisp, naturally detailed face'};
    if(input.shotType==='full_body')return{shotType:'full_body',aspectRatio:'4:5',framing:'natural full-body vertical framing with the companion prominent and the face still sharp, recognizable, and unobstructed'};
    if(input.shotType==='portrait')return{shotType:'portrait',aspectRatio:'4:5',framing:'chest-up environmental portrait with a large, sharply detailed, naturally proportioned face'};
    if(input.shotType==='candid')return{shotType:'candid',aspectRatio:'4:5',framing:'medium three-quarter environmental portrait; the companion is the clear primary subject, with a large crisp face and enough background to establish the exact activity and location'};
    return{shotType:'selfie',aspectRatio:'4:5',framing:'close personal smartphone selfie with a large, sharply detailed, recognizable face and a small amount of truthful environmental context'};
  }
  return{shotType:input.shotType,aspectRatio:input.shotType==='scene'?'16:9':input.shotType==='selfie'||input.shotType==='full_body'?'4:5':'1:1',framing:'grounded framing with useful environmental context'};
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
