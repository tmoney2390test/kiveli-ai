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
