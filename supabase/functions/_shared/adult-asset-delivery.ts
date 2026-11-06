const MAX_VIDEO_BYTES=250*1024*1024;

export type AdultAssetMedia={
  storage_path?:unknown;
  media_type?:unknown;
  content_type?:unknown;
  byte_size?:unknown;
};

export function resolveAdultVideoAsset(media:AdultAssetMedia):{storagePath:string;byteSize:number|null}|null{
  const storagePath=typeof media.storage_path==='string'?media.storage_path.trim():'';
  const contentType=typeof media.content_type==='string'?media.content_type.toLowerCase().trim():'';
  const byteSize=media.byte_size==null?null:Number(media.byte_size);
  if(media.media_type!=='video'||!storagePath||contentType!=='video/mp4'||!storagePath.toLowerCase().endsWith('.mp4'))return null;
  if(byteSize!==null&&(!Number.isFinite(byteSize)||byteSize<=0||byteSize>MAX_VIDEO_BYTES))return null;
  return{storagePath,byteSize};
}

export function resolveAdultVoiceAsset(media:AdultAssetMedia):{storagePath:string;contentType:'audio/mpeg'|'audio/wav'}|null{
  const storagePath=typeof media.storage_path==='string'?media.storage_path.trim():'';
  const contentType=typeof media.content_type==='string'?media.content_type.toLowerCase().trim():'';
  const byteSize=media.byte_size==null?null:Number(media.byte_size);
  const validMp3=contentType==='audio/mpeg'&&storagePath.toLowerCase().endsWith('.mp3');
  const validWav=contentType==='audio/wav'&&storagePath.toLowerCase().endsWith('.wav');
  if(media.media_type!=='voice_note'||!storagePath||(!validMp3&&!validWav))return null;
  if(byteSize!==null&&(!Number.isFinite(byteSize)||byteSize<=0||byteSize>25*1024*1024))return null;
  return{storagePath,contentType:contentType as 'audio/mpeg'|'audio/wav'};
}

export function adultVoiceResponseSizeValid(headers:Headers):boolean{
  const contentRange=headers.get('content-range');
  const total=contentRange?Number(/^bytes \d+-\d+\/(\d+)$/.exec(contentRange)?.[1]):Number(headers.get('content-length'));
  return Number.isFinite(total)&&total>0&&total<=25*1024*1024;
}

export function safeVideoRange(value:string|null):string|null{
  if(!value)return null;
  const normalized=value.trim();
  return/^bytes=(?:\d+-\d*|\d*-\d+)$/.test(normalized)?normalized:null;
}

export function adultVideoResponseHeaders(upstream:Headers,request:Request):Headers{
  return adultStreamResponseHeaders(upstream,request,'video/mp4');
}

export function adultVoiceResponseHeaders(upstream:Headers,request:Request,contentType:'audio/mpeg'|'audio/wav'):Headers{
  return adultStreamResponseHeaders(upstream,request,contentType);
}

function adultStreamResponseHeaders(upstream:Headers,request:Request,contentType:string):Headers{
  const headers=new Headers({
    'Content-Type':contentType,
    'Cache-Control':'private, no-store, max-age=0',
    'Content-Disposition':'inline',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Cross-Origin-Resource-Policy':'cross-origin',
    'Accept-Ranges':upstream.get('accept-ranges')??'bytes',
    ...adultAssetCorsHeaders(request),
  });
  for(const name of['content-length','content-range']){
    const value=upstream.get(name);if(value)headers.set(name,value);
  }
  return headers;
}

export function adultAssetCorsHeaders(request:Request):Record<string,string>{
  const origin=request.headers.get('origin');
  if(!origin)return{};
  try{
    const host=new URL(origin).host;
    if(!/^(?:kivelli\.app|www\.kivelli\.app|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i.test(host))return{};
  }catch{return{};}
  return{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Range',
    'Access-Control-Expose-Headers':'Accept-Ranges, Content-Length, Content-Range',
    'Vary':'Origin',
  };
}
