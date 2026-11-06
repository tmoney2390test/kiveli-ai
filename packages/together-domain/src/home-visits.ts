/** Home access is a social decision, not a new progression or currency system. */
export type HomeVisitEvidence = {
  affinity: number;
  familiarity: number;
  stage: string;
  seriousConflict: boolean;
  rememberedWelcome: boolean;
  rememberedBoundary: boolean;
  invited: boolean;
  destination: "their_home" | "my_home";
};
export type HomeVisitDecision = {
  allowed: boolean;
  reason:
    | "welcome"
    | "invited"
    | "memory"
    | "unfamiliar"
    | "conflict"
    | "boundary";
  reply: string;
};
export function homeVisitDecision(input: HomeVisitEvidence): HomeVisitDecision {
  if (input.seriousConflict) {
    return {
      allowed: false,
      reason: "conflict",
      reply:
        "I’m still upset about what happened. Let’s talk before we make plans at home.",
    };
  }
  if (input.rememberedBoundary) {
    return {
      allowed: false,
      reason: "boundary",
      reply: "I’d rather meet somewhere else for now.",
    };
  }
  if (input.invited) {
    return { allowed: true, reason: "invited", reply: "Yes, come over." };
  }
  if (input.rememberedWelcome) {
    return {
      allowed: true,
      reason: "memory",
      reply: "Of course. We can spend some time at home.",
    };
  }
  if (
    input.affinity >= 100 ||
    [
      "acquaintance",
      "friend",
      "flirting",
      "dating",
      "exclusive",
      "long_term",
      "partner",
      "close_friend",
      "romantic",
    ].includes(input.stage) || input.familiarity >= 8 || input.affinity >= 20
  ) {
    return {
      allowed: true,
      reason: "welcome",
      reply: input.destination === "my_home"
        ? "I’d like that. I can come over to yours."
        : "Sure, you’re welcome to come over.",
    };
  }
  return {
    allowed: false,
    reason: "unfamiliar",
    reply: input.destination === "my_home"
      ? "I’d like to get to know you a little first. How about meeting somewhere nearby?"
      : "Let’s spend a little time together before we hang out at my place.",
  };
}
export const homeActivityKey = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
/** A narrow offline fallback for clear saved home rules, not words in a new request. */
export function homeMemoryEvidence(
  memories: Array<
    { canonical_text?: string; metadata?: Record<string, unknown> }
  >,
): { rememberedWelcome: boolean; rememberedBoundary: boolean } {
  let rememberedWelcome = false, rememberedBoundary = false;
  for (const memory of memories) {
    const text = String(memory.canonical_text ?? "").replace(/[’‘]/g, "'");
    const boundary = memory.metadata?.homeVisitPermission === "denied" ||
      /\b(?:not (?:always )?welcome|not allowed|do not (?:come|visit)|don't (?:come|visit)|does not want (?:me|the user)|doesn't want (?:me|the user))\b.{0,80}\b(?:home|house|apartment|place)\b/i
        .test(text) ||
      /\b(?:home|house|apartment)\b.{0,50}\b(?:off limits|private for now)\b/i
        .test(text);
    if (boundary) rememberedBoundary = true;
    else if (
      memory.metadata?.homeVisitPermission === "welcome" || (
        !/\b(?:not|never|don't|doesn't|no longer|used to|want to|wish|hope|if|might|maybe)\b/i
          .test(text) && (
            /\b(?:always welcome|welcome (?:at|in)|come over (?:anytime|whenever)|has (?:a |the )?key to)\b.{0,70}\b(?:home|house|apartment|flat|your place|her place|his place|their place)\b/i
              .test(text) ||
            /\b(?:we|the user and \w+|\w+ and the user) (?:live together|are roommates|share (?:a|the|our) home)\b/i
              .test(text)
          )
      )
    ) rememberedWelcome = true;
  }
  return { rememberedWelcome, rememberedBoundary };
}
export function homeInvitationEligible(
  input: {
    activeTurn: boolean;
    atOwnHome: boolean;
    sleeping: boolean;
    available: boolean;
    allowed: boolean;
    hasPlan: boolean;
    hasPendingAction: boolean;
    now: Date;
    history: Array<{ created_at: string; activity_key: string }>;
    activityKey: string;
    cooldownDays?: number;
    scenarioCooldownDays?: number;
  },
): boolean {
  if (
    !input.activeTurn || !input.atOwnHome || input.sleeping ||
    !input.available || !input.allowed || input.hasPlan ||
    input.hasPendingAction
  ) return false;
  const cooldown = Math.max(7, input.cooldownDays ?? 7) * 86400000;
  const scenarioCooldown = Math.max(30, input.scenarioCooldownDays ?? 30) *
    86400000;
  return !input.history.some((item) => {
    const elapsed = input.now.getTime() - Date.parse(item.created_at);
    return elapsed < cooldown ||
      (item.activity_key === input.activityKey && elapsed < scenarioCooldown);
  });
}

export type HomeNewsContext = {
  id: string;
  worldId: string;
  occurredAt: string;
  endsAt?: string;
  status?: string;
};
/** Existing resident-world news can motivate company; never infer an ongoing
 * emergency, user attendance, or a new world event from the invitation. */
export function recentHomeNews(
  events: HomeNewsContext[],
  worldId: string,
  now: Date,
): HomeNewsContext | undefined {
  return events.find((event) =>
    event.worldId === worldId &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    Date.parse(event.occurredAt) <= +now &&
    +now - Date.parse(event.occurredAt) <= 86400000 &&
    !["cancelled", "completed"].includes(event.status ?? "") &&
    (!event.endsAt || Date.parse(event.endsAt) > +now)
  );
}
