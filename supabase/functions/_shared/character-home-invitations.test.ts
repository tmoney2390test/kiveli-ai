import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { homeTestDb } from "./test-support/home-test-db";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  prepare: vi.fn(),
  decide: vi.fn(),
}));
vi.mock(
  "./character-homes.ts",
  () => ({
    loadCharacterHome: mocks.load,
    homePlanningLocation: mocks.prepare,
    decideHomeVisit: mocks.decide,
  }),
);
import { maybeOfferHomeVisit } from "./character-home-invitations";
let rows: Record<string, any[]>, db: any;
const input = {
  userId: "user",
  characterInstanceId: "host",
  conversationId: "chat",
  userMessageId: "cc",
  assistantMessageId: "reply",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T16:00:00Z"));
  rows = {
    together_notification_preferences: [{
      user_id: "user",
      character_initiated_messages: true,
      initiative_level: "normal",
      timezone: "UTC",
      quiet_hours_start: "23:00",
      quiet_hours_end: "08:00",
    }],
    together_messages: [{
      id: "cc",
      user_id: "user",
      conversation_id: "chat",
      role: "user",
      created_at: new Date().toISOString(),
    }],
    together_conversations: [{
      id: "chat",
      user_id: "user",
      character_instance_id: "host",
      continuity_id: "life",
      archived_at: null,
    }],
    together_character_homes: [{
      id: "home",
      invitation_config: { enabled: true },
    }],
    together_conversation_actions: [],
    together_shared_plans: [],
    together_home_invitations: [],
    together_locations: [],
  };
  db = {
    ...homeTestDb(rows),
    rpc: vi.fn(async () => ({ data: "invitation", error: null })),
  };
  mocks.load.mockReset().mockResolvedValue({
    home: {
      id: "home",
      world_id: "eos",
      possible_activities: ["Have coffee", "Cook together"],
    },
    availability: {
      available: true,
      atHome: true,
      state: "awake",
      validUntil: "2026-11-05T19:00:00Z",
    },
  });
  mocks.prepare.mockReset().mockResolvedValue({
    place: { id: "their-home", name: "Their flat", slug: "their-flat" },
  });
  mocks.decide.mockReset().mockResolvedValue({ allowed: true });
});
afterEach(() => vi.useRealTimers());
describe("home invitations during live conversations", () => {
  it("offers their home without creating a visit or moving anyone", async () => {
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][0]).toBe("kivelle_offer_home_visit");
    expect(db.rpc.mock.calls[0][1].p_payload).toMatchObject({
      homeVisitDestination: "their_home",
      requiresConfirmation: true,
      locationId: "their-home",
    });
  });
  it("can offer to come to the user’s own home in the same world", async () => {
    rows.together_locations = [{
      id: "my-home",
      owner_user_id: "user",
      world_id: "eos",
      category: "home",
      character_home_id: null,
      archived_at: null,
      name: "My flat",
      slug: "my-flat",
      possible_activities: ["Cook together"],
    }];
    await maybeOfferHomeVisit(db, input);
    expect(mocks.decide).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ destination: "my_home" }),
    );
    expect(db.rpc.mock.calls[0][1].p_payload).toMatchObject({
      homeVisitDestination: "my_home",
      locationId: "my-home",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "away", "sleeping"])(
    "does not invite when %s",
    async (state) => {
      mocks.load.mockResolvedValue({
        home: {
          id: "home",
          world_id: "eos",
          possible_activities: ["Have coffee"],
        },
        availability: {
          available: state === "away",
          atHome: state !== "away",
          state,
        },
      });
      await maybeOfferHomeVisit(db, input);
      expect(db.rpc).not.toHaveBeenCalled();
    },
  );
  it("honors quiet hours, opt-out, pending actions, and recent invitations", async () => {
    vi.setSystemTime(new Date("2026-11-05T23:30:00Z"));
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-11-05T16:00:00Z"));
    rows.together_notification_preferences[0].character_initiated_messages =
      false;
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
    rows.together_notification_preferences[0].character_initiated_messages =
      true;
    rows.together_conversation_actions = [{
      id: "other",
      user_id: "user",
      conversation_id: "chat",
      status: "pending",
      expires_at: "2099-01-01",
    }];
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
    rows.together_conversation_actions = [];
    rows.together_home_invitations = [{
      user_id: "user",
      character_instance_id: "host",
      created_at: "2026-11-04T16:00:00Z",
      activity_key: "cook_together",
    }];
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not invite after background delay or an archived conversation", async () => {
    rows.together_messages[0].created_at = "2026-11-05T15:50:00Z";
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
    rows.together_messages[0].created_at = new Date().toISOString();
    rows.together_conversations[0].archived_at = new Date().toISOString();
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not invite when the contextual permission check refuses", async () => {
    mocks.decide.mockResolvedValue({ allowed: false });
    await maybeOfferHomeVisit(db, input);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
