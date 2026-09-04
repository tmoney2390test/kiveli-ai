import { adminClient } from '../_shared/context.ts';
import { resolveSubscriptionAccess } from '../_shared/kivelle-subscription.ts';
import { adultSessionTokenHash } from '../_shared/web-adult-access.ts';
import { sniffImageContentType } from '../../../packages/together-domain/src/security.ts';
import { adultAssetCorsHeaders,adultVideoResponseHeaders,resolveAdultVideoAsset,safeVideoRange } from '../_shared/adult-asset-delivery.ts';

Deno.serve(async(request)=>{try{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='GET'&&request.method!=='HEAD')return unavailable(405);
  if(Deno.env.get('WEB_ADULT_MODE_ENABLED')?.toLowerCase()!=='true')return unavailable();
  const grant=new URL(request.url).searchParams.get('grant');
  if(!grant||!/^[A-Za-z0-9_-]{32,128}$/.test(grant))return unavailable();
  const db=adminClient(),grantHash=await adultSessionTokenHash(grant);
  const{data:row}=await db.from('together_adult_asset_grants').select('id,user_id,web_session_id,generated_media_id,attachment_id,expires_at,together_web_adult_sessions!inner(adult_mode_enabled,expires_at,revoked_at)').eq('token_hash',grantHash).gt('expires_at',new Date().toISOString()).maybeSingle();
  if(!row)return unavailable();
  const session=Array.isArray(row.together_web_adult_sessions)?row.together_web_adult_sessions[0]:row.together_web_adult_sessions;
  if(!session||session.adult_mode_enabled!==true||session.revoked_at||new Date(session.expires_at).getTime()<=Date.now())return unavailable();
  const[{data:profile},subscription]=await Promise.all([db.from('together_profiles').select('adult_eligible_at').eq('user_id',row.user_id).maybeSingle(),resolveSubscriptionAccess(db,String(row.user_id))]);
  if(!profile?.adult_eligible_at||subscription.tier==='free')return unavailable();
  let storagePath:string|null=null,videoAsset:{storagePath:string;byteSize:number|null}|null=null;
  if(row.generated_media_id){const{data:media}=await db.from('together_generated_media').select('storage_path,content_rating,visibility_scope,status,media_type,content_type,byte_size').eq('id',row.generated_media_id).eq('user_id',row.user_id).eq('content_rating','explicit').eq('visibility_scope','web_adult').eq('status','ready').in('media_type',['image','video']).maybeSingle();videoAsset=media?resolveAdultVideoAsset(media):null;storagePath=videoAsset?.storagePath??(media?.media_type==='image'?media?.storage_path??null:null);}
  else if(row.attachment_id){const{data:attachment}=await db.from('together_conversation_attachments').select('storage_path,content_rating,visibility_scope,upload_status,kind').eq('id',row.attachment_id).eq('user_id',row.user_id).eq('content_rating','explicit').eq('visibility_scope','web_adult').eq('upload_status','uploaded').eq('kind','image').maybeSingle();storagePath=attachment?.storage_path??null;}
  if(!storagePath)return unavailable();
  if(videoAsset){
    const requestedRange=request.headers.get('range'),range=safeVideoRange(requestedRange);
    if(requestedRange&&!range)return unavailable(416,request);
    const{data:signed,error}=await db.storage.from('together-user-media').createSignedUrl(videoAsset.storagePath,120);
    if(error||!signed?.signedUrl)return unavailable();
    const upstream=await fetch(signed.signedUrl,{method:request.method,headers:range?{Range:range}:undefined,redirect:'follow'});
    if(!upstream.ok||![200,206].includes(upstream.status))return unavailable(upstream.status===416?416:404,request);
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:adultVideoResponseHeaders(upstream.headers,request)});
  }
  const downloaded=await db.storage.from('together-user-media').download(storagePath);if(downloaded.error||!downloaded.data)return unavailable();
  const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
  const mimeType=sniffImageContentType(bytes);
  if(!mimeType||!bytes.byteLength||bytes.byteLength>25*1024*1024)return unavailable();
  return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{'Content-Type':mimeType,'Cache-Control':'private, no-store, max-age=0','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'cross-origin',...corsHeaders(request)}});
}catch{return unavailable();}});

function corsHeaders(request:Request):Record<string,string>{return adultAssetCorsHeaders(request);}

function unavailable(status=404,request?:Request):Response{return new Response('Unavailable',{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(request?corsHeaders(request):{})}});}
