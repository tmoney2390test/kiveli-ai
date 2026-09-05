import { describe, expect, it } from "vitest";
import {
  assistantMadeConsequentialDecision,
  classifyHighStakesStoryRequest,
  deriveNarrativeConsequenceCandidate,
  evaluateNarrativeConsequenceGate,
  narrativeConsequenceRequestWindow,
  validateNarrativeConsequenceCandidate,
  type NarrativeConsequenceCandidate,
} from "./narrative-consequences";

const queen = { occupation: "Queen of the Cinder Crown", biography: "She commands the royal host." };
const companion = { occupation: "Court musician", biography: "She knows the palace well." };
const ready = { trust: 62, respect: 70 };
const candidate: NarrativeConsequenceCandidate = {
  title: "The Cinder Host Marches",
  summary: "Queen Maelin orders the Cinder Host to march north at first light.",
  domain: "military",
  scope: "world",
  knowledgeScope: "public",
  durationHours: 240,
  confidence: 0.94,
  authorityBasis: "She is the reigning queen and commander of the host.",
  persuasionBasis: "The user supplied evidence and earned her trust.",
  consequences: ["The northern border becomes an active front."],
};

describe("high-stakes narrative consequences", () => {
  it("recognizes a realm-scale military request", () => {
    expect(classifyHighStakesStoryRequest("March the army to war for the realm.")).toEqual({
      relevant: true,
      domain: "military",
      scope: "world",
    });
  });

  it("requires both actual authority and earned influence", () => {
    expect(evaluateNarrativeConsequenceGate({ requestText: "March the army to war.", character: queen, relationship: ready, hasWorld: true }).eligible).toBe(true);
    expect(evaluateNarrativeConsequenceGate({ requestText: "March the army to war.", character: companion, relationship: ready, hasWorld: true }).eligible).toBe(false);
    expect(evaluateNarrativeConsequenceGate({ requestText: "March the army to war.", character: queen, relationship: { trust: 12, respect: 18 }, hasWorld: true }).eligible).toBe(false);
  });

  it("distinguishes a final decision from deliberation or a condition", () => {
    expect(assistantMadeConsequentialDecision("I will give the order. We march at dawn.")).toBe(true);
    expect(assistantMadeConsequentialDecision("I agree with you.")).toBe(false);
    expect(assistantMadeConsequentialDecision("Then give the order.")).toBe(false);
    expect(assistantMadeConsequentialDecision("I might ask the council if you bring proof.")).toBe(false);
  });

  it("derives a conservative persistent event when secondary analysis is unavailable", () => {
    const derived = deriveNarrativeConsequenceCandidate({
      requestText: "March the army to war.",
      assistantText: "I have heard enough. I order the Cinder Host north at first light.",
      character: { ...queen, name: "Queen Maelin" },
      relationship: ready,
      hasWorld: true,
    });
    expect(derived).toMatchObject({ domain: "military", scope: "world", knowledgeScope: "public", confidence: 0.9 });
    expect(derived?.summary).toContain("Queen Maelin orders the Cinder Host north at first light.");
    expect(derived?.summary).not.toMatch(/\b(?:you|the user)\b/i);
  });

  it("carries the consequential request through a short confirmation", () => {
    const window = narrativeConsequenceRequestWindow({
      userMessage: "Do it",
      recent: [
        { role: "user", content: "Will you march the army north?" },
        { role: "assistant", content: "Bring me the sealed dispatch and I will decide." },
      ],
    });
    expect(classifyHighStakesStoryRequest(window)).toMatchObject({ relevant: true, domain: "military", scope: "world" });
  });

  it("recognizes authority authored in the character bible", () => {
    expect(evaluateNarrativeConsequenceGate({
      requestText: "Evacuate the city.",
      character: { occupation: "Scholar", character_bible: { office: "Regent of the river city" } },
      relationship: ready,
      hasWorld: true,
    }).eligible).toBe(true);
  });

  it("canonizes only a confident, explicit decision", () => {
    const accepted = validateNarrativeConsequenceCandidate({
      candidate,
      requestText: "March the army to war.",
      assistantText: "It is decided. I will order the host north at first light.",
      character: queen,
      relationship: ready,
      hasWorld: true,
    });
    expect(accepted.allowed).toBe(true);
    expect(validateNarrativeConsequenceCandidate({
      candidate,
      requestText: "March the army to war.",
      assistantText: "I will consider it after the council meets.",
      character: queen,
      relationship: ready,
      hasWorld: true,
    }).allowed).toBe(false);
    expect(validateNarrativeConsequenceCandidate({
      candidate: { ...candidate, domain: "political" },
      requestText: "March the army to war.",
      assistantText: "It is decided. I will order the host north at first light.",
      character: queen,
      relationship: ready,
      hasWorld: true,
    }).allowed).toBe(false);
    expect(validateNarrativeConsequenceCandidate({
      candidate: { ...candidate, summary: "You ordered the Cinder Host north." },
      requestText: "March the army to war.",
      assistantText: "It is decided. I will order the host north at first light.",
      character: queen,
      relationship: ready,
      hasWorld: true,
    }).allowed).toBe(false);
  });
});
