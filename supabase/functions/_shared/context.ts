import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { capabilitiesForAccount, effectiveChatDailyLimit, normalizeSubscriptionTier } from '../../../packages/together-domain/src/index.ts';
import { AppError } from './types.ts';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new AppError('INTERNAL_ERROR', `Server configuration is missing ${name}.`, 500);
  return value;
}

let sharedAdminClient:SupabaseClient|null=null;

export function adminClient(): SupabaseClient {
  if(sharedAdminClient)return sharedAdminClient;
  const secret = Deno.env.get('JUKESTR_SUPABASE_SECRET_KEY') ?? env('SUPABASE_SECRET_KEY');
  if (secret.startsWith('sb_publishable_')) throw new AppError('INTERNAL_ERROR', 'Server secret is not configured.', 500);
  sharedAdminClient=createClient(env('SUPABASE_URL'), secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return sharedAdminClient;
}

export async function authenticated(request: Request): Promise<{ user: User; db: SupabaseClient }> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED', 'Sign in to continue.', 401);
  const accessToken=authorization.slice(7);
  const db = adminClient();
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data.user) throw new AppError('AUTH_REQUIRED', 'Your session is no longer valid.', 401);
  const invalidBefore=Date.parse(String(data.user.app_metadata?.together_sessions_invalid_before??'')),issuedAt=jwtIssuedAt(accessToken);
  if(Number.isFinite(invalidBefore)&&issuedAt!==null&&issuedAt*1000<=invalidBefore)throw new AppError('AUTH_REQUIRED','Sign in again to continue.',401);
  const { data: suspension } = await db.from('account_suspensions').select('id').eq('user_id', data.user.id).eq('active', true).or(`permanent.eq.true,ends_at.gt.${new Date().toISOString()}`).maybeSingle();
  if (suspension) throw new AppError('FORBIDDEN', 'This account is currently suspended.', 403);
  return { user: data.user, db };
}

export async function requireStaff(userId: string, db: SupabaseClient): Promise<void> {
  const { data } = await db.from('profiles').select('role').eq('id', userId).single();
  if (!data || !['moderator', 'admin'].includes(data.role as string)) throw new AppError('FORBIDDEN', 'Moderator access is required.', 403);
}

export async function requireAdmin(userId: string, db: SupabaseClient): Promise<void> {
  const { data } = await db.from('profiles').select('role').eq('id', userId).single();
  if (data?.role !== 'admin') throw new AppError('FORBIDDEN', 'Administrator access is required.', 403);
}

export async function enforceRateLimit(db: SupabaseClient, subject: string, action: string, limit: number, windowSeconds: number, message = 'Too many requests. Try again later.'): Promise<void> {
  if(action==='together_dialogue')await enforceDialoguePlanLimit(db,subject);
  const { data, error } = await db.rpc('consume_rate_limit', { p_subject: subject, p_action: action, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new AppError('INTERNAL_ERROR', 'Rate limit validation failed.', 500);
  if (!data) throw new AppError('RATE_LIMITED', message, 429, true);
}

async function enforceDialoguePlanLimit(db:SupabaseClient,userId:string):Promise<void>{
  const[{data:entitlement,error},{data:profile}]=await Promise.all([db.from('together_entitlements').select('tier,metadata').eq('user_id',userId).maybeSingle(),db.from('together_profiles').select('created_at').eq('user_id',userId).maybeSingle()]);if(error)throw new AppError('INTERNAL_ERROR','Subscription status could not be checked.',500,true);
  const capabilities=capabilitiesForAccount(normalizeSubscriptionTier(entitlement?.tier),entitlement?.metadata),limit=effectiveChatDailyLimit(capabilities,profile?.created_at);if(limit===null)return;
  const start=new Date();start.setUTCHours(0,0,0,0);const{count,error:countError}=await db.from('together_messages').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('role','user').gte('created_at',start.toISOString());if(countError)throw new AppError('INTERNAL_ERROR','Daily chat allowance could not be checked.',500,true);
  if(Number(count??0)>=limit)throw new AppError('PLAN_LIMIT_REACHED',`Kivelle Free includes ${limit} messages per day right now. Upgrade to Kivelle+ or Max for unlimited conversations.`,429);
}

function jwtIssuedAt(token:string):number|null{try{const encoded=token.split('.')[1];if(!encoded)return null;const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4,'='),payload=JSON.parse(atob(normalized)) as Record<string,unknown>,issued=Number(payload.iat);return Number.isFinite(issued)?issued:null;}catch{return null;}}

export function serverEnv(name: string): string { return env(name); }
