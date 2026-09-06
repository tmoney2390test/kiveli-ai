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
      message: "The executioner killed Prince Lucien. The court falls silent.",
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

  it("may use a single explicit director target for an explicit outcome", () => {
    expect(deriveCharacterLifeTransition({
      message: "He is dead.",
      participants: [queen, prince],
      directedCharacterInstanceIds: [prince.characterInstanceId],
    })).toMatchObject({ characterInstanceId: prince.characterInstanceId, to: "dead" });
  });

  it.each([
    'I snap my fingers.', 'I killed the engine.', 'I killed a rat in the cellar.',
    'I shoot a photo of you.', 'You are dead tired.', 'You are dead wrong.',
    'I killed your brother.', 'He died.', 'I stab you in the neck.',
    'I strangle you.', 'I tried to kill you.', 'I killed you in my dream.',
    'Did I kill you?', 'He said "I killed you."', 'I did not kill you.',
    'I revive my friend.',
    'You are dead to me.', 'You are dead inside.', 'I killed you with kindness.',
    'I killed you in chess.', 'I should kill you.', 'Kill Prince Lucien now.',
    'You were dead. You are alive now.', 'I killed you. I revive you.',
  ])('does not infer a companion outcome from an unrelated, ambiguous, or non-completed action: %s', (message) => {
    expect(deriveCharacterLifeTransition({ message, participants: [prince] })).toBeNull();
  });

  it('does not confuse the named speaker/actor with an unrelated victim', () => {
    expect(deriveCharacterLifeTransition({
      message: 'Prince Lucien killed the assassin.', participants: [queen, prince],
      directedCharacterInstanceIds: [prince.characterInstanceId],
    })).toBeNull();
    expect(deriveCharacterLifeTransition({
      message: 'I killed a rat, Prince Lucien.', participants: [queen, prince],
    })).toBeNull();
  });

  it('requires explicit outcomes even when injury and threats appear together', () => {
    expect(deriveCharacterLifeTransition({
      message: 'Enough. You die now, Prince. *stabs him in the neck*', participants: [queen, prince],
    })).toBeNull();
    expect(deriveCharacterLifeTransition({ message: 'Prince Lucien has died.', participants: [queen, prince] }))
      .toMatchObject({ characterInstanceId: prince.characterInstanceId, to: 'dead' });
  });

  it('does not revive the addressed dead character when a different person is revived', () => {
    expect(deriveCharacterLifeTransition({message:'I revive my friend.',participants:[{...prince,lifeState:'dead'}]})).toBeNull();
    expect(deriveCharacterLifeTransition({message:'I revive you.',participants:[{...prince,lifeState:'dead'}]}))
      .toMatchObject({characterInstanceId:prince.characterInstanceId,to:'alive'});
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
