# Character conversation contract

Every `together_character_versions` row must contain a valid
`character_bible.voice.curiosity` profile. Migration
`202608210008_kivelle_conversational_reciprocity.sql` backfills all existing
versions, creates deterministic profiles for legacy creation paths, rejects
malformed profiles, and prevents a published/selectable template from pointing
at a version without one.

Required shape:

```json
{
  "domains": ["at least", "two subjects"],
  "style": "observant_selective | direct_specific | teasing_playful | warm_reflective | analytical_precise",
  "disclosureBeforeQuestion": "rare | sometimes | usually",
  "preferredMoves": {
    "casual": ["At least one authored conversational move."]
  },
  "avoids": ["generic interview questions"]
}
```

Roster authors should provide character-specific domains and moves. The
database fallback guarantees validity for older callers, but it is not a
replacement for authored identity. Creator Studio and quick-create derive a
stable profile from interests, occupation, personality, and communication
style.

At runtime, `compileResponseBrief()` derives reciprocity from recent turns and
produces a structured handoff. The AI Director may refine an authorized
current-message handoff but cannot invent continuity callbacks. Due open-thread
follow-ups can be initiated once, are persisted only after the assistant
message succeeds, and are then deduplicated.

Set `KIVELLE_CONVERSATIONAL_HANDOFFS_ENABLED=false` as a server-side emergency
kill switch. It defaults to enabled and is not a subscription feature.

## Character performance and danger

Every character version also carries `character_bible.performance` version 1.
This applies to the entire catalog, historical versions used by existing
instances, private custom companions, quick creation, Creator Studio, and
future world-pack/SQL imports. It is independent of subscription tier and
world. The migration backfills existing versions and the database trigger
supplies a compatibility seed for future writers:

```json
{"version": 1, "source": "derived"}
```

`normalizeCharacterPerformance()` resolves that seed from the current authored
traits, occupation, ambition, contradiction, and defenses on each load. There
is no name/world allowlist and no provider call on a dialogue turn. Derived
profiles follow identity edits; authored profiles retain their explicit
overrides. Existing biographies, canonical history, appearance, schedules,
relationships, and intimacy decisions are not rewritten.

New authored rosters should supply a full profile. Each of `relaxed`,
`threatened`, `angry`, `vulnerable`, and `aftermath` needs `behavior`, `speech`,
and two to six short `examples`, alongside a concrete `motivation`,
`contradiction`, and `defense`. Use `source: "authored"` and `version: 1`.
Incomplete explicitly stored profiles fail database validation. The creator
provider requests the full profile, and both creation paths persist it.
Creator Studio promotes it inside the existing finalization transaction.

Write behavior as an observable response to pressure. “Protective” is a trait;
“becomes economical with words, checks what they can actually protect, then
admits a limit” is behavior. The character's own goals and competing loyalties
must give the response its meaning. Do not copy one conversational move across
the whole roster. Reference utterances demonstrate rhythm, not canonical
events, memories, catchphrases to repeat, or guaranteed outcomes. Keep the
person's era and language register. Plain and unfinished sentences are valid;
not every reply should be an aphorism, professional metaphor, or confession.

The shared voice card chooses only the relevant performance state and up to
two examples, avoids examples recently used by that speaker, and suppresses
anecdotes and verbal flourishes during immediate danger. Direct and group
chat use the same compiler; each speaker receives their own private profile
and already-filtered visible history. Story dialogue retains its authored
speech fingerprint and also consumes the shared behavior selection.

`assessScenePressure()` runs before ordinary keyword-based social intent. It
distinguishes immediate danger, uncertain pressure, aftermath, and ordinary
conversation. Short continuations may inherit a visible recent threat;
explicit resolution closes it and an unrelated topic releases it. This is a
conservative English recognizer, not a semantic proof or multilingual action
resolver. Unrecognized wording remains available to the dialogue model as
conversation context; it must never become an irreversible state change from
an uncertain classification. Remote speakers cannot invent physical arrival.
Pressure affects expression; it does not alter content permissions, intimacy
agreement logic, user agency, or canonical outcomes. SMS/paragraph preferences
remain authoritative for delivery.

Death and resurrection are stricter. `deriveCharacterLifeTransition()` must
identify the grammatical target of an explicit completed outcome. A speaker
selection or mention is insufficient. Unrelated objects, injuries without an
explicit death, threats, attempts, quotations, hypotheticals, and ambiguous
third-person references fail closed. New language support must demonstrate
actor/target/completion regression cases before it can persist life state.

Prompt compaction selects named semantic fields rather than the first JSON
keys. Preserve psychology, current priorities, authored boundaries, current
pressure, selected voice, persona, and canonical scene truth. Select a voice
card before compacting the bible, and omit instructions for unrelated empty
optional context. Do not reintroduce the entire performance/anecdote catalog
into each prompt.

### Review and rollout

Run the domain tests, the relevant Edge Function typechecks and dialogue
tests, and `supabase/tests/152_kivelle_character_performance.sql`. Apply
`202609060005_kivelle_character_performance.sql` before deploying the updated
creator handlers; existing versions immediately gain the compatibility seed.
The runtime also supports pre-migration bibles, so direct/group dialogue does
not require a catalog rewrite. No past accidental death is automatically
reversed: remediation requires identifying the original erroneous event.

Before publishing a new world or character, compare blind dialogue samples
for ordinary chat, fear, anger, vulnerability, aftermath, and group reaction.
Use the same scenario and hide character names. Review voice distinction,
concrete motivation, appropriate uncertainty, proportionate stress response,
no invented user action, and consistency across several turns. Unit tests
verify routing and preservation; they do not establish live model quality.
