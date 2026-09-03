import { adminClient } from '../_shared/context.ts';
import { resolveSubscriptionAccess } from '../_shared/kivelle-subscription.ts';
import { adultSessionTokenHash } from '../_shared/web-adult-access.ts';
import { sniffImageContentType } from '../../../packages/together-domain/src/security.ts';

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
  let storagePath:string|null=null;
  if(row.generated_media_id){const{data:media}=await db.from('together_generated_media').select('storage_path,content_rating,visibility_scope,status,media_type').eq('id',row.generated_media_id).eq('user_id',row.user_id).eq('content_rating','explicit').eq('visibility_scope','web_adult').eq('status','ready').eq('media_type','image').maybeSingle();storagePath=media?.storage_path??null;}
  else if(row.attachment_id){const{data:attachment}=await db.from('together_conversation_attachments').select('storage_path,content_rating,visibility_scope,upload_status,kind').eq('id',row.attachment_id).eq('user_id',row.user_id).eq('content_rating','explicit').eq('visibility_scope','web_adult').eq('upload_status','uploaded').eq('kind','image').maybeSingle();storagePath=attachment?.storage_path??null;}
  if(!storagePath)return unavailable();
  const downloaded=await db.storage.from('together-user-media').download(storagePath);if(downloaded.error||!downloaded.data)return unavailable();
  const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
  const mimeType=sniffImageContentType(bytes);
  if(!mimeType||!bytes.byteLength||bytes.byteLength>25*1024*1024)return unavailable();
  return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{'Content-Type':mimeType,'Cache-Control':'private, no-store, max-age=0','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'cross-origin',...corsHeaders(request)}});
}catch{return unavailable();}});

function corsHeaders(request:Request):Record<string,string>{
  const origin=request.headers.get('origin');
  if(!origin)return{};
  try{
    const host=new URL(origin).host;
    if(!/^(?:kivelli\.app|www\.kivelli\.app|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i.test(host))return{};
  }catch{return{};}
  return{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,HEAD,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
}

function unavailable(status=404):Response{return new Response('Unavailable',{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
