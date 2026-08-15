export type PersonaIdentity={id:string;userId:string;displayName:string;age?:number|null};
export type KivelleLife={id:string;userId:string;personaId:string;kind:'main'|'alternate';activeCompanionInstanceId?:string|null};
export type LifeCharacterInstance={id:string;userId:string;continuityId:string;characterTemplateId:string};
export function validatePersona(persona:PersonaIdentity):boolean{return Boolean(persona.id&&persona.userId&&persona.displayName.trim()&&(!persona.age||persona.age>=18));}
export function canAttachInstance(life:KivelleLife,instance:LifeCharacterInstance):boolean{return life.id===instance.continuityId&&life.userId===instance.userId;}
export function sameReality(left:{continuityId:string},right:{continuityId:string}):boolean{return left.continuityId===right.continuityId;}
export function canMeetTemplate(instances:LifeCharacterInstance[],continuityId:string,characterTemplateId:string):boolean{return!instances.some((item)=>item.continuityId===continuityId&&item.characterTemplateId===characterTemplateId);}
