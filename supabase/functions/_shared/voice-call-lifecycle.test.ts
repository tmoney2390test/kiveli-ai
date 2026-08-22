import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  voiceCallLeaseExpiresAt,
  voiceCallSessionIsStale,
} from "./voice-call-lifecycle.ts";

Deno.test("active call leases are renewed for a bounded heartbeat window", () => {
  const now = new Date("2026-08-21T16:00:00.000Z");
  assertEquals(
    voiceCallLeaseExpiresAt("active", now),
    "2026-08-21T16:01:15.000Z",
  );
  assert(
    !voiceCallSessionIsStale({
      status: "active",
      lease_expires_at: "2026-08-21T16:00:01.000Z",
    }, now),
  );
  assert(
    voiceCallSessionIsStale({
      status: "active",
      lease_expires_at: "2026-08-21T15:59:59.000Z",
    }, now),
  );
});

Deno.test("ending calls release the exclusive lifecycle immediately", () => {
  assert(
    voiceCallSessionIsStale({
      status: "ending",
      updated_at: "2026-08-21T16:00:00.000Z",
    }, new Date("2026-08-21T16:00:00.001Z")),
  );
});

Deno.test("pre-lease rows use conservative state-specific fallback windows", () => {
  const now = new Date("2026-08-21T16:03:00.000Z");
  assert(
    voiceCallSessionIsStale({
      status: "connecting",
      updated_at: "2026-08-21T16:00:00.000Z",
    }, now),
  );
  assert(
    !voiceCallSessionIsStale({
      status: "active",
      updated_at: "2026-08-21T16:01:30.001Z",
    }, now),
  );
});
