# Location activity display polish — September 15, 2026

Found the reported wording in internal activityNotes on 45 live Vharadren locations. The location page rendered that field directly under Things to do.

- Added a separate activityDescriptions field and 93 display descriptions matched to current catalogue activities; populated 204 live locations without modifying internal lore/rules.
- The UI never renders activityNotes as display copy. Known activities have concrete descriptions; unknown activities omit the subtitle rather than manufacture filler or availability.
- Rejects instruction-like activity labels and descriptions before rendering. Kept ordinary discussion of consent valid; this is not a content-policy change.
- Activity selection creates a grammatical request to plan a visit. Closed venues show the published reopening time and explain that this plans a later visit. Existing world access, character eligibility, scene-entry and plan checks remain responsible for availability; the UI does not guess story unlocks from prose.
- Updated both generic location seeds and the Vharadren generator, plus the checked-in Vharadren catalogue.
- Production migration 20260915165827 applied. Pre/post hash of all existing canonical lore excluding the new display field matched: 3d72d82856d6041f68223695028ec6b3.
- App TypeScript and all 1,128 domain tests passed, including new leakage, normalization, fallback and planning prompt cases.
- Web rollout includes the renderer fix. Existing native builds need their next binary update; internal activity notes intentionally remain available to the runtime.
