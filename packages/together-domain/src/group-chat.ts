export const groupEnergies = ["quiet", "balanced", "lively"] as const;
export type GroupEnergy = typeof groupEnergies[number];
export const groupResponseModes = ["automatic", "choose_speaker"] as const;
export type GroupResponseMode = typeof groupResponseModes[number];
export const groupReactions = ["❤️", "😂", "😮", "😏", "👍", "👀"] as const;
export type GroupReaction = typeof groupReactions[number];

export type GroupPlanRosterSummary={
  id:string;
  title:string;
  status:string;
  starts_at?:string|null;
  participant_instance_ids?:readonly string[]|null;
};

/** A current group plan owns an immutable attendee roster. Removing one of
 * those companions would otherwise leave chat membership and scene attendance
 * disagreeing, so membership changes wait until that plan is resolved. */
export function currentGroupPlan<T extends GroupPlanRosterSummary>(plans:readonly T[]):T|null{
  const priority=(status:string)=>status==='active'?0:status==='scheduled'?1:2;
  return plans.filter((plan)=>['proposed','scheduled','active'].includes(plan.status))
    .sort((left,right)=>priority(left.status)-priority(right.status)||(new Date(left.starts_at??0).getTime()-new Date(right.starts_at??0).getTime()))[0]??null;
}

export function groupPlanBlockingParticipantRemoval<T extends GroupPlanRosterSummary>(plans:readonly T[],characterInstanceId:string):T|null{
  return currentGroupPlan(plans.filter((plan)=>plan.participant_instance_ids?.includes(characterInstanceId)));
}

export type GroupSpeakerCandidate = {
  characterInstanceId: string;
  name: string;
  available: boolean;
  socialEnergy?: number;
  directness?: number;
  knowledgeRelevance?: number;
  relationshipRelevance?: number;
  affinityWithUser?: number;
  affinityWithOthers?: number;
  tensionWithOthers?: number;
  recentSpeakerCount?: number;
  consecutiveSpeakerCount?: number;
  lastSpokeAt?: string | null;
};

export type GroupTurnAction = {
  id: string;
  type: "message" | "reaction";
  characterInstanceId: string;
  addresseeInstanceIds: string[];
  intent: string;
  reasonCodes: string[];
  priority: number;
  reaction?: GroupReaction;
};

export type GroupTurnPlan = {
  actions: GroupTurnAction[];
  yieldToUserAfter: boolean;
  continuationBudget: number;
  directorUsed: boolean;
  reasonCodes: string[];
};

export type GroupTurnInput = {
  message: string;
  candidates: readonly GroupSpeakerCandidate[];
  mentionedCharacterInstanceIds?: readonly string[];
  replyToCharacterInstanceId?: string | null;
  manualSpeakerInstanceId?: string | null;
  energy?: GroupEnergy;
  letThemTalk?: boolean;
  broadGroupRequest?: boolean;
  randomSeed?: number;
};

export type GroupContinuationInput = {
  originatingMessage: string;
  latestMessage: string;
  latestSpeakerCharacterInstanceId: string;
  candidates: readonly GroupSpeakerCandidate[];
  alreadySpokeCharacterInstanceIds: readonly string[];
  preferredActions?: readonly GroupTurnAction[];
  energy?: GroupEnergy;
  letThemTalk?: boolean;
  continuationIndex: number;
  randomSeed?: number;
};

export type SpeakerIsolationContext = {
  relationship?: { character_instance_id?: unknown };
  relationshipReflection?: { character_instance_id?: unknown };
  sceneSpeakerDirective?: { characterInstanceId?: unknown };
  characterVoiceOwnerId?: unknown;
  speakerPrivateContextOwnerId?: unknown;
  memories?: ReadonlyArray<
    { characterInstanceId?: unknown; character_instance_id?: unknown }
  >;
};

export function speakerContextIsolationViolations(
  context: SpeakerIsolationContext,
  speakerCharacterInstanceId: string,
): string[] {
  const violations: string[] = [];
  const owners = [
    ["relationship", context.relationship?.character_instance_id],
    [
      "relationship_reflection",
      context.relationshipReflection?.character_instance_id,
    ],
    ["speaker_directive", context.sceneSpeakerDirective?.characterInstanceId],
    ["voice", context.characterVoiceOwnerId],
    ["private_context", context.speakerPrivateContextOwnerId],
  ] as const;
  for (const [boundary, owner] of owners) {
    if (owner != null && owner !== speakerCharacterInstanceId) {
      violations.push(boundary);
    }
  }
  for (const memory of context.memories ?? []) {
    const owner = memory.characterInstanceId ?? memory.character_instance_id;
    if (owner != null && owner !== speakerCharacterInstanceId) {
      violations.push("memory");
    }
  }
  return [...new Set(violations)];
}

const normalized = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}@]+/gu, " ")
    .trim();
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const stableNoise = (id: string, seed: number) => {
  let value = Math.floor(seed * 2147483647) || 17;
  for (const char of id) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return (value % 1000) / 1000;
};
const directNameMatch = (message: string, name: string) => {
  const first = normalized(name).split(" ")[0] ?? "";
  return first.length > 1 &&
    new RegExp(`(?:^|\\s)@?${escapeRegExp(first)}(?:$|\\s)`, "iu").test(
      normalized(message),
    );
};
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function groupFloorDebt(candidate: GroupSpeakerCandidate): number {
  return clamp(
    Number(candidate.recentSpeakerCount ?? 0) * .14 +
      Number(candidate.consecutiveSpeakerCount ?? 0) * .24,
    0,
    .72,
  );
}

export function planGroupTurn(input: GroupTurnInput): GroupTurnPlan {
  const available = input.candidates.filter((candidate) => candidate.available);
  if (!available.length) {
    return {
      actions: [],
      yieldToUserAfter: true,
      continuationBudget: 0,
      directorUsed: false,
      reasonCodes: ["no_available_speaker"],
    };
  }
  const byId = new Map(
    available.map((candidate) => [candidate.characterInstanceId, candidate]),
  );
  const manual = input.manualSpeakerInstanceId &&
    byId.get(input.manualSpeakerInstanceId);
  const reply = input.replyToCharacterInstanceId &&
    byId.get(input.replyToCharacterInstanceId);
  const explicitIds = new Set(
    (input.mentionedCharacterInstanceIds ?? []).filter((id) => byId.has(id)),
  );
  for (const candidate of available) {
    if (directNameMatch(input.message, candidate.name)) {
      explicitIds.add(candidate.characterInstanceId);
    }
  }
  const addressed = manual
    ? [manual]
    : reply
    ? [reply]
    : available.filter((candidate) =>
      explicitIds.has(candidate.characterInstanceId)
    );
  const messageForOrdering = normalized(input.message);
  const explicitlyAddressed = addressed.length > 1
    ? [...addressed].sort((left, right) =>
      messageForOrdering.indexOf(normalized(left.name).split(" ")[0] ?? "") -
      messageForOrdering.indexOf(normalized(right.name).split(" ")[0] ?? "")
    )
    : addressed;
  const broad = input.broadGroupRequest === true ||
    /\b(everyone|everybody|all of you|all (?:two|three|four|five)|you (?:all|guys|girls))\b/iu
      .test(input.message);
  const crossAddressedExchange = explicitlyAddressed.length >= 2 &&
    /\b(?:tell|ask|say to|explain to|what you (?:said|told))\b/iu.test(
      input.message,
    );
  const energy = input.energy ?? "balanced";
  const maxMessages = input.letThemTalk
    ? Math.min(6, available.length + 2)
    : broad
    ? (energy === "quiet" ? 1 : energy === "balanced" ? 2 : 3)
    : crossAddressedExchange && energy !== "quiet"
    ? 2
    : 1;
  const ranked = (explicitlyAddressed.length ? explicitlyAddressed : available)
    .map((candidate) => {
      const relevance =
        .26 * clamp(Number(candidate.knowledgeRelevance ?? .5)) +
        .22 * clamp(Number(candidate.relationshipRelevance ?? .5));
      const personality = .12 * clamp(Number(candidate.directness ?? .5)) +
        .1 * clamp(Number(candidate.socialEnergy ?? .5));
      const social = .08 * clamp(Number(candidate.affinityWithUser ?? .5)) +
        .05 * clamp(Number(candidate.tensionWithOthers ?? 0));
      const explicit = explicitlyAddressed.some((item) =>
          item.characterInstanceId === candidate.characterInstanceId
        )
        ? 1.5
        : 0;
      const directedActor = crossAddressedExchange &&
          explicitlyAddressed[0]?.characterInstanceId ===
            candidate.characterInstanceId
        ? 1
        : 0;
      const quietOpportunity = Math.min(
        .16,
        Number(candidate.recentSpeakerCount ?? 0) === 0 ? .16 : 0,
      );
      return {
        candidate,
        score: explicit + directedActor + relevance + personality + social +
          quietOpportunity - groupFloorDebt(candidate) +
          stableNoise(candidate.characterInstanceId, input.randomSeed ?? .41) *
            .025,
      };
    }).sort((left, right) => right.score - left.score);
  if (
    !ranked.length ||
    (!explicitlyAddressed.length && !broad && ranked[0]!.score < .12)
  ) {
    return {
      actions: [],
      yieldToUserAfter: true,
      continuationBudget: 0,
      directorUsed: false,
      reasonCodes: ["silence_preferred"],
    };
  }
  const selected = ranked.slice(
    0,
    Math.max(
      1,
      Math.min(maxMessages, explicitlyAddressed.length || maxMessages),
    ),
  );
  const actions = selected.map((
    { candidate, score },
    index,
  ): GroupTurnAction => ({
    id: `${candidate.characterInstanceId}:${index}`,
    type: "message",
    characterInstanceId: candidate.characterInstanceId,
    addresseeInstanceIds: explicitlyAddressed.filter((item) =>
      item.characterInstanceId !== candidate.characterInstanceId
    ).map((item) => item.characterInstanceId),
    intent: index === 0
      ? "answer_user"
      : crossAddressedExchange
      ? "respond_to_character"
      : "add_novel_group_contribution",
    reasonCodes: [
      manual
        ? "manual_speaker"
        : reply
        ? "reply_target"
        : explicitIds.has(candidate.characterInstanceId)
        ? "direct_address"
        : broad
        ? "group_broadcast"
        : "best_candidate",
      ...(crossAddressedExchange ? ["cross_addressed_exchange"] : []),
      ...(groupFloorDebt(candidate) > 0 ? ["floor_debt_applied"] : []),
    ],
    priority: Number(score.toFixed(4)),
  }));
  if (
    !broad && !input.letThemTalk && energy !== "quiet" &&
    explicitlyAddressed.length <= 1 &&
    /\b(?:always|dramatic|impossible|ridiculous|funny|joke|lol|haha|seriously)\b/iu
      .test(input.message)
  ) {
    const reactor = available.filter((candidate) =>
      !actions.some((action) =>
        action.characterInstanceId === candidate.characterInstanceId
      )
    ).map((candidate) => ({
      candidate,
      score: .22 * clamp(Number(candidate.socialEnergy ?? .5)) +
        .12 * clamp(Number(candidate.directness ?? .5)) +
        .1 * clamp(Number(candidate.affinityWithOthers ?? .5)) -
        groupFloorDebt(candidate) +
        stableNoise(candidate.characterInstanceId, input.randomSeed ?? .41) *
          .025,
    })).sort((left, right) =>
      right.score - left.score
    )[0];
    if (reactor) {
      actions.push({
        id: `${reactor.candidate.characterInstanceId}:reaction`,
        type: "reaction",
        characterInstanceId: reactor.candidate.characterInstanceId,
        addresseeInstanceIds: [],
        intent: "lightweight_social_reaction",
        reasonCodes: ["reaction_adds_more_than_message"],
        priority: Number((reactor.score - .05).toFixed(4)),
        reaction: /\b(?:funny|joke|lol|haha)\b/iu.test(input.message)
          ? "😂"
          : "👀",
      });
    }
  }
  const continuationBudget = input.letThemTalk
    ? Math.min(5, Math.max(2, available.length))
    : Math.max(0, actions.length - 1);
  return {
    actions,
    yieldToUserAfter: true,
    continuationBudget,
    directorUsed: false,
    reasonCodes: [broad ? "group_broadcast" : "bounded_floor"],
  };
}

/**
 * Re-evaluates the conversational floor after a committed companion message.
 * It intentionally returns at most one action: the caller must persist that
 * action before asking the Director whether the group should continue again.
 */
export function planGroupContinuation(
  input: GroupContinuationInput,
): GroupTurnAction | null {
  const available = input.candidates.filter((candidate) =>
    candidate.available &&
    candidate.characterInstanceId !== input.latestSpeakerCharacterInstanceId
  );
  if (!available.length) return null;
  const byId = new Map(
    available.map((candidate) => [candidate.characterInstanceId, candidate]),
  );
  const preferred = (input.preferredActions ?? []).find((action) =>
    byId.has(action.characterInstanceId) && (
      action.type === "reaction" ||
      !input.alreadySpokeCharacterInstanceIds.includes(
        action.characterInstanceId,
      )
    )
  );
  if (preferred) {
    return {
      ...preferred,
      id:
        `${preferred.characterInstanceId}:continuation:${input.continuationIndex}`,
      addresseeInstanceIds: preferred.addresseeInstanceIds.length
        ? preferred.addresseeInstanceIds
        : [input.latestSpeakerCharacterInstanceId],
      reasonCodes: [...preferred.reasonCodes, "floor_re_evaluated"],
    };
  }
  if (!input.letThemTalk) return null;
  const ranked = available.map((candidate) => {
    const freshOpportunity = input.alreadySpokeCharacterInstanceIds.includes(
        candidate.characterInstanceId,
      )
      ? 0
      : .18;
    const social = .2 * clamp(Number(candidate.socialEnergy ?? .5)) +
      .16 * clamp(Number(candidate.directness ?? .5)) +
      .12 * clamp(Number(candidate.tensionWithOthers ?? 0));
    const relevance = .18 * clamp(Number(candidate.knowledgeRelevance ?? .5)) +
      .12 * clamp(Number(candidate.affinityWithOthers ?? .5));
    return {
      candidate,
      score: freshOpportunity + social + relevance - groupFloorDebt(candidate) +
        stableNoise(
            candidate.characterInstanceId,
            (input.randomSeed ?? .53) + input.continuationIndex * .07,
          ) * .025,
    };
  }).sort((left, right) => right.score - left.score);
  const next = ranked[0];
  if (!next) return null;
  return {
    id:
      `${next.candidate.characterInstanceId}:continuation:${input.continuationIndex}`,
    type: "message",
    characterInstanceId: next.candidate.characterInstanceId,
    addresseeInstanceIds: [input.latestSpeakerCharacterInstanceId],
    intent: "respond_to_character",
    reasonCodes: [
      "let_them_talk",
      "floor_re_evaluated",
      ...(groupFloorDebt(next.candidate) > 0 ? ["floor_debt_applied"] : []),
    ],
    priority: Number(next.score.toFixed(4)),
  };
}

export type AttributedTurn = {
  role: string;
  content: string;
  speakerCharacterInstanceId?: string | null;
  speakerName?: string | null;
};
export function formatAttributedGroupTranscript(
  turns: readonly AttributedTurn[],
): string {
  return turns.map((turn) =>
    turn.role === "user"
      ? `USER:\n${turn.content}`
      : turn.role === "assistant"
      ? `${turn.speakerName || "COMPANION"}${
        turn.speakerCharacterInstanceId
          ? ` [${turn.speakerCharacterInstanceId}]`
          : ""
      }:\n${turn.content}`
      : `SYSTEM:\n${turn.content}`
  ).join("\n\n");
}

export function shouldGroupChatMessages(
  left: {
    role: string;
    created_at?: string;
    speaker_character_instance_id?: string | null;
    character_instance_id?: string | null;
  },
  right: {
    role: string;
    created_at?: string;
    speaker_character_instance_id?: string | null;
    character_instance_id?: string | null;
  },
  significantEventBetween = false,
  maxGapMs = 5 * 60_000,
): boolean {
  if (significantEventBetween || left.role !== right.role) return false;
  if (left.role === "assistant") {
    const leftSpeaker = left.speaker_character_instance_id ??
        left.character_instance_id ?? null,
      rightSpeaker = right.speaker_character_instance_id ??
        right.character_instance_id ?? null;
    if (!leftSpeaker || leftSpeaker !== rightSpeaker) return false;
  }
  const leftTime = left.created_at ? new Date(left.created_at).getTime() : NaN,
    rightTime = right.created_at ? new Date(right.created_at).getTime() : NaN;
  return !Number.isFinite(leftTime) || !Number.isFinite(rightTime) ||
    Math.abs(rightTime - leftTime) <= maxGapMs;
}

export function defaultGroupTitle(names: readonly string[]): string {
  const clean = names.map((name) => name.trim().split(/\s+/)[0]).filter(
    Boolean,
  );
  if (clean.length <= 1) return clean[0] ?? "Group";
  if (clean.length === 2) return `${clean[0]} & ${clean[1]}`;
  if (clean.length === 3) return `${clean[0]}, ${clean[1]} & ${clean[2]}`;
  return `${clean.slice(0, 2).join(", ")} & ${clean.length - 2} more`;
}

/**
 * Returns the one canonical resident world shared by every proposed group
 * participant. Missing or mixed resident-world assignments are invalid.
 */
export function commonGroupWorldId(
  residentWorldIds: readonly (string | null | undefined)[],
): string | null {
  if (
    !residentWorldIds.length || residentWorldIds.some((worldId) => !worldId)
  ) {
    return null;
  }
  const unique = new Set(residentWorldIds as readonly string[]);
  return unique.size === 1 ? residentWorldIds[0]! : null;
}

export function characterWitnessesGroupSequence(
  input: {
    witnessedFromSequence: number;
    witnessedToSequence?: number | null;
    sequence: number;
  },
): boolean {
  return input.sequence >= input.witnessedFromSequence &&
    (input.witnessedToSequence == null ||
      input.sequence <= input.witnessedToSequence);
}
export function groupMemoryRecipientIds(
  participants: readonly {
    characterInstanceId: string;
    witnessedFromSequence: number;
    witnessedToSequence?: number | null;
  }[],
  sequence: number,
): string[] {
  return participants.filter((participant) =>
    characterWitnessesGroupSequence({ ...participant, sequence })
  ).map((participant) => participant.characterInstanceId);
}

export const groupSocialEventDeltas = {
  agreed: { affinity: 1, familiarity: 1, tension: -1 },
  supported: { affinity: 2, familiarity: 1, tension: -1 },
  defended: { affinity: 3, familiarity: 1, tension: -2 },
  teased: { affinity: 1, familiarity: 1, tension: 1 },
  flirted: { affinity: 2, familiarity: 1, tension: 0 },
  confided: { affinity: 3, familiarity: 2, tension: -1 },
  disagreed: { affinity: 0, familiarity: 1, tension: 1 },
  challenged: { affinity: 0, familiarity: 1, tension: 2 },
  insulted: { affinity: -3, familiarity: 1, tension: 4 },
  apologized: { affinity: 2, familiarity: 1, tension: -3 },
  repaired: { affinity: 3, familiarity: 1, tension: -4 },
  respected_boundary: { affinity: 2, familiarity: 1, tension: -2 },
  ignored: { affinity: -1, familiarity: 0, tension: 2 },
  comforted: { affinity: 3, familiarity: 2, tension: -2 },
  betrayed_expectation: { affinity: -4, familiarity: 1, tension: 5 },
} as const;
export type GroupSocialEvent = keyof typeof groupSocialEventDeltas;
export function boundedGroupSocialDelta(
  event: GroupSocialEvent,
  intensity: number,
  confidence: number,
) {
  const base = groupSocialEventDeltas[event],
    scale = clamp(intensity) * clamp(confidence);
  return {
    affinity: Math.round(base.affinity * scale),
    familiarity: Math.round(base.familiarity * scale),
    tension: Math.round(base.tension * scale),
  };
}
export function classifyGroupSocialEvent(
  text: string,
): GroupSocialEvent | null {
  const lower = text.normalize("NFKC").toLocaleLowerCase();
  const patterns: Array<[GroupSocialEvent, RegExp]> = [
    [
      "betrayed_expectation",
      /\b(?:betrayed|broke (?:your|my|our) promise|you promised)\b/,
    ],
    [
      "respected_boundary",
      /\b(?:respect(?:ed)? (?:your|that) boundary|won't push|will not push|i'll stop|i will stop)\b/,
    ],
    [
      "repaired",
      /\b(?:we(?:'re| are) okay|make this right|work this out|glad we talked)\b/,
    ],
    ["apologized", /\b(?:i(?:'m| am) sorry|apologize|my fault)\b/],
    [
      "defended",
      /\b(?:leave (?:her|him|them) alone|i've got (?:her|his|their) back|don't talk to .* like that)\b/,
    ],
    [
      "comforted",
      /\b(?:i(?:'m| am) here|got your back|you(?:'re| are) not alone|come here)\b/,
    ],
    [
      "confided",
      /\b(?:between us|i haven't told anyone|can i tell you something|i trust you with)\b/,
    ],
    [
      "insulted",
      /\b(?:idiot|pathetic|useless|shut up|can't stand you|cannot stand you)\b/,
    ],
    [
      "challenged",
      /\b(?:prove it|say that again|you wouldn't|i dare you|answer the question)\b/,
    ],
    [
      "ignored",
      /\b(?:you(?:'re| are) ignoring|didn't even listen|did not even listen)\b/,
    ],
    [
      "disagreed",
      /\b(?:i disagree|not true|you(?:'re| are) wrong|that's wrong|that is wrong)\b/,
    ],
    ["supported", /\b(?:i support|i'm with you|i am with you|back you up)\b/],
    [
      "agreed",
      /\b(?:i agree|exactly|you(?:'re| are) right|that's right|that is right)\b/,
    ],
    [
      "flirted",
      /\b(?:flirting|you look gorgeous|you look handsome|come closer|kiss me)\b/,
    ],
    ["teased", /\b(?:just teasing|kidding|dramatic|impossible)\b/],
  ];
  return patterns.find(([, pattern]) => pattern.test(lower))?.[0] ?? null;
}
