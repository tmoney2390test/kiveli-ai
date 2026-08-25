import { assertEquals } from "jsr:@std/assert@1";
import {
  authoredDepthCacheKey,
  BoundedTtlCache,
} from "./kivelle-authored-depth-cache.ts";

Deno.test("authored depth cache deduplicates concurrent static loads", async () => {
  const cache = new BoundedTtlCache<number>(1_000, 4);
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await Promise.resolve();
    return 7;
  };
  const values = await Promise.all([
    cache.getOrLoad("same", loader),
    cache.getOrLoad("same", loader),
  ]);
  assertEquals(values, [7, 7]);
  assertEquals(loads, 1);
});

Deno.test("authored depth cache is bounded and keys are order stable", async () => {
  const cache = new BoundedTtlCache<number>(1_000, 2);
  await cache.getOrLoad("a", async () => 1);
  await cache.getOrLoad("b", async () => 2);
  await cache.getOrLoad("c", async () => 3);
  assertEquals(cache.size, 2);
  const first = authoredDepthCacheKey({
    worldId: "w",
    locationId: null,
    districtId: null,
    terms: ["b", "a"],
    categories: ["history"],
    beatTerms: ["rain"],
    interactionModes: ["remote", "active_plan"],
  });
  const second = authoredDepthCacheKey({
    worldId: "w",
    locationId: null,
    districtId: null,
    terms: ["a", "b"],
    categories: ["history"],
    beatTerms: ["rain"],
    interactionModes: ["active_plan", "remote"],
  });
  assertEquals(first, second);
});
