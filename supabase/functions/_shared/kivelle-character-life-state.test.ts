import { deadCharacterSceneNarration } from "./kivelle-character-life-state.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

Deno.test("dead character response is minimal and ignores the stored death summary", () => {
  assertEquals(
    deadCharacterSceneNarration({
      name: "Prince Lucien",
      summary: "Prince Lucien lies motionless beside the throne.",
    }),
    "Prince Lucien is dead.",
  );
});

Deno.test("dead character response sanitizes an untrusted display name", () => {
  assertEquals(
    deadCharacterSceneNarration({ name: "<Queen\nMaerra>" }),
    "Queen Maerra is dead.",
  );
});
