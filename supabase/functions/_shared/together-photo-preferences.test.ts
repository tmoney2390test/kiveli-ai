import{generatedPhotosEnabled,synchronizedGeneratedPhotoPreferences}from'./together-photo-preferences.ts';

function assertEquals(actual:unknown,expected:unknown,message:string){if(actual!==expected)throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);}

Deno.test('the current generated-photos setting overrides stale legacy photo settings',()=>{
  assertEquals(generatedPhotosEnabled({multimodal_preferences:{generatedPhotos:true},photo_preferences:{companionPhotos:false}}),true,'current enabled setting');
  assertEquals(generatedPhotosEnabled({multimodal_preferences:{generatedPhotos:false},photo_preferences:{companionPhotos:true}}),false,'current disabled setting');
  assertEquals(generatedPhotosEnabled({photo_preferences:{companionPhotos:false}}),false,'legacy fallback');
});

Deno.test('saving either photo toggle keeps both preference stores aligned',()=>{
  const enabled=synchronizedGeneratedPhotoPreferences({photo_preferences:{automaticPhotos:true},multimodal_preferences:{liveVoiceCalls:true}},true);
  assertEquals(enabled.photoPreferences.companionPhotos,true,'legacy companion photos');
  assertEquals(enabled.multimodalPreferences.generatedPhotos,true,'current generated photos');
  const disabled=synchronizedGeneratedPhotoPreferences(enabled,false);
  assertEquals(disabled.photoPreferences.automaticPhotos,false,'automatic offers when photos are disabled');
  assertEquals(disabled.multimodalPreferences.generatedPhotos,false,'current generated photos disabled');
});
