# Calder's Run — implementation handoff

The authoring pack expands the commissioned frontier world to 49 companions and 47 visitable places. Preserve this content and build an adapter to the current repository schema. The pack is a source of canon, not an already deployed migration.

## Scope that must survive import

- World name: **Calder's Run**; slug: `calders-run`; diegetic year: **1888**.
- **49 companions: 32 women, 17 men.** The original 45-person core remains; C46/C47 are male bandits, C48/C49 are unrelated female brothel workers.
- **29 aged 18–22; 20 aged 23–50.** All are adults. Do not copy Vharadren-specific minimum-age assertions.
- **Spice 3/2/1 = 24/15/10**, rounded from 50/30/20 for 49 people.
- **47 visitable places**, including **The Red Sash** (P46) and **Crowcut Hollow** (P47), plus **6 district nodes** = **53 location records**.
- C01–C45 each have a distinct primary place. C46/C47 share P47; C48/C49 share P46.
- **49 private home records**, with owner-specific access. They are not public place count inflation.
- **2,058 baseline schedule rows; 334 directed bonds; 185 facts; 147 dialogue opportunities; 141 interaction beats; 14 arcs; 14 events; 20 date blueprints; 7 factions.**

## Files

- `CALDERS_RUN_WORLD_BIBLE.md`: readable complete canon, profiles, places, weekly tables, arcs, and creative direction.
- `calders_run_content_pack.json`: normalized authoring data with stable authoring UUIDs and explicit references.
- `authoring/`: hand-authored biographies, places, world, social facts, stories, and roster.
- `build.py`: deterministic standard-library build of the bible, JSON, and this handoff.
- `validate.py`: count, reference, access, schedule, disclosure, and coverage validation.
- `CALDERS_RUN_VALIDATION.md` and `validation.json`: results from the supplied final files.

## Repository adaptation

The benchmark was the original Vharadren bible and the current world-specific generator in `tmoney2390test/kiveli-ai`. Do not assume that generator is a generic importer. Inspect the actual target branch and its schema before integration. In particular, check required character fields, IDs, age bounds, gender encoding, spice meaning, location kinds, private-home handling, schedule columns, knowledge gates, and media fields.

`schemaVersion` is `calders-run-authoring-pack-v1`. `metadata.compatibility.requiresAdapter` is true. UUIDv5 values are deterministic authoring identities based on entity kind and slug, not pre-reserved production IDs. Keep a mapping if production IDs differ. Preflight collisions, use a transaction or staged import where supported, and make repeat imports idempotent.

Map narrative fields without replacing specific prose with generic templates. The source does not invent sexual-anatomy fields to satisfy an unrelated generator. If the target requires additional fields, resolve their treatment explicitly in the adapter rather than silently fabricating canon.

## Retrieval and private knowledge

Do not send this entire authoring pack to a player-facing model. Filter by saved world, location access, actual participant, disclosure state, and chosen story outcome. Author-only private truths, closed records, unchosen endings, and undiscovered hideout details must remain outside public prompts. Ordinary public facts can be retrieved locally without granting access to all social history.

The Crowcut location truth is compound. Silas knows his own pre-theft decision; Cole initially knows his participation and later discovery only. The fact record contains an explicit partial-knowledge entry. Do not infer that every resident knows every private location fact.

Kinship edges are fixed family history and are excluded from NPC romance. Bess and Sabine are unrelated. Occupational attention and paid appointments do not establish personal attraction or change a character's work by implication.

## Time and transitions

Baseline: seven days, six contiguous intervals per day, minutes 0–1440, Sunday index 0, user-local simulation clock. `baselineArrivalMinute` reserves the leading travel time when locations change. The character is in transit before that point.

Recurring events are explicit overlays, with exact hours and participants. An activated event reserves its scene and inbound/outbound travel, splitting or replacing affected baseline minutes. Reserve travel before accepting a conflicting appointment. A failed gate preserves the baseline; a private invitation is not inferred from a public venue being open. Event attendance does not make an employer's business close automatically.

Use this priority: saved consequential story transition → accepted appointment/date → active recurring event with travel → baseline. Test the actual runtime resolver on a cross-river trip, overlapping event interval, private home visit, and unmet Crowcut gate. The supplied validator checks authoring consistency; it does not claim to have tested an unimplemented production adapter.

The bridge is unfinished at launch and cannot serve as a default crossing. A ferry closure or severe weather requires a canceled or saved alternative journey. Arc resolutions update affected facts, access, employment, and schedules as one coherent transition. A tour, surrender, departure, relocation, or house purchase does not happen merely because the narrator mentions it.

## Art and release

All image slots are `not_generated`. The pack includes a world hero brief, six district prompts, 47 place prompts, 49 clothed adult portrait prompts, and 49 private-room prompts. Generate and inspect them against individual ages, appearance, work, and period design before declaring media readiness.

This delivery creates the world bible and authoring content. It does not modify the repository, import a database, or publish the world. Run the adapter's own real checks and release process when implementation is requested.

## Rebuild and verify

From this directory, run `python build.py` and then `python validate.py`. The package uses only Python's standard library. The generated artifacts and source ship together so later content changes can be regenerated and checked.
