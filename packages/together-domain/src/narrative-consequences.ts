export const narrativeConsequenceDomains = [
  "military",
  "political",
  "legal",
  "economic",
  "factional",
  "public_safety",
  "other",
] as const;

export const narrativeConsequenceScopes = ["local", "regional", "world"] as const;

export type NarrativeConsequenceDomain = typeof narrativeConsequenceDomains[number];
export type NarrativeConsequenceScope = typeof narrativeConsequenceScopes[number];
export type NarrativeKnowledgeScope = "public" | "local" | "insider" | "private";

export type NarrativeConsequenceCandidate = {
  title: string;
  summary: string;
  domain: NarrativeConsequenceDomain;
  scope: NarrativeConsequenceScope;
  knowledgeScope: NarrativeKnowledgeScope;
  durationHours: number;
  confidence: number;
  authorityBasis: string;
  persuasionBasis: string;
  consequences: string[];
};

export type NarrativeConsequenceGate = {
  relevant: boolean;
  eligible: boolean;
  domain: NarrativeConsequenceDomain | null;
  scope: NarrativeConsequenceScope | null;
  authorityMatched: boolean;
  relationshipReady: boolean;
  relationshipScore: number;
  requiredRelationshipScore: number;
  reasonCodes: string[];
};

type NarrativeCharacter = Record<string, unknown>;
type NarrativeRelationship = Record<string, unknown>;

const domainPatterns: Array<[NarrativeConsequenceDomain, RegExp]> = [
  ["military", /\b(?:war|invad(?:e|es|ed|ing)|march|mobiliz(?:e|es|ed|ing)|army|armies|troops?|legions?|battalions?|fleet|siege|attack|retreat|reinforcements?|declare war|send soldiers?|raise the banners?)\b/i],
  ["political", /\b(?:abdicate|coup|throne|crown|succession|alliance|treaty|diplomatic|recognize a ruler|appoint|dismiss the council|dissolve parliament|declare independence|peace summit)\b/i],
  ["legal", /\b(?:decree|law|outlaw|legaliz(?:e|es|ed|ing)|abolish|pardon|amnesty|ban|free the prisoners?|free the slaves?|sentence|commute|royal order)\b/i],
  ["economic", /\b(?:embargo|sanction|treasury|tax|tariff|seize assets?|nationaliz(?:e|es|ed|ing)|trade blockade|cancel the debt|forgive the debt)\b/i],
  ["public_safety", /\b(?:evacuate|quarantine|curfew|close the border|open the gates|state of emergency|disaster response)\b/i],
  ["factional", /\b(?:uprising|rebellion|revolt|mutiny|overthrow|faction|guild strike|break the alliance|join the resistance)\b/i],
];

const authorityPatterns: Record<NarrativeConsequenceDomain, RegExp> = {
  military: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|warlord|marshal|general|commander|admiral|war chief|crown prince|crown princess)\b/i,
  political: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|chancellor|governor|duke|duchess|prime minister|president|crown prince|crown princess)\b/i,
  legal: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|governor|magistrate|judge|chancellor|minister of justice)\b/i,
  economic: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|treasurer|finance minister|governor|guildmaster|guild master|merchant prince|merchant princess)\b/i,
  factional: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|leader|chief|commander|captain|guildmaster|guild master|rebel commander|spymaster)\b/i,
  public_safety: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|governor|mayor|commander|sheriff|chief|director|warden)\b/i,
  other: /\b(?:queen|king|empress|emperor|sovereign|regent|ruler|governor|leader|chief|commander|director)\b/i,
};

export function classifyHighStakesStoryRequest(text: string): {
  relevant: boolean;
  domain: NarrativeConsequenceDomain | null;
  scope: NarrativeConsequenceScope | null;
} {
  const normalized = text.trim();
  if (!normalized) return { relevant: false, domain: null, scope: null };
  const domain = domainPatterns.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
  if (!domain) return { relevant: false, domain: null, scope: null };
  const scope: NarrativeConsequenceScope = /\b(?:world|realm|kingdom|nation|empire|war|army|armies|fleet|throne|crown|all borders?)\b/i.test(normalized)
    ? "world"
    : /\b(?:region|province|district|city|faction|guild|house|alliance|border)\b/i.test(normalized)
    ? "regional"
    : "local";
  return { relevant: true, domain, scope };
}

export function narrativeConsequenceRequestWindow(input: {
  userMessage: string;
  recent?: ReadonlyArray<{ role?: string; content?: string }>;
}): string {
  const current = input.userMessage.trim();
  if (classifyHighStakesStoryRequest(current).relevant) return current;
  if (!/^(?:yes|do it|give the order|go ahead|then do it|i agree|make it happen|now)$/i.test(current)) return current;
  return [...(input.recent ?? []).slice(-6).map((turn) => String(turn.content ?? "")), current]
    .filter(Boolean)
    .join("\n");
}

export function evaluateNarrativeConsequenceGate(input: {
  requestText: string;
  character: NarrativeCharacter;
  relationship: NarrativeRelationship;
  hasWorld: boolean;
  activeStory?: boolean;
  requestedDomain?: NarrativeConsequenceDomain;
  requestedScope?: NarrativeConsequenceScope;
}): NarrativeConsequenceGate {
  const detected = classifyHighStakesStoryRequest(input.requestText);
  const domain = input.requestedDomain ?? detected.domain;
  const scope = input.requestedScope ?? detected.scope;
  const domainMatched = !input.requestedDomain || input.requestedDomain === detected.domain;
  const scopeMatched = !input.requestedScope || !detected.scope || scopeRank(input.requestedScope) <= scopeRank(detected.scope);
  const relevant = detected.relevant && Boolean(domain && scope) && domainMatched && scopeMatched;
  const authorityMatched = domain ? inferCharacterAuthority(input.character, domain) : false;
  const trust = boundedMetric(input.relationship["trust"]);
  const respect = boundedMetric(input.relationship["respect"]);
  const relationshipScore = Math.round(trust * 0.65 + respect * 0.35);
  const baseRequired = scope === "world" ? 45 : scope === "regional" ? 35 : 25;
  const requiredRelationshipScore = Math.max(20, baseRequired - (input.activeStory ? 5 : 0));
  const relationshipReady = relationshipScore >= requiredRelationshipScore;
  const reasonCodes = [
    relevant ? "high_stakes_request" : "no_high_stakes_request",
    domainMatched ? "domain_matches_request" : "domain_escalation_blocked",
    scopeMatched ? "scope_matches_request" : "scope_escalation_blocked",
    input.hasWorld ? "fictional_world_resolved" : "world_unresolved",
    authorityMatched ? "character_has_authority" : "character_lacks_authority",
    relationshipReady ? "relationship_supports_influence" : "influence_not_earned",
    ...(input.activeStory ? ["active_story_support"] : []),
  ];
  return {
    relevant,
    eligible: relevant && input.hasWorld && authorityMatched && relationshipReady,
    domain,
    scope,
    authorityMatched,
    relationshipReady,
    relationshipScore,
    requiredRelationshipScore,
    reasonCodes,
  };
}

export function assistantMadeConsequentialDecision(text: string): boolean {
  return consequentialDecisionSentence(text) !== null;
}

export function consequentialDecisionSentence(text: string): string | null {
  const commitment = /\b(?:i (?:will|shall|am going to|order|decree|command|authorize|sign|proclaim|give|send|raise|march|mobilize)|my order (?:is|stands)|it is decided|the order is given|we (?:will|shall|march|mobilize|invade|withdraw|sign|abolish|pardon|evacuate))\b/i;
  const unresolved = /\b(?:might|maybe|perhaps|consider|think about|ask the council|need proof|if you|only if|not yet|cannot decide|won't|will not|refuse)\b/i;
  const sentences = text
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences
    .filter((sentence) => commitment.test(sentence) && !unresolved.test(sentence) && !sentence.endsWith("?"))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

export function deriveNarrativeConsequenceCandidate(input: {
  requestText: string;
  assistantText: string;
  character: NarrativeCharacter;
  relationship: NarrativeRelationship;
  hasWorld: boolean;
  activeStory?: boolean;
}): NarrativeConsequenceCandidate | null {
  const gate = evaluateNarrativeConsequenceGate(input);
  const decision = consequentialDecisionSentence(input.assistantText);
  if (!gate.eligible || !gate.domain || !gate.scope || !decision) return null;
  const characterName = safeCharacterName(input.character["name"]);
  const decisionSummary = thirdPersonDecision(decision, characterName);
  const label = consequenceLabels[gate.domain];
  return {
    title: `${characterName}: ${label.title}`,
    summary: `${characterName} made a final ${label.summary} decision. ${decisionSummary}`.slice(0, 700),
    domain: gate.domain,
    scope: gate.scope,
    knowledgeScope: gate.scope === "world" ? "public" : gate.scope === "regional" ? "local" : "insider",
    durationHours: gate.scope === "world" ? 240 : gate.scope === "regional" ? 168 : 72,
    confidence: 0.9,
    authorityBasis: `${characterName}'s established role carries ${label.summary} authority.`,
    persuasionBasis: "The final decision followed the argument and established relationship in this conversation.",
    consequences: ["The immediate consequences remain unresolved and must unfold through later world events."],
  };
}

export function validateNarrativeConsequenceCandidate(input: {
  candidate: NarrativeConsequenceCandidate;
  requestText: string;
  assistantText: string;
  character: NarrativeCharacter;
  relationship: NarrativeRelationship;
  hasWorld: boolean;
  activeStory?: boolean;
}): { allowed: boolean; gate: NarrativeConsequenceGate; reasonCodes: string[] } {
  const gate = evaluateNarrativeConsequenceGate({
    requestText: input.requestText,
    character: input.character,
    relationship: input.relationship,
    hasWorld: input.hasWorld,
    activeStory: input.activeStory === true,
    requestedDomain: input.candidate.domain,
    requestedScope: input.candidate.scope,
  });
  const decisionExplicit = assistantMadeConsequentialDecision(input.assistantText);
  const confidenceEnough = input.candidate.confidence >= 0.86;
  const userActionFree = !/\b(?:the user|you)\b/i.test(input.candidate.summary);
  const wellFormed = input.candidate.title.trim().length >= 3 && input.candidate.summary.trim().length >= 16 && userActionFree;
  const reasonCodes = [
    ...gate.reasonCodes,
    decisionExplicit ? "decision_explicit" : "decision_not_final",
    confidenceEnough ? "confidence_sufficient" : "confidence_insufficient",
    wellFormed ? "candidate_well_formed" : "candidate_malformed",
  ];
  return { allowed: gate.eligible && decisionExplicit && confidenceEnough && wellFormed, gate, reasonCodes };
}

function inferCharacterAuthority(character: NarrativeCharacter, domain: NarrativeConsequenceDomain): boolean {
  const direct = [character["occupation"], character["title"], character["role"], character["rank"], character["biography"]]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const authored = authorityFields(character["character_bible"]).join(" ");
  return authorityPatterns[domain].test(`${direct} ${authored}`);
}

function authorityFields(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== "object" || depth > 3 || Array.isArray(value)) return [];
  const result: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:title|role|rank|office|position|authority|command|status|faction|house)$/i.test(key)) {
      if (typeof child === "string") result.push(child);
      else if (Array.isArray(child)) result.push(...child.filter((item): item is string => typeof item === "string"));
    }
    if (child && typeof child === "object" && !Array.isArray(child)) result.push(...authorityFields(child, depth + 1));
  }
  return result;
}

function boundedMetric(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

function scopeRank(scope: NarrativeConsequenceScope): number {
  return scope === "world" ? 3 : scope === "regional" ? 2 : 1;
}

const consequenceLabels: Record<NarrativeConsequenceDomain, { title: string; summary: string }> = {
  military: { title: "Military order issued", summary: "military" },
  political: { title: "Political decision made", summary: "political" },
  legal: { title: "Decree issued", summary: "legal" },
  economic: { title: "Economic order issued", summary: "economic" },
  factional: { title: "Faction changes course", summary: "factional" },
  public_safety: { title: "Emergency order issued", summary: "public-safety" },
  other: { title: "World-changing decision made", summary: "high-stakes" },
};

function safeCharacterName(value: unknown): string {
  const name = (typeof value === "string" ? value : "The companion").replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return name || "The companion";
}

function thirdPersonDecision(value: string, characterName: string): string {
  const withoutUserClause = value
    .replace(/\s+(?:and|while|because|if|provided|as long as)\s+you\b.*$/i, "")
    .replace(/[<>\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutUserClause
    .replace(/^I am going to\b/i, `${characterName} will`)
    .replace(/^I (?:will|shall)\b/i, `${characterName} will`)
    .replace(/^I order\b/i, `${characterName} orders`)
    .replace(/^I decree\b/i, `${characterName} decrees`)
    .replace(/^I command\b/i, `${characterName} commands`)
    .replace(/^I authorize\b/i, `${characterName} authorizes`)
    .replace(/^I sign\b/i, `${characterName} signs`)
    .replace(/^I proclaim\b/i, `${characterName} proclaims`)
    .replace(/^I give\b/i, `${characterName} gives`)
    .replace(/^I send\b/i, `${characterName} sends`)
    .replace(/^I raise\b/i, `${characterName} raises`)
    .replace(/^I march\b/i, `${characterName} marches`)
    .replace(/^I mobilize\b/i, `${characterName} mobilizes`)
    .replace(/^My order\b/i, `${characterName}'s order`)
    .replace(/^We (?:will|shall)\b/i, `${characterName}'s order commits their side to`)
    .replace(/^We march\b/i, `${characterName}'s forces march`)
    .replace(/^We mobilize\b/i, `${characterName}'s forces mobilize`)
    .replace(/^We invade\b/i, `${characterName}'s forces invade`)
    .replace(/^We withdraw\b/i, `${characterName}'s forces withdraw`)
    .replace(/^We sign\b/i, `${characterName}'s government signs`)
    .replace(/^We abolish\b/i, `${characterName}'s decree abolishes`)
    .replace(/^We pardon\b/i, `${characterName}'s decree pardons`)
    .replace(/^We evacuate\b/i, `${characterName}'s order evacuates`);
}
