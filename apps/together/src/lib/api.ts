import { supabase, supabasePublishableKey, supabaseUrl } from './supabase';
import { MESSAGE_CHARACTER_LIMIT, messageCharacterLimitError } from '@together/domain/src/message-limits';
import type { CompanionVoicePreset } from '@together/domain/src/voice-presets';
import type { AutoDialoguePreference, AutoDialogueSuggestion, CharacterInteractionProposal, CharacterResetPreview, CharacterResetResult, Conversation, ConversationAttachment, CreatorDraft, CreatorStep, GeneratedMedia, InteractionCandidate, KivelleExperienceCapabilities, MediaOffer, Message, MultimodalPreferences, PlaceContext, SceneAction, SceneSession, Snapshot, SnapshotDelta, VoiceCallSession } from '../types';
import type { RealtimeVoiceConfiguration } from './realtimeVoice';

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
export const loadPlaceDetail = (locationId:string) => invoke<{place:PlaceContext}>('together-place',{locationId});
export const bootstrap = (input: {ageConfirmed:true;onboardingChoice?:'companion'|'skip';displayName?:string;characterTemplateId?:string;worldId?:string;interests:string[];goals:Array<'Dating'|'Friendship'|'Stories'|'Social worlds'>}) => invoke<Snapshot>('together-bootstrap', {...input,experienceTimezone:deviceTimezone()});
export const setActiveCompanion = (characterInstanceId:string, source:'home_switcher'|'discover_profile'|'companion_manager'='home_switcher') => invoke<Snapshot>('together-companion',{action:'set_active',characterInstanceId,source});
export const meetCompanion = (characterTemplateId:string, source:'onboarding'|'discover_profile'='discover_profile') => invoke<Snapshot>('together-companion',{action:'meet',characterTemplateId,source});
export const setCharacterFavorite = (characterTemplateId:string,favorite:boolean,source:'home_featured'|'discover'|'chat_menu'='home_featured') => invoke<{characterTemplateId:string;favorite:boolean;favoriteCharacterTemplateIds:string[]}>('together-companion',{action:'set_favorite',characterTemplateId,favorite,source});
export const mutateMemory = (input: Record<string,unknown>) => invoke('together-memory', input);
export const mutateDate = <T>(input: Record<string,unknown>) => invoke<T>('together-date', input);
export const simulate = (characterInstanceId?: string) => invoke('together-simulate', { characterInstanceId, evaluateProactive: true });
export const markProactiveOpened = (proactiveMessageId: string) => invoke('together-notifications', { action: 'opened', proactiveMessageId });
export const introduction = <T>(action: 'preview'|'accept'|'complete', choice?: string) => invoke<T>('together-introduction', { action, choice });
export const reportMessage = (messageId: string, reason: string, detail = '') => invoke('together-report', { messageId, reason, detail });
export const manageAccount = <T>(input: Record<string, unknown>) => invoke<T>('together-account', input);
export const managePlan = <T>(input:Record<string,unknown>) => invoke<T>('together-plan',input);
export const createSharedPlan = <T>(input:{activityKey?:string;activity?:string;locationId:string;characterInstanceId:string;startsAt?:string;scheduledFor?:string;timingChoice?:'now'|'in_one_hour'|'custom';requestId:string;note?:string;source?:'chat'|'manual_planner'|'location'|'discover'|'date'|'story';sourceConversationId?:string}) => invoke<T>('together-plan',{action:'create',activityKey:input.activityKey??input.activity,locationId:input.locationId,characterInstanceId:input.characterInstanceId,startsAt:input.startsAt??input.scheduledFor,timingChoice:input.timingChoice,requestId:input.requestId,note:input.note,source:input.source??'manual_planner',sourceConversationId:input.sourceConversationId});
export const cancelSharedPlan = <T>(planId:string,conversationId?:string) => invoke<T>('together-plan',{action:'cancel',planId,conversationId});
export const confirmConversationAction = <T>(candidateId:string,input?:{startsAt?:string;scheduledFor?:string;timingChoice?:'now'|'in_one_hour'|'custom';windowStartsAt?:string;windowEndsAt?:string;timePrecision?:'exact'|'approximate'|'daypart'|'window'|'day';originalTimeExpression?:string;activityKey?:string;activity?:string;locationId?:string;planId?:string}) => invoke<T>('together-plan',{action:'confirm_proposal',candidateId,startsAt:input?.startsAt??input?.scheduledFor,timingChoice:input?.timingChoice,windowStartsAt:input?.windowStartsAt,windowEndsAt:input?.windowEndsAt,timePrecision:input?.timePrecision,originalTimeExpression:input?.originalTimeExpression,activityKey:input?.activityKey??input?.activity,locationId:input?.locationId,planId:input?.planId});
export const dismissConversationAction = <T>(candidateId:string) => invoke<T>('together-plan',{action:'dismiss_proposal',candidateId});
export const resolveRelationshipMilestone = (milestoneId:string,action:'accept'|'defer'|'stay_friends'|'talk_it_out'|'give_space') => invoke<{snapshot:Snapshot}>('together-relationship',{milestoneId,action});
export const manageConversation = <T>(input: Record<string, unknown>) => invoke<T>('together-conversation', input);
export const ensureConversation = (characterInstanceId:string) => manageConversation<Conversation>({action:'ensure',characterInstanceId});
export const previewCharacterReset = (characterInstanceId:string) => manageConversation<CharacterResetPreview>({action:'reset_preview',characterInstanceId});
export const startOverCharacter = (characterInstanceId:string,requestId:string) => manageConversation<CharacterResetResult>({action:'start_over',characterInstanceId,requestId});
export const manageInteraction = <T = {scene:SceneSession;action?:SceneAction;interactions:InteractionCandidate[];destinations:InteractionCandidate[];characterProposal?:CharacterInteractionProposal}>(input: Record<string, unknown>) => invoke<T>('together-interaction', input);
export const enterScene = <T>(input:{characterInstanceId:string;locationId:string;conversationId?:string}) => invoke<T>('together-conversation',{action:'enter_scene',...input});
export const manageMedia = <T>(input: Record<string, unknown>) => invoke<T>('together-media', input);
export const rateGeneratedMedia = (mediaId:string,feedback:'positive'|'negative') => manageMedia<{mediaId:string;userFeedback:'positive'|'negative';userFeedbackAt:string}>({action:'feedback',mediaId,feedback});
export const animateMedia = (mediaId:string,requestId:string,motionPrompt?:string,durationSeconds=5) => manageMedia<{media:GeneratedMedia;creditCost?:number}>({action:'animate',mediaId,requestId,motionPrompt,durationSeconds});
export const editGeneratedMedia = (mediaId:string,requestId:string,instruction:string) => manageMedia<{media:GeneratedMedia;creditCost:number;creditBalance?:{permanentBalance:number;subscriptionBalance:number;total:number}}>({action:'edit',mediaId,requestId,instruction});
export const saveMediaContentPreferences = (input:{suggestiveMediaEnabled:boolean;matureMediaEnabled:boolean;explicitMediaEnabled:boolean;adultVideoEnabled:boolean}) => manageMedia<{saved:boolean;preferences:Record<string,unknown>}>({action:'content_preferences',...input});
export const manageMultimodal = <T>(input:Record<string,unknown>) => invoke<T>('together-multimodal',input);
export const getExperienceCapabilities = () => manageMultimodal<{experience:KivelleExperienceCapabilities;providers:KivelleExperienceCapabilities['providers']}>({action:'capabilities'});
export const saveMultimodalPreferences = (preferences:Required<MultimodalPreferences>) => manageMultimodal<{preferences:MultimodalPreferences;experience:KivelleExperienceCapabilities}>({action:'preferences',...preferences});
export const prepareUserImage = (input:{conversationId:string;characterInstanceId:string;mimeType:'image/jpeg'|'image/png'|'image/webp';byteSize:number;width?:number;height?:number;requestId:string}) => manageMultimodal<{attachment:ConversationAttachment;upload:{bucket:string;path:string}}>({action:'prepare_user_image',...input});
export const confirmUserImage = (attachmentId:string) => manageMultimodal<{attachment:ConversationAttachment;upload:{bucket:string;path:string}}>({action:'confirm_user_image',attachmentId});
export const removePendingAttachment = (attachmentId:string) => manageMultimodal<{removed:boolean}>({action:'remove_attachment',attachmentId});
export type VoiceNoteQuote={creditCost:number;creditBalance:number;canAfford:boolean;generationRequired:boolean};
export const quoteVoiceNote = (messageId:string) => manageMultimodal<VoiceNoteQuote>({action:'voice_note_quote',messageId});
export const requestVoiceNote = (messageId:string,requestId:string) => manageMultimodal<{status?:string;providerStatus?:string;message?:string;media?:GeneratedMedia}>({action:'request_voice_note',messageId,requestId});
export const previewCompanionVoice = (input:{conversationId:string;voicePreset:CompanionVoicePreset|null;requestId:string}) => manageMultimodal<{preview:{signedUrl:string;durationMs:number;contentType:string;voicePreset:CompanionVoicePreset|null;cached:boolean}}>({action:'preview_voice',...input});
export const refreshVoiceNote = (mediaId:string) => manageMultimodal<{media:GeneratedMedia}>({action:'media_status',mediaId});
export async function transcribeChatAudio(input:{conversationId:string;characterInstanceId:string;uri:string;durationMs:number;contentType:string;fileName:string}):Promise<{text:string;provider:string;model:string}>{
  const source=await fetch(input.uri);
  if(!source.ok)throw new ApiError('That recording could not be opened.','VALIDATION_FAILED');
  const recorded=await source.blob();
  if(!recorded.size)throw new ApiError('Speak for a moment before stopping.','VALIDATION_FAILED');
  if(recorded.size>8*1024*1024)throw new ApiError('Keep voice-to-text recordings under one minute.','VALIDATION_FAILED');
  const audio=recorded.type===input.contentType?recorded:new Blob([recorded],{type:input.contentType});
  const form=new FormData();
  form.append('audio',audio,input.fileName);
  form.append('conversationId',input.conversationId);
  form.append('characterInstanceId',input.characterInstanceId);
  form.append('durationMs',String(Math.max(0,Math.min(60_000,Math.round(input.durationMs)))));
  const response=await fetch(`${supabaseUrl}/functions/v1/together-multimodal?action=transcribe_audio`,{method:'POST',headers:{Authorization:`Bearer ${await token()}`,apikey:supabasePublishableKey,'x-kivelle-timezone':deviceTimezone()},body:form});
  const payload=await response.json().catch(()=>({})) as Envelope<{text:string;provider:string;model:string}>&{error?:{message?:string;code?:string;retryable?:boolean}};
  if(!response.ok)throw new ApiError(payload.error?.message??'That recording could not be transcribed.',payload.error?.code,payload.error?.retryable);
  return payload.data;
}
export type VoiceCallBilling={creditsPerMinute:number;creditBalance:number;chargedMinutes:number;remainingMinutes:number};
export type ManageCallResult={call?:VoiceCallSession;status?:string;providerStatus?:string;message?:string;clientSecret?:string;expiresAt?:string;clientConfiguration?:RealtimeVoiceConfiguration;billing?:VoiceCallBilling;reconciliation?:{messageCount:number;reconciled:boolean}};
export const manageCall = <T=ManageCallResult>(input:Record<string,unknown>) => invoke<T>('together-call',input);
export const manageSharedScene = <T>(input:Record<string,unknown>) => invoke<T>('together-shared-scene',input);
export const managePersona = <T>(input:Record<string,unknown>) => invoke<T>('together-persona',input);
export const manageCreator = <T>(input:Record<string,unknown>) => invoke<T>('together-creator',input);
export const createCreatorDraft = (input:{concept:string;worldId:string;relationshipGoal:'friendship'|'romance'|'either';requestId:string}) => manageCreator<{draft:CreatorDraft;idempotent:boolean}>({action:'create_draft',...input});
export const getCreatorDraft = (draftId:string) => manageCreator<{draft:CreatorDraft}>({action:'get_draft',draftId});
export const listCreatorDrafts = () => manageCreator<{drafts:CreatorDraft[]}>({action:'list_drafts'});
export const updateCreatorDraftSection = (input:{draftId:string;section:'identity'|'appearance'|'personality'|'communication'|'connection'|'life'|'routine';config:Record<string,unknown>;expectedRevision:number;currentStep?:CreatorStep;relationshipGoal?:'friendship'|'romance'|'either'}) => manageCreator<{draft:CreatorDraft;readiness?:{ready:boolean;missing:string[]}}>({action:'update_draft_section',...input});
export const regenerateCreatorDraftSection = (draftId:string,section:'routine'|'first_meetings') => manageCreator<{draft:CreatorDraft}>({action:'regenerate_draft_section',draftId,section});
export const generateCreatorAppearance = (draftId:string,requestId:string) => manageCreator<{draft:CreatorDraft;creditCost?:number;creditBalance?:{permanentBalance:number;subscriptionBalance:number;total:number}}>({action:'generate_draft_appearance',draftId,requestId});
export const selectCreatorAppearance = (draftId:string,assetId:string) => manageCreator<{draft:CreatorDraft;readiness?:{ready:boolean;missing:string[]}}>({action:'select_draft_appearance',draftId,assetId});
export const selectCreatorFirstMeeting = (draftId:string,meetingId:string) => manageCreator<{draft:CreatorDraft;readiness?:{ready:boolean;missing:string[]}}>({action:'select_first_meeting',draftId,meetingId});
export const finalizeCreatorDraft = (draftId:string,requestId:string) => manageCreator<{draft:CreatorDraft;result:{draftId:string;characterTemplateId:string;characterVersionId:string;publicHandle:string;idempotent:boolean}}>({action:'finalize_draft',draftId,requestId});
export const archiveCreatorDraft = (draftId:string) => manageCreator<{archived:boolean;draftId:string}>({action:'archive_draft',draftId});
export const manageSubscription = <T>(input?:Record<string,unknown>) => input?invoke<T>('together-subscription',input):invoke<T>('together-subscription',undefined,'GET');

export async function createTogetherAccount(email: string, password: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-signup`, { method: 'POST', headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string; retryable?: boolean } };
  if (!response.ok) throw new ApiError(payload.error?.message ?? 'Your Kivelle account could not be created.', payload.error?.code, payload.error?.retryable);
}

export async function sendDialogue(input: {conversationId:string;characterInstanceId:string;message:string;attachmentIds?:string[];clientRequestId:string;focusPlanId?:string;sceneActionId?:string;autoDialogueSuggestionId?:string;autoDialogueSuggestionSource?:AutoDialogueSuggestion['source'];autoDialogueSuggestionEdited?:boolean;autoDialogueSuggestionIntent?:AutoDialogueSuggestion['intent'];autoDialogueSuggestionPreference?:AutoDialoguePreference;entryContext?:{entryReason:'user_drop_in';locationId:string;scheduleEventId?:string}}, onToken: (token:string)=>void): Promise<{message:Message;additionalMessages?:Message[];generatedMedia?:GeneratedMedia;mediaOffer?:MediaOffer;photoRequestError?:{code:string;message:string;retryable:boolean};delta?:SnapshotDelta}> {
  if (input.message.length > MESSAGE_CHARACTER_LIMIT) throw new ApiError(messageCharacterLimitError(), 'VALIDATION_FAILED');
  const response = await fetch(`${supabaseUrl}/functions/v1/together-dialogue`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, apikey: supabasePublishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new ApiError(error.error?.message ?? 'Your companion could not reply.', error.error?.code, error.error?.retryable); }
  if (!response.body) throw new ApiError('The response stream ended early.', 'STREAM_INTERRUPTED', true);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let final: Message | null = null; let additionalMessages:Message[]|undefined;let generatedMedia:GeneratedMedia|undefined;let mediaOffer:MediaOffer|undefined;let photoRequestError:{code:string;message:string;retryable:boolean}|undefined;let delta:SnapshotDelta|undefined;
  const processEvents=(events:string[])=>{for(const event of events){const line=event.split('\n').find((item)=>item.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));if(data.type==='token')onToken(data.token);if(data.type==='done'){final=data.message;additionalMessages=data.additionalMessages;generatedMedia=data.generatedMedia;mediaOffer=data.mediaOffer;photoRequestError=data.photoRequestError;delta=data.delta;}if(data.type==='error')throw new ApiError(data.error?.message??'Your companion could not finish the reply.',data.error?.code??'STREAM_INTERRUPTED',Boolean(data.error?.retryable));}};
  while(true){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split('\n\n');buffer=events.pop()??'';processEvents(events);}
  buffer+=decoder.decode();
  if(buffer.trim())processEvents([buffer]);
  if (!final) throw new ApiError('The reply was interrupted. Try again.', 'STREAM_INTERRUPTED', true);
  return {message:final,...(additionalMessages?.length?{additionalMessages}:{}),...(generatedMedia?{generatedMedia}:{}),...(mediaOffer?{mediaOffer}:{}),...(photoRequestError?{photoRequestError}:{}),...(delta?{delta}:{})};
}

export async function suggestDialogue(input:{conversationId:string;characterInstanceId:string;anchorMessageId:string;clientRequestId:string;preference?:AutoDialoguePreference},signal?:AbortSignal):Promise<AutoDialogueSuggestion>{
  const response=await fetch(`${supabaseUrl}/functions/v1/together-dialogue-suggestion`,{method:'POST',headers:{Authorization:`Bearer ${await token()}`,apikey:supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  const payload=await response.json().catch(()=>({})) as Envelope<AutoDialogueSuggestion>&{error?:{message?:string;code?:string;retryable?:boolean}};
  if(!response.ok)throw new ApiError(payload.error?.message??'A reply suggestion could not be generated.',payload.error?.code,payload.error?.retryable);
  return payload.data;
}

export async function sendSceneReaction(input:{conversationId:string;characterInstanceId:string;sceneActionId:string;clientRequestId:string},onToken:(token:string)=>void):Promise<{message:Message}>{
  const response=await fetch(`${supabaseUrl}/functions/v1/together-scene-reaction`,{method:'POST',headers:{Authorization:`Bearer ${await token()}`,apikey:supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(input)});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new ApiError(error.error?.message??'Your companion could not react to that right now.',error.error?.code,error.error?.retryable);}
  if(!response.body)throw new ApiError('The reaction stream ended early.','STREAM_INTERRUPTED',true);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',final:Message|null=null;
  while(true){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split('\n\n');buffer=events.pop()??'';for(const event of events){const line=event.split('\n').find((item)=>item.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));if(data.type==='token')onToken(data.token);if(data.type==='done')final=data.message;if(data.type==='error')throw new ApiError(data.error?.message??'Your companion could not finish that reaction.',data.error?.code??'STREAM_INTERRUPTED',Boolean(data.error?.retryable));}}
  if(!final)throw new ApiError('The reaction was interrupted. Try again.','STREAM_INTERRUPTED',true);return{message:final};
}
