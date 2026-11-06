export const USER_IMAGE_MAX_EDGE=2048;
export const USER_IMAGE_MAX_INPUT_BYTES=10*1024*1024;
export const USER_IMAGE_MAX_OUTPUT_BYTES=10*1024*1024;
// A full-resolution 48 MP phone photo can be 8064 × 6048 (48,771,072 pixels).
// Keep an input guard for decoding, but let ordinary high-resolution photos
// reach the 2048-pixel normalization step before upload.
export const USER_IMAGE_MAX_INPUT_PIXELS=64_000_000;

export type KnownImageDimensions={width?:number|null;height?:number|null};

export function userImageResize(dimensions:KnownImageDimensions,maxEdge=USER_IMAGE_MAX_EDGE):{width?:number;height?:number}|null{
  const width=Number(dimensions.width),height=Number(dimensions.height);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||Math.max(width,height)<=maxEdge)return null;
  return width>=height?{width:maxEdge}:{height:maxEdge};
}

export function validateUserImageSource(input:KnownImageDimensions&{byteSize?:number|null}):void{
  const byteSize=Number(input.byteSize??0),width=Number(input.width??0),height=Number(input.height??0);
  if(Number.isFinite(byteSize)&&byteSize>USER_IMAGE_MAX_INPUT_BYTES)throw new Error('Choose an image no larger than 10 MB.');
  if(width>0&&height>0&&(width*height>USER_IMAGE_MAX_INPUT_PIXELS||Math.max(width,height)>12_000))throw new Error('This photo is too large to process safely. Choose a version up to 64 megapixels.');
}

export function normalizedJpegName(fileName?:string|null):string{
  const stem=(fileName??'shared-photo').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'shared-photo';
  return`${stem}.jpg`;
}

export function userImageNormalizationError(fileName?:string|null):string{
  return /\.(heic|heif)$/i.test(fileName??'')
    ? 'This device could not convert that HEIC photo. In Photos, choose Share or Export with “Most Compatible,” then try again.'
    : 'That photo could not be opened safely. Try a JPEG, PNG, or WebP image.';
}
