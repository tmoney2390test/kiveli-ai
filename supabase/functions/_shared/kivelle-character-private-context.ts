type Row=Record<string,unknown>;

export type PrivateCharacterPromptProfile={
  private_truth?:unknown;
  adult_continuity?:unknown;
  intimate_anatomy?:unknown;
  hidden_sexual?:unknown;
};

/**
 * Merge server-owned character depth into the model-only prompt context.
 * The base character version remains safe for public catalog/bootstrap reads.
 */
export function mergePrivateCharacterPromptContext(
  publicBible:unknown,
  profile:PrivateCharacterPromptProfile|null|undefined,
  includeAdult:boolean,
):Row{
  const bible=publicBible&&typeof publicBible==='object'&&!Array.isArray(publicBible)?{...(publicBible as Row)}:{};
  const privateTruth=clean(profile?.private_truth);
  if(privateTruth)bible.privateTruth=privateTruth;
  if(!includeAdult)return bible;
  const adultContinuity=clean(profile?.adult_continuity),intimateAnatomy=clean(profile?.intimate_anatomy),hiddenSexual=clean(profile?.hidden_sexual);
  if(adultContinuity)bible.adultContinuity=adultContinuity;
  if(intimateAnatomy)bible.intimateAnatomy=intimateAnatomy;
  if(hiddenSexual)bible.hiddenSexual=hiddenSexual;
  return bible;
}

function clean(value:unknown):string|null{
  return typeof value==='string'&&value.trim()?value.trim():null;
}
