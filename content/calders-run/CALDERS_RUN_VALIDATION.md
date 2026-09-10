# Calder's Run — validation

**Status: PASSED · 70 / 70 checks passed.**

The supplied final content pack and readable bible were checked together. The bible contains approximately 80,649 whitespace-delimited words, including tables and image prompts.

| Layer | Verified count |
|---|---:|
| Companions | 49 |
| Women / men | 32 / 17 |
| Ages 18–22 / 23–50 | 29 / 20 |
| Spice 3 / 2 / 1 | 24 / 15 / 10 |
| Visitable places / districts | 47 / 6 |
| Total district and place records | 53 |
| Private homes | 49 |
| Baseline weekly rows | 2,058 |
| Directed social connections | 334 |
| Minimum connections per companion | 5 |
| Facts / dialogue opportunities / interaction beats | 185 / 147 / 141 |
| Arcs / weekly opportunities / date blueprints | 14 / 14 / 20 |

Checks cover exact allocation, place matching, family relationships, reference validity, profile depth, complete weekly intervals, visitor hours, event overlays, private facts, initial hideout access, and honest asset status. Detailed results and checksums are in `validation.json`.

## Practical limits

- Authoring consistency verified; no production importer or runtime has been executed.
- Event overlays specify travel reservation semantics; the production resolver must implement and test that contract.
- Images are prompts only and are correctly marked not_generated.
- This is fictional worldbuilding; sources inform period texture, not certification of every invented detail.
