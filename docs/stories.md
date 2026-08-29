# Kivelli Stories

Kivelli Stories is a namespaced anthology system inside the authenticated Kivelli app. It reuses authentication, the responsive shell, provider telemetry, and safe dialogue infrastructure while deliberately keeping campaign saves, transcripts, discoveries, and character state separate from normal companion relationships and memories.

## Story Director architecture

`packages/together-domain/src/stories.ts` is the deterministic authority for time, travel, schedules, interactions, evidence, deductions, loop resets, and endings. `story-director.ts` resolves character overlays, participation tiers, reveal authorization, structured AI output, emotional transitions, safe ambient fallback, and pluggable persistence policies. Canonical hidden content lives server-side in `kivelle-stories-content.ts`.

The dialogue path is deliberately narrow:

1. Load and compatibility-upgrade the authoritative campaign state.
2. Classify or validate the player intent.
3. Resolve the active character packet and current location packet.
4. Evaluate fact, belief, lie, lead, action, and emotional-transition permissions deterministically.
5. Send only the permitted context to the configured Kivelli AI provider.
6. Parse structured output and validate every referenced identifier.
7. Replace invalid output with a safe in-character fallback.
8. Apply only validated state changes and persist the action once with optimistic versioning and idempotency.

Travel, schedules, evidence inspection, deductions, resets, and endings never require an AI call. Story messages and state stay in Story tables and do not write normal companion memories or relationship progression.

The client exposes `/stories`, `/stories/[slug]`, and `/stories/play/[campaignId]`. The supplied library, map, timeline, and conversation concepts are packaged core artwork rather than remote dependencies. The playable surface supports current scene, conversations, travel, learned character presence, known timeline, inspectable evidence, dossiers, pinning a lead/person/event, loop recap, ending archives, and campaign-scoped text, sound, motion, and story-tone settings on web and native layouts.

Character presence is canonical rather than decorative. The domain engine derives a bounded next-departure forecast from the same conditional schedule resolver used to commit movement. Dialogue crossing a boundary receives the validated transition and an authored character-specific exit voice. Follow is a server action with a preflight catchability estimate, at most one safe reroute, a missed-encounter trace when necessary, and a one-use reunion cue that resumes the character’s private open thread. Waiting, leaving a note, and asking nearby are also bounded actions. Movement rows remain idempotent in the existing Story transcript; core/focused transitions are shown individually while unrelated ambient churn is collapsed. The client never receives a full hidden schedule.

## Content packs and versioning

A `StoryDefinition` is a versioned, server-owned content pack. It references the base Kivelli world, portraits, identity, and location slugs while overlaying story-only roles, objectives, schedules, knowledge, beliefs, lies, reveal rules, emotions, scene states, actions, evidence, deductions, endings, theme, and AI instructions.

Participation tiers are explicit:

- `core`: complete story packet, several authored moments, and possible finale involvement.
- `supporting`: deterministic schedule plus bounded clue, corroboration, or personal-truth content.
- `ambient`: ordinary characterization and public atmosphere only; never receives critical facts.
- `excluded`: omitted from the story.

An existing world character or location named in `knownBaseCharacterIds` or `knownBaseLocationIds` safely resolves to an ambient packet when no richer overlay exists. This prevents crashes without expanding their knowledge.

Vespormoor v2 includes 12 core characters, explicit supporting/ambient assignments for all 47 residents, 10 authored scene locations, and safe resolution for all 51 current Vespormoor location/district slugs.

## Persistence and compatibility

The `StoryPersistencePolicy` registry owns campaign/loop lifecycle behavior. Vespormoor uses `knowledge-persists-loop-resets`: validated evidence, deductions, persistent flags, and loop history survive; current-loop physical state, schedules, presented evidence, exhausted topics, and ordinary emotions reset. The registry accepts other policies without changing the UI or Story Director.

Campaigns store their content version and persistence-policy ID. V1 checkpoints are upgraded in memory, retain discovered facts and progress, receive any missing character state defaults, and save as v2 on the next successful action. Generic server-authored opening messages replace the old Elara client special case.

## Database and privacy

Migration `202608280001_kivelli_stories_v1.sql` creates definitions, campaigns, actions, messages, and discoveries. Migration `202608280002_kivelli_story_director_v2.sql` additively records content version and persistence policy and marks compatible Vespormoor checkpoints without resetting progress. Campaign data is private under user-scoped RLS. Direct client writes are not granted; service-owned RPC persistence verifies campaign ownership, expected version, and idempotency key in one transaction.

Hidden canonical descriptions, reveal prerequisites, and undiscovered timeline details are never serialized to the client. Client evidence uses an explicit allowlist projection instead of object spreading.

## Configuration

```text
KIVELLE_STORIES_ENABLED=true
KIVELLE_STORIES_ACCESS_ENTITLEMENT=
KIVELLE_STORY_DIALOGUE_MODEL=gpt-5.6-luna
KIVELLE_STORY_INSPECTOR_ENABLED=false
OPENAI_API_KEY=...
```

The feature fails closed when explicitly disabled. Leave the entitlement variable empty to allow all authenticated accounts. Without an OpenAI key, conversations use the deterministic fallback and gameplay remains functional.

The Story Director inspector is available only when explicitly enabled in a non-production environment. It reports content version, loop/time/location, the selected schedule block, departure forecast, Follow preflight, one-use reunion cue, evaluated schedule windows, emotion state, knowledge/belief/lie IDs, permitted and locked reveals, actions, persistence boundaries, the last validated AI output, and rejected IDs.

## Authoring workflow

Run `pnpm stories:validate` after every content edit. Critical errors fail the command; warnings identify legal but thin content such as missing scene-state variants or one-way routes.

### Add a core character

Reference an existing character ID, define a deterministic schedule, and add a `storyProfile` with `participationTier: 'core'`, distinct objective/strategy/mannerisms, known fact IDs, reveal rules, emotional transitions, and authored opening/confrontation beats. A fact in `knownFactIds` remains unavailable until a matching reveal rule passes.

### Add an ambient override

Add the existing character to the pack with `participationTier: 'ambient'`, an ordinary schedule, public role/biography, and no critical facts. Characters in `knownBaseCharacterIds` also receive this behavior automatically.

### Add a location state

Reference the base location slug and provide normal `arrivalNarration`, `alteredNarration`, `lateNightNarration`, travel costs, sensory vocabulary, and optional structured environmental states. State changes must be backed by deterministic flags/actions.

### Add a fact and reveal rule

Create a stable evidence/fact ID with player-safe and hidden canonical descriptions, routes, prerequisites, knowledge ownership, and persistence behavior. Add the fact to the character’s `knownFactIds`, then add a `fact` reveal rule with deterministic intent, evidence, trust, suspicion, emotion, time, location, loop, and exhaustion requirements as needed.

Mistaken beliefs and intentional lies use separate IDs under `mistakenBeliefs` and `intentionalLies`; they are never added to canonical evidence or used to satisfy deductions.

### Add a scene action

Create a stable interaction ID with location, positive time cost, requirements, authored narration, discoveries, flags, repeatability, and persistence. AI may propose only an existing action ID; the server validates it before display or execution.

### Add a persistence policy

Implement `StoryPersistencePolicy`, register it once, and reference its ID from the content pack. Keep story-specific reset behavior in the adapter instead of branching the shared UI or dialogue handler.

### Add a new story pack

Create and validate a versioned `StoryDefinition`, register it in the server definition resolver, add spoiler-safe catalog metadata and packaged art, seed the definition metadata, and cover the pack with domain and database tests. Do not place hidden content in the client catalog, base world metadata, or normal companion biography.

## Authored behavior examples

These are voice/scene QA examples, not hardcoded replies:

- **Elara:** “You reached for the token before I offered it. Good. Don’t explain—tell me what the bell does after the twelfth strike.” She warns, withholds, and tests memory.
- **Celeste:** “Grief is not evidence. Neither is fear. Bring me one reading the Engine cannot explain, and I’ll give you access to the lower array.” She negotiates and rationalizes.
- **Owen:** “There’s a rest in the music that wasn’t there yesterday. When I play through it, the lake answers from somewhere under my ribs.” He uses sensation and fragmented musical memory.
- **Zuri:** “Observation: the needle moves eleven seconds early. Hypothesis: it’s counting us, not the sky. Predict the next jump.” She distinguishes measurement from inference.
- **Marcus:** “This page isn’t blank. Blank paper still carries the hand that touched it. This has the shape of something removed.” He interprets unnatural absence.
- **Luca:** “I can show you the time in my private ledger, or protect the person who wrote it. Decide which proof you actually need.” He trades bounded secrets and protects sources.

Scene QA examples:

- **Bell Tower:** normal trembling mechanism; altered synchronization teeth after intervention; the tower seems to breathe near midnight.
- **Observatory:** cold rotating instruments; calculations forced off course; every needle leans toward midnight during escalation.
- **Lake Vesper:** deliberate underwater lights; a stuttering circuit after disruption; fog and gathered lights near midnight.
- **Blackglass Archives:** indexed silence; an erased name restored to the catalog; restricted doors opening for the final audit.
- **Black Lantern:** warm shelter and ordinary gossip; one object displaced by player action; conversation thinning around skipped minutes.

The current v2 pack remains content-driven but could be deepened with additional supporting-character alibis, more branch-specific schedule overrides, and unique artwork/audio for ambient locations. Those are additive authoring improvements, not engine blockers.

## Rollout and operations

Apply the migration, deploy `together-stories` and `together-story-dialogue`, set feature configuration, and publish the web build. Safe analytics record story entry, campaign lifecycle, actions, evidence counts, loops, endings, provider/model, latency, and fallback status—never message or clue text. Provider failure does not block deterministic actions or saves.
