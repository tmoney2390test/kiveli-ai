import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { corsHeaders, errorResponse } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { adultSessionCookie, adultSessionTokenHash, newAdultSessionToken, readAdultSessionToken, requireVerifiedWebSurface, resolveAdultAccess } from '../_shared/web-adult-access.ts';
import { isAtLeast18 } from '../../../packages/together-domain/src/adult-access.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}),
  z.object({action:z.literal('verify_eligibility'),dateOfBirth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}),
  z.object({action:z.literal('set_mode'),enabled:z.boolean()}),
]);

Deno.serve(async(request)=>{const correlationId=crypto.randomUUID();if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});try{
  const{user,db}=await authenticated(request);await requireVerifiedWebSurface(request,user.id);const input=await parseBody(request,schema);await enforceRateLimit(db,user.id,`adult_mode_${input.action}`,input.action==='status'?240:30,3600);
  let token=readAdultSessionToken(request),setCookie:string|null=null;
  if(!token){token=newAdultSessionToken();const hash=await adultSessionTokenHash(token),now=new Date(),expires=new Date(now.getTime()+30*86400_000);const{error}=await db.from('together_web_adult_sessions').insert({user_id:user.id,token_hash:hash,adult_mode_enabled:true,enabled_at:now.toISOString(),expires_at:expires.toISOString()});if(error)throw new AppError('INTERNAL_ERROR','A secure website session could not be prepared.',500,true);setCookie=adultSessionCookie(token);}
  const tokenHash=await adultSessionTokenHash(token);
  if(input.action==='verify_eligibility'){
    if(!isAtLeast18(input.dateOfBirth,new Date()))throw new AppError('FORBIDDEN','Adult website content is only available to eligible adults.',403,false);
    const now=new Date().toISOString();const{data:profile,error:profileReadError}=await db.from('together_profiles').select('content_preferences').eq('user_id',user.id).maybeSingle();if(profileReadError||!profile)throw new AppError('INTERNAL_ERROR','Eligibility could not be saved.',500,true);
    const contentPreferences={...((profile.content_preferences??{}) as Record<string,unknown>),contentMode:'explicit'};
    const{error}=await db.from('together_profiles').update({date_of_birth:input.dateOfBirth,age_verified_at:now,adult_eligible_at:now,adult_eligibility_method:'self_declared_dob_v2',adult_eligibility_reference:null,content_preferences:contentPreferences,updated_at:now}).eq('user_id',user.id);if(error)throw new AppError('INTERNAL_ERROR','Eligibility could not be saved.',500,true);
  }
  if(input.action==='set_mode'){
    // Backward-compatible no-op for a briefly shipped client. Website content
    // is now controlled per chat; the server session itself stays enabled.
    const now=new Date().toISOString();const{error}=await db.from('together_web_adult_sessions').update({adult_mode_enabled:true,enabled_at:now,updated_at:now,last_seen_at:now}).eq('user_id',user.id).eq('token_hash',tokenHash).is('revoked_at',null);if(error)throw new AppError('INTERNAL_ERROR','The secure website session could not be updated.',500,true);
  }
  const access=await resolveAdultAccess(withCookie(request,token),user,db);return response({data:{premium_access:access.premium_access,adult_eligible:access.adult_eligible,client_surface:access.client_surface,available:access.adult_generation_enabled,authorized:access.authorized_web_adult,eligibilityMethod:'self_declared_dob_v2'},correlationId},200,correlationId,setCookie);
}catch(error){return errorResponse(error,correlationId);}});

function withCookie(request:Request,token:string):Request{const headers=new Headers(request.headers);headers.set('cookie',`__Host-kivelli_web_session=${token}`);return new Request(request.url,{method:request.method,headers});}
function response(data:unknown,status:number,correlationId:string,setCookie:string|null):Response{const headers={...corsHeaders,'Content-Type':'application/json','X-Correlation-ID':correlationId,...(setCookie?{'Set-Cookie':setCookie}:{})};return new Response(JSON.stringify(data),{status,headers});}
