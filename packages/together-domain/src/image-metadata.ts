export type ImageDimensions={width:number;height:number};

/** Reads dimensions from validated PNG, JPEG, or WebP bytes without decoding pixels. */
export function imageDimensions(bytes:Uint8Array,contentType:string):ImageDimensions|null{
  if(contentType==='image/png')return pngDimensions(bytes);
  if(contentType==='image/jpeg')return jpegDimensions(bytes);
  if(contentType==='image/webp')return webpDimensions(bytes);
  return null;
}

function pngDimensions(bytes:Uint8Array):ImageDimensions|null{
  if(bytes.length<24||bytes[0]!==0x89||bytes[1]!==0x50||bytes[12]!==0x49||bytes[13]!==0x48||bytes[14]!==0x44||bytes[15]!==0x52)return null;
  return validDimensions(readU32Be(bytes,16),readU32Be(bytes,20));
}

function jpegDimensions(bytes:Uint8Array):ImageDimensions|null{
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  const startOfFrame=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while(offset+3<bytes.length){
    while(offset<bytes.length&&bytes[offset]===0xff)offset+=1;
    if(offset>=bytes.length)return null;
    const marker=bytes[offset++]!;
    if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(offset+1>=bytes.length)return null;
    const length=(bytes[offset]!<<8)|bytes[offset+1]!;
    if(length<2||offset+length>bytes.length)return null;
    if(startOfFrame.has(marker)&&length>=7)return validDimensions((bytes[offset+5]!<<8)|bytes[offset+6]!,(bytes[offset+3]!<<8)|bytes[offset+4]!);
    offset+=length;
  }
  return null;
}

function webpDimensions(bytes:Uint8Array):ImageDimensions|null{
  if(bytes.length<30||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP')return null;
  const chunk=ascii(bytes,12,4);
  if(chunk==='VP8X')return validDimensions(1+readU24Le(bytes,24),1+readU24Le(bytes,27));
  if(chunk==='VP8L'&&bytes[20]===0x2f){
    const width=1+bytes[21]!+((bytes[22]!&0x3f)<<8);
    const height=1+((bytes[22]!&0xc0)>>6)+(bytes[23]!<<2)+((bytes[24]!&0x0f)<<10);
    return validDimensions(width,height);
  }
  if(chunk==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){
    return validDimensions((bytes[26]!|(bytes[27]!<<8))&0x3fff,(bytes[28]!|(bytes[29]!<<8))&0x3fff);
  }
  return null;
}

function validDimensions(width:number,height:number):ImageDimensions|null{return Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0?{width,height}:null;}
function readU32Be(bytes:Uint8Array,offset:number):number{return((bytes[offset]!*0x1000000)+(bytes[offset+1]!<<16)+(bytes[offset+2]!<<8)+bytes[offset+3]!)>>>0;}
function readU24Le(bytes:Uint8Array,offset:number):number{return bytes[offset]!+(bytes[offset+1]!<<8)+(bytes[offset+2]!<<16);}
function ascii(bytes:Uint8Array,offset:number,length:number):string{return String.fromCharCode(...bytes.subarray(offset,offset+length));}
