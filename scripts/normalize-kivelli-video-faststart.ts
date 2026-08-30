import{randomUUID}from'node:crypto';
import{createClient}from'@supabase/supabase-js';
import type{SupabaseClient}from'@supabase/supabase-js';
import{normalizeMp4FastStart}from'../supabase/functions/_shared/together-video-inspection.ts';

async function main():Promise<void>{
  const supabaseUrl=requiredEnvironment('KIVELLI_VIDEO_BACKFILL_SUPABASE_URL');
  const serviceRoleKey=requiredEnvironment('KIVELLI_VIDEO_BACKFILL_SERVICE_ROLE_KEY');
  const mediaId=requiredEnvironment('KIVELLI_VIDEO_BACKFILL_MEDIA_ID');
  const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const{data:media,error:mediaError}=await db.from('together_generated_media')
    .select('id,media_type,status,storage_path,content_type,metadata')
    .eq('id',mediaId)
    .maybeSingle();
  if(mediaError)throw mediaError;
  if(!media)throw new Error('The requested generated-media record was not found.');
  if(media.media_type!=='video'||media.status!=='ready'||!media.storage_path)throw new Error('The requested record is not a stored, ready video.');
  if(media.content_type!=='video/mp4')throw new Error('Only MP4 videos can be normalized by this utility.');

  const{data:stored,error:downloadError}=await db.storage.from('together-user-media').download(String(media.storage_path));
  if(downloadError||!stored)throw downloadError??new Error('The stored video could not be downloaded.');
  const originalBytes=new Uint8Array(await stored.arrayBuffer());
  const normalized=normalizeMp4FastStart(originalBytes,'video/mp4');

  if(!normalized.fastStart)throw new Error('The MP4 layout could not be safely normalized.');
  const oldStoragePath=String(media.storage_path);
  const needsCacheBustingPath=normalized.relocated||!oldStoragePath.includes('-faststart-');
  let finalStoragePath=oldStoragePath;
  if(needsCacheBustingPath){
    const newStoragePath=versionedStoragePath(oldStoragePath);
    const{error:uploadError}=await db.storage.from('together-user-media').upload(newStoragePath,normalized.bytes,{contentType:'video/mp4',upsert:false,cacheControl:'31536000'});
    if(uploadError)throw uploadError;

    const now=new Date().toISOString();
    const metadata=media.metadata&&typeof media.metadata==='object'?media.metadata as Record<string,unknown>:{};
    const adjustedChunkOffsets=normalized.adjustedChunkOffsets||Number(metadata.fastStartChunkOffsetsAdjusted??0);
    const{error:updateError}=await db.from('together_generated_media').update({
      storage_path:newStoragePath,
      byte_size:normalized.bytes.byteLength,
      metadata:{...metadata,fastStart:true,fastStartNormalized:true,fastStartBackfilled:true,fastStartChunkOffsetsAdjusted:adjustedChunkOffsets,fastStartNormalizedAt:now},
      updated_at:now,
    }).eq('id',mediaId);
    if(updateError){
      await db.storage.from('together-user-media').remove([newStoragePath]);
      throw updateError;
    }
    const{error:removeError}=await db.storage.from('together-user-media').remove([oldStoragePath]);
    if(removeError)throw new Error('The video was repaired, but its obsolete storage object could not be removed.');
    finalStoragePath=newStoragePath;
  }

  const delivery=await verifySignedDelivery(db,finalStoragePath);
  console.log(JSON.stringify({mediaId,bytes:normalized.bytes.byteLength,relocated:normalized.relocated,republished:needsCacheBustingPath,adjustedChunkOffsets:normalized.adjustedChunkOffsets,delivery}));
}

function requiredEnvironment(name:string):string{
  const value=process.env[name];
  if(!value)throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function versionedStoragePath(storagePath:string):string{
  const extensionIndex=storagePath.lastIndexOf('.');
  const stem=extensionIndex>storagePath.lastIndexOf('/')?storagePath.slice(0,extensionIndex):storagePath;
  return`${stem}-faststart-${randomUUID()}.mp4`;
}

async function verifySignedDelivery(db:SupabaseClient,storagePath:string):Promise<Record<string,unknown>>{
  const{data,error}=await db.storage.from('together-user-media').createSignedUrl(storagePath,60);
  if(error||!data?.signedUrl)throw error??new Error('A signed playback URL could not be created.');
  const response=await fetch(data.signedUrl,{headers:{Range:'bytes=0-65535'}});
  if(response.status!==200&&response.status!==206)throw new Error('The signed playback response was unavailable.');
  const bytes=new Uint8Array(await response.arrayBuffer()),boxOrder=topLevelBoxOrder(bytes);
  const moovIndex=boxOrder.indexOf('moov'),mdatIndex=boxOrder.indexOf('mdat');
  if(moovIndex<0||mdatIndex<0||moovIndex>mdatIndex)throw new Error('The signed playback response was not fast-start compatible.');
  return{status:response.status,contentType:response.headers.get('content-type'),contentRange:response.headers.get('content-range'),boxOrder,receivedBytes:bytes.byteLength};
}

function topLevelBoxOrder(bytes:Uint8Array):string[]{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),types:string[]=[];
  for(let start=0;start+8<=bytes.byteLength;){
    const compactSize=view.getUint32(start,false);
    const type=String.fromCharCode(...bytes.subarray(start+4,start+8));
    types.push(type);
    let size=compactSize;
    if(compactSize===0)break;
    if(compactSize===1){
      if(start+16>bytes.byteLength)break;
      const extended=view.getBigUint64(start+8,false);
      if(extended>BigInt(Number.MAX_SAFE_INTEGER))break;
      size=Number(extended);
    }
    if(size<8)break;
    start+=size;
  }
  return types;
}

main().catch((error:unknown)=>{
  console.error(error instanceof Error?error.message:'Video normalization failed.');
  process.exitCode=1;
});
