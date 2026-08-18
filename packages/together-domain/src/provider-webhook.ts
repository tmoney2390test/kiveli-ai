export async function verifyProviderWebhookHmac(input:{rawBody:string;webhookId:string|null;timestamp:string|null;signature:string|null;secret:string;scheme?:string;now?:Date;maxAgeSeconds?:number}):Promise<boolean>{
  if(!input.webhookId||!input.timestamp||!input.signature||!input.secret)return false;
  const parts=input.signature.split(','),scheme=input.scheme??'v3';if(parts.length!==2||parts[0]!==scheme||!/^[a-f0-9]{64}$/i.test(parts[1]!))return false;
  const unix=Number(input.timestamp),now=Math.floor((input.now??new Date()).getTime()/1000);if(!Number.isFinite(unix)||Math.abs(now-unix)>(input.maxAgeSeconds??300))return false;
  const secret=input.secret.startsWith('whsec_')?input.secret.slice(6):input.secret,key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),expected=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${input.webhookId}.${input.timestamp}.${input.rawBody}`))),received=hexBytes(parts[1]!);return constantTimeEqual(expected,received);
}
function hexBytes(value:string):Uint8Array{const result=new Uint8Array(value.length/2);for(let index=0;index<value.length;index+=2)result[index/2]=Number.parseInt(value.slice(index,index+2),16);return result;}
function constantTimeEqual(left:Uint8Array,right:Uint8Array):boolean{if(left.length!==right.length)return false;let difference=0;for(let index=0;index<left.length;index+=1)difference|=left[index]!^right[index]!;return difference===0;}
