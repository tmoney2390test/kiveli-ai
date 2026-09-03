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

export type Mp4FastStartResult={
  bytes:Uint8Array;
  fastStart:boolean;
  relocated:boolean;
  adjustedChunkOffsets:number;
};

export type Mp4AudioStripResult={bytes:Uint8Array;stripped:boolean;removedTracks:number};

/**
 * Removes MP4 audio track declarations without decoding or re-encoding the
 * video stream. Unreferenced audio samples may remain inside `mdat`, but no
 * player can discover or play them after the `soun` tracks are removed.
 */
export function stripMp4AudioTracks(bytes:Uint8Array,contentType:string):Mp4AudioStripResult{
  const unchanged:Mp4AudioStripResult={bytes,stripped:false,removedTracks:0};
  if(contentType!=='video/mp4'||bytes.byteLength<24)return unchanged;
  const boxes=parseTopLevelBoxes(bytes),moov=boxes?.find((box)=>box.type==='moov');
  if(!boxes||!moov||moov.headerSize!==8)return unchanged;
  const children=parseBoxesInRange(bytes,moov.start+moov.headerSize,moov.start+moov.size);if(!children)return unchanged;
  const removed=children.filter((box)=>box.type==='trak'&&boxContainsAudioHandler(bytes,box));if(!removed.length)return unchanged;
  const kept=children.filter((box)=>!removed.includes(box)),removedBytes=removed.reduce((sum,box)=>sum+box.size,0),newMoovSize=moov.size-removedBytes;
  if(newMoovSize<8||newMoovSize>0xffff_ffff)return unchanged;
  const nextMoov=new Uint8Array(newMoovSize);nextMoov.set(bytes.subarray(moov.start,moov.start+8),0);new DataView(nextMoov.buffer).setUint32(0,newMoovSize,false);
  let cursor=8;for(const box of kept){const part=bytes.subarray(box.start,box.start+box.size);nextMoov.set(part,cursor);cursor+=part.byteLength;}
  const mdat=boxes.find((box)=>box.type==='mdat');
  if(mdat&&moov.start<mdat.start&&!adjustChunkOffsetsBy(nextMoov,-removedBytes,mdat.start))return unchanged;
  const output=new Uint8Array(bytes.byteLength-removedBytes);output.set(bytes.subarray(0,moov.start),0);output.set(nextMoov,moov.start);output.set(bytes.subarray(moov.start+moov.size),moov.start+nextMoov.byteLength);
  return{bytes:output,stripped:true,removedTracks:removed.length};
}

type Mp4Box={start:number;size:number;headerSize:number;type:string};

/**
 * Moves an MP4's metadata in front of its media payload so mobile browsers can
 * start playback without first downloading the complete video. Chunk offsets
 * are repaired in-place in the copied `moov` atom before it is relocated.
 */
export function normalizeMp4FastStart(bytes:Uint8Array,contentType:string):Mp4FastStartResult{
  const unchanged=(fastStart=false):Mp4FastStartResult=>({bytes,fastStart,relocated:false,adjustedChunkOffsets:0});
  if(contentType!=='video/mp4'||bytes.byteLength<16)return unchanged();

  const boxes=parseTopLevelBoxes(bytes);
  if(!boxes)return unchanged();
  const moov=boxes.find((box)=>box.type==='moov');
  const mdat=boxes.find((box)=>box.type==='mdat');
  if(!moov||!mdat)return unchanged();
  if(moov.start<mdat.start)return unchanged(true);
  if(moov.start<mdat.start+mdat.size)return unchanged();

  const adjustedMoov=bytes.slice(moov.start,moov.start+moov.size);
  const adjustedChunkOffsets=adjustChunkOffsetTables(adjustedMoov,moov.size,mdat.start,moov.start);
  if(adjustedChunkOffsets===null||adjustedChunkOffsets===0)return unchanged();

  const normalized=new Uint8Array(bytes.byteLength);
  let cursor=0;
  normalized.set(bytes.subarray(0,mdat.start),cursor);cursor+=mdat.start;
  normalized.set(adjustedMoov,cursor);cursor+=adjustedMoov.byteLength;
  normalized.set(bytes.subarray(mdat.start,moov.start),cursor);cursor+=moov.start-mdat.start;
  normalized.set(bytes.subarray(moov.start+moov.size),cursor);cursor+=bytes.byteLength-(moov.start+moov.size);
  if(cursor!==normalized.byteLength)return unchanged();

  return{bytes:normalized,fastStart:true,relocated:true,adjustedChunkOffsets};
}

function parseTopLevelBoxes(bytes:Uint8Array):Mp4Box[]|null{
  const view=dataView(bytes),boxes:Mp4Box[]=[];
  for(let start=0;start<bytes.byteLength;){
    if(start+8>bytes.byteLength)return null;
    const compactSize=view.getUint32(start,false),type=boxType(bytes,start+4);
    let size:number,headerSize=8;
    if(compactSize===0)size=bytes.byteLength-start;
    else if(compactSize===1){
      if(start+16>bytes.byteLength)return null;
      const extendedSize=view.getBigUint64(start+8,false);
      if(extendedSize>BigInt(Number.MAX_SAFE_INTEGER))return null;
      size=Number(extendedSize);headerSize=16;
    }else size=compactSize;
    if(size<headerSize||start+size>bytes.byteLength)return null;
    boxes.push({start,size,headerSize,type});
    start+=size;
  }
  return boxes;
}

function parseBoxesInRange(bytes:Uint8Array,start:number,end:number):Mp4Box[]|null{
  const view=dataView(bytes),boxes:Mp4Box[]=[];
  for(let cursor=start;cursor<end;){if(cursor+8>end)return null;const size=view.getUint32(cursor,false),type=boxType(bytes,cursor+4);if(size<8||cursor+size>end)return null;boxes.push({start:cursor,size,headerSize:8,type});cursor+=size;}
  return boxes;
}

function boxContainsAudioHandler(bytes:Uint8Array,box:Mp4Box):boolean{
  const end=box.start+box.size;
  for(let offset=box.start+8;offset+20<=end;offset+=1){if(boxType(bytes,offset)!=='hdlr')continue;const handler=String.fromCharCode(bytes[offset+12]??0,bytes[offset+13]??0,bytes[offset+14]??0,bytes[offset+15]??0);if(handler==='soun')return true;}
  return false;
}

function adjustChunkOffsetsBy(moov:Uint8Array,delta:number,minimumOriginalOffset:number):boolean{
  const view=dataView(moov);
  for(let typeOffset=4;typeOffset+12<=moov.byteLength;typeOffset+=1){const type=boxType(moov,typeOffset);if(type!=='stco'&&type!=='co64')continue;const boxStart=typeOffset-4,boxSize=view.getUint32(boxStart,false),entrySize=type==='stco'?4:8;if(boxSize<16||boxStart+boxSize>moov.byteLength)return false;const count=view.getUint32(typeOffset+8,false),entriesStart=typeOffset+12;if(count>Math.floor((boxStart+boxSize-entriesStart)/entrySize))return false;for(let index=0;index<count;index+=1){const at=entriesStart+index*entrySize,current=entrySize===4?BigInt(view.getUint32(at,false)):view.getBigUint64(at,false);if(current<BigInt(minimumOriginalOffset))continue;const next=current+BigInt(delta);if(next<0n)return false;if(entrySize===4){if(next>0xffff_ffffn)return false;view.setUint32(at,Number(next),false);}else view.setBigUint64(at,next,false);}typeOffset=boxStart+boxSize-1;}
  return true;
}

function adjustChunkOffsetTables(moov:Uint8Array,delta:number,mdatStart:number,moovStart:number):number|null{
  const view=dataView(moov);
  let adjusted=0;
  for(let typeOffset=4;typeOffset+12<=moov.byteLength;typeOffset+=1){
    const type=boxType(moov,typeOffset);
    if(type!=='stco'&&type!=='co64')continue;
    const boxStart=typeOffset-4,boxSize=view.getUint32(boxStart,false),entrySize=type==='stco'?4:8;
    if(boxSize<16||boxStart+boxSize>moov.byteLength)return null;
    const entryCount=view.getUint32(typeOffset+8,false),entriesStart=typeOffset+12;
    if(entryCount>Math.floor((boxStart+boxSize-entriesStart)/entrySize))return null;
    for(let index=0;index<entryCount;index+=1){
      const entryOffset=entriesStart+index*entrySize;
      const current=entrySize===4?BigInt(view.getUint32(entryOffset,false)):view.getBigUint64(entryOffset,false);
      if(current<BigInt(mdatStart)||current>=BigInt(moovStart))return null;
      const next=current+BigInt(delta);
      if(entrySize===4){
        if(next>0xffff_ffffn)return null;
        view.setUint32(entryOffset,Number(next),false);
      }else view.setBigUint64(entryOffset,next,false);
      adjusted+=1;
    }
    typeOffset=boxStart+boxSize-1;
  }
  return adjusted;
}

function dataView(bytes:Uint8Array):DataView{return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}

function boxType(bytes:Uint8Array,offset:number):string{
  return String.fromCharCode(bytes[offset]??0,bytes[offset+1]??0,bytes[offset+2]??0,bytes[offset+3]??0);
}
