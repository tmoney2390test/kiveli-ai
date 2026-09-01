export type PersonaResponseLength='concise'|'balanced'|'detailed';
export type PersonaQuestionFrequency='low'|'natural'|'high';
export type PersonaCommunicationTone='gentle'|'natural'|'direct';
export type PersonaCommunicationConfig={
  responseLength:PersonaResponseLength;
  questionFrequency:PersonaQuestionFrequency;
  tone:PersonaCommunicationTone;
};
export type PersonaAppearanceConfig={avatarPath?:string;description?:string};
export type PersonaIdentity={id:string;userId:string;displayName:string;age?:number|null};
export type KivelleLife={id:string;userId:string;personaId:string;kind:'main'|'alternate';activeCompanionInstanceId?:string|null};
export type LifeCharacterInstance={id:string;userId:string;continuityId:string;characterTemplateId:string};
export function validatePersona(persona:PersonaIdentity):boolean{return Boolean(persona.id&&persona.userId&&persona.displayName.trim()&&(persona.age==null||(Number.isInteger(persona.age)&&persona.age>=18&&persona.age<=120)));}
export function canAttachInstance(life:KivelleLife,instance:LifeCharacterInstance):boolean{return life.id===instance.continuityId&&life.userId===instance.userId;}
export function sameReality(left:{continuityId:string},right:{continuityId:string}):boolean{return left.continuityId===right.continuityId;}
export function canMeetTemplate(instances:LifeCharacterInstance[],continuityId:string,characterTemplateId:string):boolean{return!instances.some((item)=>item.continuityId===continuityId&&item.characterTemplateId===characterTemplateId);}

export function normalizePersonaCommunicationConfig(value:unknown):PersonaCommunicationConfig{
  const input=record(value);
  return{
    responseLength:oneOf(input['responseLength'],['concise','balanced','detailed'],'balanced'),
    questionFrequency:oneOf(input['questionFrequency'],['low','natural','high'],'natural'),
    tone:oneOf(input['tone'],['gentle','natural','direct'],'natural'),
  };
}

export function normalizePersonaAppearanceConfig(value:unknown):PersonaAppearanceConfig{
  const input=record(value);
  const avatarPath=cleanString(input['avatarPath'],500);
  const description=cleanString(input['description'],500);
  return{...(avatarPath?{avatarPath}:{}),...(description?{description}:{})};
}

function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function cleanString(value:unknown,max:number):string{return typeof value==='string'?value.trim().slice(0,max):'';}
function oneOf<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T{return typeof value==='string'&&allowed.includes(value as T)?value as T:fallback;}
