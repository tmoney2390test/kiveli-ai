# Generation abuse controls

Kivelli applies these controls on the server. They are operational safeguards,
not subscription allowances, and are not shown as Plus or Max product limits.

## Dialogue admission

- One account may hold at most two active direct, group, or shared-scene turns.
- The database takes an account-scoped transaction lock before counting leases,
  so separate Edge Function instances cannot race past the limit.
- A group **Let them talk** turn holds one slot until the whole turn finishes.
- New dialogue turns use rolling limits of 4/20 seconds, 20/5 minutes, and
  240/hour. Auxiliary generation uses 3/20 seconds, 12/5 minutes, and 60/hour.
- Free-tier daily message allowances remain independent. Paid tiers have no
  ordinary-use daily message quota, but every tier retains the abuse ceilings.
- Identical conversation payloads received with different request IDs inside a
  20-second reconnect window resolve to one canonical request.

All values are editable in the server-only
`kivelle_generation_guardrail_config` row. Clients cannot read or mutate it.

## Provider-cost circuit

The migration calculates the 99.5th percentile of positive per-account
15-minute and daily AI, media, and voice provider-cost buckets over the previous 30 days. When at
least 20 observations exist, each initial threshold is three times that
observed percentile. The source percentile, sample counts, multiplier, and time
are recorded in `percentile_source`.

If a project has fewer than 20 usable observations, the circuit remains off
instead of inventing a dollar limit. An operator should re-run the same
percentile calculation after sufficient traffic, review the result, set
`cost_limit_15m_usd` and `cost_limit_daily_usd`, and enable the circuit. A trip
creates a temporary cooldown; it never suspends or bans the account.

## Group and provider budgets

- Ordinary group turns: at most 3 visible replies, 6,000 visible characters,
  and 10 provider operations.
- Explicit **Let them talk** turns: at most 5 visible replies, 10,000 visible
  characters, and 16 provider operations.
- Dialogue provider execution has a shared two-attempt budget across the
  primary request, a repair, and any cross-provider fallback. Once exhausted,
  only the local deterministic recovery path may run.
- Reply suggestions are cached for ten minutes by account, conversation anchor,
  preference, and content mode. Video prompt enhancement and suggestion misses
  share the auxiliary-generation rolling bucket.

## Payload and history handling

New direct and group user messages share the 2,000-character limit. Edge
Functions additionally enforce a 24 KB UTF-8 ceiling, reject control/invisible
formatting characters, and decline payloads dominated by repetition, whitespace,
or encoded garbage. No roleplay keyword filter is used.

Canonical conversation history is not capped or deleted. Model context remains
bounded through the existing recent-message window, ranked memories, summaries,
and episode compaction. Conversation retrieval continues to use cursor pages.

## Privacy and incident handling

Signup velocity uses HMAC-pseudonymized network prefixes and a random,
resettable installation identifier. Signals are rate-limit inputs only; they do
not authorize access or cause permanent bans. Shared-network anomalies receive
a temporary cooldown.

Credential-shaped generated output is stopped before the completing token is
streamed and is replaced before persistence. Database ownership/RLS remains the
real cross-account boundary; the output check is defense in depth.

To soften or pause a control, update the singleton configuration row. Do not
drop event, cooldown, or turn tables during an incident. Schema rollback is
additive: restore the previous `kivelle_begin_dialogue_turn` definition and
previous Edge Function versions, then leave the new private tables dormant for
forensics and a later retry.
