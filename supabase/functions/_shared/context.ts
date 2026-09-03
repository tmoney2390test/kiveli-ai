import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { resolveSubscriptionAccess } from './kivelle-subscription.ts';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new AppError('INTERNAL_ERROR', `Server configuration is missing ${name}.`, 500);
  return value;
}

let sharedAdminClient:SupabaseClient|null=null;

const serverSecretNames = [
  'KIVELLE_SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JUKESTR_SUPABASE_SECRET_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

export function resolveServerSecret(
  read: (name: string) => string | undefined | null = (name) => Deno.env.get(name),
): string | null {
  for (const name of serverSecretNames) {
    const value = read(name)?.trim();
    if (value) return value;
  }
  return null;
}

export function adminClient(): SupabaseClient {
  if(sharedAdminClient)return sharedAdminClient;
  const secret = resolveServerSecret();
  if (!secret) throw new AppError('INTERNAL_ERROR', 'Server authentication is not configured.', 500);
  if (!serverSecretLooksUsable(secret)) throw new AppError('INTERNAL_ERROR', 'Server authentication is not configured correctly.', 500);
  sharedAdminClient=createClient(env('SUPABASE_URL'), secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return sharedAdminClient;
}

export async function authenticated(request: Request): Promise<{ user: User; db: SupabaseClient }> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED', 'Sign in to continue.', 401);
  const accessToken=authorization.slice(7);
  const db = adminClient();
  const assertedUserId=jwtSubjectFromAccessToken(accessToken),nowIso=new Date().toISOString();
  const suspensionPromise=assertedUserId
    ? db.from('account_suspensions').select('id').eq('user_id',assertedUserId).eq('active',true).or(`permanent.eq.true,ends_at.gt.${nowIso}`).maybeSingle()
    : Promise.resolve({data:null});
  const [{data,error},preloadedSuspension]=await Promise.all([db.auth.getUser(accessToken),suspensionPromise]);
  if (error || !data.user) throw new AppError('AUTH_REQUIRED', 'Your session is no longer valid.', 401);
  const invalidBefore=Date.parse(String(data.user.app_metadata?.together_sessions_invalid_before??'')),issuedAt=jwtIssuedAt(accessToken);
  if(Number.isFinite(invalidBefore)&&issuedAt!==null&&issuedAt*1000<=invalidBefore)throw new AppError('AUTH_REQUIRED','Sign in again to continue.',401);
  const suspension=assertedUserId===data.user.id
    ? preloadedSuspension.data
    : (await db.from('account_suspensions').select('id').eq('user_id',data.user.id).eq('active',true).or(`permanent.eq.true,ends_at.gt.${nowIso}`).maybeSingle()).data;
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
  if(action==='together_dialogue')await enforceDailyMessageLimit(db,subject);
  const { data, error } = await db.rpc('consume_rate_limit', { p_subject: subject, p_action: action, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new AppError('INTERNAL_ERROR', 'Rate limit validation failed.', 500);
  if (!data) throw new AppError('RATE_LIMITED', message, 429, true);
}

export function serverSecretLooksUsable(value:string):boolean{
  return Boolean(value)
    && /^[\x21-\x7e]+$/.test(value)
    && !value.startsWith('sb_publishable_')
    && !value.includes('*');
}

async function enforceDailyMessageLimit(db:SupabaseClient,userId:string):Promise<void>{
  const access=await resolveSubscriptionAccess(db,userId),limit=access.capabilities.dailyMessageLimit;if(limit===null)return;
  const start=new Date();start.setUTCHours(0,0,0,0);const{count,error:countError}=await db.from('together_messages').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('role','user').gte('created_at',start.toISOString());if(countError)throw new AppError('INTERNAL_ERROR','Daily chat allowance could not be checked.',500,true);
  if(Number(count??0)>=limit)throw new AppError('PLAN_LIMIT_REACHED',`${access.capabilities.displayName} includes ${limit} messages per day. Your daily message allowance resets at midnight UTC.`,429);
}

function jwtIssuedAt(token:string):number|null{try{const encoded=token.split('.')[1];if(!encoded)return null;const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4,'='),payload=JSON.parse(atob(normalized)) as Record<string,unknown>,issued=Number(payload.iat);return Number.isFinite(issued)?issued:null;}catch{return null;}}
export function jwtSubjectFromAccessToken(token:string):string|null{try{const encoded=token.split('.')[1];if(!encoded)return null;const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4,'='),payload=JSON.parse(atob(normalized))as Record<string,unknown>,subject=String(payload.sub??'');return/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subject)?subject:null;}catch{return null;}}

export function serverEnv(name: string): string { return env(name); }
