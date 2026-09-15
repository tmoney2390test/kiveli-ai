# Expanded-memory send latency

Normal direct/group sends no longer request a context quote before displaying the optimistic user message. The existing cost consent is still required once per memory activation; account/draft/settings changes still cancel pending consent. Photos retain their explicit Included-memory choice. Rewrite confirmation and older quoted clients remain compatible.

The server validates the current activation and membership and acquires the existing turn lease. It creates an automatic reservation with no hold, builds the actual expanded context once, and atomically prepares a bounded credit hold before provider dispatch. Short contexts that do not benefit from expansion cost zero. Final receipts, actual-usage pricing, refund/recovery, model routing and content rules are unchanged. Holds remain bounded to the server-selected speaker count and token budget; retries cannot duplicate wallet deductions.

Migration: `20260915150102_context_send_admission`. Client roles cannot execute the new preparation RPC. Live dialogue v310 and group dialogue v166 were patched from their downloaded sources to preserve unrelated production changes.

Validation: client consent/provider-admission tests; app typecheck; both Edge Function typechecks; existing context pricing/fingerprint tests; PGlite coverage for zero-cost prompts, duplicate holds, multiple speakers, insufficient funds, ownership, renewal boundaries, receipt settlement/refunds and client denial.

Live test on the existing test account: the old quote request took 10,353 ms. The subsequent automatic send completed without consuming that quote, with first token at 17,916 ms and completion at 19,315 ms. Its short conversation required no paid expansion; the zero-credit reservation closed with one receipt. This demonstrates removal of a separate ten-second preflight, not an apples-to-apples overall model-speed benchmark or a live paid-expansion test. The test account's temporary memory setting was restored.

Web can use the new path after deployment/reload. Existing native binaries still use the compatible quoted path until rebuilt; over-the-air updates are not configured.
