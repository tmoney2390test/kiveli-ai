import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";
import {
  eligibleGroupInstances,
  GROUP_ELIGIBLE_INSTANCE_SELECT,
  hasMetCompanionForGroup,
} from "./kivelle-group-eligibility.ts";

function fakeDb(result: { data: unknown[] | null; error: unknown }) {
  let selected = "";
  const builder = {
    select(value: string) {
      selected = value;
      return builder;
    },
    eq() {
      return builder;
    },
    in() {
      return Promise.resolve(result);
    },
  };
  return {
    db: { from: () => builder } as unknown as SupabaseClient,
    selected: () => selected,
  };
}

Deno.test("group eligibility uses canonical character-version columns", async () => {
  const mock = fakeDb({
    data: [{ id: "a", introduced_at: "2026-08-01T00:00:00Z" }],
    error: null,
  });
  const result = await eligibleGroupInstances(mock.db, "user", "life", ["a"]);
  assertEquals(result.length, 1);
  assertEquals(mock.selected(), GROUP_ELIGIBLE_INSTANCE_SELECT);
  assertEquals(mock.selected().includes("portrait_asset_url"), false);
  assertEquals(mock.selected().includes("portrait_asset_key"), true);
});

Deno.test("legacy contact history counts as having met a companion", () => {
  assertEquals(
    hasMetCompanionForGroup({
      introduced_at: null,
      contact_added_at: "2026-08-01T00:00:00Z",
    }),
    true,
  );
  assertEquals(
    hasMetCompanionForGroup({ introduced_at: null, contact_added_at: null }),
    false,
  );
});

Deno.test("database failures are not mislabeled as unmet companions", async () => {
  const mock = fakeDb({ data: null, error: { code: "42703" } });
  const error = await assertRejects(
    () => eligibleGroupInstances(mock.db, "user", "life", ["a", "b"]),
    AppError,
    "Companion eligibility could not be verified.",
  );
  assertEquals(error.code, "INTERNAL_ERROR");
  assertEquals(error.retryable, true);
});
