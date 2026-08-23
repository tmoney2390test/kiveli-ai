# Kivelle group chat

Persistent group chat uses the same canonical Kivelle conversations, messages, character instances, relationships, memories, social state, provider routing, and world simulation as direct chat. It is not a fan-out wrapper around direct dialogue.

## Runtime flow

1. `together-group-dialogue` verifies the user, active Life, paid `group_chat` entitlement, group conversation, and active roster.
2. A database RPC locks the conversation and acquires its one expiring conversational floor. A planning turn cannot be superseded during setup; once generating, a new group message atomically cancels it and takes the floor. Direct chat uses the same primitive but rejects a competing cross-device turn instead of superseding it.
3. The deterministic Group Director resolves manual selection, replies, mentions, names, broad-group intent, availability, social signals, and floor debt. Only a close ambiguous score may use the inexpensive OpenAI Director, controlled by `KIVELLE_GROUP_DIRECTOR_ENABLED`; it chooses a speaker or silence and never writes dialogue.
4. Only a selected speaker receives an expensive context build. `buildIsolatedSpeakerContext()` reloads that character's template/version, relationship, reflection, user view, voice, memories, life state, and witness-bounded attributed group history from canonical storage.
5. Content/age/relationship/provider eligibility is resolved independently for that speaker.
6. PostgreSQL atomically commits a message or reaction only while the turn version and lease remain current and the participant remains active. Long bounded exchanges renew the lease. This prevents late responses after interruption, removal, archival, or an expired worker.
7. After every committed character message the Director re-evaluates the floor from the live roster and new attributed history. Final turns update participant-specific attributed summaries, materialize durable group-visible facts only for legitimate witnesses, and apply bounded semantic character-to-character social events.

## Membership and knowledge

`together_conversation_participants` is authoritative for groups. Each membership interval has `witnessed_from_sequence` and `witnessed_to_sequence`. A late participant may render older UI history, but their model context starts at their join boundary. A removed participant stops witnessing new turns while retaining memories legitimately learned before leaving.

Every persistent group is scoped to one canonical world. All participants must have exactly one authored `resident` world and it must match `together_conversations.group_world_id`; temporary travel or visitor presence does not make a companion eligible for another world's group. Creation, scene bridging, later additions, and direct database writes all enforce this invariant.

Private direct-message memory remains stored per character instance and is never copied merely because characters share a group. Stable facts spoken in a group are materialized independently for active witnesses with `visibility = group_visible` and the learned sequence.

## Product access

`group_chat` is included with Kivelle+ and Kivelle Max. Every management and dialogue endpoint enforces it server-side. `test7@test.com` has an explicit metadata entitlement grant for production testing; runtime code contains no email bypass.

## Shared Scenes

Shared Scenes remain physically co-present, schedule/location constrained experiences. Their speakers now use the same deterministic floor planner, floor-debt signals, bounded post-message continuation check, attributed history, isolated context boundary, bounded semantic social effects, and canonical attributed reactions. The `together-group` `create_from_scene` action bridges a scene into a persistent remote group using only participant/witness-safe context.

## Group media

Group chat reuses canonical user-image uploads, inline credit confirmation, generated-media storage, and per-speaker voice-note playback. The camera menu lets the user choose one companion or exactly two companions; typed requests resolve explicit names, “both,” or “together” against the active roster. Requests that resolve to more than two people stop before an offer is created and ask the user to choose two.

Two-person photos remain one canonical generation job rather than one image per companion. Ordered subject IDs are validated at the API and database boundaries, every subject independently passes ownership, active-membership, adult/content, relationship, and boundary checks, and each companion must have a canonical identity reference. The group prompt binds reference image 1/2 to named left/right subjects and quality review checks subject count, identity fidelity, swaps, blending, missing people, and extra people.

When both companions are canonically at the same location the result may visualize that shared setting. Otherwise Kivelle marks it as a staged group portrait and does not mutate presence or imply that the photo is a witnessed world event. A configured provider route must support at least two identity references; unsupported content levels fail before credits are spent. Two-person video animation is intentionally unavailable in this first release because the current video route accepts only one reference frame.

`subject_character_instance_ids[]` remains the compatibility field used by current APIs. `together_generated_media_subjects` and `together_media_offer_subjects` provide normalized, ordered rosters for auditing and future media extensions. Multi-character generation beyond two subjects remains intentionally deferred.
