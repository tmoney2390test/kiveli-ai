# Eos Meridian editorial enrichment

Implemented from the September 14 editorial proposal. Current colony year remains 38. This is a content change, not a new companion, NSFW policy, UI, or whole-world state system.

## Authored scope

- All 47 existing selectable adults retain their identities, appearance, voice, spice, romance styles, boundaries, original hooks and date scenes. Added individual immediate goals, ambitions, ordinary wishes, private concerns, named relationship tensions, origin records, dated milestones and concrete first-meeting scenes.
- Year 20 dates the later Lyra emergency and contract renewal. Year 0 and its seventeen missing hours remain separate. Older landing residents were children, not adult officials; heritage does not imply personal knowledge of present-day Earth countries.
- Six districts gain different social habits and disagreements; 12 existing venues gain history, regulars, etiquette, disputed uses and unresolved pressures.
- Sabine Holt, Ansel Keene and Ivo Serrat are supporting people in relevant place/story context, not selectable or romance-enabled templates. There are still 47 companions and 54 map entries (6 districts plus 48 venues).
- Six arcs have 18 distinct evidence/choice chapters. The Ghost Passenger accepts friendship. No global vote result, signal origin, automatic access to Lyra, or compulsory romance is authored.
- Eight recurring events gain variations; The Rain Is Cancelled adds a ninth, scoped to the user's story, with no global closure side effect. Seven culture/chronology facts bring the fact catalogue to 37.
- Profession-specific rosters provide two days off, private personal commitments and venue-hour-safe intervals. Existing plans and generated schedule events are not deleted. New rosters take effect as future schedule windows are generated; this deliberately avoids moving characters mid-scene or interrupting scenarios.
- Eight directed perspectives add asymmetry to four established bonds without replacing their relationship labels or original histories.

## Runtime integration and limits

Character goals use the existing `currentGoals`, `ambitions` and `concerns` fields consumed by `compileCharacterGoals`; detailed histories live within the existing character bible. Places use the existing publicHistory, conversationHooks, localEtiquette, storySeeds and recurringPeople retrieval fields. No parallel retrieval system is introduced.

Private concerns are character-specific. The writing explicitly distinguishes firsthand knowledge, disclosures, public information and inference. Existing session decisions override the starting situation. This content pass does not claim to add a deterministic cross-character privacy enforcement engine.

The story engine currently advances chapters on timers. The rewritten chapters therefore introduce evidence and unresolved choices, and never assert that a choice occurred because time elapsed. They retain chapter IDs for existing instances. Proactive chapter messages and automatic milestone-photo creation are disabled for these six rewritten arcs so an unplayed decision is not presented as a completed achievement. Existing player outcomes are untouched. A dedicated branching/choice persistence system and automatic map/exhibit changes remain separate work; no such behavior is simulated with global database writes here.

There are no new locations, mandatory romance scenes, automatic job departures, resolved elections, or forced cancellations of player plans. Sora's offer remains real and does not disappear to prove affection. More recurring events can follow after validating that these stories retain continuity in live conversations.

## Content preservation and release

The new migration is additive. It merges character-bible additions, appends lore arrays, preserves existing goals, and updates only the known boilerplate first-meeting opener. A custom live opener is retained. Existing mature event content is not rewritten. Character rows are checked inside the transaction to prevent changes outside the allowed narrative keys. Media, anatomy, adult character material, relationship configuration and user data are not rewritten.

Historical Eos migrations remain unchanged. `node scripts/build-eos-meridian-content.mjs` refreshes the app's generated world module; historical migration rewriting requires the explicit maintenance flag `--rewrite-legacy-migrations` and is not part of deployment. `node scripts/build-eos-meridian-enrichment.mjs` regenerates the new forward migration.

Validation:

```text
node --test scripts/eos-meridian-enrichment.test.mjs scripts/eos-meridian-enrichment-db.test.mjs
pnpm --filter @together/app typecheck
pnpm --filter @together/app exec vitest run src/worlds/eos-meridian.test.ts
```

The content test fingerprints all original character fields except firstMeeting, removing only the four added bible keys, plus every date scene and adult world fact. The fingerprint was captured before this pass. The in-memory PostgreSQL test applies the migration twice and checks adult-field preservation, retained custom intros, unchanged player outcomes, schedule coverage and idempotency. It is a focused schema fixture, not a production migration rehearsal.

Before deployment, compare the target database's Eos template/version IDs and custom introduction count, take the normal database backup, apply the forward migration and verify live counts and representative dialogue retrieval. Existing schedules will transition naturally. Web catalogue changes require a web release; no native app build has been made by this implementation.
