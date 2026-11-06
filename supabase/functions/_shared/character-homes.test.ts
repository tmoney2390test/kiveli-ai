import { beforeEach, describe, expect, it, vi } from "vitest";
import { homeTestDb } from "../../../scripts/fixtures/home-test-db";
vi.mock(
  "./together-continuity.ts",
  () => ({
    activeContinuity: vi.fn(async () => ({
      id: "life",
      persona_id: "persona",
    })),
    requireInstanceInActiveContinuity: vi.fn(async () => {}),
  }),
);
vi.mock(
  "./together-place.ts",
  () => ({ resolveWorldAccess: vi.fn(async () => "unlocked") }),
);
vi.mock(
  "./together-schedule.ts",
  () => ({ resolveCompanionPresence: vi.fn(async () => null) }),
);
vi.mock(
  "./kivelle-ai-consent.ts",
  () => ({
    loadAiDataConsent: vi.fn(async () => ({ allowsProviderCalls: false })),
  }),
);
vi.mock("./kivelle-director-request.ts", () => ({ directorRequest: vi.fn() }));
vi.mock(
  "./kivelle-ai-usage.ts",
  () => ({ recordAiUsage: vi.fn(async () => {}) }),
);
import { assertHomePlanWelcome, decideHomeVisit } from "./character-homes";
const now = new Date().toISOString();
let rows: Record<string, any[]>;
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  rows = {
    together_relationship_states: [{
      user_id: "user",
      character_instance_id: "host",
      continuity_id: "life",
      affinity: 100,
    }],
    together_memories: [],
    together_character_instances: [{
      id: "host",
      user_id: "user",
      character_version_id: "version",
      relationship_stage: "stranger",
      together_character_templates: { name: "Host" },
    }],
    together_profiles: [{ user_id: "user", memory_categories: {} }],
    together_conversations: [{
      id: "chat",
      kind: "direct",
      user_id: "user",
      continuity_id: "life",
      character_instance_id: "host",
      archived_at: null,
    }],
    together_messages: [{
      id: "message",
      user_id: "user",
      conversation_id: "chat",
      role: "user",
      content: "Coffee?",
      created_at: now,
    }],
    together_character_homes: [{
      id: "home",
      character_version_id: "version",
      visits_enabled: true,
      active: true,
    }],
    together_home_invitations: [],
  };
});
describe("server home permission and conversation isolation", () => {
  it("uses the latest owned chat when planning from a profile", async () => {
    const db = homeTestDb(rows);
    expect(
      (await decideHomeVisit(db, {
        userId: "user",
        characterInstanceId: "host",
        destination: "their_home",
      })).allowed,
    ).toBe(true);
    expect(db.calls.find((x) => x.table === "together_messages")?.filters)
      .toContainEqual(["eq", "conversation_id", "chat"]);
  });
  it("does not read a different companion’s private transcript", async () => {
    rows.together_conversations.unshift({
      id: "other-chat",
      kind: "direct",
      user_id: "user",
      continuity_id: "life",
      character_instance_id: "other",
      archived_at: null,
    });
    const db = homeTestDb(rows);
    await decideHomeVisit(db, {
      userId: "user",
      characterInstanceId: "host",
      destination: "their_home",
      conversationId: "other-chat",
    });
    expect(db.calls.find((x) => x.table === "together_messages")?.filters)
      .toContainEqual(["eq", "conversation_id", "chat"]);
  });
  it("uses the instance's canonical relationship stage rather than a nonexistent state column", async () => {
    rows.together_relationship_states[0].affinity = 0;
    rows.together_relationship_states[0].familiarity = 0;
    rows.together_character_instances[0].relationship_stage = "friend";
    const decision = await decideHomeVisit(homeTestDb(rows), {userId:"user",characterInstanceId:"host",destination:"their_home"});
    expect(decision).toMatchObject({allowed:true,reason:"welcome"});
  });
  it("refuses an unowned conversation", async () => {
    await expect(
      decideHomeVisit(homeTestDb(rows), {
        userId: "user",
        characterInstanceId: "host",
        destination: "their_home",
        conversationId: "foreign",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("shares a group transcript only with its active members and retains speaker IDs", async () => {
    rows.together_conversations.push({
      id: "group",
      kind: "group",
      user_id: "user",
      continuity_id: "life",
    });
    rows.together_conversation_participants = [{
      conversation_id: "group",
      character_instance_id: "host",
      user_id: "user",
      left_at: null,
    }];
    const db = homeTestDb(rows);
    await decideHomeVisit(db, {
      userId: "user",
      characterInstanceId: "host",
      destination: "their_home",
      conversationId: "group",
    });
    const call = db.calls.find((x) => x.table === "together_messages");
    expect(call?.filters).toContainEqual(["eq", "conversation_id", "group"]);
    expect(call?.columns).toContain("speaker_character_instance_id");
  });
  it("keeps a stranger’s clear saved home permission usable without an AI service", async () => {
    rows.together_relationship_states[0].affinity = 0;
    rows.together_memories = [{
      user_id: "user",
      character_instance_id: "host",
      status: "active",
      canonical_text: "The user is always welcome at her home.",
    }];
    expect(
      (await decideHomeVisit(homeTestDb(rows), {
        userId: "user",
        characterInstanceId: "host",
        destination: "their_home",
      })).reason,
    ).toBe("memory");
  });
  it("does not ignore current conflict at full affinity", async () => {
    rows.together_relationship_states[0].active_major_conflict = true;
    await expect(
      assertHomePlanWelcome(homeTestDb(rows), {
        userId: "user",
        location: {
          category: "home",
          owner_user_id: "user",
          character_home_id: "home",
        },
        participantIds: ["host"],
      }),
    ).rejects.toMatchObject({ code: "HOME_VISIT_DECLINED" });
  });
  it("requires the host in a group visit roster", async () => {
    await expect(
      assertHomePlanWelcome(homeTestDb(rows), {
        userId: "user",
        location: {
          category: "home",
          owner_user_id: "user",
          character_home_id: "home",
        },
        participantIds: ["someone-else"],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("checks all companions invited to the user’s home", async () => {
    rows.together_character_instances.push({ id: "guest", user_id: "user" });
    await expect(
      assertHomePlanWelcome(homeTestDb(rows), {
        userId: "user",
        location: { category: "home", owner_user_id: "user" },
        participantIds: ["host", "guest"],
      }),
    ).rejects.toMatchObject({ code: "HOME_VISIT_DECLINED" });
  });
  it("does not reuse a dismissed invitation to override unfamiliarity", async () => {
    rows.together_relationship_states[0].affinity = 0;
    rows.together_home_invitations = [{
      id: "invitation",
      user_id: "user",
      character_instance_id: "host",
      home_id: "home",
      expires_at: "2099-01-01",
      action: { status: "dismissed" },
    }];
    await expect(
      assertHomePlanWelcome(homeTestDb(rows), {
        userId: "user",
        location: {
          category: "home",
          owner_user_id: "user",
          character_home_id: "home",
        },
        participantIds: ["host"],
      }),
    ).rejects.toMatchObject({ code: "HOME_VISIT_DECLINED" });
  });
  it("accepts an unexpired pending invitation", async () => {
    rows.together_relationship_states[0].affinity = 0;
    rows.together_home_invitations = [{
      id: "invitation",
      user_id: "user",
      character_instance_id: "host",
      home_id: "home",
      expires_at: "2099-01-01",
      action: { status: "pending" },
    }];
    await expect(
      assertHomePlanWelcome(homeTestDb(rows), {
        userId: "user",
        location: {
          category: "home",
          owner_user_id: "user",
          character_home_id: "home",
        },
        participantIds: ["host"],
      }),
    ).resolves.toBeUndefined();
  });
  it("leaves public places unchanged and rejects another user’s home", async () => {
    const db = homeTestDb(rows);
    await assertHomePlanWelcome(db, {
      userId: "user",
      location: { category: "cafe" },
      participantIds: ["host"],
    });
    expect(db.calls).toHaveLength(0);
    await expect(
      assertHomePlanWelcome(db, {
        userId: "user",
        location: { category: "home", owner_user_id: "other" },
        participantIds: ["host"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("surfaces a retriable error if the relationship cannot be checked", async () => {
    await expect(
      decideHomeVisit(
        homeTestDb(rows, { together_relationship_states: "offline" }),
        { userId: "user", characterInstanceId: "host", destination: "my_home" },
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 503 });
  });
});
