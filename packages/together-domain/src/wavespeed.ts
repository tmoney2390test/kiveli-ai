export type WaveSpeedRequestOptions={enableSyncMode?:boolean|undefined;enableBase64Output?:boolean|undefined};

export function buildWaveSpeedRequestBody(input:Record<string,unknown>,options:WaveSpeedRequestOptions={}):Record<string,unknown>{
  const body={...input};
  if(options.enableSyncMode!==undefined)body['enable_sync_mode']=options.enableSyncMode;
  if(options.enableBase64Output!==undefined)body['enable_base64_output']=options.enableBase64Output;
  return body;
}

export function normalizeWaveSpeedOutputs(value:unknown):{urlOutputs:string[];textOutputs:string[]}{
  const urlOutputs:string[]=[],textOutputs:string[]=[];
  for(const output of Array.isArray(value)?value:[])collectOutput(output,urlOutputs,textOutputs,0);
  return{urlOutputs:[...new Set(urlOutputs)],textOutputs:[...new Set(textOutputs)]};
}

const URL_KEYS=new Set(['url','uri','image_url','video_url','output_url']);
const TEXT_KEYS=new Set(['text','answer','content','caption','response','message','value','output']);
const CONTAINER_KEYS=new Set(['data','result']);

function collectOutput(value:unknown,urls:string[],texts:string[],depth:number):void{
  if(depth>4||value==null)return;
  if(typeof value==='string'){
    const normalized=value.trim();
    if(!normalized)return;
    if(isHttpsUrl(normalized))urls.push(normalized);else texts.push(normalized);
    return;
  }
  if(Array.isArray(value)){for(const item of value)collectOutput(item,urls,texts,depth+1);return;}
  if(typeof value!=='object')return;
  const record=value as Record<string,unknown>;
  let collected=false;
  for(const[key,item]of Object.entries(record)){
    const normalizedKey=key.toLowerCase();
    if(URL_KEYS.has(normalizedKey)||TEXT_KEYS.has(normalizedKey)||CONTAINER_KEYS.has(normalizedKey)){
      const before=urls.length+texts.length;
      collectOutput(item,urls,texts,depth+1);
      collected=collected||urls.length+texts.length>before;
    }
  }
  if(!collected){try{const serialized=JSON.stringify(value);if(serialized)texts.push(serialized);}catch{/* Ignore non-serializable provider output. */}}
}

function isHttpsUrl(value:string):boolean{try{return new URL(value).protocol==='https:';}catch{return false;}}
