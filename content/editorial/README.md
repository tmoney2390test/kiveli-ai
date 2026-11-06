# Public copy polish

The three character biography files record the reviewed public text for 212 published canonical residents. The matching additive migrations update only records whose previous biography still matches the reviewed source. Custom companions and later editorial changes are left alone.

The place migration applies the same exact-match rule to five canonical descriptions and their public lore summaries. Scenario copy is maintained in `content/scenarios/runtime-catalog.json` and `scripts/storyline-scenario-editorial.mjs`; run `node scripts/build-storyline-scenarios.mjs` after editing either source.

Keep public bios short and concrete: what the character does, how they come across, and one specific tension when useful. Private desires, secret plot solutions, trait lists, and writing instructions belong in character or story data, not the public introduction.
