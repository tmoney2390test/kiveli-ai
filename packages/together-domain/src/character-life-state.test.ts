import { describe, expect, it } from "vitest";
import {
  characterCanSpeak,
  deriveCharacterLifeTransition,
} from "./character-life-state.ts";

const prince = {
  characterInstanceId: "prince-instance",
  name: "Prince Lucien Vaelorian",
  lifeState: "alive",
};
const queen = {
  characterInstanceId: "queen-instance",
  name: "Queen Maerra Vaelorian",
  lifeState: "alive",
};

describe("character life-state continuity", () => {
  it("persists an explicit completed fatal action against a named group participant", () => {
    expect(deriveCharacterLifeTransition({
      message: "Enough. You die now, Prince. *stabs him in the neck*",
      participants: [queen, prince],
    })).toMatchObject({
      characterInstanceId: "prince-instance",
      from: "alive",
      to: "dead",
      kind: "death",
    });
  });

  it.each([
    "I will kill Prince Lucien",
    "I want to kill Prince Lucien",
    "If Prince Lucien dies, we retreat",
    "I almost killed Prince Lucien",
    "Don't kill Prince Lucien",
  ])("does not turn threats, wishes, hypotheticals, or negations into death: %s", (message) => {
    expect(deriveCharacterLifeTransition({ message, participants: [queen, prince] })).toBeNull();
  });

  it("does not resolve an ambiguous group pronoun", () => {
    expect(deriveCharacterLifeTransition({
      message: "*stabs him through the heart*",
      participants: [queen, prince],
    })).toBeNull();
  });

  it("may use a single explicit director target", () => {
    expect(deriveCharacterLifeTransition({
      message: "*stabs him through the heart*",
      participants: [queen, prince],
      directedCharacterInstanceIds: [prince.characterInstanceId],
    })).toMatchObject({ characterInstanceId: prince.characterInstanceId, to: "dead" });
  });

  it("allows an explicit supernatural return without treating a wish as canon", () => {
    const deadPrince = { ...prince, lifeState: "dead" };
    expect(deriveCharacterLifeTransition({
      message: "Prince Lucien rises as a ghost beside the throne.",
      participants: [queen, deadPrince],
    })).toMatchObject({ to: "undead", kind: "supernatural_return" });
    expect(deriveCharacterLifeTransition({
      message: "I wish I could resurrect Prince Lucien.",
      participants: [queen, deadPrince],
    })).toBeNull();
  });

  it("prevents only canonically dead characters from speaking", () => {
    expect(characterCanSpeak("alive")).toBe(true);
    expect(characterCanSpeak("undead")).toBe(true);
    expect(characterCanSpeak("dead")).toBe(false);
    expect(characterCanSpeak(undefined)).toBe(true);
  });
});
