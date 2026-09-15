# Storylines in scenarios

## Coverage

The checked-in audit accounts for all 117 existing arc templates. It connects 85 current arcs to companion scenarios: 23 extend existing entries and 62 introduce new entries. All 80 original scenario identifiers remain, producing 142 scenario entries. Twelve inactive arcs and twenty arcs tied solely to retired Maya remain archived rather than advertising unavailable experiences.

| World | Connected arcs |
| --- | ---: |
| Juniper | 23 |
| Port Vervelle | 12 |
| Neon Kyo | 2 |
| Vespormoor | 9 |
| Northvale | 7 |
| Eos Meridian | 6 |
| Vharadren | 12 |
| Calder’s Run | 14 |

The separate anthology Stories engine is preserved. Vespormoor scenarios link to its playable anthology; coming-soon anthologies remain unavailable.

## Player experience

Players find scenarios through Explore or companion onboarding, preview a concrete opening, and start with its published resident lead at a matching canonical location. Saved stories can be resumed. Chat shows a compact progress control with the current chapter and a player-written checkpoint journal. Chapters advance only when the player explicitly records a decision or discovery after participating in chat. This is not automatic quest grading. Final checkpoints save an ending; completed stories open for reading without automatically restarting.

Scenario presence pauses the companion’s routine. Planning an event remains available and does not pause the scenario. Explicitly joining an event or date asks before pausing it. Actual player movement remains authoritative. Existing conversation-scoped scenario reset clears checkpoints; this change does not introduce a separate reset UI.

Old timer-driven arc records and transcripts remain intact. Converted arcs stop receiving timer-generated progress. Their scenario entry begins at chapter one: historical timer state is not treated as proof that a player made specific choices.

## Content and continuity

Public catalogue data contains openings and presentation metadata, not private canon, chapter guidance, or hidden outcomes. The server supplies only the current chapter and relevant private guidance, with explicit limits on what a character knows. Checkpoint notes are player-reported events, not instructions or global canon. Completed history is scoped to the same account, Life, and companion and is not automatically shared into group chats.

Each new opening is validated against a published, selectable resident and a location in that world. Vharadren hooks avoid giving away hidden identities. Calder’s Run uses its detailed authored chapter material. Generic chapter names and vague openings have been replaced. Explicit scenario starts do not require the legacy timer’s romance thresholds; dialogue must still respect the actual relationship. No character NSFW material or original scenario content was rewritten.

## Authoring and checks

`pnpm scenarios:build` deterministically rebuilds the public catalogue, private storyline catalogue, disposition audit, and definition SQL from the checked-in source and editorial mapping. Future definition SQL changes need a new migration; rebuilding does not edit deployed migrations.

`pnpm scenarios:test` covers coverage, residency, locations, public/private separation, original-content fingerprints, deterministic generation, and database checkpoint behavior. Database tests include ownership, active-chat leases, stale revisions, duplicate retries, reset behavior, and protection against older timer workers.

The public catalogue loads on demand to keep the initial web bundle within budget. Original scenario artwork is restored; new entries reuse relevant existing place/character artwork rather than requiring new image generation.

## Release order

No production changes were made for this implementation. Before release, review the branch’s other pending changes separately.

1. Verify migration history: the restored September 9–10 scenario migrations already exist in production and must not be replayed blindly.
2. Apply `20260914233719_storyline_scenarios.sql`. Its database guards prevent older workers from advancing converted arcs during rollout.
3. Deploy `together-scenario` and all Edge Function consumers of the changed shared context, snapshot, schedule, plan, and date modules. Deploying only the new endpoint is insufficient.
4. Deploy the web export, then smoke-test Explore, onboarding, start/resume, saved location, checkpoint retries, completion, event planning versus joining, and account/Life switching.
5. Native binaries are a separate release; none are built by this change.

Local automated checks and a production-configured web export do not replace a post-deployment authenticated smoke test.
