export const characterLifeStates = ["alive", "dead", "undead"] as const;

export type CharacterVitalStatus = typeof characterLifeStates[number];

export type CharacterLifeParticipant = {
  characterInstanceId: string;
  name: string;
  lifeState?: unknown;
};

export type CharacterLifeTransition = {
  characterInstanceId: string;
  name: string;
  from: CharacterVitalStatus;
  to: CharacterVitalStatus;
  kind: "death" | "resurrection" | "supernatural_return";
  summary: string;
  confidence: number;
};

export function normalizeCharacterLifeState(value: unknown): CharacterVitalStatus {
  return value === "dead" || value === "undead" ? value : "alive";
}

export function characterCanSpeak(value: unknown): boolean {
  return normalizeCharacterLifeState(value) !== "dead";
}

/**
 * Resolves only explicit, completed fictional state changes. Threats, wishes,
 * hypotheticals, attempts, and ambiguous group pronouns deliberately fail
 * closed so a stray violent sentence cannot permanently alter a continuity.
 */
export function deriveCharacterLifeTransition(input: {
  message: string;
  participants: readonly CharacterLifeParticipant[];
  directedCharacterInstanceIds?: readonly string[];
}): CharacterLifeTransition | null {
  const message = normalizeText(input.message);
  if (!message || !input.participants.length) return null;

  const target = resolveTarget({
    message,
    participants: input.participants,
    directedCharacterInstanceIds: input.directedCharacterInstanceIds ?? [],
  });
  if (!target) return null;

  const current = normalizeCharacterLifeState(target.lifeState);
  const supernatural = supernaturalReturnKind(message);
  if (current === "dead" && supernatural) {
    const to: CharacterVitalStatus = supernatural === "supernatural_return"
      ? "undead"
      : "alive";
    return {
      characterInstanceId: target.characterInstanceId,
      name: target.name,
      from: current,
      to,
      kind: supernatural,
      summary: to === "undead"
        ? `${target.name} returned through an explicit supernatural event.`
        : `${target.name} was explicitly restored to life.`,
      confidence: .98,
    };
  }

  if (current === "dead" || current === "undead") return null;
  if (!completedFatalAction(message)) return null;
  return {
    characterInstanceId: target.characterInstanceId,
    name: target.name,
    from: current,
    to: "dead",
    kind: "death",
    summary: `${target.name} was killed during this continuity.`,
    confidence: .97,
  };
}

function completedFatalAction(message: string): boolean {
  if (nonCompletedAction(message)) return false;
  const directDeath = /\b(?:you|he|she|they|[\p{L}\p{N}'-]+)\s+(?:are|is|lies?|falls?)?\s*(?:now\s+)?dead\b/iu.test(message) ||
    /\b(?:you|he|she|they)\s+die(?:s|d)?\s+(?:now|here|tonight|today)\b/iu.test(message) ||
    /\b(?:killed|slew|slain|executed|beheaded|decapitated)\b/iu.test(message);
  const completedLethalVerb = /(?:^|[*.!;]\s*|\bi\s+|\bwe\s+)(?:kill|slay|execute|behead|decapitate|strangle|snap)\w*\b/iu.test(message);
  const lethalInjury = /\b(?:stab|slice|cut|shoot|strike|pierce)\w*\b[^.!?]{0,55}\b(?:neck|throat|heart|head|skull)\b/iu.test(message);
  return directDeath || completedLethalVerb || lethalInjury;
}

function nonCompletedAction(message: string): boolean {
  return /\b(?:will|would|could|might|may|want(?:ed)? to|plan(?:ned)? to|going to|try(?:ing|ied)? to|attempt(?:ing|ed)? to|threaten(?:ing|ed)? to)\s+(?:kill|slay|execute|behead|stab|shoot|strangle)\b/iu.test(message) ||
    /\b(?:do not|don't|did not|didn't|never|won't|wouldn't|can't|cannot)\s+(?:kill|slay|execute|behead|stab|shoot|strangle)\b/iu.test(message) ||
    /\b(?:if|unless|whether)\b[^.!?]{0,70}\b(?:die|dead|kill|slay|execute|behead|stab|shoot|strangle)\b/iu.test(message) ||
    /\b(?:almost|nearly)\s+(?:die|died|kill|killed|slay|slew|execute|executed)\b/iu.test(message);
}

function supernaturalReturnKind(
  message: string,
): "resurrection" | "supernatural_return" | null {
  if (/\b(?:try|attempt|wish|hope|want|might|could|if)\w*\b[^.!?]{0,45}\b(?:resurrect|revive|raise|return)\b/iu.test(message)) return null;
  if (/\b(?:resurrect|revive|restore)\w*\b|\bbring\w*\b[^.!?]{0,35}\bback to life\b|\braise\w*\b[^.!?]{0,35}\bfrom the dead\b/iu.test(message)) {
    return "resurrection";
  }
  if (/\b(?:return|rise|arise|appear|come back)\w*\b[^.!?]{0,45}\b(?:ghost|spirit|specter|spectre|undead|wraith|revenant|vampire)\b|\b(?:ghost|spirit|specter|spectre|undead|wraith|revenant|vampire)\b[^.!?]{0,45}\b(?:return|rise|arise|appear|come back)\w*\b/iu.test(message)) {
    return "supernatural_return";
  }
  return null;
}

function resolveTarget(input: {
  message: string;
  participants: readonly CharacterLifeParticipant[];
  directedCharacterInstanceIds: readonly string[];
}): CharacterLifeParticipant | null {
  const mentioned = input.participants.filter((participant) =>
    participantAliases(participant.name).some((alias) => containsPhrase(input.message, alias))
  );
  if (mentioned.length === 1) return mentioned[0]!;
  if (mentioned.length > 1) return null;

  const directed = input.participants.filter((participant) =>
    input.directedCharacterInstanceIds.includes(participant.characterInstanceId)
  );
  if (directed.length === 1) return directed[0]!;

  // A direct conversation has exactly one possible fictional target. In a
  // group, an unqualified pronoun is intentionally too ambiguous to persist.
  return input.participants.length === 1 ? input.participants[0]! : null;
}

function participantAliases(name: string): string[] {
  const normalized = normalizeText(name);
  const words = normalized.split(" ").filter((word) => word.length >= 4);
  return [...new Set([normalized, ...words])].filter(Boolean);
}

function containsPhrase(message: string, phrase: string): boolean {
  return ` ${message} `.includes(` ${phrase} `);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}'*]+/gu, " ").replace(/\s+/g, " ").trim();
}
