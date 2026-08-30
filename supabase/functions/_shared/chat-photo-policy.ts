export function matchesChatPhotoSignature(bytes:Uint8Array,mimeType:string):boolean{
  if(mimeType==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mimeType==='image/png')return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
  if(mimeType==='image/webp')return bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP';
  return false;
}

export function isAnimatedChatPhoto(bytes:Uint8Array,mimeType:string):boolean{
  if(mimeType==='image/png'){
    for(let offset=8;offset+12<=bytes.length;){const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);if(ascii(bytes,offset+4,4)==='acTL')return true;if(length>bytes.length-offset-12)break;offset+=12+length;}
  }
  if(mimeType==='image/webp'){
    for(let offset=12;offset+8<=bytes.length;){const chunk=ascii(bytes,offset,4),length=new DataView(bytes.buffer,bytes.byteOffset+offset+4,4).getUint32(0,true);if(chunk==='ANIM'||chunk==='ANMF')return true;if(length>bytes.length-offset-8)break;offset+=8+length+(length%2);}
  }
  return false;
}

function ascii(bytes:Uint8Array,start:number,length:number):string{return String.fromCharCode(...bytes.slice(start,start+length));}
