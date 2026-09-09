# Scenario launch — 9 September 2026

80 scenarios, ten in each of the eight worlds, are accessible in Explore and in the onboarding Scenarios tab. Each has a reviewed landscape cover generated with the built-in ImageGen tool using canonical character, location, or combined references. Public cards expose the premise; development possibilities and opening dialogue remain in the server catalogue.

## Behaviour
- Browse by world and lead gender, search titles/people/places/themes, preview and start.
- One active scenario per conversation; starting a different one pauses the prior scenario.
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
