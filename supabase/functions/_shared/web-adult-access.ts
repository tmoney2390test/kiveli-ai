import type { SupabaseClient, User } from '@supabase/supabase-js';
import { resolveSubscriptionAccess } from './kivelle-subscription.ts';
import { adultPipelineAuthorized } from '../../../packages/together-domain/src/adult-access.ts';
import { normalizePrivateAdultTextMode, resolveAdultEligibility, type AdultEligibility, type PrivateAdultTextMode } from '../../../packages/together-domain/src/platform-content-policy.ts';
import { AppError } from './types.ts';
import { paidEntitlementAccepted, resolveBillingSurfacePolicy } from './web-billing-policy.ts';
import { waitUntil } from './background.ts';

export type ClientSurface='web'|'native_or_unknown';
export type AdultAccessContext={
  premium_access:boolean;
  adult_eligible:boolean;
  adult_mode_enabled:boolean;
  client_surface:ClientSurface;
  adult_generation_enabled:boolean;
  authorized_web_adult:boolean;
  adult_eligibility:AdultEligibility;
  private_adult_text_mode:PrivateAdultTextMode;
  web_session_id:string|null;
};

const COOKIE_NAME='__Host-kivelli_web_session';

export async function resolveAdultAccess(request:Request,user:User,db:SupabaseClient):Promise<AdultAccessContext>{
  const cookieToken=readCookie(request.headers.get('cookie'),COOKIE_NAME);
  const webSessionPromise=cookieToken
    ? sha256Hex(cookieToken).then((hash)=>db.from('together_web_adult_sessions').select('id,adult_mode_enabled,expires_at,revoked_at').eq('user_id',user.id).eq('token_hash',hash).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle())
    : Promise.resolve({data:null});
  const [verifiedWebSurface,subscription,profile,webSessionResult]=await Promise.all([
    verifyWebSurfaceAssertion(request,user.id),
    resolveSubscriptionAccess(db,user.id),
    db.from('together_profiles').select('adult_eligible_at,age_verified_at,date_of_birth').eq('user_id',user.id).maybeSingle(),
    webSessionPromise,
  ]);
  const client_surface=verifiedWebSurface?'web':'native_or_unknown';
  const premium_access=paidEntitlementAccepted(resolveBillingSurfacePolicy(client_surface),subscription.tier,subscription.billing.provider);
  const adult_eligibility=resolveAdultEligibility({adultEligibleAt:profile.data?.adult_eligible_at,ageVerifiedAt:profile.data?.age_verified_at,dateOfBirth:profile.data?.date_of_birth});
  const adult_eligible=adult_eligibility.allowed;
  let adult_mode_enabled=false,web_session_id:string|null=null;
  const session=webSessionResult.data;
  if(client_surface==='web'&&session){
    web_session_id=String(session.id);
    adult_mode_enabled=Boolean(session.adult_mode_enabled);
    const seenAt=new Date().toISOString();
    waitUntil(Promise.resolve(db.from('together_web_adult_sessions').update({last_seen_at:seenAt,updated_at:seenAt}).eq('id',session.id).then(()=>undefined)));
  }
  // Authorization fails closed unless both the global switch and independent
  // moderation provider are available. When either is off every caller receives
  // the safe projection; canonical content remains stored and unchanged.
  const adult_generation_enabled=envTrue('WEB_ADULT_MODE_ENABLED')&&Boolean(Deno.env.get('OPENAI_API_KEY')?.trim());
  const authorized_web_adult=adultPipelineAuthorized({client_surface,premium_access,adult_eligible,adult_mode_enabled,global_enabled:adult_generation_enabled});
  const private_adult_text_mode=normalizePrivateAdultTextMode(Deno.env.get('KIVELLE_PRIVATE_ADULT_TEXT_MODE'));
  return{premium_access,adult_eligible,adult_mode_enabled,client_surface,adult_generation_enabled,authorized_web_adult,adult_eligibility,private_adult_text_mode,web_session_id};
}

export async function requireVerifiedWebSurface(request:Request,userId:string):Promise<void>{
  if(!await verifyWebSurfaceAssertion(request,userId))throw new AppError('FORBIDDEN','This setting is only available in a verified website session.',403,false);
}

export async function verifyWebSurfaceAssertion(request:Request,userId:string,now=Date.now()):Promise<boolean>{
  try{
    const secret=Deno.env.get('KIVELLE_SURFACE_SIGNING_SECRET');
    if(!secret||secret.length<24)return false;
    const surface=request.headers.get('x-kivelli-surface'),assertedUser=request.headers.get('x-kivelli-surface-user'),timestamp=request.headers.get('x-kivelli-surface-time'),nonce=request.headers.get('x-kivelli-surface-nonce'),path=request.headers.get('x-kivelli-surface-path'),signature=request.headers.get('x-kivelli-surface-signature');
    if(surface!=='web'||assertedUser!==userId||!timestamp||!nonce||!path||!signature)return false;
    if(!surfacePathMatches(new URL(request.url).pathname,path))return false;
    const seconds=Number(timestamp);if(!Number.isFinite(seconds)||Math.abs(Math.floor(now/1000)-seconds)>90)return false;
    if(!/^[0-9a-f-]{16,80}$/i.test(nonce)||!/^[A-Za-z0-9_-]{43}$/.test(signature))return false;
    const canonical=surfaceCanonical(request.method,path,userId,timestamp,nonce);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const signatureBytes=base64UrlBytes(signature),signatureBuffer=signatureBytes.buffer.slice(signatureBytes.byteOffset,signatureBytes.byteOffset+signatureBytes.byteLength) as ArrayBuffer;
    return await crypto.subtle.verify('HMAC',key,signatureBuffer,new TextEncoder().encode(canonical));
  }catch{return false;}
}

export function surfaceCanonical(method:string,path:string,userId:string,timestamp:string,nonce:string):string{return[String(method).toUpperCase(),path,userId,timestamp,nonce,'web'].join('\n');}
export function surfacePathMatches(requestPath:string,assertedPath:string):boolean{
  const normalize=(value:string)=>value.length>1?value.replace(/\/+$/,''):value;
  const requestValue=normalize(requestPath),assertedValue=normalize(assertedPath);
  if(requestValue===assertedValue)return true;
  const edgePrefix='/functions/v1';
  return assertedValue.startsWith(`${edgePrefix}/`)&&requestValue===assertedValue.slice(edgePrefix.length);
}
export function adultSessionCookie(token:string,maxAgeSeconds=2_592_000):string{return`${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Strict`;}
export function clearAdultSessionCookie():string{return`${COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;}
export function newAdultSessionToken():string{const bytes=crypto.getRandomValues(new Uint8Array(32));return bytesToBase64Url(bytes);}
export async function adultSessionTokenHash(token:string):Promise<string>{return sha256Hex(token);}
export function readAdultSessionToken(request:Request):string|null{return readCookie(request.headers.get('cookie'),COOKIE_NAME);}

export async function currentAdultMediaJobAuthorized(db:SupabaseClient,media:Record<string,unknown>):Promise<boolean>{
  const restricted=media.visibility_scope==='web_adult'||['suggestive','mature','explicit'].includes(String(media.content_level??''));
  if(!restricted)return true;
  if(!envTrue('WEB_ADULT_MODE_ENABLED')||!envTrue('KIVELLE_ADULT_MEDIA_ENABLED')||!Deno.env.get('OPENAI_API_KEY')?.trim())return false;
  const metadata=(media.metadata??{}) as Record<string,unknown>,sessionId=String(metadata.adultWebSessionId??''),userId=String(media.user_id??'');
  if(!sessionId||!userId)return false;
  for(let attempt=0;attempt<2;attempt+=1){
    try{
      const[subscription,profile,session]=await Promise.all([
        resolveSubscriptionAccess(db,userId),
        db.from('together_profiles').select('adult_eligible_at').eq('user_id',userId).maybeSingle(),
        db.from('together_web_adult_sessions').select('adult_mode_enabled,expires_at,revoked_at').eq('id',sessionId).eq('user_id',userId).maybeSingle(),
      ]);
      if(profile.error||session.error)throw new Error('adult_media_revalidation_read_failed');
      return adultMediaJobAuthorizationValid({tier:subscription.tier,adultEligibleAt:profile.data?.adult_eligible_at,session:session.data});
    }catch{
      if(attempt===0){await new Promise((resolve)=>setTimeout(resolve,150));continue;}
      console.warn(JSON.stringify({level:'warn',operation:'adult_media_revalidation_unavailable',mediaId:String(media.id??''),code:'authorization_read_failed'}));
    }
  }
  return false;
}

export function adultMediaJobAuthorizationValid(input:{tier:string;adultEligibleAt:unknown;session:{adult_mode_enabled?:unknown;expires_at?:unknown;revoked_at?:unknown}|null|undefined},now=Date.now()):boolean{
  return input.tier!=='free'&&Boolean(input.adultEligibleAt)&&input.session?.adult_mode_enabled===true&&!input.session.revoked_at&&new Date(String(input.session.expires_at??0)).getTime()>now;
}

export async function issueAdultAssetUrl(input:{request:Request;db:SupabaseClient;access:AdultAccessContext;userId:string;generatedMediaId?:string;attachmentId?:string}):Promise<string>{
  if(!input.access.authorized_web_adult||!input.access.web_session_id)throw new Error('ADULT_ASSET_AUTHORIZATION_REQUIRED');
  const token=newAdultSessionToken(),tokenHash=await sha256Hex(token),expiresAt=new Date(Date.now()+15*60_000).toISOString();
  const{error}=await input.db.from('together_adult_asset_grants').insert({user_id:input.userId,web_session_id:input.access.web_session_id,token_hash:tokenHash,expires_at:expiresAt,generated_media_id:input.generatedMediaId??null,attachment_id:input.attachmentId??null});
  if(error)throw new Error('ADULT_ASSET_GRANT_FAILED');
  const forwardedHost=input.request.headers.get('x-forwarded-host'),host=forwardedHost&&/^(?:kivelli\.app|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i.test(forwardedHost)?forwardedHost:'kivelli.app';
  const protocol=/^(?:localhost|127\.)/.test(host)?'http':'https';
  return`${protocol}://${host}/supabase/functions/v1/together-adult-asset?grant=${encodeURIComponent(token)}`;
}

function envTrue(name:string):boolean{return Deno.env.get(name)?.trim().toLowerCase()==='true';}
function readCookie(header:string|null,name:string):string|null{if(!header)return null;for(const part of header.split(';')){const[index,...rest]=part.trim().split('=');if(index===name){const value=rest.join('=');return/^[A-Za-z0-9_-]{32,128}$/.test(value)?value:null;}}return null;}
async function sha256Hex(value:string):Promise<string>{const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return[...digest].map((byte)=>byte.toString(16).padStart(2,'0')).join('');}
function base64UrlBytes(value:string):Uint8Array{const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');const binary=atob(normalized);return Uint8Array.from(binary,(char)=>char.charCodeAt(0));}
function bytesToBase64Url(bytes:Uint8Array):string{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
