type Row=Record<string,unknown>;

export const MEDIA_OFFER_COMPANION_SELECT='id,user_id,continuity_id,together_character_templates(name,age,discovery_metadata),together_character_versions(visual_identity,character_bible)';

function record(value:unknown):Row{return value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};}

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
