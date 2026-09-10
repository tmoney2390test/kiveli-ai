# Scenario launch — 9 September 2026

80 scenarios, ten in each of the eight worlds, are accessible in Explore and in the onboarding Scenarios tab. Each has a reviewed landscape cover generated with the built-in ImageGen tool using canonical character, location, or combined references. Public cards expose the premise; development possibilities and opening dialogue remain in the server catalogue.

## Behaviour
- Browse by world and lead gender, search titles/people/places/themes, preview and start.
- One active scenario per companion in each Life, including across conversations; starting a different one pauses the prior scenario.
- Starts are atomic and idempotent. Resume preserves the original conversation and never repeats its opening.
- Progress belongs to the signed-in user and their active Life. Pause and complete controls are available in the chat banner.
- Existing character identity, relationship history, account content settings and world access restrictions remain authoritative. Cole Hensley's scenario requires crowcut.access_granted.
- Scenario prompt sections explicitly supersede unrelated schedule/remote-chat instructions, while later player choices and movement supersede the starting premise. Scenario covers become mobile chat backgrounds; ordinary schedule cards are hidden while a scenario is active.
- Reply suggestions and context pricing include the scenario. Lifecycle changes invalidate earlier context quotes through the conversation revision.
- This is open-ended roleplay, not a fixed branching quest engine. Completion is chosen by the player; proposed developments are possibilities rather than forced outcomes.

## Artwork
Assets: apps/together/assets/scenarios (80 JPEGs, about 17.8 MiB total; only visible cards are rendered).
References, hashes and review notes: content/scenarios/art-manifest.json.
Prompts: content/scenarios/image-prompts.jsonl. The original user catalogue and mapped runtime catalogue are retained alongside them.
The maritime museum scenario uses its canonical parent Porto Vecchio as a visual reference because the museum has no authored reference image. Calder's Run covers add no train bridges. Four first attempts were rejected by image generation; fully clothed public compositions succeeded on regeneration.
Newer portrait/artwork/chat changes from origin/main through 72cbda9 were incorporated. ReferenceRevision records the exact earlier artwork used by generation. Existing oversized PNG portraits and the Vharadren hero are served as high-quality JPEGs to satisfy the web asset budget; their original PNGs remain in the repository.

## Validation
- 729 app tests, application TypeScript check, targeted lint.
- PGlite transaction tests: idempotency, pause/switch/resume, ownership/Life checks, archived conversations, read-only client privileges, quote revision.
- Six Deno scenario/prompt regression tests; affected Edge Function typechecks.
- Live test account: start, repeated start, opening visibility, pause/resume/complete, and actual dialogue continuation.
- Browser: Explore search and library, ten cards/world, gender filters, previews, locked Cole scenario, resume into original chat, pause controls; 360/390/430/768px without horizontal overflow. Onboarding start flow tested with mocked writes, preserving the existing account.
- 11 gateway tests, production route audit, production auth configuration, deployment dry run and asset budget.
- Production scenario table has RLS, no anonymous read or authenticated write access; start RPC is service-only. Supabase security advisors reported no scenario-specific findings.

Two migrations use the production-applied version identifiers, keeping the repository aligned with the migration ledger.

## Release verification

Published Cloudflare version af68ea39-743d-4e25-af22-04d36a39189f. Live browser checks passed for all 80 images/previews, 79 immediately available starts plus Cole's gated scenario, Explore and chat controls. The onboarding start path passed with mocked writes. An actual follow-up reply remained co-present in the selected awards-reception scene.

## Scenario polish

- Cards keep equal widths on incomplete rows; the three Explore cards fill their row. Artwork has loading and failure states, while scene previews remain available if an image fails.
- All stories, To continue and Completed filters expose saved progress. Badges preserve location information, search has a clear action, and empty results explain how to recover.
- Progress refreshes on screen focus. Failed progress loads offer retry instead of silently hiding saved state.
- Previews and chat controls have fixed action footers, so their actions remain visible on short mobile screens. Completed scenarios explicitly reopen their existing conversation.
- Scenario navigation uses the existing URL-preserving web helper. A browser regression reproduced the imperative router dropping conversation parameters after a failed start; retry now preserves the correct character and conversation.
- Chat controls show pending save feedback, reject duplicate taps, recover from failed saves and ignore delayed responses after conversation/scope changes.

Validation: application TypeScript and targeted lint; all 729 app tests; production export and asset budget; browser checks at 360/390/768px for fixed actions and overflow, equal desktop card widths, progress filters, completed reopening, failed load/start/pause recovery, and mocked onboarding start. Browser mutations are mocked for the polish pass.

## Scenario locations and routine pause

All 80 starts use canonical world/location mappings stored in a service-only database catalogue. An active scenario owns the companion's presence across chat, profile and media context. Explicit scene movement updates its saved location; resume preserves that location. Routine simulation and ambient messages are held, including database guards against older in-flight workers. Pause, completion, conversation archival and deletion release the hold without replaying routine events.

Character profiles show a lock, scenario title, location, Continue scenario and Plan an event. Creating, editing, cancelling and scheduling plans never pause a scenario. Planning for now saves the plan without automatically joining it. Reminders remain available; expired unjoined plans overlapping a scenario become proposals needing rescheduling, without invented attendance or missed-event penalties. Explicit event/date joining requires confirmation and atomically pauses the scenario; a failed join rolls back the transition.

Validation: 732 app tests; all application/Edge Function TypeScript and lint checks; three database suites covering all 80 placements, routine write protection, saved movement, lifecycle cleanup, event/date confirmation, join rollback, deferred plans and permissions; two Deno scenario tests and 26 scheduled-message regressions. Production browser verification at 390px confirmed the lock card and canonical location, opened the original conversation's planner, created and cancelled a real immediate plan without interrupting the scenario, and checked pause/resume. The test plan was cancelled afterward. Production catalogue has 80 matching locations and zero inconsistent active scenario instances; new RPCs remain inaccessible to authenticated clients. Production export and web asset budget pass.

Migration: 20260910001505_scenario_presence_pause.sql. The migration ledger and repository version are aligned.

The production transaction check also exercises the existing attendance-source constraint. Scenario confirmation remains internal to the transition wrapper; attendance retains the existing app source. Migration 20260910002531_scenario_join_attendance_source.sql records this compatibility fix.

## Relationship controls and scoped resets

Relationship controls opens as a matching frosted popup in chat. The standalone settings entry point uses the same component. It has exactly four actions: Reset relationship progress, Start over with the companion, Reset scenario, and Reset current conversation. Memory and conversation management links were removed from these controls. Confirmation screens explain scope; full start-over retains the removal preview and typed START OVER confirmation. Scenario reset is available only when this conversation has a saved scenario.

Scenario reset replaces only this transcript and restarts the saved scenario at its authored opening/location. Conversation reset replaces only this transcript, with empty context, preserving any scenario's current location and status. Both preserve relationship progression and session counters, shared memories, plans, Moments, generated gallery media, other conversations, and chat preferences. Transcript attachments are removed through existing storage cleanup. Old conversation references cannot accept stale replies into the replacement. Active replies/media must finish before reset. Reset receipts make retries idempotent and are private to the service role.

Validated with 732 app tests, TypeScript, lint, Edge Function typechecks, scenario/database suites including ownership and retry checks, and production rollback transactions comparing relationship state, memory counts, other conversations and both reset outcomes. Browser checks at 360/390/768/1440px verified the live popup, four options, confirmation screens and full-reset lock. No production reset was committed during testing. Production route audit passed all 423 pages and 63 critical assets; asset budget passed.

Applied migrations: 20260910004000_conversation_scoped_resets.sql and 20260910004232_chat_reset_preserve_progress.sql. Frontend release: 72959cc4-46ce-4db2-97f1-136ca3ffe8ee.

## Companion dialogue presentation

Direct and group chat use the same formatter for saved and streaming companion replies. Explicit action markup renders in italics; speech wrappers are removed while ordinary inline quotations, contractions, measurements, links and code are preserved. A conservative legacy parser recognizes narration alongside quoted dialogue in older replies. User messages and stored transcripts are unchanged. Character profile links remain available inside formatted text.

The shared reply prompt requests unquoted speech and asterisk-marked actions or narration, with no added physical stage directions in remote messages. This applies inside structured reply text without changing response schemas.

Validation: 742 app tests, application/domain and Edge Function TypeScript checks, lint, prompt regressions, production export and asset budget. A read-only 390px browser check of an existing conversation verified italic narration and normal unquoted speech without sending messages or changing history.

## Compact Home

The approved Home mockup is connected to saved companion data. One portrait card has a short reply preview, Continue chat, and a small relationship link. Up next shows the active scenario first, otherwise a scheduled/active plan or date, with a compact planning action when nothing is booked. Unlocked date suggestions are not presented as appointments. Scenario chat and planning use the original conversation ID; unrelated conversation previews are excluded while that scenario owns the companion.

Photos, videos and recent moments share a maximum-four-item section, ordered newest first and deduplicated when media illustrates a moment. Empty sharing is hidden; locked media retains its upgrade flow. Relationship details, memories and the daily timeline remain on the companion profile. World discovery moves below personal content in a short illustrated card, using the existing compact world descriptions. Broader companion discovery and world pulse remain in Explore, and Home no longer fetches their full catalogues. Existing account credits, navigation, empty-Life onboarding, media access and high-priority portrait loading are retained.

Validation: 748 app tests, application/domain TypeScript, lint, production build and asset budget. Read-only browser checks at 360/390/768/1440px verified the compact layout, empty sharing, saved chat IDs and event-planner navigation. Browser-only scenario/media/moment fixtures verified active-scenario priority, locked media, populated sharing and conversation routing without changing account data.


## Proactive chat settings (September 10)

Direct Chat settings now has a Proactive tab, with account default, Off, Quiet, Natural and Frequent options. Quiet maps to the existing occasional policy (36-hour minimum proactive gap); Natural stays at 18 hours and Frequent at 8 hours. Recent-chat idle minimums remain 12, 5 and 3 hours. These limits are ceilings on frequency, not promised delivery schedules.

Companion quiet-hour overrides follow the character instance across conversations in its Life. Defaults resolve companion → Life → account. The unchecked “Apply these quiet hours to all my conversations” checkbox replaces quiet-hour overrides in the current Life and sets its default for future companions. With Use default selected, applying to all clears Life overrides back to the account default. Frequency overrides and other Lives are preserved.

Free accounts see locked controls and an upgrade path. Expired or Free entitlements, Off, active scenarios, quiet hours and changed preferences are checked before generation and again before insertion. A database guard serializes proactive delivery against preference changes and delivered-message pacing, preventing queued ambient bursts. Plan reminders remain independent of initiative frequency and observe quiet hours. Existing queued push retries also recheck the companion policy.

Preference RPCs are service-only and verify ownership and Life scope. Companion saves patch only edited fields; the account Notifications page sends only edited companion keys. Group Chat settings retain their existing tabs. Account notification fields introduced by other work are preserved.

Validation: 748 app tests; 1,038 domain tests, including DST transitions and inheritance; 19 targeted Deno delivery/push/initiative tests; PGlite tests for ownership, paid/expired access, quiet boundaries, apply-all scope, queue cancellation, reminders, scenarios, cadence, normal replies and RPC permissions. TypeScript, lint, Edge checks and production bundle budget passed. Browser checks covered paid/Free controls and mocked save payloads at 360, 390, 768 and 1440 px. Live API smoke verified an unchanged-values save, invalid time rejection, foreign companion rejection and privileged RPC protection. Production transaction assertions were rolled back. Migration: 20260910115620_proactive_chat_preferences.sql.
