import { proactiveDeliveryPolicy } from './kivelle-proactive-policy.ts';
import { isPlanReminderProactive } from './kivelle-initiative.ts';
import { nextQuietHoursEnd } from '../../../packages/together-domain/src/proactive-preferences.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeChatLanguage } from '../../../packages/together-domain/src/chat-language.ts';
import { normalizeSubscriptionTier } from '../../../packages/together-domain/src/entitlements.ts';
import { renderCharacterInitiative } from './kivelle-proactive-voice.ts';
import { loadInitiativeSource, markInitiativeThreadDelivered, userResumedAfterQueue } from './kivelle-proactive-context.ts';
import { continuityById } from './together-continuity.ts';

type Row = Record<string, any>;
type DeliveryInput = {
  db: SupabaseClient; userId: string; proactive: Row; now: Date; timezone: string;
  additionalRelevance?: (now: Date) => Promise<boolean>;
};

/** One worker owns generation; response_key makes persistence/recovery idempotent. */
export async function persistCharacterInitiative(input: DeliveryInput): Promise<{
  proactive: Row; conversation: Row; messageId: string;
} | null> {
  const { db, userId, proactive, now } = input;
  const reminder=isPlanReminderProactive(proactive);
  if(!reminder){const {data:hold,error}=await db.from('together_scenario_sessions').select('id').eq('user_id',userId).eq('character_instance_id',proactive.character_instance_id).eq('status','active').maybeSingle();if(error)throw error;if(hold)return null;}
  if (!proactive.conversation_id || (proactive.context?.generationLeaseUntil &&
    Date.parse(proactive.context.generationLeaseUntil) > now.getTime())) return null;
  const started = Date.now(), leaseToken = crypto.randomUUID();
  const clock = () => new Date(now.getTime() + Math.max(0, Date.now() - started));
  const leaseContext = { ...proactive.context, generationLeaseToken: leaseToken,
    generationLeaseUntil: new Date(now.getTime() + 90_000).toISOString() };
  const { data: claimed, error: claimError } = await db.from('together_proactive_messages')
    .update({ context: leaseContext, updated_at: now.toISOString() })
    .eq('id', proactive.id).eq('user_id', userId).eq('status', 'queued')
    .eq('updated_at', proactive.updated_at)
    .or(`context->>generationLeaseUntil.is.null,context->>generationLeaseUntil.lte.${now.toISOString()}`)
    .select('*').maybeSingle();
  if (claimError) throw new Error('INITIATIVE_CLAIM_FAILED');
  if (!claimed) return null;
  const ownedUpdate = (values: Row) => db.from('together_proactive_messages').update(values)
    .eq('id', proactive.id).eq('user_id', userId).eq('status', 'queued').eq('context->>generationLeaseToken', leaseToken);
  const cancel = async (reason: string) => {
    const { error } = await ownedUpdate({ status: 'cancelled', updated_at: clock().toISOString(),
      context: { ...leaseContext, generationLeaseUntil: null, skipReason: reason } });
    if (error) throw new Error('INITIATIVE_CANCEL_FAILED');
    return null;
  };
  const checkPolicy = async () => {
    const at=clock(), policy=await proactiveDeliveryPolicy(db,userId,String(proactive.id),at);
    if(policy.allowed)return true;
    if(policy.reason==='quiet_hours'&&policy.quietHours){
      const q=policy.quietHours;
      await ownedUpdate({eligible_at:nextQuietHoursEnd(at,q).toISOString(),context:{...leaseContext,generationLeaseUntil:null},updated_at:at.toISOString()});
    }else await cancel(policy.reason??'policy_changed');
    return false;
  };
  try {
    const { data: conversation, error: conversationError } = await db.from('together_conversations').select('*')
      .eq('id', proactive.conversation_id).eq('user_id', userId).maybeSingle();
    if (conversationError) throw new Error('INITIATIVE_CONVERSATION_READ_FAILED');
    if (!conversation || conversation.archived_at) return await cancel('conversation_unavailable');
    const responseKey = `proactive:${proactive.id}`;
    const { data: existing, error: existingError } = await db.from('together_messages').select('id,content,created_at')
      .eq('conversation_id', conversation.id).eq('user_id', userId).eq('response_key', responseKey).maybeSingle();
    if (existingError) throw new Error('INITIATIVE_RECOVERY_READ_FAILED');
    let message = existing;
    let content = existing?.content ?? '';
    if (!message) {
      if(!await checkPolicy())return null;
      const [source, instanceResult, relationshipResult, entitlementResult, latestUser, continuity] = await Promise.all([
        loadInitiativeSource(db, userId, proactive, now, input.timezone),
        db.from('together_character_instances')
          .select('*,together_character_templates(name,slug,occupation),together_character_versions(character_bible,communication_style,personality_config,relationship_config)')
          .eq('id', proactive.character_instance_id).eq('user_id', userId).maybeSingle(),
        db.from('together_relationship_states').select('*').eq('character_instance_id', proactive.character_instance_id)
          .eq('user_id', userId).maybeSingle(),
        db.from('together_entitlements').select('tier,expires_at').eq('user_id', userId).maybeSingle(),
        latestUserMessage(db, userId, conversation.id),
        continuityById(db,userId,String(conversation.continuity_id)),
      ]);
      if (instanceResult.error || relationshipResult.error || entitlementResult.error) throw new Error('INITIATIVE_CONTEXT_READ_FAILED');
      const instance = instanceResult.data;
      if (!source || !instance || !relationshipResult.data || !continuity ||
        String(proactive.continuity_id) !== String(conversation.continuity_id) ||
        String(instance.continuity_id) !== String(conversation.continuity_id) ||
        userResumedAfterQueue(proactive, latestUser) ||
        (input.additionalRelevance && !await input.additionalRelevance(now))) return await cancel('source_no_longer_relevant');
      const entitlement = entitlementResult.data;
      const tier = entitlement?.expires_at && Date.parse(entitlement.expires_at) <= now.getTime()
        ? 'free' : normalizeSubscriptionTier(entitlement?.tier);
      content = await renderCharacterInitiative({ db, userId, instance, conversation, relationship: relationshipResult.data, persona:continuity.together_user_personas,
        draft: source.draft, reason: String(proactive.reason ?? 'A grounded update'), sourceSummary: source.summary,
        sourceAt: source.occurredAt, sourceMessageId: source.sourceMessageId, allowFallback: source.allowFallback,
        timezone: input.timezone, subscriptionTier: tier, now });
      if (!content) return await cancel('no_suitable_message');
      // A user can resume or a plan/thread can change while the model is running.
      const commitTime = clock();
      const [currentSource, currentUser, currentConversation, currentInstance, currentClaim, currentContinuity] = await Promise.all([
        loadInitiativeSource(db, userId, proactive, commitTime, input.timezone),
        latestUserMessage(db, userId, conversation.id),
        db.from('together_conversations').select('archived_at,metadata').eq('id', conversation.id).eq('user_id', userId).maybeSingle(),
        db.from('together_character_instances').select('current_activity,current_location_id,scenario_state').eq('id', instance.id).eq('user_id', userId).maybeSingle(),
        db.from('together_proactive_messages').select('id').eq('id', proactive.id).eq('user_id', userId)
          .eq('status', 'queued').eq('context->>generationLeaseToken', leaseToken).maybeSingle(),
        continuityById(db,userId,String(conversation.continuity_id)),
      ]);
      if (currentConversation.error || currentInstance.error || currentClaim.error) throw new Error('INITIATIVE_REVALIDATION_FAILED');
      if (!currentClaim.data) return null;
      if ((!reminder&&currentInstance.data?.scenario_state) || !currentSource || JSON.stringify(currentSource) !== JSON.stringify(source) || userResumedAfterQueue(proactive, currentUser) ||
        !currentConversation.data || currentConversation.data.archived_at || !currentContinuity ||
        JSON.stringify(currentContinuity.together_user_personas) !== JSON.stringify(continuity.together_user_personas) ||
        JSON.stringify(currentConversation.data.metadata?.chatPreferences) !== JSON.stringify(conversation.metadata?.chatPreferences) ||
        currentInstance.data?.current_activity !== instance.current_activity || currentInstance.data?.current_location_id !== instance.current_location_id ||
        commitTime.getTime() >= Date.parse(leaseContext.generationLeaseUntil) ||
        (input.additionalRelevance && !await input.additionalRelevance(commitTime))) return await cancel('changed_during_generation');
      if(!await checkPolicy())return null;
      const { data: inserted, error: insertError } = await db.from('together_messages').insert({
        conversation_id: conversation.id, user_id: userId, character_instance_id: instance.id,
        speaker_character_instance_id: conversation.kind === 'group' ? instance.id : null,
        role: 'assistant', content, delivery_status: 'complete', response_key: responseKey,
        provider_metadata: { provider: 'life-engine', proactive: true, proactive_message_id: proactive.id,
          messageKind: reminder?'plan_reminder':'initiative', group_plan_id: proactive.context?.groupPlanId, chatLanguage: normalizeChatLanguage(conversation.metadata?.chatPreferences?.chatLanguage),
          initiativeGenerationVersion: 2, ...(proactive.open_thread_id ? { conversationalHandoff: {
            mode: 'earned_followup', source: 'open_thread', openThreadId: proactive.open_thread_id,
          } } : {}) },
      }).select('id,content,created_at').single();
      if(insertError?.message?.includes('PROACTIVE_DELIVERY_BLOCKED')){if(!await checkPolicy())return null;return await cancel('policy_changed_at_commit');}
      if (insertError || !inserted) throw new Error('INITIATIVE_MESSAGE_INSERT_FAILED');
      message = inserted;
    }
    // Recover this bookkeeping after a crash without generating/inserting another message.
    await markInitiativeThreadDelivered(db, userId, proactive, new Date(message.created_at));
    const { error: conversationWriteError } = await db.from('together_conversations').update({
      last_message_at: message.created_at, updated_at: message.created_at,
    }).eq('id', conversation.id).eq('user_id', userId)
      .or(`last_message_at.is.null,last_message_at.lt.${message.created_at}`);
    if (conversationWriteError) throw new Error('INITIATIVE_CONVERSATION_WRITE_FAILED');
    const { data: delivered, error: deliveryError } = await ownedUpdate({ status: 'sent', sent_message_id: message.id, content,
      updated_at: clock().toISOString(), context: { ...leaseContext, generationLeaseUntil: null,
        generationVersion: 2, renderedAt: message.created_at } }).select('*').maybeSingle();
    if (deliveryError) throw new Error('INITIATIVE_DELIVERY_WRITE_FAILED');
    return delivered ? { proactive: delivered, conversation, messageId: message.id } : null;
  } catch (error) {
    await ownedUpdate({ context: { ...leaseContext, generationLeaseUntil: null }, updated_at: clock().toISOString() });
    throw error;
  }
}

async function latestUserMessage(db: SupabaseClient, userId: string, conversationId: string): Promise<Row | null> {
  // Timestamps only: private message contents never enter background generation.
  const { data, error } = await db.from('together_messages').select('id,created_at').eq('user_id', userId)
    .eq('conversation_id', conversationId).eq('role', 'user').neq('delivery_status', 'failed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('INITIATIVE_USER_ACTIVITY_READ_FAILED');
  return data;
}
