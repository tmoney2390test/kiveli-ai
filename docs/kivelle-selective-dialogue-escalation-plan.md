# Selective dialogue escalation plan

## Outcome

Use a stronger dialogue model only when a turn can materially benefit from deeper reasoning, continuity reconciliation, or longer-form scene work. Ordinary chat should remain fast. Character identity, world truth, relationship truth, safety decisions, and adult eligibility must remain identical across model tiers.

Explicit dialogue remains a separate provider route: an eligible explicit turn continues to use the configured xAI path. The escalation tier may tune the chosen provider's model or budget, but it must never decide whether explicit content is allowed.

## Proposed route contract

Add a pure domain function named `resolveDialogueQualityRoute` with these inputs:

- interaction quality and response brief mode;
- active conflict, repair, milestone, and relationship stage;
- relevant-memory count, open-thread count, and continuity contradictions;
- active story or multi-character scene complexity;
- requested response style and target response length;
- explicit-readiness result and required provider family;
- subscription capability and remaining per-user quality budget.

It returns:

- `tier`: `fast`, `deep`, or `critical`;
- `reasonCodes`: stable, non-sensitive enums for telemetry;
- provider family fixed by capability policy;
- model environment-variable key, not a hard-coded model name;
- context and output token budgets;
- timeout and fallback tier;
- whether the director pass is required.

## Escalation signals

Stay on `fast` for greetings, acknowledgements, factual logistics, lightweight flirtation, short reactions, and ordinary ongoing dialogue.

Escalate to `deep` for:

- meaningful vulnerability or a personal-history request;
- an active disagreement or relationship repair;
- a stage milestone or decision about a commitment;
- a story beat needing multiple memories or open threads;
- a multi-character scene with competing goals;
- a long paragraph response whose voice must remain tightly controlled;
- a detected continuity conflict the prompt can reconcile without inventing facts.

Escalate to `critical` only for rare turns combining several signals, such as a major relationship rupture during an established story with conflicting commitments. A subscription can increase the available frequency or budget, but it must not make free-tier characters less correct or less themselves.

Never escalate merely because a turn is sexual. Explicit readiness and xAI routing remain capability and safety decisions; complexity may independently choose the configured fast or deep xAI dialogue model.

## Guardrails

1. Compile the same Character Depth voice card before routing and send it to every provider.
2. Make safety and explicit-readiness decisions before model selection; models cannot self-upgrade around a failed gate.
3. Do not expose tier, model, subscription reason, or internal scores in dialogue.
4. Cap escalations per rolling window and fall back to `fast` on timeout without changing canonical state.
5. Persist canonical conversation effects only after one final response wins; a timed-out attempt cannot double-write memories or relationship changes.
6. Keep response-length preference independent from quality tier: a deep answer may still be short.

## Evaluation and rollout

1. Build a fixed evaluation set covering all three worlds, every relationship stage, all three Spice levels, explicit and non-explicit routes, repair, milestones, anecdotes, schedules, and multi-character scenes.
2. Score character identification with names removed, contradiction rate, memory precision, relationship-stage accuracy, response-shape repetition, latency, and cost.
3. Run the router in shadow mode and record the proposed tier without changing models.
4. Compare false escalations and missed complex turns, then tune only stable reason-code thresholds.
5. Canary the real route for internal/test accounts, then 5%, 25%, and 100%, with instant environment-flag rollback.
6. Require a measurable lift in character identification and continuity accuracy for an acceptable latency and cost increase. If a category does not improve, keep it on `fast`.

## Instrumentation

Record `dialogue_quality_route_selected` with tier, reason codes, provider family, context budget, response budget, latency, fallback use, interaction quality, and world slug. Never log prompt text, explicit text, secrets, or raw user memories. Link the event to existing correlation IDs so dialogue errors and continuity writes can be audited without storing sensitive content.

## Implementation order

1. Pure router and table-driven tests.
2. Shadow telemetry behind `KIVELLE_DIALOGUE_ESCALATION_MODE=shadow`.
3. Provider adapters accepting a route-selected model and budget.
4. Timeout-safe single-winner generation orchestration.
5. Offline evaluation report and threshold tuning.
6. Canary flags and production ramp.

This plan intentionally does not implement model escalation yet.

