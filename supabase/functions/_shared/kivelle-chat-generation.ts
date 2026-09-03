import {
  normalizeChatGenerationControlsMode,
  normalizeDialogueSubscriptionTier,
  resolveDialogueGenerationProfile,
  resolveDialogueModelCapabilities,
  type ChatGenerationControlsMode,
  type DialogueGenerationProvider,
  type DialogueGenerationProfile,
  type DialogueReasoningSignals,
} from '../../../packages/together-domain/src/chat-generation.ts';
import { resolveResponseDirection } from './kivelle-intelligence.ts';
import type { KivelleConversationContext } from './kivelle-conversation-context.ts';

export type DialogueGenerationContext={mode:'direct'|'group';speakerRole?:'primary'|'secondary';activeSpeakerCount?:number};

export function sharedSceneGenerationContext(speakerRole:'primary'|'secondary',activeSpeakerCount:number):DialogueGenerationContext{
  return{mode:'group',speakerRole,activeSpeakerCount:Math.max(2,Math.floor(activeSpeakerCount))};
}

export function chatGenerationControlsMode(value:unknown=Deno.env.get('KIVELLE_CHAT_GENERATION_CONTROLS_MODE')):ChatGenerationControlsMode{
  return normalizeChatGenerationControlsMode(value);
}

export function dialogueReasoningSignals(context:KivelleConversationContext,activeSpeakerCount=1):DialogueReasoningSignals{
  const message=String(context.userMessage??'').trim();
  const quality=String(context.interactionQuality??'normal');
  const conflict=Number(context.relationship?.conflict??0);
  const responseMode=String(context.responseBrief?.mode??'');
  const directRecall=Array.isArray(context.memoryContext?.directRecall)?context.memoryContext.directRecall:[];
  const callbacks=Array.isArray(context.memoryContext?.callbacks)?context.memoryContext.callbacks:[];
  const openThreads=Array.isArray(context.openThreads)?context.openThreads:[];
  const interactionQuality:DialogueReasoningSignals['interactionQuality']=quality==='major_relationship_event'?'critical':quality==='shared_experience'?'major':quality==='meaningful'?'meaningful':'routine';
  return{
    isGreetingOrAcknowledgement:message.length<=42&&/^(?:hi|hey|hello|hiya|yo|thanks|thank you|okay|ok|got it|sounds good|sure|yes|no|yep|nope|lol|haha)[!. ]*$/i.test(message),
    isSimpleLogistics:['schedule','plan','date','location'].includes(String(context.queryIntent))||responseMode==='practical',
    interactionQuality,
    hasActiveConflict:conflict>=25||responseMode==='conflicted',
    hasRepairOpportunity:responseMode==='repair'||/\b(?:sorry|apologize|apologise|make it right|forgive me)\b/i.test(message),
    hasPendingMilestone:Boolean(context.progression&&Object.values(context.progression).some((value)=>value===true||value==='pending')),
    hasImportantMemoryRecall:directRecall.length>0||callbacks.length>0||['history','memory_overview'].includes(String(context.queryIntent)),
    hasOpenThreadResolution:openThreads.some((thread)=>Boolean(thread?.eligible)&&message.length>20),
    hasActiveStoryComplexity:Boolean(context.activeStory)&&(['story','history'].includes(String(context.queryIntent))||responseMode==='storytelling'),
    activeSpeakerCount:Math.max(1,Math.floor(activeSpeakerCount)),
    directorWasUsed:Boolean(context.director?.used),
  };
}

export function resolveDialogueRunGenerationProfile(input:{
  context:KivelleConversationContext;
  provider:DialogueGenerationProvider;
  model:string;
  generationContext?:DialogueGenerationContext;
}):DialogueGenerationProfile{
  const direction=resolveResponseDirection(input.context);
  const generationContext=input.generationContext??{mode:'direct' as const,speakerRole:'primary' as const,activeSpeakerCount:1};
  return resolveDialogueGenerationProfile({
    preferences:input.context.generationPreferences,
    provider:input.provider,
    model:input.model,
    subscriptionTier:normalizeDialogueSubscriptionTier(input.context.subscription?.tier),
    providerCapabilities:resolveDialogueModelCapabilities({provider:input.provider,model:input.model}),
    responseStyle:direction.style,
    targetLength:direction.length,
    mode:generationContext.mode,
    speakerRole:generationContext.speakerRole??'primary',
    signals:dialogueReasoningSignals(input.context,generationContext.activeSpeakerCount??1),
  });
}
