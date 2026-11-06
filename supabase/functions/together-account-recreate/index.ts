import {z} from 'zod';
import {authenticated,enforceRateLimit,jwtIssuedAt} from '../_shared/context.ts';
import {parseBody} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {hasRecentAccountAuthentication} from '../_shared/kivelle-account-lifecycle.ts';

serve(async(request,correlationId)=>{
  if(request.method!=='POST')throw new AppError('NOT_FOUND','That endpoint is unavailable.',404);
  await parseBody(request,z.object({confirmation:z.literal('CREATE NEW ACCOUNT')}));
  // This endpoint is the only caller permitted past the deleted-account guard.
  const {user,db}=await authenticated(request,{allowDeletedAccount:true});
  await enforceRateLimit(db,user.id,'together_account_recreate',10,600);
  const issued=jwtIssuedAt(request.headers.get('authorization')!.slice(7));
  const marker=await db.from('together_account_deletion_markers').select('created_at').eq('user_id',user.id).maybeSingle();
  if(marker.error)throw new AppError('INTERNAL_ERROR','Your account status could not be checked.',500,true);
  if(!marker.data)return json({data:{created:false},correlationId},200,correlationId);
  const deletedAt=String(marker.data.created_at);
  if(!hasRecentAccountAuthentication(user.last_sign_in_at)||issued===null||issued*1000<=Date.parse(deletedAt)||Date.parse(user.last_sign_in_at??'')<=Date.parse(deletedAt))
    throw new AppError('AUTH_REQUIRED','Sign in again, then choose Create a new account.',401,false);
  // getUser reads server-owned metadata on every API request, invalidating old
  // Kivelli tokens without deleting a shared Auth identity or another app's data.
  const fence=await db.auth.admin.updateUserById(user.id,{app_metadata:{...user.app_metadata,together_sessions_invalid_before:deletedAt}});
  if(fence.error)throw new AppError('INTERNAL_ERROR','A new account could not be prepared.',500,true);
  const result=await db.rpc('kivelle_recreate_application_account',{p_user_id:user.id,p_authenticated_at:user.last_sign_in_at,p_token_issued_at:new Date(issued*1000).toISOString()});
  if(result.error){
    if(result.error.message.includes('DELETION_CLEANUP_PENDING'))throw new AppError('CONFLICT','Your previous account is still finishing deletion. Please try again shortly.',409,true);
    if(result.error.message.includes('FRESH_SIGN_IN_REQUIRED'))throw new AppError('AUTH_REQUIRED','Sign in again to create a new account.',401,false);
    throw new AppError('INTERNAL_ERROR','A new account could not be created. Please try again.',500,true);
  }
  return json({data:{created:result.data===true},correlationId},201,correlationId);
});
