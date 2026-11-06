// Bounded public incidents for the twenty later-published Gilded Coast residents.
// Each resident leads two distinct events and has a substantive role in the others in their cohort.
import { gildedSupportActions } from './gilded-coast-actions.mjs';
export const supportActions = gildedSupportActions;
export const worldIntroduction = 'The Gilded Coast is an age-of-sail harbor where work, trade, pleasure, and the law meet at the water.';
export const groups = [
  ['calista-fen', 'osric-kane', 'odile-vane', 'gideon-holt'],
  ['cormac-bray', 'tessera-pike', 'harlan-vex', 'vesperine-crowe'],
  ['dax-marin', 'maren-hooke', 'roxana-brine', 'rune-calder'],
  ['helene-dusk', 'liora-quell', 'stellan-rook', 'nyxa-marin'],
  ['isolde-wren', 'petra-cinder', 'quinnie-salt', 'sable-rourke'],
];
export const leadRoles = {
  'calista-fen': 'Auction broker', 'osric-kane': 'Goods dealer', 'odile-vane': 'Customs inspector', 'gideon-holt': 'Court fixer',
  'cormac-bray': 'Prizefighter', 'tessera-pike': 'Prizefighter', 'harlan-vex': 'Duelist', 'vesperine-crowe': 'Sword instructor',
  'dax-marin': 'Boarding master', 'maren-hooke': 'Gunner', 'roxana-brine': 'Wrecking captain', 'rune-calder': 'Night salvage worker',
  'helene-dusk': 'Companion', 'liora-quell': 'Floor captain', 'stellan-rook': 'Door keeper', 'nyxa-marin': 'Tavern worker',
  'isolde-wren': 'Verdict broker', 'petra-cinder': 'Arms founder', 'quinnie-salt': 'Spice maker', 'sable-rourke': 'Smuggler',
};
export const contributions = Object.fromEntries(Object.entries(leadRoles).map(([slug, role]) => [slug, `brings the judgment of a ${role.toLowerCase()} to the incident` ]));
export const coverageBridges = {
  'iria-montrose': { location: 'reef-landing', role: 'Examined the stamped plate', targets: ['The recovered plate bearing two names'], action: 'uses a jeweller’s loupe to establish which vessel name was stamped first without claiming either crew owns the plate' },
  'talia-wren': { location: 'signal-house', role: 'Checked warning visibility', targets: ['The squall warning posted too high'], action: 'checks the warning from the lighthouse approach and confirms that arriving families cannot read it from the path' },
  'seraphine-vale': { location: 'salt-ledger-bank', role: 'Checked the company papers', targets: ['The repair fund with an unsigned promise', 'A deposit receipt with no date'], action: 'brings the company’s signed account book so a private promise cannot be mistaken for a company guarantee', actions: { 'A deposit receipt with no date': 'brings her crew payroll ledger to narrow the deposit date without pretending to know when the teller entered it' } },
  'lucien-damar': { location: 'honeyglass-theatre', role: 'Checked the score', targets: ['The chorus listed under the wrong singer'], action: 'checks his dated rehearsal score and confirms which chorus Luca wrote without claiming the rest of the song' },
};
export const incidents = {
  'calista-fen': [
    ['The pearl with a broken clasp', 'gilt-auction', 'Calista finds a pearl necklace listed as intact although its clasp has been replaced with a cheaper pin since the viewing.', 'She halts bids until the seller agrees to show the repair, even though the room is already full.', 'trade'],
    ['A painting offered twice', 'gilt-auction', 'Calista receives two ownership claims for one harbor painting, each carrying a signed bill of sale.', 'She holds the lot and asks both claimants to explain the painting’s custody before either claim becomes an auction fact.', 'evidence'],
  ],
  'osric-kane': [
    ['The anchor chain without a ship', 'sailors-exchange', 'Osric is offered a cut anchor chain whose stamped vessel number belongs to a cutter still working offshore.', 'He keeps the chain on his floor and asks the seller for a lawful removal record before buying it.', 'trade'],
    ['A coat paid for with another crew’s token', 'sailors-exchange', 'Osric notices a buyer settle a coat bill with a brass wage token issued to a crew that has not returned.', 'He sets the token aside and seeks the rightful holder instead of letting the sale hide the question.', 'work'],
  ],
  'odile-vane': [
    ['The crate that passed without a seal', 'customs-house', 'Odile finds an expensive clock crate marked cleared even though the wax seal never reached the inspector’s desk.', 'She blocks its release and has to explain who used her stamp while she was away.', 'records'],
    ['A favor written into the duty book', 'customs-house', 'Odile sees a waived harbor duty entered beside a merchant’s private note rather than the public tariff rule.', 'She leaves the original line visible and asks for a formal ruling before another clerk copies it.', 'accountability'],
  ],
  'gideon-holt': [
    ['The hearing bought an empty bench', 'harbor-court', 'Gideon arranges a salvage hearing and learns the promised witness bench was reserved for a clerk who never came.', 'He demands a new hearing time so the claimants can speak before the judge closes the file.', 'legal'],
    ['A debt collector at the wrong door', 'gilt-row', 'Gideon follows a collector’s note to a boarding house and finds the named debtor moved out before the loan was made.', 'He retrieves the public notice and asks who supplied the address before another tenant is threatened.', 'evidence'],
  ],
  'cormac-bray': [
    ['The gloves weighed after the bell', 'battery-yard', 'Cormac sees a trainee’s fighting gloves fail the agreed weight check after the bout has already been announced.', 'He delays the match and offers his own spare pair if both fighters accept them.', 'competition'],
    ['A prize purse missing the medic’s share', 'battery-yard', 'Cormac reads a prize purse that pays the fighters but omits the medic who staffed the entire night.', 'He holds his signature until the promoter states who will pay the promised fee.', 'work'],
  ],
  'tessera-pike': [
    ['The extra round no one signed for', 'battery-yard', 'Tessera finds an exhibition card advertising a fourth round although both fighters agreed to three.', 'She tells the crowd the limit before walking in and asks the promoter to refund anyone sold a different fight.', 'competition'],
    ['A training rope cut too short', 'battery-yard', 'Tessera notices the practice ring rope has been shortened enough to push fighters toward the stone posts.', 'She cancels sparring until the yard resets the corners and checks who changed them.', 'safety'],
  ],
  'harlan-vex': [
    ['The challenge with no second', 'velvet-balcony', 'Harlan receives a formal duel challenge with a date and weapon but no named second to verify the terms.', 'He refuses the appointment until both parties choose witnesses who can stop an unfair fight.', 'competition'],
    ['A blade returned with a new nick', 'velvet-balcony', 'Harlan gets his practice blade back from a borrowed lesson and finds a fresh nick near the guard.', 'He takes it out of use and asks the borrower what struck it before anyone trains with a weakened sword.', 'safety'],
  ],
  'vesperine-crowe': [
    ['A lesson sold as a public duel', 'velvet-balcony', 'Vesperine sees a private sword lesson advertised as a public duel with her name across the bill.', 'She pulls the poster and offers paying spectators a demonstration only if the student freely agrees.', 'consent'],
    ['The scorecard marked before the bout', 'velvet-balcony', 'Vesperine finds a judge’s scorecard with a winning mark on it before either duelist has stepped onto the floor.', 'She saves the card and asks for a replacement judge in front of both fighters.', 'fairness'],
  ],
  'dax-marin': [
    ['The ladder that missed the deck', 'admiralty-quay', 'Dax tests a boarding ladder delivered for his crew and finds its last rung falls below the vessel’s rail at low tide.', 'He rejects the kit and asks the supplier to measure it against the actual ship before departure.', 'safety'],
    ['A crew list with one sailor too many', 'arrival-steps', 'Dax reads a charter list that names a sailor who turned down the voyage the night before.', 'He strikes the name and wants the captain to explain why the empty berth was still drawing wages.', 'records'],
  ],
  'maren-hooke': [
    ['The cannonball that would not fit', 'battery-yard', 'Maren checks a fresh crate of shot and finds several balls too wide for the gun they were invoiced to supply.', 'She tags the whole batch for remeasurement rather than let a rushed crew force one into the barrel.', 'safety'],
    ['Powder counted after rain', 'battery-yard', 'Maren finds damp powder sacks counted as ready stores after a storm soaked the outer rack.', 'She separates the sacks and asks the quartermaster to record the lost supply before a ship plans around it.', 'resources'],
  ],
  'roxana-brine': [
    ['A wreck marked empty from shore', 'sable-reef', 'Roxana approaches a wreck declared empty and spots a fresh lantern moving below its broken stern.', 'She stops the salvage line and treats the moving light as a possible survivor until the boat can check below deck.', 'rescue'],
    ['The bell claimed by two boats', 'reef-landing', 'Roxana recovers a ship’s bell whose nameplate has been ground down, while two crews claim the find.', 'She leaves the bell at the landing and asks each crew for a dated recovery record.', 'salvage'],
  ],
  'rune-calder': [
    ['A night beacon facing the reef', 'breakwater-point', 'Rune sees a temporary salvage beacon pointed toward shallow rock instead of the safe channel.', 'He turns it dark and tells the watch before another boat follows the false light.', 'navigation'],
    ['The rope knot that changed overnight', 'reef-landing', 'Rune finds his marked salvage rope tied with a new knot after he left it secured above the tide.', 'He checks the line for hidden damage and asks who used it before anyone hangs from it.', 'safety'],
  ],
  'helene-dusk': [
    ['A booking written after it ended', 'house-of-hours', 'Helene sees a private appointment added to the guest ledger after the time had passed, under a name she never accepted.', 'She asks the desk to preserve the earlier page and remove the false charge without naming her real guest.', 'privacy'],
    ['The gift left with instructions', 'house-of-hours', 'Helene receives a wrapped necklace with a note saying she must wear it for a returning patron.', 'She returns the gift unopened and asks staff to remind the patron that a paid visit does not buy her choices.', 'boundaries'],
  ],
  'liora-quell': [
    ['The closed room still on the booking sheet', 'house-of-hours', 'Liora spots a guest assigned to a private room whose lock is being repaired that afternoon.', 'She offers another room and keeps the repair crew on the schedule rather than hide the work.', 'hospitality'],
    ['A staff tip entered as house income', 'house-of-hours', 'Liora finds a performer’s cash tip recorded in the nightly house total.', 'She corrects the ledger with the performer present and asks how the mistake survived the shift handover.', 'work'],
  ],
  'stellan-rook': [
    ['A visitor with someone else’s token', 'house-of-hours', 'Stellan checks an entry token and sees the name belongs to a guest who left before sunset.', 'He keeps the door closed and offers to verify a fresh appointment instead of arguing in the street.', 'security'],
    ['The side exit tied for a party', 'house-of-hours', 'Stellan finds a ribbon tied across the staff exit to decorate a private party.', 'He removes it and asks the host to keep the passage clear while people are inside.', 'safety'],
  ],
  'nyxa-marin': [
    ['A tavern tab signed in a stranger’s hand', 'brass-compass', 'Nyxa spots a sailor’s tab extended after he left, with a signature unlike the one on his earlier drinks.', 'She stops service against the account and keeps both slips for him to check.', 'records'],
    ['A knife left where children wait', 'brass-compass', 'Nyxa finds a sharpened knife under the ferry families’ breakfast bench before the tavern opens.', 'She secures it and asks last night’s staff who cleared that table without accusing a guest.', 'safety'],
  ],
  'isolde-wren': [
    ['The verdict notice posted before the hearing', 'harbor-court', 'Isolde sees a salvage verdict pinned to the court board before the claimants have made their arguments.', 'She preserves the dated notice and asks the clerk to explain whether it is a draft or a decision made in secret.', 'legal'],
    ['A witness paid from the wrong purse', 'harbor-court', 'Isolde finds a travel allowance for a neutral witness paid from one claimant’s purse.', 'She asks the court to disclose the payment before that witness takes the stand.', 'accountability'],
  ],
  'petra-cinder': [
    ['The barrel stamped with another maker’s mark', 'lantern-foundry', 'Petra finds a forged gun barrel bearing her foundry mark although the metal failed her own gauge.', 'She keeps the barrel off a ship and asks the seller where the false stamp was cut.', 'craft'],
    ['A blade order without a buyer', 'lantern-foundry', 'Petra receives payment for six blades but the order book gives only a collection time, not a purchaser.', 'She holds the weapons until someone accepts responsibility for the sale in writing.', 'trade'],
  ],
  'quinnie-salt': [
    ['The sleeping draught with two labels', 'spice-courtyard', 'Quinnie finds a sleeping draught labeled with two different measures by the seller and the bottle maker.', 'She pulls it from the stall and asks both to settle the dose before anyone drinks it.', 'safety'],
    ['A tasting spoon from the wrong jar', 'spice-courtyard', 'Quinnie catches a market helper moving one tasting spoon between ordinary spice and a stronger blend.', 'She closes the sampling tray and rewrites the labels so buyers know what they are offered.', 'care'],
  ],
  'sable-rourke': [
    ['The reef delivery with no receiver', 'reef-landing', 'Sable reaches a reef landing with a sealed parcel and finds the named receiver has not worked there for weeks.', 'She takes it back aboard rather than leave it with the loudest person on the dock.', 'cargo'],
    ['A tide chart sold as a safe route', 'sable-reef', 'Sable buys a hand-drawn tide chart and discovers its marked passage closes at the hour listed for her return.', 'She warns the next crew and asks the seller to correct every copy before the tide turns.', 'navigation'],
  ],
};
