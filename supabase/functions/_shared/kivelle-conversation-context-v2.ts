import type { SupabaseClient } from "@supabase/supabase-js";
import {
  antiRepetitionGuidance,
  type CharacterGoals,
  type CharacterUserView,
  type CharacterVoiceCard,
  classifyChemistryResponseIntent,
  compileCharacterGoals,
  compileCharacterVoiceCard,
  compileRelationshipStance,
  compileResponseBrief,
  type KivelleCapabilities,
  normalizeCharacterUserView,
  type PromptInteractionQuality,
  type RelationshipStance,
  type RelationshipState,
  type ResponseBrief,
  scoreConversationEngagement,
  type SpiceLevel,
  normalizeChatGenerationPreferences,
  type ChatGenerationPreferences,
} from "../../../packages/together-domain/src/index.ts";
import {
  buildKivelleConversationContext as buildBaseContext,
  type KivelleConversationContext as BaseContext,
} from "./kivelle-conversation-context-base.ts";
import {
  type ConversationCommitment,
  loadConversationCommitments,
} from "./kivelle-commitment-context.ts";
import { resolveSubscriptionState } from "./kivelle-subscription.ts";
import { runKivelleDirector } from "./kivelle-director.ts";
import { mergePrivateCharacterPromptContext } from "./kivelle-character-private-context.ts";

type Row = Record<string, any>;
export type TieredConversationContext = BaseContext & {
  speakerPrivateContextOwnerId?: string;
  characterVoiceOwnerId?: string;
  sceneSpeakerDirective?: { characterInstanceId: string; name: string };
  commitments: ConversationCommitment[];
  subscription: {
    tier: string;
    displayName: string;
    intelligenceProfile: string;
    capabilities: KivelleCapabilities;
  };
  relationshipStance: RelationshipStance;
  characterGoals: CharacterGoals;
  relationshipReflection: Row | null;
  characterUserView: CharacterUserView;
  characterVoice: CharacterVoiceCard;
  responseBrief: ResponseBrief;
  interactionQuality: PromptInteractionQuality;
  antiRepetition: string[];
  director: { used: boolean; provider: string; policy: string };
  generationPreferences:ChatGenerationPreferences;
};

type BudgetedMemoryContext<T,D extends {id:string}>={silent:T[];callbacks:T[];directRecall:T[];callbackAllowance:number;retrievedIds:string[];debug?:D[]};

/** Apply the subscription budget to the combined recall set, not each bucket independently. */
export function applyMemoryRetrievalBudget<T extends {id:string},D extends {id:string}>(context:BudgetedMemoryContext<T,D>,requestedBudget:number):BudgetedMemoryContext<T,D>{
  let remaining=Math.max(0,Math.floor(requestedBudget));
  const directRecall=context.directRecall.slice(0,Math.min(5,remaining));remaining-=directRecall.length;
  const callbacks=context.callbacks.slice(0,Math.min(1,remaining));remaining-=callbacks.length;
  const silent=context.silent.slice(0,remaining),selectedIds=new Set([...directRecall,...callbacks,...silent].map((item)=>item.id));
  return{...context,directRecall,callbacks,silent,callbackAllowance:Math.min(context.callbackAllowance,directRecall.length||callbacks.length),retrievedIds:context.retrievedIds.filter((id)=>selectedIds.has(id)),...(context.debug?{debug:context.debug.filter((item)=>selectedIds.has(item.id))}:{})};
}

export async function buildTieredKivelleConversationContext(
  input: {
    db: SupabaseClient;
    userId: string;
    instance: Row;
    conversation: Row;
    userMessage: string;
    lifeRun: Row;
    semanticRows?: Row[];
    semanticQueryEmbedding?: number[] | null;
    attachments?: Row[];
    now?: Date;
    correlationId?: string;
    visibleHistoryFromSequence?: number;
    visibleSceneSessionId?: string;
    visibleSceneFromSequence?: number;
    forceRemoteInteraction?: boolean;
    conversationSceneResolution?: Row;
    authorizedWebAdult?: boolean;
    authorizedPrivateAdultText?: boolean;
  },
): Promise<TieredConversationContext> {
  const [subscription, base] = await Promise.all([
    resolveSubscriptionState(input.db, input.userId, input.now),
    buildBaseContext({...input,memoryCandidateLimit:20}),
  ]);
  const caps = subscription.capabilities;
  let recent = base.recent.slice(-caps.recentTurnBudget);
  if (caps.recentTurnBudget > recent.length) {
    let query = input.db.from("together_messages").select(
      "role,content,created_at,provider_metadata,speaker_character_instance_id,character_instance_id,conversation_sequence,scene_session_id,scene_sequence,content_rating,visibility_scope",
    ).eq("conversation_id", input.conversation.id);
    if(!input.authorizedPrivateAdultText)query=query.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
    if (input.visibleSceneSessionId) {
      query = query.eq("scene_session_id", input.visibleSceneSessionId).gte(
        "scene_sequence",
        Number(input.visibleSceneFromSequence ?? 1),
      );
    } else if (
      input.conversation.kind === "group" &&
      Number(input.visibleHistoryFromSequence ?? 1) > 1
    ) {
      query = query.gte(
        "conversation_sequence",
        Number(input.visibleHistoryFromSequence),
      );
    }
    const { data } = await query.order(
      input.visibleSceneSessionId ? "scene_sequence" : "conversation_sequence",
      { ascending: false, nullsFirst: false },
    ).order("created_at", { ascending: false }).limit(caps.recentTurnBudget);
    if (data?.length) {
      recent = data.reverse().map((item: Row) => {
        const providerMetadata =
          item.provider_metadata && typeof item.provider_metadata === "object"
            ? item.provider_metadata as Record<string, unknown>
            : undefined;
        return {
          role: String(item.role),
          content: String(item.content),
          createdAt: item.created_at ? String(item.created_at) : undefined,
          speakerCharacterInstanceId: item.role === "assistant"
            ? String(
              item.speaker_character_instance_id ??
                item.character_instance_id ?? "",
            ) || null
            : null,
          speakerName: typeof providerMetadata?.speakerName === "string"
            ? providerMetadata.speakerName
            : null,
          conversationSequence: item.conversation_sequence == null
            ? null
            : Number(item.conversation_sequence),
          ...(providerMetadata ? { providerMetadata } : {}),
        };
      });
    }
  }
  const memoryContext=applyMemoryRetrievalBudget(base.memoryContext,caps.memoryRetrievalBudget);
  const conversationEpisodes=base.conversationEpisodes.slice(0,caps.historyRetrievalBudget);
  const memories = [
      ...memoryContext.silent,
      ...memoryContext.callbacks,
      ...memoryContext.directRecall,
    ].map((item) => ({
      id: item.id,
      text: item.text,
      type: item.type,
      pinned: item.pinned,
      importance: item.importance,
      characterInstanceId: String(input.instance.id),
    })),
    sharedHistory = base.sharedHistory.slice(0, caps.historyRetrievalBudget);
  const nestedVersion =
    Array.isArray(input.instance.together_character_versions)
      ? input.instance.together_character_versions[0]
      : input.instance.together_character_versions;
  const [{ data: reflection }, { data: version }, commitments, {data:privateCharacterProfile}] = await Promise
    .all([
      base.personalizationEnabled
        ? input.db.from("together_relationship_reflections").select("*").eq(
          "user_id",
          input.userId,
        ).eq("character_instance_id", input.instance.id).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      nestedVersion
        ? Promise.resolve({ data: nestedVersion, error: null })
        : input.db.from("together_character_versions").select(
          "pronouns,interests,character_bible,life_config,relationship_config,personality_config",
        ).eq("id", input.instance.character_version_id).maybeSingle(),
      loadConversationCommitments(input.db, {
        userId: input.userId,
        continuityId: String(input.instance.continuity_id),
        characterInstanceId: String(input.instance.id),
        queryIntent: base.queryIntent,
        now: input.now,
      }),
      input.db.from('together_character_private_profiles')
        .select('private_truth,adult_continuity,intimate_anatomy,hidden_sexual')
        .eq('character_version_id',String(input.instance.character_version_id)).maybeSingle(),
    ]);
  const reflectionView = reflection
    ? {
      companionView: String(reflection.companion_view ?? ""),
      relationshipSummary: String(reflection.relationship_summary ?? ""),
      unresolvedTension: (reflection.unresolved_tension ?? []).map(String),
      recurringDynamics: (reflection.recurring_dynamics ?? []).map(String),
      sharedReferences: (reflection.shared_references ?? []).map(String),
      emotionalExpectations: (reflection.emotional_expectations ?? []).map(
        String,
      ),
    }
    : {};
  const characterUserView = normalizeCharacterUserView(reflection?.user_view);
  const storedPreferences = input.conversation?.metadata?.chatPreferences;
  const chatPreferences =
    storedPreferences && typeof storedPreferences === "object" &&
      !Array.isArray(storedPreferences)
      ? storedPreferences as Row
      : {};
  const paidSpice = subscription.tier === "free"
    ? undefined
    : chatPreferences.spiceLevel;
  const spiceLevel = normalizeSpice(paidSpice ?? base.character?.spice_level);
  const conversationStyle = chatPreferences.responseStyle === "paragraph" ||
      chatPreferences.responseStyle === "texting"
    ? chatPreferences.responseStyle
    : base.conversationStyle;
  const generationPreferences=normalizeChatGenerationPreferences(chatPreferences);
  const personality =
    (version?.personality_config ?? base.character?.personality_config ??
      {}) as Record<string, unknown>;
  const relationshipState = toRelationshipState(base.relationship);
  const characterBible=mergePrivateCharacterPromptContext(version?.character_bible??{},privateCharacterProfile,input.authorizedPrivateAdultText===true);
  const effectiveCharacter = {
    ...base.character,
    spice_level: spiceLevel,
    pronouns: version?.pronouns ?? base.character?.pronouns ??
      base.character?.discovery_metadata?.pronouns ?? null,
    interests: Array.isArray(version?.interests)
      ? version.interests
      : base.character?.interests ?? [],
    character_bible: characterBible,
    life_config: version?.life_config ?? {},
    relationship_config: version?.relationship_config ?? {},
  };
  const relationshipStance = compileRelationshipStance({
    ...base.relationship,
    spiceLevel,
    personality,
  }, reflectionView);
  const characterGoals = compileCharacterGoals({
    occupation: String(base.character?.occupation ?? ""),
    currentActivity: base.currentScene.activity,
    bible: characterBible,
    activeStory: base.activeStory
      ? {
        title: String(base.activeStory.title ?? ""),
        chapterTitle: String(base.activeStory.chapterTitle ?? ""),
        knownSummary: String(base.activeStory.knownSummary ?? ""),
      }
      : null,
    reflection: reflectionView,
    recentLifeEvents: base.knownLifeEvents.slice(0, 2).map((event) => ({
      title: event.title,
      summary: event.summary,
    })),
  });
  const precedingAssistantMessage = [...recent].reverse().find((turn) =>
    turn.role === "assistant"
  )?.content;
  const recentUserMessages = recent.filter((turn) => turn.role === "user")
    .slice(-8).map((turn) => turn.content);
  const interactionQuality = scoreConversationEngagement({
    message: input.userMessage,
    ...(precedingAssistantMessage ? { precedingAssistantMessage } : {}),
    recentUserMessages,
  }).quality as PromptInteractionQuality;
  const assistantMessages = recent.filter((turn) =>
    turn.role === "assistant" &&
    (input.conversation.kind !== "group" ||
      turn.speakerCharacterInstanceId === String(input.instance.id))
  ).map((turn) => turn.content);
  const antiRepetition = antiRepetitionGuidance(assistantMessages);
  const nextCommitment = commitments.find((item) => item.status !== "missed") ??
    commitments[0];
  const responseIntent = classifyChemistryResponseIntent({
    message: input.userMessage,
    state: relationshipState,
    spiceLevel,
    personality,
    contextFit: sceneChemistryFit(base.currentScene),
  });
  const eligibleOpenThread =
    base.openThreads.filter((thread) =>
      thread.eligible && thread.followupCount < 1 && !thread.lastFollowedUpAt
    ).sort((a, b) =>
      b.importance - a.importance ||
      (a.expectedAt ?? "9999").localeCompare(b.expectedAt ?? "9999")
    )[0];
  const handoffsEnabled =
    String(Deno.env.get("KIVELLE_CONVERSATIONAL_HANDOFFS_ENABLED") ?? "true")
      .toLowerCase() !== "false";
  const baseBrief = compileResponseBrief({
    message: input.userMessage,
    interactionQuality,
    relationshipStance,
    ...(responseIntent ? { responseIntent } : {}),
    ...(eligibleOpenThread ? { eligibleOpenThread } : {}),
    nextCommitment: nextCommitment?.title ?? base.upcomingCommitments[0]?.title,
    activeStory: base.activeStory?.title,
    recentAssistantMessages: assistantMessages,
    recentTurns: recent.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    now: input.now,
    handoffsEnabled,
  });
  const director = await runKivelleDirector({
    context: {
      ...base,
      commitments,
      character: effectiveCharacter,
      relationshipStance,
      characterGoals,
      recent,
      userMessage: input.userMessage,
    },
    baseBrief,
    policy: caps.directorPolicy,
    interactionQuality,
    pendingMilestone: Boolean(base.progression),
    activeConflict: Number(base.relationship?.conflict ?? 0) >= 45,
    usageScope: {
      db: input.db,
      userId: input.userId,
      continuityId: String(input.instance.continuity_id ?? ""),
      conversationId: String(input.conversation.id),
      characterInstanceId: String(input.instance.id),
      subscriptionTier: subscription.tier,
      contentMode: String(base.contentMode ?? "standard"),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    },
  });
  const characterVoice = compileCharacterVoiceCard({
    bible: characterBible,
    characterName: String(base.character?.name ?? ""),
    occupation: String(base.character?.occupation ?? ""),
    message: input.userMessage,
    mode: director.brief.mode,
    relationshipStage: String(
      base.relationship?.relationship_stage ?? base.relationship?.stage ??
        "stranger",
    ),
    trust: Number(base.relationship?.trust ?? 0),
    interactionMode: String(base.currentScene?.interactionMode ?? "remote"),
    interactionQuality,
    recentAssistantMessages: assistantMessages,
    contentMode: String(base.contentMode ?? "standard"),
    age: Number(base.character?.age ?? 0) || null,
  });
  const compiled: {
    companionView: string;
    relationshipSummary: string;
    unresolvedTension: string[];
    recurringDynamics: string[];
    sharedReferences: string[];
    emotionalExpectations: string[];
  } = {
    companionView: relationshipStance.summary,
    relationshipSummary:
      `${relationshipStance.summary} ${relationshipStance.conflictPosture}`
        .trim(),
    unresolvedTension: Number(base.relationship?.conflict ?? 0) >= 25
      ? [relationshipStance.conflictPosture]
      : [],
    recurringDynamics: reflectionView.recurringDynamics ?? [],
    sharedReferences: sharedHistory.slice(0, 4).map((item) => item.title),
    emotionalExpectations: [
      relationshipStance.vulnerabilityPosture,
      relationshipStance.affectionBoundary,
    ],
  };
  const shouldRefresh = base.personalizationEnabled && !input.authorizedPrivateAdultText &&
    (!reflection ||
      Date.now() - new Date(String(reflection.updated_at ?? 0)).getTime() >
        6 * 3600000);
  if (shouldRefresh) {
    void input.db.from("together_relationship_reflections").upsert({
      character_instance_id: input.instance.id,
      user_id: input.userId,
      continuity_id: input.instance.continuity_id ?? null,
      companion_view: compiled.companionView,
      relationship_summary: compiled.relationshipSummary,
      unresolved_tension: compiled.unresolvedTension,
      recurring_dynamics: compiled.recurringDynamics,
      shared_references: compiled.sharedReferences,
      emotional_expectations: compiled.emotionalExpectations,
      content_rating:'safe',visibility_scope:'all',moderation_version:'safe-context-v1',
      metadata: {
        source: "prompt_compiler",
        tier: subscription.tier,
        promptVersion: 2,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "character_instance_id" });
  }
  return {
    ...base,
    conversationStyle,
    generationPreferences,
    commitments,
    character: effectiveCharacter,
    recent,
    conversationEpisodes,
    memories,
    memoryContext,
    sharedHistory,
    relationshipStance,
    characterGoals,
    relationshipReflection: reflection ?? compiled,
    characterUserView,
    characterVoice,
    responseBrief: director.brief,
    interactionQuality,
    antiRepetition,
    director: {
      used: director.directorUsed,
      provider: director.provider,
      policy: caps.directorPolicy,
    },
    subscription: {
      tier: subscription.tier,
      displayName: caps.displayName,
      intelligenceProfile: caps.intelligenceProfile,
      capabilities: caps,
    },
    debug: {
      ...base.debug,
      limits: {
        ...base.debug.limits,
        memory: caps.memoryRetrievalBudget,
        recentTurns: caps.recentTurnBudget,
        history: caps.historyRetrievalBudget,
        commitments: ["plan", "schedule", "date"].includes(base.queryIntent)
          ? 8
          : 4,
      },
    },
  };
}

function normalizeSpice(value: unknown): SpiceLevel {
  const parsed = Number(value);
  return parsed === 1 || parsed === 3 ? parsed : 2;
}
function toRelationshipState(value: Row): RelationshipState {
  return {
    stage: String(
      value.relationship_stage ?? value.stage ?? "stranger",
    ) as RelationshipState["stage"],
    trust: Number(value.trust ?? 0),
    comfort: Number(value.comfort ?? 0),
    attraction: Number(value.attraction ?? 0),
    affinity: Number(value.affinity ?? 0),
    familiarity: Number(value.familiarity ?? 0),
    respect: Number(value.respect ?? 0),
    conflict: Number(value.conflict ?? 0),
    romantic_interest: Number(value.romantic_interest ?? 0),
    commitment: Number(value.commitment ?? 0),
    conversationCount: Number(
      value.interaction_turn_count ?? value.conversation_count ?? 0,
    ),
    conversationSessionCount: Number(value.conversation_session_count ?? 0),
    meaningfulInteractionCount: Number(value.meaningful_interaction_count ?? 0),
    engagementScore: Number(value.engagement_score ?? 0),
    genuineBackAndForthTurns: Number(value.genuine_back_and_forth_turns ?? 0),
    trivialEngagementScore: Number(value.trivial_engagement_score ?? 0),
    chemistryHeat: Number(value.chemistry_heat ?? 0),
    physicalTension: Number(value.physical_tension ?? 0),
    userFlirtSignals: Number(value.user_flirt_signals ?? 0),
    characterFlirtSignals: Number(value.character_flirt_signals ?? 0),
    mutualFlirtSignals: Number(value.mutual_flirt_signals ?? 0),
    attractionAcknowledged: Boolean(value.attraction_acknowledged),
    ...(value.last_chemistry_change_at
      ? { lastChemistryChangeAt: String(value.last_chemistry_change_at) }
      : {}),
    ...(value.last_flirt_signal_at
      ? { lastFlirtSignalAt: String(value.last_flirt_signal_at) }
      : {}),
    activeMajorConflict: Boolean(value.active_major_conflict),
    romanceEnabled: value.romance_enabled !== false,
    romancePathStatus: String(
      value.romance_path_status ?? "open",
    ) as RelationshipState["romancePathStatus"],
  };
}
function sceneChemistryFit(scene: Row): number {
  const interruptibility = String(
    scene?.interruptibility ?? scene?.availability ?? "open",
  );
  if (interruptibility === "busy" || interruptibility === "unavailable") {
    return .2;
  }
  const activity = String(scene?.activity ?? "").toLowerCase();
  if (/\b(work|meeting|sleep|driving|appointment|casework)\b/.test(activity)) {
    return .25;
  }
  if (
    /\b(date|drinks|karaoke|dancing|dinner|rooftop|walk|music)\b/.test(activity)
  ) return .85;
  return interruptibility === "limited" ? .45 : .65;
}
