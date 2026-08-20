import { classifyPhotoIntent } from './media.ts';
import type { MediaContentLevel } from './media-routing.ts';

export type MediaEditSemantics='correction'|'creative_variant';

export const MAX_MEDIA_EDIT_DEPTH=8;

const LEVELS:MediaContentLevel[]=['standard','romance','suggestive','mature','explicit'];
const CORRECTION=/\b(?:fix|repair|correct|restore|clean up|remove (?:an? )?(?:artifact|distortion)|sharpen|improve)\b[^.!?]{0,60}\b(?:face|eyes?|mouth|teeth|skin|hand|hands|finger|fingers|thumb|arm|arms|leg|legs|foot|feet|toe|toes|anatomy|artifact|distortion|blur|detail|lighting|quality)\b|\b(?:proper|natural|realistic|undistorted|correct)\s+(?:face|hands?|fingers?|anatomy|proportions?)\b/i;

export function resolveMediaEditContentLevel(source:MediaContentLevel,instruction:string):MediaContentLevel{
  const requested=editRequestedContentLevel(instruction);
  return LEVELS[Math.max(LEVELS.indexOf(source),LEVELS.indexOf(requested))]??source;
}

function editRequestedContentLevel(instruction:string):MediaContentLevel{
  const classified=classifyPhotoIntent(instruction).requestedContentLevel;
  if(classified)return classified;
  if(/\b(?:nude|naked|topless|bottomless|explicit|nsfw|genitals?|genitalia|vulva|pussy|vagina|penis|dick|cock|boobs?|breasts?|tits?|nipples?)\b|\b(?:remove|take off)\b[^.!?]{0,30}\b(?:shirt|top|blouse|bra|shorts|pants|trousers|skirt|underwear|panties|clothes|clothing)\b/i.test(instruction))return'explicit';
  if(/\b(?:suggestive|lingerie|sexy|thirst trap)\b/i.test(instruction))return'suggestive';
  if(/\b(?:romantic|kiss|kissing)\b/i.test(instruction))return'romance';
  return'standard';
}

export function classifyMediaEditSemantics(instruction:string):MediaEditSemantics{
  return CORRECTION.test(instruction)?'correction':'creative_variant';
}

export function normalizeMediaEditInstruction(instruction:string):string{
  return instruction.normalize('NFKC').replace(/[<>]/g,'').replace(/\s+/g,' ').trim().slice(0,400);
}

export function buildMediaEditConstraint(instruction:string,semantics:MediaEditSemantics):string{
  const change=normalizeMediaEditInstruction(instruction);
  return [
    `Apply only this requested change to the existing photograph: ${change}`,
    semantics==='correction'
      ?'This is a corrective repair. Keep the original event, identity, pose, wardrobe, setting, framing, lighting, expression, and composition unchanged except where a minimal correction is required.'
      :'This is a creative derivative. Keep the same fictional adult identity and preserve every visual element the request does not explicitly change.',
    'Do not add extra people, captions, watermarks, borders, inset reference images, or unrelated objects.',
  ].join('\n');
}
