type Row=Record<string,unknown>;

export const MEDIA_OFFER_COMPANION_SELECT='id,user_id,continuity_id,together_character_templates(name,age,discovery_metadata,creator_id),together_character_versions(visual_identity,character_bible)';

function record(value:unknown):Row{return value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};}

/** User-created companions have a creator_id; official catalog companions do not. */
export function isCustomCharacterTemplate(template:unknown):boolean{
  return Boolean(record(template).creator_id);
}

/**
 * Visual age presentation QA stays strict for custom companions.
 * Official catalog adults keep only an actual under-18/child fail.
 * Unknown subjects fail closed to the custom-character gate.
 */
export function requiresCustomCharacterAgePresentationCheck(subjects:Array<{companion?:{custom?:boolean}}>):boolean{
  return subjects.length===0||subjects.some((subject)=>subject.companion?.custom!==false);
}

export function customCharacterAgeCheckFromMetadata(metadata:unknown):boolean|null{
  const value=record(metadata).customCharacter;
  if(value===true)return true;
  if(value===false)return false;
  return null;
}

/** Authored companions are fictional by default; any canonical false flag wins. */
export function isFictionalCompanion(template:unknown,version:unknown):boolean{
  const templateRow=record(template),versionRow=record(version);
  const flags=[
    record(templateRow.discovery_metadata).fictional,
    record(versionRow.visual_identity).fictional,
    record(versionRow.character_bible).fictional,
  ];
  return !flags.some((value)=>value===false);
}

/** Real-person portrait references remain usable for safe media, but never for adult-capable media. */
export function isAdultMediaReferenceEligible(version:unknown):boolean{
  const visual=record(record(version).visual_identity);
  return visual.referenceOrigin!=='authorized_real_person'&&visual.adultMediaReferenceEligible!==false;
}
