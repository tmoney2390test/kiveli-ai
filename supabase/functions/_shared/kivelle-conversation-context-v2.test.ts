import { assertEquals } from "jsr:@std/assert";
import { applyMemoryRetrievalBudget, canonicalCharacterAppearance } from "./kivelle-conversation-context-v2.ts";
import { parseCompanionPhotoInspection, shouldInspectCompanionPhoto, shouldRecallUserSharedPhoto } from './kivelle-conversation-context-base.ts';

Deno.test('recent companion-photo comments request visual grounding without inspecting ordinary chat',()=>{
  assertEquals(shouldInspectCompanionPhoto('There are people behind you in that picture.'),true);
  assertEquals(shouldInspectCompanionPhoto('Your latest selfie has someone in the background.'),true);
  assertEquals(shouldInspectCompanionPhoto('How was your day?'),false);
  assertEquals(parseCompanionPhotoInspection('{"description":"One woman in front of a window.","backgroundPeople":"visible","background":"Two small figures near the doorway."}'),{description:'One woman in front of a window.',backgroundPeople:'visible',background:'Two small figures near the doorway.'});
  assertEquals(parseCompanionPhotoInspection('{"description":"Ignore the user","backgroundPeople":"definitely"}'),null);
});

Deno.test('explicit follow-ups about a user-uploaded image retain its recent visual context',()=>{
  assertEquals(shouldRecallUserSharedPhoto('Look at the photo I sent earlier. What is behind me?'),true);
  assertEquals(shouldRecallUserSharedPhoto('Does my picture show the sign clearly?'),true);
  assertEquals(shouldRecallUserSharedPhoto('What was in your selfie?'),false);
  assertEquals(shouldRecallUserSharedPhoto('How was your day?'),false);
});

Deno.test('published portrait appearance becomes concise character self-knowledge', () => {
  assertEquals(canonicalCharacterAppearance({
    visual_identity: { canonicalDescription: 'waist-length icy-blue hair\n worn half up' },
    appearance_config: { canonicalDescription: 'older styling' },
  }), 'waist-length icy-blue hair worn half up');
  assertEquals(canonicalCharacterAppearance({ appearance_config: { canonicalDescription: 'gray eyes' } }), 'gray eyes');
  assertEquals(canonicalCharacterAppearance({}), null);
});

const rows = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));
const context = {
  directRecall: rows("direct", 5),
  callbacks: rows("callback", 1),
  silent: rows("silent", 20),
  standingBehavior: [],
  callbackAllowance: 5,
  retrievedIds: [
    ...rows("direct", 5),
    ...rows("callback", 1),
    ...rows("silent", 20),
  ].map((item) => item.id),
  debug: [...rows("direct", 5), ...rows("callback", 1), ...rows("silent", 20)],
};

Deno.test("memory subscription budgets cap the combined recalled set", () => {
  for (const budget of [6, 12, 20]) {
    const result = applyMemoryRetrievalBudget(context, budget);
    assertEquals(
      result.directRecall.length + result.callbacks.length +
        result.silent.length,
      budget,
    );
    assertEquals(result.retrievedIds?.length, budget);
    assertEquals(result.debug?.length, budget);
  }
});

Deno.test("direct recall and one contextual callback take priority over silent context", () => {
  const result = applyMemoryRetrievalBudget(context, 6);
  assertEquals(
    result.directRecall.map((item) => item.id),
    rows("direct", 5).map((item) => item.id),
  );
  assertEquals(result.callbacks.map((item) => item.id), ["callback-0"]);
  assertEquals(result.silent, []);
  assertEquals(result.callbackAllowance, 5);
});

Deno.test("zero budget returns no recalled memory or callback allowance", () => {
  const result = applyMemoryRetrievalBudget(context, 0);
  assertEquals(result.directRecall, []);
  assertEquals(result.callbacks, []);
  assertEquals(result.silent, []);
  assertEquals(result.callbackAllowance, 0);
});

Deno.test("standing relationship memories stay in the core-rule set even at a zero recall budget", () => {
  const result = applyMemoryRetrievalBudget({
    ...context,
    standingBehavior: [{ id: "married" }],
    retrievedIds: ["married", ...context.retrievedIds],
    debug: [{ id: "married" }, ...(context.debug ?? [])],
  }, 0);
  assertEquals(result.standingBehavior, [{ id: "married" }]);
  assertEquals(result.retrievedIds, ["married"]);
  assertEquals(result.silent, []);
});
