# The Gilded Coast — initial world plan

Status: concept for review; no playable world, characters, or production data created.

## Existing app state and naming

The current app has a local coming-soon preview named **The Gilded Age** (`gilded-age`). Its copy promises pirate adventure among tropical harbors, hidden fortunes, and dangerous alliances. The hero art shows a fortified tropical port, sailing ships, a working quay, and submerged ruins. The preview is not a canonical world record with places or residents. This plan treats **The Gilded Coast** (`gilded-coast`) as the intended final name for that same concept. Before building, update the preview name, slug, copy, asset key, and tests together; do not create two nearly identical coming-soon worlds.

## Promise and boundaries

**Promise:** Enter a brilliant port that lives by sea trade and privateering. Choose whom to trust, where to spend an evening, and whether to stay ashore or take a bounded voyage. Wealth is visible everywhere, but the people who keep ships, markets, and households running have their own plans for the coast.

Use a fictional age of sail. Keep its technology legible: wind, tide, charts, signal flags, print, ship repair, and slow travel. No automatic magic, modern communications, or literal historical nation is required. The user is not assigned a pirate identity. They may arrive as a guest, worker, passenger, trader, scholar, or someone simply looking for company.

This world should feel different from Port Vervelle's intimate modern seaside routine and Vharadren's court-centered fantasy. The Gilded Coast has ships that depart, bargains that cross class lines, and social reputations that travel between quay, salon, and island. Most evenings can still be pleasant and ordinary.

## Geography and daily life

Design six connected districts and roughly 36–42 named places before writing schedules. Names below are working names, not final canon.

| District | Identity | Repeatable scenes |
| --- | --- | --- |
| Admiralty Quay | Arrivals, customs, ferries, and official authority | Passenger manifests, posted sailing times, missed reunions, berth disputes |
| Gilt Row | Wealthy terraces, salons, lenders, and auction rooms | Invitations, patronage, music, debt, visible status games |
| The Ropewalk | Shipwrights, sail lofts, warehouses, and modest homes | Repairs, apprenticeships, shared meals, wage and safety arguments |
| Lantern Market | Food, taverns, small shops, and performance | Night markets, gossip, games, dancing, neighborhood favors |
| Breakwater Point | Fort, clinic, lighthouse, and storm shelter | Weather calls, rescue work, lookout shifts, quiet views |
| The Outer Cays | Fishing villages, reefs, coves, and short boat routes | Day sails, shoreline walks, local stewardship, lost cargo |

Establish a believable travel graph: walking within the main port, short ferries to nearby cays, and scheduled voyages beyond the playable map. Time of day, tide, weather, opening hours, and a character's work shift must constrain physical meetings. A character away on a ship can text or be discussed, but should not suddenly appear in a tavern. Voyages can be bounded plans or scenarios; they do not need a real-time moving-ship map for the first release.

Give the coast domestic texture: mended sails and clothes, dockside breakfast, fresh water deliveries, shared kitchens, shipping notices, children waiting for a returning relative, cheap seats at an expensive performance, and arguments about noise or berth priority. Avoid making every venue a pirate den or every resident a treasure hunter.

## Cast and relationships

Target **32–36 selectable adult residents** at launch, spread across districts, ages, occupations, and social classes. Build the final roster around actual relationships before writing isolated biographies. Useful role clusters include a reef pilot and navigation apprentice; captain and former crewmate; customs clerk and cargo broker; shipwright and financier; tavern musician and patron; healer and storm lookout; market cook and fishing family; wealthy heir and household manager. No role should exist solely to deliver a clue or romance route.

Each resident needs a distinct work rhythm, a private ordinary wish, a goal unrelated to the player, a personal history with dated milestones, and at least two named relationships that can change. Give some characters compatible ambitions and others incompatible claims on the same ship, room, contract, or public event. Keep disagreement asymmetric: one person may see a debt as loyalty while another sees it as control.

First meetings should begin with a concrete action at a real place, followed by an opening line in that person's voice. Friendship and group scenes must work without romance. Existing protected mature-content fields should remain separate from general world and character authoring.

## Stories, play, and recurring activity

Launch with **six to eight discoverable scenarios**, each visible from the Scenario tab and introduced through characters or places. A mix might include a disputed salvage claim, a last-minute regatta crew, a masked concert with a missing performer, a storm-damaged lighthouse signal, a shipyard apprenticeship contest, and a cargo whose lawful owner is unclear. Each needs an evidence path, player choices, a bounded local outcome, and consequences remembered in that player's Life. Do not resolve a whole-world political question because one player completed a scene.

Offer at least **20 place-based experiences** with a strong fun bias: sunset sail, harbor breakfast, market tasting, regatta viewing, beach fire, lantern dance, chartmaking lesson, ropework demonstration, lighthouse climb, reef walk, open-air concert, boat repair afternoon, cooking with a market vendor, salon performance, night fishing, costume fitting, tide-pool outing, shipboard dinner, island picnic, and festival games. Experiences are invitations to do something in a place; plans remain the user's scheduled commitment with a companion. The experience can become a plan, but the two concepts should remain distinct.

Author recurring civic and seasonal activity—arrival days, fish auction, pay night, harbor inspection, storm preparation, a public regatta, and a lantern festival—with changing details and outcomes. At launch, World Pulse needs **200 complete resident-level templates** and **15 major coast-wide incidents**, using the current global scheduler: six to eight routine events daily, major incidents once or twice weekly with several days between them, no routine repeat inside 720 hours, and no major identity repeat inside 60 days. Major events should affect many residents without implying that every user attended them. Residents know public reports; only focal participants know their own direct observations.

## Art and presentation

Keep the existing tropical harbor hero as a visual reference, subject to final art review. Art direction: sunlit gold and turquoise by day, deep indigo and lantern light at night; patched canvas, salt-stained stone, busy docks, and lived-in interiors. Balance ships and grand terraces with ordinary homes and workplaces. Commission or generate district and venue images before enabling place-driven photography, and give every launch companion a consistent portrait set. Avoid reuse of Port Vervelle's modern Mediterranean street imagery or Vharadren's armor and magic motifs.

The coming-soon card should promise a specific fantasy—**“Fortunes change hands. Loyalties do too.”**—and remain non-playable until the world is ready. The preview can show the name, hero, and short premise without exposing empty People, Places, or Scenario tabs.

## Implementation order and release gate

1. Agree on name, era, technology, central port, faction boundaries, and a one-page world bible. Rename the existing preview consistently.
2. Finalize district graph, place catalog, opening hours, travel rules, and visual canon. Produce a small playable map slice for internal testing.
3. Author the resident roster, social graph, histories, first meetings, schedules, and voice samples. Test co-presence and group dialogue with several conflicting relationships.
4. Author scenarios, 20+ experiences, recurring events, 200 resident Pulse templates, and 15 major incidents. Validate coverage, knowledge boundaries, repeat scheduling, and local outcomes.
5. Complete portrait/place art and test chat, group chat, plans, photo generation, venue recall, World Pulse handoffs, and iPhone layouts. Check accessibility and narrow screens.
6. Seed a hidden canonical world, verify data and entitlements, run migration and Edge checks, then publish deliberately. Preview visibility must not be confused with release readiness. Rollback should hide discovery while preserving existing conversations.

The first reviewable milestone is the world bible, district map, and a smaller set of lead-character briefs. That fixes the identity before hundreds of event templates or images are produced.
