import{describe,expect,it}from'vitest';import{canAttachInstance,canMeetTemplate,sameReality,validatePersona}from'../src';
describe('Persona and Kivelle Life isolation',()=>{
  const main={id:'main',userId:'tim',personaId:'tim-persona',kind:'main' as const},alternate={id:'jordan-life',userId:'tim',personaId:'jordan',kind:'alternate' as const};
  const timMaya={id:'maya-a',userId:'tim',continuityId:'main',characterTemplateId:'maya'},jordanMaya={id:'maya-b',userId:'tim',continuityId:'jordan-life',characterTemplateId:'maya'};
  it('allows the same template in separate Lives but not twice inside one Life',()=>{expect(canMeetTemplate([timMaya],'jordan-life','maya')).toBe(true);expect(canMeetTemplate([timMaya],'main','maya')).toBe(false);});
  it('requires state and character ownership to match the Life',()=>{expect(canAttachInstance(main,timMaya)).toBe(true);expect(canAttachInstance(main,jordanMaya)).toBe(false);expect(canAttachInstance(alternate,jordanMaya)).toBe(true);});
  it('treats continuity as the reality boundary',()=>{expect(sameReality(timMaya,jordanMaya)).toBe(false);expect(sameReality(timMaya,{continuityId:'main'})).toBe(true);});
  it('keeps adult Persona validation explicit',()=>{expect(validatePersona({id:'p',userId:'u',displayName:'Jordan',age:31})).toBe(true);expect(validatePersona({id:'p',userId:'u',displayName:'Jordan',age:17})).toBe(false);});
});
