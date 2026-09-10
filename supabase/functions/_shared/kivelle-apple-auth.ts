import {createRemoteJWKSet,importPKCS8,jwtVerify,SignJWT} from 'npm:jose@6.2.12';
import type {SupabaseClient,User} from '@supabase/supabase-js';
import {AppError} from './types.ts';
const issuer='https://appleid.apple.com';
const appleKeys=createRemoteJWKSet(new URL(issuer+'/auth/keys'),{timeoutDuration:8000});
type ReadEnv=(name:string)=>string|undefined;
const env:ReadEnv=name=>Deno.env.get(name);
function required(name:string,read=env){const value=read(name)?.trim();if(!value)throw new AppError('PROVIDER_UNAVAILABLE','Apple account recovery is not configured. Your account can still be deleted.',503,true);return value;}
export function appleClientId(kind:'native'|'web',read=env):string{
  return required(kind==='native'?'KIVELLE_APPLE_CLIENT_ID':'KIVELLE_APPLE_WEB_CLIENT_ID',read);
}
export function appleSubjectMatches(user:Pick<User,'identities'>,subject:string):boolean{
  return Boolean(subject&&user.identities?.some(identity=>identity.provider==='apple'&&(identity.identity_data?.sub===subject||identity.id===subject)));
}
export async function appleClientSecret(clientId:string,read=env):Promise<string>{
  const allowed=[read('KIVELLE_APPLE_CLIENT_ID'),read('KIVELLE_APPLE_WEB_CLIENT_ID')].filter(Boolean);
  if(!allowed.includes(clientId))throw new AppError('FORBIDDEN','Apple client is not authorized.',403);
  const key=await importPKCS8(required('KIVELLE_APPLE_PRIVATE_KEY',read).replace(/\\n/g,'\n'),'ES256');
  return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:required('KIVELLE_APPLE_KEY_ID',read)}).setIssuer(required('KIVELLE_APPLE_TEAM_ID',read)).setSubject(clientId).setAudience(issuer).setIssuedAt().setExpirationTime('5m').sign(key);
}
function b64(bytes:Uint8Array):string{return btoa(String.fromCharCode(...bytes));}
function bytes(value:string):Uint8Array<ArrayBuffer>{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export async function sealAppleToken(token:string,userId:string,clientId:string,secret:string):Promise<string>{
  const material=bytes(secret);if(material.length!==32)throw new Error('APPLE_ENCRYPTION_KEY_INVALID');
  const key=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('kivelle-apple-v1:'+userId+':'+clientId)},key,new TextEncoder().encode(token));
  return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(ciphertext));
}
export async function unsealAppleToken(sealed:string,userId:string,clientId:string,secret:string):Promise<string>{
  const [version,iv,ciphertext]=sealed.split('.');
  if(version!=='v1'||!iv||!ciphertext)throw new Error('APPLE_TOKEN_INVALID');
  const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode('kivelle-apple-v1:'+userId+':'+clientId)},key,bytes(ciphertext));
  return new TextDecoder().decode(plain);
}
export async function captureAppleCredential(db:SupabaseClient,user:User,input:{kind:'native'|'web';authorizationCode?:string;refreshToken?:string}){
  const clientId=appleClientId(input.kind),secret=await appleClientSecret(clientId);
  const body=new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:input.kind==='native'?'authorization_code':'refresh_token'});
  if(input.kind==='native'&&input.authorizationCode)body.set('code',input.authorizationCode);
  else if(input.kind==='web'&&input.refreshToken)body.set('refresh_token',input.refreshToken);
  else throw new AppError('VALIDATION_ERROR','A fresh Apple authorization is required.',400);
  let response:Response;
  try{response=await fetch(issuer+'/auth/token',{method:'POST',body,signal:AbortSignal.timeout(8000)});}
  catch{throw new AppError('PROVIDER_UNAVAILABLE','Apple account recovery could not be prepared. Try signing in with Apple again.',503,true);}
  if(!response.ok)throw new AppError('PROVIDER_UNAVAILABLE','Apple authorization could not be verified. Try signing in with Apple again.',503,true);
  const payload=await response.json();
  if(typeof payload.id_token!=='string')throw new AppError('FORBIDDEN','Apple identity could not be verified.',403);
  const {payload:identity}=await jwtVerify(payload.id_token,appleKeys,{issuer,audience:clientId,algorithms:['RS256']});
  if(!identity.sub||!appleSubjectMatches(user,identity.sub))throw new AppError('FORBIDDEN','Apple identity does not match this account.',403);
  const refreshToken=payload.refresh_token??(input.kind==='web'?input.refreshToken:undefined);
  if(typeof refreshToken!=='string'||!refreshToken)throw new AppError('PROVIDER_UNAVAILABLE','Apple did not provide a revocable credential.',503,true);
  const encrypted=await sealAppleToken(refreshToken,user.id,clientId,required('KIVELLE_APPLE_TOKEN_ENCRYPTION_KEY'));
  const {error}=await db.rpc('kivelle_store_apple_credential',{p_user_id:user.id,p_client_id:clientId,p_subject:identity.sub,p_encrypted_token:encrypted});
  if(error)throw new AppError('INTERNAL_ERROR','Apple account recovery could not be saved.',500,true);
}
export async function retryAppleRevocations(db:SupabaseClient,now=new Date()){
  const {data:jobs,error}=await db.rpc('kivelle_claim_apple_revocations',{p_now:now.toISOString()});
  if(error)throw new AppError('INTERNAL_ERROR','Apple revocation queue could not be claimed.',500,true);
  const result={revoked:0,retry:0,failed:0};
  for(const job of jobs??[]){
    try{
      const token=await unsealAppleToken(job.encrypted_token,job.user_id,job.client_id,required('KIVELLE_APPLE_TOKEN_ENCRYPTION_KEY'));
      const body=new URLSearchParams({client_id:job.client_id,client_secret:await appleClientSecret(job.client_id),token,token_type_hint:'refresh_token'});
      const response=await fetch(issuer+'/auth/revoke',{method:'POST',body,signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('APPLE_REVOCATION_UNAVAILABLE');
      const update=await db.from('together_apple_credentials').update({status:'revoked',encrypted_token:'',subject:'',failure_code:null,lease_id:null,lease_expires_at:null,updated_at:now.toISOString()}).eq('user_id',job.user_id).eq('client_id',job.client_id).eq('lease_id',job.lease_id).select('user_id').maybeSingle();
      if(update.error||!update.data)continue;
      const {count,error:countError}=await db.from('together_apple_credentials').select('user_id',{count:'exact',head:true}).eq('user_id',job.user_id).neq('status','revoked');
      if(!countError&&count===0)await db.from('together_account_deletion_jobs').update({apple_revocation_status:'complete'}).eq('user_id',job.user_id);
      result.revoked++;
    }catch{
      const failed=job.attempt_count>=8;
      await db.from('together_apple_credentials').update({status:failed?'failed':'pending',failure_code:'APPLE_REVOCATION_UNAVAILABLE',next_attempt_at:new Date(now.getTime()+Math.min(86400000,60000*2**job.attempt_count)).toISOString(),lease_id:null,lease_expires_at:null,updated_at:now.toISOString()}).eq('user_id',job.user_id).eq('client_id',job.client_id).eq('lease_id',job.lease_id);
      await db.from('together_account_deletion_jobs').update({apple_revocation_status:'retry'}).eq('user_id',job.user_id);
      result[failed?'failed':'retry']++;
      if(failed){
        console.error(JSON.stringify({operation:'apple_revocation_exhausted',code:'APPLE_REVOCATION_UNAVAILABLE'}));
        await db.rpc('kivelle_ops_upsert_incident',{p_dedupe_key:'apple-revocation-configuration',p_source:'account_deletion',p_severity:'high',p_title:'Apple credential revocation needs attention',p_summary_safe:'Apple revocation retries were exhausted. Check server credentials and the protected retry queue.',p_correlation_id:null,p_metadata:{code:'APPLE_REVOCATION_UNAVAILABLE'}});
      }
    }
  }
  // Credential tombstones are not billing records and carry no long-term value.
  await db.from('together_apple_credentials').delete().eq('status','revoked').lt('updated_at',new Date(now.getTime()-7*86400000).toISOString());
  return result;
}
