import { describe, expect, it } from "vitest";
import {
  boundedGroupSocialDelta,
  classifyGroupSocialEvent,
  commonGroupWorldId,
  defaultGroupTitle,
  formatAttributedGroupTranscript,
  groupFloorDebt,
  groupMemoryRecipientIds,
  type GroupSpeakerCandidate,
  planGroupContinuation,
  planGroupTurn,
  shouldGroupChatMessages,
  speakerContextIsolationViolations,
} from "../src/group-chat.ts";

const candidates: GroupSpeakerCandidate[] = [
  {
    characterInstanceId: "mara",
    name: "Mara Vale",
    available: true,
    directness: .9,
    socialEnergy: .8,
    knowledgeRelevance: .5,
    relationshipRelevance: .7,
    recentSpeakerCount: 3,
    consecutiveSpeakerCount: 2,
  },
  {
    characterInstanceId: "priya",
    name: "Priya Sen",
    available: true,
    directness: .6,
    socialEnergy: .6,
    knowledgeRelevance: .7,
    relationshipRelevance: .7,
    recentSpeakerCount: 0,
  },
  {
    characterInstanceId: "evelyn",
    name: "Evelyn Hart",
    available: true,
    directness: .4,
    socialEnergy: .4,
    knowledgeRelevance: .4,
    relationshipRelevance: .4,
    recentSpeakerCount: 1,
  },
];

describe("group director", () => {
  it("routes a direct name and persisted mention to the correct speaker", () => {
    expect(
      planGroupTurn({ message: "Priya, what do you think?", candidates })
        .actions[0]?.characterInstanceId,
    ).toBe("priya");
    expect(
      planGroupTurn({
        message: "answer me",
        candidates,
        mentionedCharacterInstanceIds: ["evelyn"],
      }).actions[0]?.characterInstanceId,
    ).toBe("evelyn");
  });
  it("gives manual and reply targets deterministic precedence", () => {
    expect(
      planGroupTurn({
        message: "Why?",
        candidates,
        replyToCharacterInstanceId: "mara",
      }).actions[0]?.characterInstanceId,
    ).toBe("mara");
    expect(
      planGroupTurn({
        message: "Anyone?",
        candidates,
        manualSpeakerInstanceId: "evelyn",
      }).actions[0]?.characterInstanceId,
    ).toBe("evelyn");
  });
  it("opens a bounded second floor action for an explicit character-to-character handoff", () => {
    const plan = planGroupTurn({
      message: "Mara, tell Priya what you told me.",
      candidates,
    });
    expect(plan.actions.map((action) => action.characterInstanceId)).toEqual([
      "mara",
      "priya",
    ]);
    expect(plan.actions[1]).toMatchObject({ intent: "respond_to_character" });
    expect(plan.continuationBudget).toBe(1);
  });
  it("bounds a group-wide answer and permits silence when nobody is available", () => {
    expect(
      planGroupTurn({
        message: "What does everyone want?",
        candidates,
        energy: "balanced",
      }).actions,
    ).toHaveLength(2);
    expect(
      planGroupTurn({
        message: "hello?",
        candidates: candidates.map((item) => ({ ...item, available: false })),
      }).actions,
    ).toHaveLength(0);
  });
  it("penalizes a dominant recent speaker without round robin forcing", () => {
    expect(groupFloorDebt(candidates[0]!)).toBeGreaterThan(
      groupFloorDebt(candidates[1]!),
    );
    expect(
      planGroupTurn({ message: "You guys are impossible.", candidates })
        .actions[0]?.characterInstanceId,
    ).not.toBe("mara");
  });
  it("re-evaluates only one continuation at a time and never repeats the current speaker", () => {
    const initial = planGroupTurn({
      message: "What does everyone want?",
      candidates,
      energy: "balanced",
    });
    const next = planGroupContinuation({
      originatingMessage: "What does everyone want?",
      latestMessage: "Food.",
      latestSpeakerCharacterInstanceId: initial.actions[0]!.characterInstanceId,
      candidates,
      alreadySpokeCharacterInstanceIds: [
        initial.actions[0]!.characterInstanceId,
      ],
      preferredActions: initial.actions.slice(1),
      continuationIndex: 1,
    });
    expect(next?.characterInstanceId).not.toBe(
      initial.actions[0]!.characterInstanceId,
    );
    expect(next?.reasonCodes).toContain("floor_re_evaluated");
  });
  it("uses a lightweight attributed reaction when another full message would be redundant", () => {
    const initial = planGroupTurn({
      message: "Mara, you are always dramatic.",
      candidates,
      energy: "balanced",
    });
    const reaction = initial.actions.find((action) =>
      action.type === "reaction"
    );
    expect(reaction).toMatchObject({ type: "reaction", reaction: "👀" });
    const next = planGroupContinuation({
      originatingMessage: "Mara, you are always dramatic.",
      latestMessage: "I prefer memorable.",
      latestSpeakerCharacterInstanceId: "mara",
      candidates,
      alreadySpokeCharacterInstanceIds: ["mara"],
      preferredActions: initial.actions.filter((action) =>
        action.type === "reaction"
      ),
      continuationIndex: 1,
    });
    expect(next).toMatchObject({
      type: "reaction",
      characterInstanceId: reaction?.characterInstanceId,
      addresseeInstanceIds: ["mara"],
    });
  });
  it("gives let-them-talk a bounded multi-message exchange even with two companions", () => {
    const two = candidates.slice(0, 2),
      initial = planGroupTurn({
        message: "Talk this through.",
        candidates: two,
        letThemTalk: true,
      });
    expect(initial.continuationBudget).toBeGreaterThanOrEqual(2);
    expect(initial.continuationBudget).toBeLessThanOrEqual(5);
    expect(
      planGroupContinuation({
        originatingMessage: "Talk this through.",
        latestMessage: "Fine.",
        latestSpeakerCharacterInstanceId: two[0]!.characterInstanceId,
        candidates: two,
        alreadySpokeCharacterInstanceIds: [two[0]!.characterInstanceId],
        letThemTalk: true,
        continuationIndex: 1,
      })?.characterInstanceId,
    ).toBe(two[1]!.characterInstanceId);
  });
});

describe("group identity helpers", () => {
  it("preserves speaker attribution in prompt history", () =>
    expect(
      formatAttributedGroupTranscript([{ role: "user", content: "No." }, {
        role: "assistant",
        content: "Why?",
        speakerName: "Mara",
        speakerCharacterInstanceId: "mara",
      }]),
    ).toContain("Mara [mara]:"));
  it("never visually groups adjacent assistant messages from different speakers", () => {
    const at = "2026-08-22T12:00:00Z";
    expect(
      shouldGroupChatMessages({
        role: "assistant",
        created_at: at,
        speaker_character_instance_id: "mara",
      }, {
        role: "assistant",
        created_at: at,
        speaker_character_instance_id: "priya",
      }),
    ).toBe(false);
    expect(
      shouldGroupChatMessages({
        role: "assistant",
        created_at: at,
        speaker_character_instance_id: "mara",
      }, {
        role: "assistant",
        created_at: at,
        speaker_character_instance_id: "mara",
      }),
    ).toBe(true);
  });
  it("creates readable default titles and bounded social changes", () => {
    expect(defaultGroupTitle(["Mara Vale", "Priya Sen", "Evelyn Hart"])).toBe(
      "Mara, Priya & Evelyn",
    );
    expect(boundedGroupSocialDelta("insulted", 1, 1)).toEqual({
      affinity: -3,
      familiarity: 1,
      tension: 4,
    });
  });
  it("requires every group participant to share one canonical resident world", () => {
    expect(commonGroupWorldId(["juniper", "juniper", "juniper"])).toBe(
      "juniper",
    );
    expect(commonGroupWorldId(["juniper", "vervelle"])).toBeNull();
    expect(commonGroupWorldId(["juniper", null])).toBeNull();
    expect(commonGroupWorldId([])).toBeNull();
  });
  it("classifies meaningful social events while leaving ordinary dialogue neutral", () => {
    expect(classifyGroupSocialEvent("I'm sorry, Priya. My fault.")).toBe(
      "apologized",
    );
    expect(classifyGroupSocialEvent("Leave her alone, Mara.")).toBe("defended");
    expect(classifyGroupSocialEvent("The weather changed.")).toBeNull();
  });
  it("does not give late joiners old facts or removed participants future facts", () => {
    const participants = [
      { characterInstanceId: "early", witnessedFromSequence: 1 },
      { characterInstanceId: "late", witnessedFromSequence: 50 },
      {
        characterInstanceId: "left",
        witnessedFromSequence: 1,
        witnessedToSequence: 60,
      },
    ];
    expect(groupMemoryRecipientIds(participants, 40)).toEqual([
      "early",
      "left",
    ]);
    expect(groupMemoryRecipientIds(participants, 70)).toEqual([
      "early",
      "late",
    ]);
  });
  it("accepts only relationship, reflection, voice, persona directive, and private memories owned by the selected speaker", () => {
    expect(speakerContextIsolationViolations({
      relationship: { character_instance_id: "b" },
      relationshipReflection: { character_instance_id: "b" },
      sceneSpeakerDirective: { characterInstanceId: "b" },
      characterVoiceOwnerId: "b",
      speakerPrivateContextOwnerId: "b",
      memories: [{ characterInstanceId: "b" }],
    }, "b")).toEqual([]);
    expect(speakerContextIsolationViolations({
      relationship: { character_instance_id: "a" },
      relationshipReflection: { character_instance_id: "a" },
      sceneSpeakerDirective: { characterInstanceId: "a" },
      characterVoiceOwnerId: "a",
      speakerPrivateContextOwnerId: "a",
      memories: [{ character_instance_id: "a" }],
    }, "b")).toEqual([
      "relationship",
      "relationship_reflection",
      "speaker_directive",
      "voice",
      "private_context",
      "memory",
    ]);
  });
});
