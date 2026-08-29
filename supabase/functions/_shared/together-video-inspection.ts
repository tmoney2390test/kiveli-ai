export type ActualVideoAudioBehavior='has_audio'|'silent'|'unknown';

/**
 * Detects an MP4 audio handler without decoding or trusting provider metadata.
 * Unknown containers remain unknown rather than being incorrectly labelled silent.
 */
export function detectActualVideoAudioBehavior(bytes:Uint8Array,contentType:string):ActualVideoAudioBehavior{
  if(!/video\/(mp4|quicktime)/i.test(contentType))return'unknown';
  for(let offset=0;offset+20<=bytes.length;offset+=1){
    if(bytes[offset]!==0x68||bytes[offset+1]!==0x64||bytes[offset+2]!==0x6c||bytes[offset+3]!==0x72)continue;
    const handler=String.fromCharCode(bytes[offset+12]??0,bytes[offset+13]??0,bytes[offset+14]??0,bytes[offset+15]??0);
    if(handler==='soun')return'has_audio';
  }
  return'silent';
}
