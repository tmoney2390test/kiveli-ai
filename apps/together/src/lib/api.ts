import { supabase, supabasePublishableKey, supabaseUrl } from './supabase';
import type { Message, Snapshot } from '../types';

export class ApiError extends Error { constructor(message: string, readonly code = 'UNKNOWN', readonly retryable = false) { super(message); } }
type Envelope<T> = { data: T; correlationId: string };

async function token(): Promise<string> { const { data } = await supabase.auth.getSession(); if (!data.session) throw new ApiError('Sign in to continue.', 'AUTH_REQUIRED'); return data.session.access_token; }
export async function invoke<T>(name: string, body?: unknown, method: 'GET'|'POST' = 'POST'): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, { method, headers: { Authorization: `Bearer ${await token()}`, apikey: supabasePublishableKey, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json().catch(() => ({})) as Envelope<T> & { error?: {message?:string;code?:string;retryable?:boolean} };
  if (!response.ok) throw new ApiError(payload.error?.message ?? 'Something went wrong.', payload.error?.code, payload.error?.retryable);
  return payload.data;
}
export const loadSnapshot = () => invoke<Snapshot>('together-bootstrap', undefined, 'GET');
export const bootstrap = (input: {ageConfirmed:true;displayName?:string;interests:string[];goals:Array<'Dating'|'Friendship'|'Stories'|'Social worlds'>}) => invoke<Snapshot>('together-bootstrap', input);
export const mutateMemory = (input: Record<string,unknown>) => invoke('together-memory', input);
export const mutateDate = <T>(input: Record<string,unknown>) => invoke<T>('together-date', input);
export const simulate = (characterInstanceId?: string) => invoke('together-simulate', { characterInstanceId, evaluateProactive: true });
export const markProactiveOpened = (proactiveMessageId: string) => invoke('together-notifications', { action: 'opened', proactiveMessageId });
export const introduction = <T>(action: 'preview'|'accept'|'complete', choice?: string) => invoke<T>('together-introduction', { action, choice });
export const reportMessage = (messageId: string, reason: string, detail = '') => invoke('together-report', { messageId, reason, detail });
export const manageAccount = <T>(input: Record<string, unknown>) => invoke<T>('together-account', input);
export const createSharedPlan = <T>(input:{activity:string;characterInstanceId:string;scheduledFor:string;requestId:string;note?:string}) => invoke<T>('together-activity',{action:'create',...input});
export const cancelSharedPlan = <T>(planId:string) => invoke<T>('together-activity',{action:'cancel',planId});
export const resolveRelationshipMilestone = (milestoneId:string,action:'accept'|'defer'|'stay_friends'|'talk_it_out'|'give_space') => invoke<{snapshot:Snapshot}>('together-relationship',{milestoneId,action});
export const manageConversation = <T>(input: Record<string, unknown>) => invoke<T>('together-conversation', input);
export const manageMedia = <T>(input: Record<string, unknown>) => invoke<T>('together-media', input);

export async function createTogetherAccount(email: string, password: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-signup`, { method: 'POST', headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string; retryable?: boolean } };
  if (!response.ok) throw new ApiError(payload.error?.message ?? 'Your Kivelle account could not be created.', payload.error?.code, payload.error?.retryable);
}

export async function sendDialogue(input: {conversationId:string;characterInstanceId:string;message:string;clientRequestId:string}, onToken: (token:string)=>void): Promise<Message> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-dialogue`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, apikey: supabasePublishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new ApiError(error.error?.message ?? 'Your companion could not reply.', error.error?.code, error.error?.retryable); }
  if (!response.body) throw new ApiError('The response stream ended early.', 'STREAM_INTERRUPTED', true);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let final: Message | null = null;
  while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() ?? ''; for (const event of events) { const line = event.split('\n').find((item) => item.startsWith('data: ')); if (!line) continue; const data = JSON.parse(line.slice(6)); if (data.type === 'token') onToken(data.token); if (data.type === 'done') final = data.message; if (data.type === 'error') throw new ApiError(data.error?.message ?? 'Your companion could not finish the reply.', data.error?.code ?? 'STREAM_INTERRUPTED', Boolean(data.error?.retryable)); } }
  if (!final) throw new ApiError('The reply was interrupted. Try again.', 'STREAM_INTERRUPTED', true);
  return final;
}
