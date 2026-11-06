import { describe, expect, it } from "vitest";
import {
  homeActivityKey,
  homeInvitationEligible,
  homeMemoryEvidence,
  homeVisitDecision,
  type HomeVisitEvidence,
} from "./home-visits";
const stranger: HomeVisitEvidence = {
  affinity: 8,
  familiarity: 0,
  stage: "stranger",
  seriousConflict: false,
  rememberedWelcome: false,
  rememberedBoundary: false,
  invited: false,
  destination: "their_home",
};
describe("home visits", () => {
  it("lets a stranger suggest another meeting without any upgrade or grind copy", () => {
    const d = homeVisitDecision(stranger);
    expect(d.allowed).toBe(false);
    expect(d.reply).not.toMatch(/unlock|level|affinity|upgrade|subscription/i);
  });
  it.each([
    "acquaintance",
    "friend",
    "flirting",
    "dating",
    "exclusive",
    "long_term",
  ])(
    "welcomes %s without a rigid affinity requirement",
    (stage) =>
      expect(homeVisitDecision({ ...stranger, stage }).allowed).toBe(true),
  );
  it.each(["their_home", "my_home"] as const)(
    "welcomes full affinity at %s",
    (destination) =>
      expect(
        homeVisitDecision({ ...stranger, affinity: 100, destination }).allowed,
      ).toBe(true),
  );
  it("lets memory and direct invitations override unfamiliarity", () => {
    expect(homeVisitDecision({ ...stranger, rememberedWelcome: true }).allowed)
      .toBe(true);
    expect(homeVisitDecision({ ...stranger, invited: true }).allowed).toBe(
      true,
    );
  });
  it("does not erase a recent serious conflict just because affinity is full", () =>
    expect(
      homeVisitDecision({
        ...stranger,
        affinity: 100,
        invited: true,
        rememberedWelcome: true,
        seriousConflict: true,
      }).reason,
    ).toBe("conflict"));
  it("respects an explicit current boundary", () =>
    expect(
      homeVisitDecision({
        ...stranger,
        affinity: 100,
        rememberedBoundary: true,
      }).reason,
    ).toBe("boundary"));
  it("understands clear saved home rules offline", () => {
    expect(
      homeMemoryEvidence([{
        canonical_text: "The user is always welcome at her home.",
      }]).rememberedWelcome,
    ).toBe(true);
    expect(
      homeMemoryEvidence([{ canonical_text: "We live together." }])
        .rememberedWelcome,
    ).toBe(true);
  });
  it("does not turn a negative rule or a request into permission", () => {
    expect(
      homeMemoryEvidence([{
        canonical_text: "The user is not welcome at her home.",
      }]),
    ).toEqual({ rememberedWelcome: false, rememberedBoundary: true });
    expect(
      homeMemoryEvidence([{ canonical_text: "I want to visit your home." }])
        .rememberedWelcome,
    ).toBe(false);
  });
  it.each([
    "You are always welcome at the café.",
    "We do not live together.",
    "I wish we were roommates.",
    "You are not always welcome at her home.",
    "She used to welcome me at her home.",
    "Maybe we live together.",
    "I want to be welcome at her apartment.",
  ])(
    "does not misread saved text: %s",
    (canonical_text) =>
      expect(homeMemoryEvidence([{ canonical_text }]).rememberedWelcome).toBe(
        false,
      ),
  );
  it("does not treat an unknown relationship stage as established familiarity", () =>
    expect(homeVisitDecision({ ...stranger, stage: "unknown" }).allowed).toBe(
      false,
    ));
  it("normalizes personal activities for the existing planning contract", () =>
    expect(homeActivityKey("Fit the model shuttle’s loose panel")).toBe(
      "fit_the_model_shuttle_s_loose_panel",
    ));
});
describe("home invitations", () => {
  const now = new Date("2026-11-05T20:00:00Z");
  const eligible = {
    activeTurn: true,
    atOwnHome: true,
    sleeping: false,
    available: true,
    allowed: true,
    hasPlan: false,
    hasPendingAction: false,
    now,
    history: [],
    activityKey: "have_coffee",
  };
  it("can offer during an active available at-home conversation", () =>
    expect(homeInvitationEligible(eligible)).toBe(true));
  it.each(["activeTurn", "atOwnHome", "available", "allowed"] as const)(
    "requires %s",
    (key) =>
      expect(homeInvitationEligible({ ...eligible, [key]: false })).toBe(false),
  );
  it.each(["sleeping", "hasPlan", "hasPendingAction"] as const)(
    "does not interrupt %s",
    (key) =>
      expect(homeInvitationEligible({ ...eligible, [key]: true })).toBe(false),
  );
  it.each([0, 1, 6])(
    "does not repeat a character invitation after %s days",
    (days) =>
      expect(
        homeInvitationEligible({
          ...eligible,
          history: [{
            created_at: new Date(+now - days * 86400000).toISOString(),
            activity_key: "cook_together",
          }],
        }),
      ).toBe(false),
  );
  it("can offer a different scenario after a week", () =>
    expect(
      homeInvitationEligible({
        ...eligible,
        history: [{
          created_at: new Date(+now - 7 * 86400000).toISOString(),
          activity_key: "cook_together",
        }],
      }),
    ).toBe(true));
  it("keeps the same scenario apart for 30 days", () => {
    for (let day = 0; day < 30; day++) {
      expect(
        homeInvitationEligible({
          ...eligible,
          history: [{
            created_at: new Date(+now - day * 86400000).toISOString(),
            activity_key: "have_coffee",
          }],
        }),
      ).toBe(false);
    }
    expect(
      homeInvitationEligible({
        ...eligible,
        history: [{
          created_at: new Date(+now - 30 * 86400000).toISOString(),
          activity_key: "have_coffee",
        }],
      }),
    ).toBe(true);
  });
  it("does not allow configuration to lower the minimum gaps", () =>
    expect(
      homeInvitationEligible({
        ...eligible,
        cooldownDays: 0,
        scenarioCooldownDays: 0,
        history: [{
          created_at: new Date(+now - 86400000).toISOString(),
          activity_key: "have_coffee",
        }],
      }),
    ).toBe(false));
});

import { recentHomeNews } from "./home-visits";
describe("home invitations and shared news", () => {
  const now = new Date("2026-11-05T16:00:00Z");
  const event = {
    id: "event",
    worldId: "eos",
    occurredAt: "2026-11-05T15:00:00Z",
  };
  it("can use a real event from the last 24 hours", () =>
    expect(recentHomeNews([event], "eos", now)?.id).toBe("event"));
  it.each([
    { worldId: "other" },
    { occurredAt: "2026-11-04T14:00:00Z" },
    { occurredAt: "2026-11-06T15:00:00Z" },
    { endsAt: "2026-11-05T15:30:00Z" },
    { status: "cancelled" },
    { status: "completed" },
    { occurredAt: "invalid" },
  ])(
    "ignores irrelevant, old, future, or ended news: %j",
    (patch) =>
      expect(recentHomeNews([{ ...event, ...patch }], "eos", now))
        .toBeUndefined(),
  );
});
