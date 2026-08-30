import type{SupabaseClient}from'@supabase/supabase-js';

export function isHiddenDirectVideoFrame(media:Record<string,unknown>):boolean{
  const metadata=(media.metadata??{}) as Record<string,unknown>;
  return String(media.media_type)==='image'&&metadata.hiddenIntermediate===true&&metadata.source==='direct_video_frame';
}

export async function cleanupDirectVideoSourceFrame(db:SupabaseClient,video:Record<string,unknown>):Promise<void>{
  const metadata=(video.metadata??{}) as Record<string,unknown>;if(metadata.directVideoGeneratedFirstFrame!==true)return;
  const sourceId=String(video.parent_media_id??metadata.directVideoSourceFrameId??'');if(!sourceId)return;
  const{data:source}=await db.from('together_generated_media').select('*').eq('id',sourceId).eq('user_id',String(video.user_id)).eq('media_type','image').maybeSingle();if(!source||!isHiddenDirectVideoFrame(source))return;
  const storagePath=String(source.storage_path??'');
  if(storagePath){
    const{error}=await db.storage.from('together-user-media').remove([storagePath]);
    if(error)await db.from('together_storage_cleanup_jobs').insert({user_id:String(video.user_id),bucket_id:'together-user-media',storage_path:storagePath,status:'pending',attempt_count:1,last_error:error.message});
  }
  const sourceMetadata=(source.metadata??{}) as Record<string,unknown>,now=new Date().toISOString();
  const{error:updateError}=await db.from('together_generated_media').update({storage_path:null,byte_size:null,metadata:{...sourceMetadata,intermediateCleanedAt:now},updated_at:now}).eq('id',sourceId).eq('user_id',String(video.user_id));
  if(updateError)console.warn(JSON.stringify({level:'warn',operation:'direct_video_source_frame_cleanup',sourceMediaId:sourceId,errorCode:updateError.code??'update_failed'}));
}
