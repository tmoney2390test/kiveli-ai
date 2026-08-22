type PreferenceRecord=Record<string,unknown>;

function record(value:unknown):PreferenceRecord{return value&&typeof value==='object'&&!Array.isArray(value)?value as PreferenceRecord:{};}

/** The current Media & voice toggle is authoritative; legacy photo settings remain a fallback. */
export function generatedPhotosEnabled(profile:unknown):boolean{
  const source=record(profile),multimodal=record(source.multimodal_preferences);
  if(typeof multimodal.generatedPhotos==='boolean')return multimodal.generatedPhotos;
  return record(source.photo_preferences).companionPhotos!==false;
}

export function synchronizedGeneratedPhotoPreferences(profile:unknown,enabled:boolean){
  const source=record(profile),photo=record(source.photo_preferences),multimodal=record(source.multimodal_preferences);
  return{
    photoPreferences:{...photo,companionPhotos:enabled,automaticPhotos:enabled&&photo.automaticPhotos!==false},
    multimodalPreferences:{...multimodal,generatedPhotos:enabled},
  };
}
