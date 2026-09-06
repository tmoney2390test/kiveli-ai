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
  // A mention or selected speaker is not evidence that this person was harmed.
  // Match the grammatical target of an explicit outcome in a single clause.
  const clauses = input.message.normalize("NFKC")
    .replace(/[“"][^“”"]*[”"]/gu, " ")
    .match(/[^.!?;\n]+[.!?;]?/gu) ?? [];
  const transitions: CharacterLifeTransition[] = [];
  const observedOutcomes = new Map<string, Set<CharacterVitalStatus>>();
  for (const raw of clauses) {
    if (raw.trim().endsWith("?")) continue;
    const clause = normalizeText(raw);
    if (!clause || nonCanonicalClaim(clause)) continue;
    for (const target of input.participants) {
      const current = normalizeCharacterLifeState(target.lifeState);
      const directed = input.directedCharacterInstanceIds ?? [];
      const pronounsAllowed = input.participants.length === 1 ||
        (directed.length === 1 && directed[0] === target.characterInstanceId);
      const names = participantAliases(target.name).filter((alias) =>
        input.participants.filter((person) => participantAliases(person.name).includes(alias)).length === 1
      ).map(escapePattern).sort((a, b) => b.length - a.length);
      const subject = [...names, ...(pronounsAllowed ? ["you"] : []), ...(directed.length === 1 && directed[0] === target.characterInstanceId ? ["he", "she", "they"] : [])].join("|");
      const object = [...names, ...(pronounsAllowed ? ["you"] : []), ...(directed.length === 1 && directed[0] === target.characterInstanceId ? ["him", "her", "them"] : [])].join("|");
      if (!subject || !object) continue;
      const targetSubject = `(?:${subject})`;
      const targetObject = `(?:${object})(?!\\s+(?:a|an|the|my|your|his|her|their)\\b)`;
      const completedDeath = new RegExp(`\\b${targetSubject}\\s+(?:(?:is|are|lies|lie|was|were)\\s+(?:now\\s+)?dead(?!\\s+(?:tired|wrong|serious|set|certain|last|right|center|centre|inside|to))|(?:has|have)\\s+died|dies|died)\\b`, "iu").test(clause);
      const fatalAction = new RegExp(`\\b(?:(?:i|we)\\s+(?:kill|slay|execute|behead|decapitate)|killed|slew|executed|beheaded|decapitated)\\s+${targetObject}(?:$|\\s+(?:now|here|with|using|by|and|in|at|on|during|before|after)\\b)`, "iu").test(clause);
      const passiveDeath = new RegExp(`\\b${targetSubject}\\s+(?:is|are|was|were|has been|have been)\\s+(?:killed|slain|executed|beheaded|decapitated)\\b`, "iu").test(clause);
      const restored = new RegExp(`\\b(?:resurrect|resurrected|revive|revived|restore|restored)\\s+${targetObject}\\b|\\b${targetSubject}\\s+(?:is|was|has been)\\s+(?:resurrected|revived|restored to life)\\b|\\bbring\\s+${targetObject}\\s+back to life\\b`, "iu").test(clause);
      const supernatural = new RegExp(`\\b${targetSubject}\\s+(?:rises?|returns?|appears?)\\s+as\\s+(?:a |an )?(?:ghost|spirit|specter|spectre|undead|wraith|revenant|vampire)\\b`, "iu").test(clause);
      const explicitlyAlive = new RegExp(`\\b${targetSubject}\\s+(?:is|are|was|were)\\s+(?:still |now )?alive\\b`, "iu").test(clause);
      const observed = observedOutcomes.get(target.characterInstanceId) ?? new Set<CharacterVitalStatus>();
      if (completedDeath || fatalAction || passiveDeath) observed.add('dead');
      if (restored || explicitlyAlive) observed.add('alive');
      if (supernatural) observed.add('undead');
      observedOutcomes.set(target.characterInstanceId, observed);
      // Injury, a neck strike, or strangling is not independently proof of death.
      if (current === "alive" && (completedDeath || fatalAction || passiveDeath)) {
        transitions.push({ characterInstanceId: target.characterInstanceId, name: target.name,
          from: current, to: "dead", kind: "death",
          summary: `${target.name} was killed during this continuity.`, confidence: .97 });
        continue;
      }
      if (current !== "dead") continue;
      if (restored || supernatural) transitions.push({ characterInstanceId: target.characterInstanceId,
        name: target.name, from: current, to: supernatural ? "undead" : "alive",
        kind: supernatural ? "supernatural_return" : "resurrection",
        summary: supernatural ? `${target.name} returned through an explicit supernatural event.` : `${target.name} was explicitly restored to life.`,
        confidence: .98 });
    }
  }
  // Contradictory or multiple outcomes need story resolution, never a guessed target.
  const unique = [...new Map(transitions.map((item) => [`${item.characterInstanceId}:${item.to}`, item])).values()];
  return unique.length === 1 && ![...observedOutcomes.values()].some((outcomes) => outcomes.size > 1) ? unique[0]! : null;
}

function nonCanonicalClaim(clause: string): boolean {
  return /\b(?:not|never|no|don't|didn't|won't|wouldn't|can't|cannot|isn't|aren't|wasn't|weren't|hasn't|haven't|if|unless|whether|will|would|could|might|may|should|must|can|almost|nearly|try|tries|tried|trying|attempt|attempts|attempted|attempting|want|wanted|wish|hope|plan|planned|pretend|pretended|imagine|imagined|dream|dreamed|dreamt|joke|joking|kidding|metaphor|figuratively|remember|recall|yesterday|previously|earlier|said|says|told|claims|claimed|rumor|rumour|book|movie|film|game|chess|checkers|poker)\b|\b(?:going to|need to|used to|with kindness|years ago|days ago|hours ago|last night|last week|last time)\b/iu.test(clause);
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function participantAliases(name: string): string[] {
  const normalized = normalizeText(name);
  const words = normalized.split(" ").filter((word) => word.length >= 2 && !["the","of"].includes(word));
  const pairs=words.slice(0,-1).map((word,index)=>`${word} ${words[index+1]}`);
  return [...new Set([normalized, ...pairs, ...words])].filter(Boolean);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}'*]+/gu, " ").replace(/\s+/g, " ").trim();
}
