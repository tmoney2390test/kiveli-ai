export type GroupMediaParticipant={characterInstanceId:string;name:string};

export type GroupPhotoSubjectResolution=
  |{ok:true;subjectCharacterInstanceIds:string[];reason:'explicit_selection'|'named_subjects'|'whole_group'|'pair_language'|'speaker_fallback'}
  |{ok:false;code:'NO_SUBJECT'|'TOO_MANY_SUBJECTS'|'AMBIGUOUS_PAIR'|'INVALID_SUBJECT';message:string};

const GROUP_LANGUAGE=/(?:\b(?:all of you|you all|everyone|everybody|the whole group|group (?:photo|picture|pic|selfie)|todos ustedes|todo el grupo|tout le monde|tout le groupe|tutti voi|tutto il gruppo|ihr alle|die ganze gruppe|vocês todos|todo o grupo)\b|みんな|全員|모두|다 같이|大家|所有人)/iu;
const PAIR_LANGUAGE=/(?:\b(?:both of you|you two|the two of you|together|los dos|ambos|juntos|vous deux|tous les deux|ensemble|voi due|entrambi|insieme|ihr beide|beide zusammen|vocês dois|os dois|juntos)\b|二人|二人とも|一緒に|둘 다|두 사람|같이|你们两个|你们俩|一起)/iu;
const PHOTO_NOUN=/(?:\b(?:photos?|pictures?|pics?|selfies?|snaps?|images?|fotos?|fotografías?|imágenes?|immagini|bilder?|fotos?|imagens?)\b|写真|画像|自撮り|사진|이미지|셀카|照片|图片|自拍)/iu;

function unique(values:string[]):string[]{return[...new Set(values.filter(Boolean))];}
function containsName(text:string,name:string):boolean{
  const first=name.trim().split(/\s+/)[0]??'';
  if(!first)return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_-])${escapeRegExp(first)}(?:$|[^\\p{L}\\p{N}_-])`,'iu').test(text);
}
function escapeRegExp(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

/**
 * Resolves who appears in a group photo independently from who has the
 * conversational floor. Explicit UI selection wins; text supports names,
 * "both", and whole-group wording without silently dropping people.
 */
export function resolveGroupPhotoSubjects(input:{
  text:string;
  participants:GroupMediaParticipant[];
  mentionedCharacterInstanceIds?:string[];
  explicitSubjectCharacterInstanceIds?:string[];
  fallbackSpeakerCharacterInstanceId?:string;
  maxSubjects?:number;
}):GroupPhotoSubjectResolution{
  const max=Math.max(1,input.maxSubjects??2),participantIds=new Set(input.participants.map((item)=>item.characterInstanceId));
  const validate=(ids:string[],reason:Extract<GroupPhotoSubjectResolution,{ok:true}>['reason']):GroupPhotoSubjectResolution=>{
    const subjects=unique(ids);
    if(!subjects.length)return{ok:false,code:'NO_SUBJECT',message:'Choose at least one companion for the photo.'};
    if(subjects.some((id)=>!participantIds.has(id)))return{ok:false,code:'INVALID_SUBJECT',message:'One selected companion is no longer in this group.'};
    if(subjects.length>max)return{ok:false,code:'TOO_MANY_SUBJECTS',message:`Choose up to ${max} companions for one photo.`};
    return{ok:true,subjectCharacterInstanceIds:subjects,reason};
  };
  if(input.explicitSubjectCharacterInstanceIds?.length)return validate(input.explicitSubjectCharacterInstanceIds,'explicit_selection');

  const mentioned=unique([
    ...(input.mentionedCharacterInstanceIds??[]),
    ...input.participants.filter((item)=>containsName(input.text,item.name)).map((item)=>item.characterInstanceId),
  ]).filter((id)=>participantIds.has(id));
  if(mentioned.length>max)return validate(mentioned,'named_subjects');

  // "Take a photo of Priya" makes Priya the subject even if Mara is being
  // addressed as the photographer. "A selfie with Priya" includes the sender.
  const noun=PHOTO_NOUN.exec(input.text),tail=noun?input.text.slice(noun.index+noun[0].length):'';
  const ofClause=/^\s+(?:of|de|di|von)\s+(.+)$/iu.exec(tail)?.[1];
  if(ofClause){
    const namedInClause=input.participants.filter((item)=>containsName(ofClause,item.name)).map((item)=>item.characterInstanceId);
    if(namedInClause.length){
      const includesAddressedPhotographer=/(?:\b(?:you|yourself|ti|tú|toi|te|tu|dir|dich|você)\b|あなた|君|너|你)/iu.test(ofClause);
      return validate([...(includesAddressedPhotographer?[input.fallbackSpeakerCharacterInstanceId??'']:[]),...namedInClause],'named_subjects');
    }
  }
  const withClause=/^\s+(?:with|con|avec|mit|com)\s+(.+)$/iu.exec(tail)?.[1];
  if(withClause){
    const namedWith=input.participants.filter((item)=>containsName(withClause,item.name)).map((item)=>item.characterInstanceId);
    return validate([input.fallbackSpeakerCharacterInstanceId??'',...namedWith],'named_subjects');
  }

  if(GROUP_LANGUAGE.test(input.text)){
    if(input.participants.length>max)return{ok:false,code:'TOO_MANY_SUBJECTS',message:`Group photos currently support up to ${max} companions. Choose them by name.`};
    return validate(input.participants.map((item)=>item.characterInstanceId),'whole_group');
  }
  if(PAIR_LANGUAGE.test(input.text)){
    if(mentioned.length===max)return validate(mentioned,'named_subjects');
    if(input.participants.length===2)return validate(input.participants.map((item)=>item.characterInstanceId),'pair_language');
    return{ok:false,code:'AMBIGUOUS_PAIR',message:'Choose which two companions should be in the photo.'};
  }
  if(mentioned.length)return validate(mentioned,'named_subjects');
  return validate([input.fallbackSpeakerCharacterInstanceId??''],'speaker_fallback');
}
