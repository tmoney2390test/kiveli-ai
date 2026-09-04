import { assertEquals } from "jsr:@std/assert";
import { applyMemoryRetrievalBudget } from "./kivelle-conversation-context-v2.ts";

const rows = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));
const context = {
  directRecall: rows("direct", 5),
  callbacks: rows("callback", 1),
  silent: rows("silent", 20),
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
