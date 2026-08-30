import{assertEquals,assertNotStrictEquals,assertStrictEquals}from'jsr:@std/assert@1';
import{normalizeMp4FastStart}from'./together-video-inspection.ts';

Deno.test('relocates a trailing MP4 moov atom and repairs stco offsets',()=>{
  const fixture=videoFixture('stco');
  const original=fixture.bytes.slice();
  const result=normalizeMp4FastStart(fixture.bytes,'video/mp4');

  assertEquals(result.fastStart,true);
  assertEquals(result.relocated,true);
  assertEquals(result.adjustedChunkOffsets,2);
  assertNotStrictEquals(result.bytes,fixture.bytes);
  assertEquals(fixture.bytes,original);
  assertEquals(topLevelTypes(result.bytes),['ftyp','free','moov','mdat']);
  assertEquals(chunkOffsets(result.bytes,'stco'),fixture.offsets.map((offset)=>BigInt(offset+fixture.moovSize)));
});

Deno.test('repairs 64-bit co64 chunk offsets while relocating metadata',()=>{
  const fixture=videoFixture('co64');
  const result=normalizeMp4FastStart(fixture.bytes,'video/mp4');

  assertEquals(result.fastStart,true);
  assertEquals(result.relocated,true);
  assertEquals(chunkOffsets(result.bytes,'co64'),fixture.offsets.map((offset)=>BigInt(offset+fixture.moovSize)));
});

Deno.test('leaves an already streamable MP4 untouched',()=>{
  const fixture=videoFixture('stco');
  const boxes=topLevelBoxes(fixture.bytes);
  const ftypAndFree=fixture.bytes.subarray(0,boxes[2]!.start);
  const mdat=fixture.bytes.subarray(boxes[2]!.start,boxes[2]!.start+boxes[2]!.size);
  const moov=fixture.bytes.subarray(boxes[3]!.start);
  const alreadyFast=join(ftypAndFree,moov,mdat);
  const result=normalizeMp4FastStart(alreadyFast,'video/mp4');

  assertEquals(result.fastStart,true);
  assertEquals(result.relocated,false);
  assertStrictEquals(result.bytes,alreadyFast);
});

Deno.test('does not alter unsupported video containers',()=>{
  const bytes=videoFixture('stco').bytes;
  const result=normalizeMp4FastStart(bytes,'video/webm');
  assertEquals(result.fastStart,false);
  assertStrictEquals(result.bytes,bytes);
});

function videoFixture(offsetTable:'stco'|'co64'){
  const ftyp=box('ftyp',new Uint8Array(8));
  const free=box('free',new Uint8Array(4));
  const mdatStart=ftyp.byteLength+free.byteLength;
  const offsets=[mdatStart+8,mdatStart+16];
  const mdat=box('mdat',new Uint8Array(24));
  const table=offsetTable==='stco'?stco(offsets):co64(offsets);
  const moov=box('moov',box('trak',table));
  return{bytes:join(ftyp,free,mdat,moov),offsets,moovSize:moov.byteLength};
}

function box(type:string,payload:Uint8Array):Uint8Array{
  const bytes=new Uint8Array(8+payload.byteLength),view=new DataView(bytes.buffer);
  view.setUint32(0,bytes.byteLength,false);
  bytes.set(Array.from(type).map((value)=>value.charCodeAt(0)),4);
  bytes.set(payload,8);
  return bytes;
}

function stco(offsets:number[]):Uint8Array{
  const payload=new Uint8Array(8+offsets.length*4),view=new DataView(payload.buffer);
  view.setUint32(4,offsets.length,false);
  offsets.forEach((offset,index)=>view.setUint32(8+index*4,offset,false));
  return box('stco',payload);
}

function co64(offsets:number[]):Uint8Array{
  const payload=new Uint8Array(8+offsets.length*8),view=new DataView(payload.buffer);
  view.setUint32(4,offsets.length,false);
  offsets.forEach((offset,index)=>view.setBigUint64(8+index*8,BigInt(offset),false));
  return box('co64',payload);
}

function topLevelTypes(bytes:Uint8Array):string[]{return topLevelBoxes(bytes).map((entry)=>entry.type);}

function topLevelBoxes(bytes:Uint8Array):Array<{start:number;size:number;type:string}>{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),boxes:Array<{start:number;size:number;type:string}>=[];
  for(let start=0;start<bytes.byteLength;){
    const size=view.getUint32(start,false),type=String.fromCharCode(...bytes.subarray(start+4,start+8));
    boxes.push({start,size,type});start+=size;
  }
  return boxes;
}

function chunkOffsets(bytes:Uint8Array,type:'stco'|'co64'):bigint[]{
  const marker=Array.from(type).map((value)=>value.charCodeAt(0));
  let typeOffset=-1;
  for(let index=4;index<=bytes.byteLength-4;index+=1){
    if(marker.every((value,part)=>bytes[index+part]===value)){typeOffset=index;break;}
  }
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entrySize=type==='stco'?4:8;
  const count=view.getUint32(typeOffset+8,false),values:bigint[]=[];
  for(let index=0;index<count;index+=1){
    const offset=typeOffset+12+index*entrySize;
    values.push(entrySize===4?BigInt(view.getUint32(offset,false)):view.getBigUint64(offset,false));
  }
  return values;
}

function join(...parts:Uint8Array[]):Uint8Array{
  const output=new Uint8Array(parts.reduce((total,part)=>total+part.byteLength,0));
  let cursor=0;for(const part of parts){output.set(part,cursor);cursor+=part.byteLength;}return output;
}
