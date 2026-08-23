import{File}from'expo-file-system';
import{manipulateAsync,SaveFormat,type Action}from'expo-image-manipulator';
import{normalizedJpegName,userImageResize,USER_IMAGE_MAX_EDGE,USER_IMAGE_MAX_OUTPUT_BYTES,validateUserImageSource,type KnownImageDimensions}from'./imageUploadPolicy';

export type NormalizedUserImage={uri:string;mimeType:'image/jpeg';byteSize:number;width:number;height:number;fileName:string;temporary:true};

export async function normalizeUserImage(input:KnownImageDimensions&{uri:string;fileSize?:number|null;fileName?:string|null},quality=.9):Promise<NormalizedUserImage>{
  validateUserImageSource({byteSize:input.fileSize,width:input.width,height:input.height});
  const resize=userImageResize(input),actions:Action[]=resize?[{resize}]:[];
  let result=await manipulateAsync(input.uri,actions,{compress:quality,format:SaveFormat.JPEG});
  const correctiveResize=userImageResize(result);
  if(correctiveResize){
    const previous=result.uri;
    result=await manipulateAsync(result.uri,[{resize:correctiveResize}],{compress:quality,format:SaveFormat.JPEG});
    cleanupNormalizedImage(previous);
  }
  if(Math.max(result.width,result.height)>USER_IMAGE_MAX_EDGE)throw new Error('That photo could not be resized safely.');
  const response=await fetch(result.uri),blob=await response.blob();
  if(blob.size>USER_IMAGE_MAX_OUTPUT_BYTES){cleanupNormalizedImage(result.uri);throw new Error('That photo is still too large after resizing.');}
  return{uri:result.uri,mimeType:'image/jpeg',byteSize:blob.size,width:result.width,height:result.height,fileName:normalizedJpegName(input.fileName),temporary:true};
}

export function cleanupNormalizedImage(uri?:string|null):void{
  if(!uri?.startsWith('file:'))return;
  try{const file=new File(uri);if(file.exists)file.delete();}catch{/* Expo owns the cache; failed cleanup is harmless and retried by the OS. */}
}
