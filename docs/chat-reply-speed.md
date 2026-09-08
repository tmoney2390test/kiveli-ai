# Chat reply speed

Fast requests previously spent substantial time outside the reply model, including expression Director calls and serial context reads. Group text was buffered until generation completed, and direct chat held the composer while optional secondary speakers ran.

This change implements the four improvements:

1. Fast (`reasoningPreference: none`) uses the deterministic expression brief without calling the Director. Other modes retain the Director with a shared three-second deadline covering headers and response bodies, a common Responses text parser, and a 60-second provider cooldown after three consecutive failures.
2. Each authenticated request gets a unique client identity over the pooled transport. Subscription, timezone and authored place reads reuse in-flight results within that request; each consumer gets a clone. Existing bounded authored-depth caching remains in place. Independent reads run together, and short conversations avoid fetching history a second time. Private speaker eligibility is evaluated separately. The request identity also isolates context quotes and reservations that were previously keyed by the shared client.
3. Ordinary Fast / Included prompts start with the compact compiler variants and aim for a 5,000-token ceiling, raised when required context needs it. Identity, style, authorized recall and pinned memories remain represented. Complex/repair turns retain the existing compiler. Explicit 32k/64k allowances keep the existing full compiler and selected ceiling. Quote and generation use the same compiler; the pricing version is bumped to invalidate older quotes.
4. Clients request stream protocol 2. Group replies emit sequential, moderated text deltas and replace drafts with canonical messages. Direct replies report primary completion after persistence and required scene updates, then deliver secondary messages separately. New turns atomically cancel eligible old turns and settle unused context holds. Secondary commits require a valid floor; provider cancellation also polls the floor while optional work runs. Clients ignore duplicate/stale deltas and old completions, batch tiny direct text updates, and preserve newly typed drafts.

Reasoning, texting/paragraph style, chat dynamism, context allowance, and subscription entitlement remain independent controls.

## Release order and rollback

Apply `20260908110440_kivelle_chat_primary_completion.sql` before deploying the updated dialogue handlers. Deploy `together-dialogue` and `together-group-dialogue`, plus the context quote handler (`together-dialogue-quote`) because it shares the prompt compiler and pricing version. Deploy the client last. Existing clients keep the original event flow; new clients also understand the original completion events.

The following Edge environment switches default on. Set an individual switch to `off` to restore its previous behavior:

| Switch | Controls |
| --- | --- |
| `KIVELLE_CHAT_DIRECTOR_BYPASS` | Fast's Director bypass |
| `KIVELLE_CHAT_CONTEXT_REUSE` | Request memoization and short-history query avoidance |
| `KIVELLE_CHAT_FAST_PROMPT` | Compact ordinary Fast / Included prompts |
| `KIVELLE_CHAT_STREAM_V2` | Progressive group text and primary completion/takeover |

Keep compiler flags consistent across quote and generation functions. The request identity isolation and guarded database commits are correctness fixes and remain active during rollback. The migration is additive except for preserving conversation-before-turn lock order and rejecting expired group commits; old RPC signatures remain supported.

## Validation and measurement

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm context:test:db`, `pnpm chat-speed:test:db`, and the `kivelle-chat-speed_test.ts` Deno suite. CI includes the new database and Edge regressions. Database tests execute the actual acquisition, commit and settlement SQL in PGlite, covering pending-primary blocking, takeover, replay, expired/cancelled commits, exact-once refunds and service-only grants. PGlite does not replace the isolated Supabase CI migration/database gate or a production concurrency canary.

Client `first_text` for groups measures readable text separately from `first_activity` (typing). Direct `first_token`, both `primary_complete` events, and stream completion carry the request correlation ID. Edge `dialogue_latency` records preflight, first approved/readable text, primary completion and total time without prompt contents. Existing provider usage metadata supplies provider latency and input/output/reasoning tokens.

After deployment, compare direct/group, reasoning setting, Included/32k/64k, primary/secondary, platform, cold/warm and provider-fallback cohorts. Initial Fast targets are median/p95 first readable text of 2s/5s and primary completion of 4s/8s. These are acceptance targets, not measured results of this implementation. Validate representative real conversations before widening rollout; mock-provider and local compiler timings are not end-to-end benchmarks.
