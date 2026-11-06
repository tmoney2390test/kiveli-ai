# Kivelli Homes — Eos Meridian pilot

## Scope and current state

Sitewide code, Eos-only authored rollout: 67 existing resident home records, three permanent personal details and six activities each. No second home database. Other worlds retain their existing home descriptions and schedules; their visits are not enabled.

Released to production web on November 5, 2026. The Eos-only migration is applied and recorded, affected backend functions are deployed, and all 67 interiors were generated through the configured provider, visually inspected, and approved. All 134 original/thumbnail URLs return valid images. Other worlds have zero homes enabled for visits. No native build was made.

Cloudflare web version: `a5dfcd2a-8a8e-426e-b3ad-468aac848233`. The live home route and its five script assets match the built release. Catalog artwork jobs use server credentials and do not charge user credits. The provider did not return billed costs for these jobs, so their null cost values are not a zero-cost claim.

## Reused systems and gaps filled

| Existing system | Home integration |
| --- | --- |
| `together_character_homes` | Canonical descriptions, three details, activities, invitation settings and approved artwork pointer. |
| UUID locations, shared plans and scene sessions | Private per-account location adapters reference the canonical home; they are not user-created homes or quota consumption. |
| Character profiles and shared planner | Home card and detail route, plus Their home/My home shortcuts. |
| Life Engine and schedules | Presence and availability remain authoritative; no parallel presence simulation. |
| Relationship state, memory and continuity | Submission/arrival checks use owned conversation context, saved guidance and current conflict. |
| Conversation actions | Expiring invitations use `plan_create`, existing confirmation, cancellation and idempotent plans. |
| World Pulse | Existing resident-world events may motivate company within 24 hours; no new event generator or invented event attendance. |
| Existing image provider and Storage | Explicit one-shot artwork jobs, immutable history, approval/restoration, cached thumbnails. |
| Photo/video media context | Identity references stay separate from home environment references; virtual home snapshots retain their artwork IDs. |
| Ops | Admin-only Homes panel edits details and runs/reviews artwork jobs. |

## Authored examples

- Nia Calder: a modest rover-yard flat, patched cushions, a hand-cranked model rover, a shuttle waiting for paint, and a repaired radio. Personal activities: run the tabletop rover course or paint the shuttle.
- Commander Rhea Navarro: quarters suited to her senior role, with a communications console and flight-related personal equipment. Activities remain social uses of authorized equipment, not access to classified systems.
- Hana Petrov: her own domestic space and painting supplies. The swimming bag links to her interest; it does not put a public swimming pool inside her home.
- Liora Haddad: private home details and plant interests, distinct from the public orchard where she works.

Authored content: `content/homes/eos-meridian.mjs` and `content/homes/eos-interiors.mjs`. Each resident has a distinct interior direction and window outlook. The original migration is already applied; make subsequent production changes in a new migration rather than rewriting that history.

## Behavior

Viewing a home or asking about it does not create a visit, move a character, send a message, spend credits, or generate artwork. Ask opens an editable chat draft. Activities open the existing planner and then use structured plans/scenes in the existing chat.

Strangers normally suggest meeting elsewhere. Acquaintances and closer relationships generally accept; full affinity accepts unless a concrete current conflict or boundary applies. Saved home permission overrides ordinary unfamiliarity. A plan note does not count as permission. A short submission-time contextual check uses the existing director; clear saved rules and relationship state provide the fallback if the provider is unavailable. Other characters’ private transcripts and memories are excluded. Group plans include the resident host and check every companion when visiting the user's home.

Invitations only follow a successful active conversation turn, while the character is at their own home and available for at least 45 minutes. Quiet hours, opt-outs, imminent plans and pending actions suppress them. A stable sparse turn sample prevents rerolls; the database enforces at most one home invitation per user/day, one per companion/7 days, and no repeated activity within 30 days. Offers expire within two hours or when current availability ends. A dismissed/expired invitation does not grant access. Offers may be for either home; the user's home must be in the same world.

Opening or polling the home never queues an image. An admin starts a queued job explicitly. Concurrency leases prevent duplicate purchases; failures are recorded, not automatically retried. A replacement remains unapproved until selected in Ops. Approving/restoring refreshes the existing visit adapters and keeps the previous images and reference history.

## Verification

- Application/domain and home server suite: 301 files, 2,472 passing tests before the final relationship-stage regression test was added. The affected home/auth suite then passed all 15 tests. TypeScript and production web export pass configuration and performance-budget checks (home startup 1.050 MiB gzip, within the configured limit). All 41 affected edge entry points compile; the 13 affected by the final stage fix were rechecked and redeployed.
- Six passing isolated PostgreSQL migration tests using current table definitions, the actual reference uniqueness constraint, authenticated-role mutations, quota handling, two-user image references, restoration, invitation eligibility and cooldowns.
- Server tests for relationship decisions, conversation scope, group membership, saved guidance, expired/dismissed invitations, provider failures, upload/thumbnail failures, concurrent workers and explicit approvals.
- 71 passing Deno tests for home image prompts/snapshots plus existing location, clock, plan, group photo, video, retry and media-offer behavior.
- Browser component fixtures at phone/tablet/desktop sizes; editable draft navigation, activity-to-planner selection, and Their home/My home. These use the real home and planner components with mocked data/services; they do not replace real-device verification.
- Two content checks cover all 67 distinct home directions, personal details, shared activities and 134 character-specific activities. Together with the six migration tests, eight Node tests pass.
- Live production API checks under an isolated temporary account: home detail/artwork, idempotent private adapter, personal-place quota exclusion, unauthorized adapter changes, stranger refusal, saved home permission, full affinity, canonical friendship stage, current serious conflict, My home, and group plans at both destinations. A second group participant's conflict correctly prevents the plan and identifies that companion. Saved guidance and the group roster were isolated test fixtures; the actual planner endpoint processed each request. The temporary account and private data were removed.
- The production artwork dispatcher rejects unauthenticated requests. Database security advisor results contained no findings for the new home tables/functions.

## Operational notes and verification limits

The rollout applied only `20261105200017_character_home_visits_pilot.sql`; it did not push unrelated pending migrations. Deployment included all transitive backend consumers. Artwork release/review scripts are `scripts/release-eos-home-artwork.mjs` and `scripts/review-home-artwork-sheets.mjs`. They resume existing queued jobs, retain immutable originals and require an explicit reviewed manifest before approval. Existing approvals are skipped on reruns.

All 67 live interior generations and the planning checks above are complete. Photo/video context, animation environment preservation, arrival rechecks, invitation cooldown/expiry and artwork restoration have automated regression coverage. This release did not purchase a live photo/video for every resident or run an authenticated full-browser end-to-end session; the browser checks used component fixtures plus public production route/asset verification. Native device verification remains part of the next separately authorized native release.

If a future artwork provider call fails, retain the previous approved image. New artwork remains unapproved until inspected in Ops; navigation never queues a paid generation.
