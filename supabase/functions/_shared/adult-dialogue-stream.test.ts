import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  moderationContextTail,
  takeModerationSegments,
} from "./adult-dialogue-stream.ts";

Deno.test("adult stream holds incomplete output and releases natural bounded segments", () => {
  const first = takeModerationSegments("A short unfinished thought");
  assertEquals(first.segments, []);
  assertEquals(first.remainder, "A short unfinished thought");
  const complete = takeModerationSegments(
    "This first sentence is long enough to pass the moderation gate. A second sentence follows.",
  );
  assertEquals(complete.segments.length, 1);
  assertStringIncludes(complete.segments[0]!, "moderation gate.");
  assertStringIncludes(complete.remainder, "second sentence");
});

Deno.test("adult stream flushes final fragments and bounds long unpunctuated text", () => {
  const long = "word ".repeat(90);
  const bounded = takeModerationSegments(long, {
    minimumChars: 40,
    maximumChars: 120,
  });
  assertEquals(
    bounded.segments.every((segment) => segment.length <= 120),
    true,
  );
  const flushed = takeModerationSegments("final fragment", { flush: true });
  assertEquals(flushed, { segments: ["final fragment"], remainder: "" });
});

Deno.test("moderation context retains only the recent approved tail", () => {
  const value = "a".repeat(300);
  assertEquals(moderationContextTail(value, 80), "a".repeat(80));
});
