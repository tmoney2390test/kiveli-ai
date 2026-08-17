import { supabase, supabasePublishableKey, supabaseUrl } from './supabase';
import type { CharacterResetPreview, CharacterResetResult, InteractionCandidate, Message, SceneAction, SceneSession, Snapshot, SnapshotDelta } from '../types';

export class ApiError extends Error { constructor(message: string, readonly code = 'UNKNOWN', readonly retryable = false) { super(message); } }
type Envelope<T> = { data: T; correlationId: string };
function deviceTimezone():string{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return'UTC';}}

async function token(): Promise<string> { const { data } = await supabase.auth.getSession(); if (!data.session) throw new ApiError('Sign in to continue.', 'AUTH_REQUIRED'); return data.session.access_token; }
export async function invoke<T>(name: string, body?: unknown, method: 'GET'|'POST' = 'POST'): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, { method, headers: { Authorization: `Bearer ${await token()}`, apikey: supabasePublishableKey, 'Content-Type': 'application/json','x-kivelle-timezone':deviceTimezone() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json().catch(() => ({})) as Envelope<T> & { error?: {message?:string;code?:string;retryable?:boolean} };
  if (!response.ok) throw new ApiError(payload.error?.message ?? 'Something went wrong.', payload.error?.code, payload.error?.retryable);
  return payload.data;
}
export const loadSnapshot = () => invoke<Snapshot>('together-bootstrap', undefined, 'GET');
export const bootstrap = (input: {ageConfirmed:true;displayName?:string;characterTemplateId?:string;interests:string[];goals:Array<'Dating'|'Friendship'|'Stories'|'Social worlds'>}) => invoke<Snapshot>('together-bootstrap', {...input,experienceTimezone:deviceTimezone()});
export const setActiveCompanion = (characterInstanceId:string, source:'home_switcher'|'discover_profile'|'companion_manager'='home_switcher') => invoke<Snapshot>('together-companion',{action:'set_active',characterInstanceId,source});
export const meetCompanion = (characterTemplateId:string, source:'onboarding'|'discover_profile'='discover_profile') => invoke<Snapshot>('together-companion',{action:'meet',characterTemplateId,source});
export const mutateMemory = (input: Record<string,unknown>) => invoke('together-memory', input);
export const mutateDate = <T>(input: Record<string,unknown>) => invoke<T>('together-date', input);
export const simulate = (characterInstanceId?: string) => invoke('together-simulate', { characterInstanceId, evaluateProactive: true });
export const markProactiveOpened = (proactiveMessageId: string) => invoke('together-notifications', { action: 'opened', proactiveMessageId });
export const introduction = <T>(action: 'preview'|'accept'|'complete', choice?: string) => invoke<T>('together-introduction', { action, choice });
export const reportMessage = (messageId: string, reason: string, detail = '') => invoke('together-report', { messageId, reason, detail });
export const manageAccount = <T>(input: Record<string, unknown>) => invoke<T>('together-account', input);
export const managePlan = <T>(input:Record<string,unknown>) => invoke<T>('together-plan',input);
export const createSharedPlan = <T>(input:{activityKey?:string;activity?:string;locationId:string;characterInstanceId:string;startsAt?:string;scheduledFor?:string;requestId:string;note?:string;source?:'chat'|'manual_planner'|'location'|'discover'|'date'|'story';sourceConversationId?:string}) => invoke<T>('together-plan',{action:'create',activityKey:input.activityKey??input.activity,locationId:input.locationId,characterInstanceId:input.characterInstanceId,startsAt:input.startsAt??input.scheduledFor,requestId:input.requestId,note:input.note,source:input.source??'manual_planner',sourceConversationId:input.sourceConversationId});
export const cancelSharedPlan = <T>(planId:string,conversationId?:string) => invoke<T>('together-plan',{action:'cancel',planId,conversationId});
export const confirmConversationAction = <T>(candidateId:string,input?:{startsAt?:string;scheduledFor?:string;windowStartsAt?:string;windowEndsAt?:string;timePrecision?:'exact'|'approximate'|'daypart'|'window'|'day';originalTimeExpression?:string;activityKey?:string;activity?:string;locationId?:string;planId?:string}) => invoke<T>('together-plan',{action:'confirm_proposal',candidateId,startsAt:input?.startsAt??input?.scheduledFor,windowStartsAt:input?.windowStartsAt,windowEndsAt:input?.windowEndsAt,timePrecision:input?.timePrecision,originalTimeExpression:input?.originalTimeExpression,activityKey:input?.activityKey??input?.activity,locationId:input?.locationId,planId:input?.planId});
export const dismissConversationAction = <T>(candidateId:string) => invoke<T>('together-plan',{action:'dismiss_proposal',candidateId});
export const resolveRelationshipMilestone = (milestoneId:string,action:'accept'|'defer'|'stay_friends'|'talk_it_out'|'give_space') => invoke<{snapshot:Snapshot}>('together-relationship',{milestoneId,action});
export const manageConversation = <T>(input: Record<string, unknown>) => invoke<T>('together-conversation', input);
export const previewCharacterReset = (characterInstanceId:string) => manageConversation<CharacterResetPreview>({action:'reset_preview',characterInstanceId});
export const startOverCharacter = (characterInstanceId:string,requestId:string) => manageConversation<CharacterResetResult>({action:'start_over',characterInstanceId,requestId});
export const manageInteraction = <T = {scene:SceneSession;action?:SceneAction;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>(input: Record<string, unknown>) => invoke<T>('together-interaction', input);
export const enterScene = <T>(input:{characterInstanceId:string;locationId:string;conversationId?:string}) => invoke<T>('together-conversation',{action:'enter_scene',...input});
export const manageMedia = <T>(input: Record<string, unknown>) => invoke<T>('together-media', input);
export const managePersona = <T>(input:Record<string,unknown>) => invoke<T>('together-persona',input);
export const manageCreator = <T>(input:Record<string,unknown>) => invoke<T>('together-creator',input);
export const manageSubscription = <T>(input?:Record<string,unknown>) => input?invoke<T>('together-subscription',input):invoke<T>('together-subscription',undefined,'GET');

export async function createTogetherAccount(email: string, password: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-signup`, { method: 'POST', headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string; retryable?: boolean } };
  if (!response.ok) throw new ApiError(payload.error?.message ?? 'Your Kivelle account could not be created.', payload.error?.code, payload.error?.retryable);
}

export async function sendDialogue(input: {conversationId:string;characterInstanceId:string;message:string;clientRequestId:string;focusPlanId?:string;entryContext?:{entryReason:'user_drop_in';locationId:string;scheduleEventId?:string}}, onToken: (token:string)=>void): Promise<{message:Message;delta?:SnapshotDelta}> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-dialogue`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, apikey: supabasePublishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new ApiError(error.error?.message ?? 'Your companion could not reply.', error.error?.code, error.error?.retryable); }
  if (!response.body) throw new ApiError('The response stream ended early.', 'STREAM_INTERRUPTED', true);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let final: Message | null = null; let delta:SnapshotDelta|undefined;
  while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() ?? ''; for (const event of events) { const line = event.split('\n').find((item) => item.startsWith('data: ')); if (!line) continue; const data = JSON.parse(line.slice(6)); if (data.type === 'token') onToken(data.token); if (data.type === 'done') {final = data.message;delta=data.delta;} if (data.type === 'error') throw new ApiError(data.error?.message ?? 'Your companion could not finish the reply.', data.error?.code ?? 'STREAM_INTERRUPTED', Boolean(data.error?.retryable)); } }
  if (!final) throw new ApiError('The reply was interrupted. Try again.', 'STREAM_INTERRUPTED', true);
  return {message:final,...(delta?{delta}:{})};
}

