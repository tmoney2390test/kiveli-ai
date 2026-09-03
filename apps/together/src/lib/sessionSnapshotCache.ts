import type { Snapshot } from '../types';

const CACHE_VERSION = 2;
const CACHE_TTL_MS = 30 * 60_000;
const MAX_CACHE_BYTES = 4_500_000;
const COMPRESS_CACHE_THRESHOLD_BYTES=750_000;

type SnapshotCacheEnvelope = { version: number; userId: string; savedAt: number; snapshot: Snapshot };
type CompressedSnapshotCacheEnvelope = { version: number; userId: string; savedAt: number; encoding: 'gzip-base64'; payload: string };

export function sessionSnapshotCacheKey(userId: string): string {
  return `kivelle:session-snapshot:v${CACHE_VERSION}:${userId}`;
}

export function serializeSessionSnapshot(userId: string, snapshot: Snapshot, savedAt = Date.now()): string | null {
  try {
    const value = JSON.stringify({ version: CACHE_VERSION, userId, savedAt, snapshot } satisfies SnapshotCacheEnvelope);
    return value.length <= MAX_CACHE_BYTES ? value : null;
  } catch {
    return null;
  }
}

export function parseSessionSnapshot(raw: string | null, userId: string, now = Date.now()): Snapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SnapshotCacheEnvelope>;
    if (value.version !== CACHE_VERSION || value.userId !== userId || !value.savedAt || now - value.savedAt > CACHE_TTL_MS || now < value.savedAt) return null;
    const snapshot = value.snapshot;
    if (!snapshot || !Array.isArray(snapshot.worlds) || !Array.isArray(snapshot.characters) || !Array.isArray(snapshot.conversations)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export async function readSessionSnapshot(userId: string): Promise<Snapshot | null> {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  const key = sessionSnapshotCacheKey(userId);
  const raw=window.sessionStorage.getItem(key);
  let snapshot=parseSessionSnapshot(raw,userId);
  if(!snapshot&&raw&&supportsCompressionStreams()){
    try{
      const envelope=JSON.parse(raw) as Partial<CompressedSnapshotCacheEnvelope>;
      if(envelope.version===CACHE_VERSION&&envelope.userId===userId&&envelope.encoding==='gzip-base64'&&envelope.payload&&envelope.savedAt&&Date.now()-envelope.savedAt<=CACHE_TTL_MS&&Date.now()>=envelope.savedAt){
        const decompressed=await decompressBase64(envelope.payload);
        snapshot=parseSessionSnapshot(decompressed,userId);
      }
    }catch{snapshot=null;}
  }
  if (!snapshot) window.sessionStorage.removeItem(key);
  return snapshot;
}

export async function writeSessionSnapshot(userId: string, snapshot: Snapshot): Promise<boolean> {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  const savedAt=Date.now();
  const raw=JSON.stringify({version:CACHE_VERSION,userId,savedAt,snapshot} satisfies SnapshotCacheEnvelope);
  let value=raw.length<=Math.min(MAX_CACHE_BYTES,COMPRESS_CACHE_THRESHOLD_BYTES)?raw:null;
  if(!value&&supportsCompressionStreams()){
    try{
      const payload=await compressToBase64(raw);
      const compressed=JSON.stringify({version:CACHE_VERSION,userId,savedAt,encoding:'gzip-base64',payload} satisfies CompressedSnapshotCacheEnvelope);
      if(compressed.length<=MAX_CACHE_BYTES)value=compressed;
    }catch{value=null;}
  }
  if(!value)return false;
  try {
    window.sessionStorage.setItem(sessionSnapshotCacheKey(userId), value);
    return true;
  } catch {
    return false;
  }
}

export function clearSessionSnapshot(userId: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.removeItem(sessionSnapshotCacheKey(userId));
  window.sessionStorage.removeItem(sessionHeroCacheKey(userId));
}

export function readSessionHeroUri(userId:string):string|null{
  if(typeof window==='undefined'||!window.sessionStorage)return null;
  const value=window.sessionStorage.getItem(sessionHeroCacheKey(userId));
  return value?.startsWith('https://')||value?.startsWith('/')?value:null;
}

export function writeSessionHeroUri(userId:string,uri:string):boolean{
  if(typeof window==='undefined'||!window.sessionStorage||(!uri.startsWith('https://')&&!uri.startsWith('/')))return false;
  try{window.sessionStorage.setItem(sessionHeroCacheKey(userId),uri);return true;}catch{return false;}
}

function sessionHeroCacheKey(userId:string){return`kivelle:startup-hero:v1:${userId}`;}

function supportsCompressionStreams(){return typeof CompressionStream!=='undefined'&&typeof DecompressionStream!=='undefined';}

async function compressToBase64(value:string){
  const stream=new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decompressBase64(value:string){
  const stream=new Blob([base64ToBytes(value)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function bytesToBase64(bytes:Uint8Array){
  let binary='';
  const chunkSize=0x8000;
  for(let index=0;index<bytes.length;index+=chunkSize)binary+=String.fromCharCode(...bytes.subarray(index,index+chunkSize));
  return btoa(binary);
}

function base64ToBytes(value:string){
  const binary=atob(value),bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
  return bytes;
}
