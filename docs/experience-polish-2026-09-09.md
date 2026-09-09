# Experience polish — 2026-09-09

Implemented the approved browsing, profile, chat, Calder's Run, and mobile pass.

## Changes

- Discover, Explore, and companion creation share visual world cards with clear selection and localized label shading. Creator world ordering matches the catalog. Gender and spiciness controls use accessible dialogs with comfortable tap targets.
- Discover restores sorting, spiciness, expanded results, and scroll position when returning from profiles, scoped to the current Life. Filter changes reset the result position.
- Companion profiles put Meet/Talk and current activity/location before relationship details. Interests are easier to scan; previews expose a full-profile action and fit short screens.
- Draft hydration no longer overwrites text entered while storage loads. Drafts flush on navigation/backgrounding, and serialized writes prevent an older save from resurrecting a sent draft. The inbox waits for pending saves. Both direct and group drafts use this path.
- Chat distinguishes new incoming messages from the ordinary Latest button and positions it above the measured composer height. Existing photo cards already reserve identical space for pending and delivered images; their frame and retry behavior are retained.
- Calder's Run stories have status filters, current-scene-first copy, saved-progress guidance, independent per-story date/base fields, calendar validation, a synchronous save guard, and errors next to the affected choice.
- Shared dialogs contain keyboard focus, close with Escape, restore focus, respect reduced motion, and account for safe areas. Profile previews adapt to short viewports.
- Authored art guidance and production world visual exclusions prohibit trains approaching or crossing the unfinished bridge. The reviewed set remains 152 images with six bridge appearances.

## Verification

- App typecheck and lint pass; 721 app tests and 1,033 domain tests pass.
- Calder import, progress, and reservation integration tests pass.
- Production-canon simulation: 49 companions across seven days, no schedule gaps or overlaps. Saved relocation, absence and blocked-travel scenarios pass without database writes.
- Headless browser checks use the local production build with the authorized test account and read-only APIs. Verified world selection/focus restoration, Discover return state, profiles at 360/390/430/768px, story filters, creator picker, immediate draft navigation/reload and a 390x500 short chat viewport. No page errors.
- Full production export validates public auth configuration. The existing corrected cover and lighter artwork are retained.

The browser checks do not emulate a physical iOS/Android keyboard or a two-way voice call. No complete story ending or relationship state was changed for this pass. Live media smoke results and deployment verification are recorded in the task.
