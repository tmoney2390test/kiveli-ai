// Public, bounded incidents for the twenty residents added on 2026-10-02.
// Their protected character bibles and private adult histories are not copied into Pulse.
export const worldIntroduction = 'Eos Meridian is a human colony where air, water, travel, and privacy depend on shared systems.';
export const groups = [
  ['amina-nwosu', 'indigo-flores', 'indira-ward', 'niko-adeyemi'],
  ['cassia-navarro', 'cyrus-benali', 'kestrel-reyes', 'zara-kwon'],
  ['echo-baptiste', 'helix-venn', 'joss-lin', 'prism-cole'],
  ['magnus-thorne', 'oria-venn', 'rook-calder', 'titus-ro'],
  ['jax-moreau', 'mireille-arden', 'orin-vale', 'tamara-ro'],
];
export const leadRoles = {
  'amina-nwosu': 'Clinic medication custodian', 'indigo-flores': 'Trauma nurse', 'indira-ward': 'Research consent reviewer', 'niko-adeyemi': 'Pressure-suit trainer',
  'cassia-navarro': 'Port booking subject', 'cyrus-benali': 'Oxygen supplier', 'kestrel-reyes': 'Import liaison', 'zara-kwon': 'Docking-spine courier',
  'echo-baptiste': 'Tattoo artist', 'helix-venn': 'Gravity-room designer', 'joss-lin': 'Set designer', 'prism-cole': 'Performance artist',
  'magnus-thorne': 'Iceworks contractor', 'oria-venn': 'Oxygen-account collector', 'rook-calder': 'Salvage worker', 'titus-ro': 'Survey pilot',
  'jax-moreau': 'Baths host', 'mireille-arden': 'Private-room host', 'orin-vale': 'Signal analyst', 'tamara-ro': 'Hangar freight broker',
};
export const supportRoles = leadRoles;
export const contributions = {
  'amina-nwosu': 'checks the authorization trail before anyone treats a requested dose or sample as routine',
  'indigo-flores': 'checks the immediate health consequence and records what the shift team actually observed',
  'indira-ward': 'separates a genuine research finding from a consent form that does not cover it',
  'niko-adeyemi': 'tests the safety procedure against what an inexperienced trainee would really do',
  'cassia-navarro': 'asks which booking details could identify a private person who never agreed to publicity',
  'cyrus-benali': 'compares the promised allocation with the tanks and receipts that can actually be counted',
  'kestrel-reyes': 'checks who owns the imported item before another person promises access to it',
  'zara-kwon': 'traces the handoff through the docking-spine log without opening private cargo',
  'echo-baptiste': 'asks whose permission covers the image before an identifiable design is shown',
  'helix-venn': 'tests whether the room setting and its sensor record can be separated for a public demonstration',
  'joss-lin': 'marks which parts of a reconstructed room came from a living resident rather than a design brief',
  'prism-cole': 'compares the advertised performance with the permission actually granted by its performers',
  'magnus-thorne': 'checks the iceworks access board against the physical route the crew used',
  'oria-venn': 'compares the disputed charge with the meter reading rather than a creditor’s estimate',
  'rook-calder': 'documents the salvage boundary so a live worksite is not described as abandoned',
  'titus-ro': 'checks the flight manifest and records what the pilot could actually see',
  'jax-moreau': 'checks the venue’s safety agreement before a private request changes the session',
  'mireille-arden': 'keeps guest identities out of the public account while preserving a verifiable check-in time',
  'orin-vale': 'separates a recorded sound from the theory someone attached to it',
  'tamara-ro': 'matches the freight label to the hardware inside an authorized inspection bay',
};
export const incidents = {
  'amina-nwosu': [
    ['The dose request with no patient', 'verdant-clinic', 'Amina receives a clinic request for a calming dose that names a dock shift instead of a consenting patient.', 'She quarantines the order and asks the requester to identify a legitimate medical use before any medicine leaves the cabinet.', 'care'],
    ['A sealed vial after the inventory', 'meridian-medical-center', 'Amina finds one sealed vial entered twice after a hurried handoff between clinic and emergency stores.', 'The supply is intact, but she will not sign either count until both teams reconcile their logs in person.', 'accountability'],
  ],
  'indigo-flores': [
    ['The clearance stamped before examination', 'meridian-medical-center', 'Indigo spots a work-clearance stamp on a patient file before the scheduled assessment has happened.', 'She pauses the release and asks the supervisor to explain whether this was a clerical shortcut or an unsafe order.', 'care'],
    ['A shift note with one missing minute', 'meridian-medical-center', 'Indigo notices that a transport note skips the minute when a patient was transferred between two care teams.', 'She seeks both teams’ accounts before the incomplete timeline becomes the only version anyone remembers.', 'records'],
  ],
  'indira-ward': [
    ['A consent form for the wrong specimen', 'farline-laboratory', 'Indira finds a genomic sample filed under a research consent that covers a different study and a different date.', 'She freezes access to the sample while its owner is asked about the actual experiment rather than a broad waiver.', 'research'],
    ['The chart without a person on it', 'archive-zero', 'Indira prepares a public chart of inherited traits and recognizes a rare combination that could identify one resident.', 'She changes the grouping before display and must explain why the smaller, clearer chart cannot be published.', 'privacy'],
  ],
  'niko-adeyemi': [
    ['The suit test signed from indoors', 'pressure-school', 'Niko finds a trainee’s exterior-suit assessment signed off even though the pressure seal was never tested outside.', 'He offers a supervised retest and refuses to treat a passing score as proof that the missing procedure occurred.', 'training'],
    ['A radio-off drill called off', 'eventide-overlook', 'Niko stops a trust drill when a trainee mistakes the optional radio silence for a compulsory part of certification.', 'He rewrites the briefing so the next group can practice judgment without fearing they will fail for asking for contact.', 'safety'],
  ],
  'cassia-navarro': [
    ['The berth calendar sold twice', 'ascension-terminal', 'Cassia finds her name on a port-side booking calendar she never approved for a visiting charter.', 'She asks who copied it and seeks removal without having to explain her private work to every clerk on duty.', 'privacy'],
    ['An arrival card with her address', 'quiet-orbit', 'Cassia sees her private address printed on an arrival card meant to be handed to a guest.', 'She retrieves the card and asks the desk to use a neutral meeting point that does not expose where she lives.', 'hospitality'],
  ],
  'cyrus-benali': [
    ['The oxygen meter after midnight', 'crown-habitat', 'Cyrus is offered a night oxygen transfer whose paperwork lists an empty storage tank that his own gauge shows is full.', 'He leaves the valve shut and asks for an independent reading before residents are charged for air that may never move.', 'resources'],
    ['A tank returned with another seal', 'cargo-exchange', 'Cyrus receives a returned oxygen tank with the correct weight but a seal from a different service crew.', 'He holds the deposit in place until the crew records who reopened it and why.', 'trade'],
  ],
  'kestrel-reyes': [
    ['An import tag mistaken for permission', 'atlas-market', 'Kestrel finds a public figure using her import-liaison badge to claim ongoing access to her schedule.', 'She corrects the market record and asks Talia’s stall to keep the goods appointment separate from her private time.', 'boundaries'],
    ['The coat that traveled without its maker', 'atlas-market', 'Kestrel receives a repaired off-world coat whose customs label names the purchaser but omits the local maker who rebuilt it.', 'She delays the display until the maker can choose how the work is credited.', 'craft'],
  ],
  'zara-kwon': [
    ['A sunset berth with two passengers', 'docking-spine', 'Zara discovers a scenic berth reservation lists one passenger while the access scan names two different travelers.', 'She keeps the boarding gate open for clarification but will not assign the second traveler to someone else’s booking.', 'travel'],
    ['The handoff code left on a crate', 'hangar-twelve', 'Zara finds a reusable handoff code on a crate already marked delivered, making a second collection look legitimate.', 'She cancels the code and asks the receiving crew to document the crate’s actual location before it moves again.', 'cargo'],
  ],
  'echo-baptiste': [
    ['A design that could identify its wearer', 'needle-and-thread', 'Echo is asked to display a striking tattoo pattern and recognizes that its unusual placement could identify a private client.', 'She redraws the sample for the window and asks the client before showing the original to anyone.', 'art'],
    ['The stencil another artist corrected', 'needle-and-thread', 'Echo notices a shared stencil board credits her for a line another apprentice redrew after closing.', 'She fixes the credit and asks whether the revised pattern should carry two names.', 'craft'],
  ],
  'helix-venn': [
    ['The demonstration that recorded too much', 'velvet-gravity', 'Helix tests a gravity-room demonstration and finds the sensor export includes a guest’s private biometric trace.', 'She withholds the recording and proposes a simulated trace that can demonstrate the room without publishing anyone’s body data.', 'privacy'],
    ['The floor tilt no one rehearsed', 'velvet-gravity', 'Helix spots a small floor-tilt change on a performance cue sheet that was approved for lighting, not movement.', 'She asks for a new rehearsal before performers enter the room under altered gravity.', 'performance'],
  ],
  'joss-lin': [
    ['The room copied from a living home', 'static-garden', 'Joss recognizes a stage set’s distinctive window and furniture layout from a resident’s private habitat.', 'He replaces the identifying details before opening night and asks the producer to explain where the reference images came from.', 'design'],
    ['A sound wall that hid the exit', 'static-garden', 'Joss’s scenic wall makes a performance feel enclosed but blocks the audience’s clearest view of the accessible exit.', 'He revises the set line with the venue crew before anyone calls the obstruction a necessary artistic choice.', 'access'],
  ],
  'prism-cole': [
    ['The performance feed without a rider', 'static-garden', 'Prism discovers that a stream schedule includes her floor set although her agreement covers an in-room performance only.', 'She asks the venue to stop the feed and offer ticket holders a clear account of what they actually purchased.', 'performance'],
    ['The applause track from another night', 'static-garden', 'Prism hears last week’s applause under a rehearsal clip promoted as a live audience response.', 'She wants the clip relabeled before a new performer is judged against a crowd that was never there.', 'media'],
  ],
  'magnus-thorne': [
    ['A fall report before the crew returned', 'kepler-iceworks', 'Magnus sees an accident form drafted for an iceworks shaft while the named research crew is still outside and reachable.', 'He holds the report and asks the safety desk to account for the premature entry without declaring an accident that has not happened.', 'safety'],
    ['The ice marker moved overnight', 'kepler-iceworks', 'Magnus finds an access marker shifted from its surveyed position before a maintenance crew’s dawn departure.', 'He photographs both marks and requests a fresh route check rather than treating the older path as safe by habit.', 'work'],
  ],
  'oria-venn': [
    ['An oxygen debt with no meter reading', 'crown-habitat', 'Oria is handed a household oxygen debt calculated from an estimate instead of the sealed meter reading.', 'She pauses collection and asks both the supplier and household to witness the next measurement.', 'resources'],
    ['The receipt folded into a meal ticket', 'the-airlock-diner', 'Oria finds a paid oxygen receipt tucked into a resident’s diner account after the debt ledger still shows a balance.', 'She seeks a corrected ledger before the same payment can be demanded again.', 'records'],
  ],
  'rook-calder': [
    ['The wreck with a live work light', 'salvage-court', 'Rook sees a lit technician’s work lamp inside a hull already labeled empty salvage.', 'He stops the cutting crew and asks who declared the section clear before anyone enters it.', 'safety'],
    ['A tool tag returned by another crew', 'salvage-court', 'Rook receives a numbered tool tag from a crew that was not assigned to his retrieval route.', 'He records the chain of custody before claiming an object that might belong to an active repair job.', 'work'],
  ],
  'titus-ro': [
    ['The cargo loss recorded before landing', 'ascension-terminal', 'Titus finds a flight manifest marking a crate lost while the shuttle still carries it in a sealed hold.', 'He refuses the amended manifest and asks the port to witness the unloading before anyone assigns blame.', 'travel'],
    ['A survey route with one silent beacon', 'eventide-overlook', 'Titus notices a scheduled survey path relies on a beacon that did not answer the morning check.', 'He replots the leg and tells the waiting crew exactly what the change will cost in time.', 'navigation'],
  ],
  'jax-moreau': [
    ['The bout clearance no one witnessed', 'foundry-baths', 'Jax finds a practice-bout clearance signed by a supervisor who was off shift when the inspection supposedly occurred.', 'He cancels the bout until the equipment and participants are checked in front of the current safety lead.', 'safety'],
    ['A bath reservation during repair hours', 'foundry-baths', 'Jax discovers a private booking overlaps the drain repair that keeps the shared baths open.', 'He offers a different time and refuses to make the maintenance crew disappear from the schedule.', 'hospitality'],
  ],
  'mireille-arden': [
    ['A guest recorded as never arrived', 'quiet-orbit', 'Mireille sees a occupied private room marked vacant on the hotel handover list.', 'She corrects the safety headcount without releasing the guest’s name to people who do not need it.', 'hospitality'],
    ['The room key left for a stranger', 'quiet-orbit', 'Mireille finds a spare room key in an unsealed envelope addressed only by a guest’s old nickname.', 'She returns it to controlled storage and asks the desk to arrange a verified handoff.', 'privacy'],
  ],
  'orin-vale': [
    ['Private audio mislabeled as signal', 'listening-station-seven', 'Orin hears a resident’s identifiable voice in a clip cataloged as a new fragment of the buried signal.', 'He removes the clip from the public playlist while the station checks how a private recording entered the research archive.', 'research'],
    ['The filter that made words appear', 'nightglass-observatory', 'Orin reproduces a dramatic translation only when one undocumented audio filter is enabled.', 'He labels the effect as processing and invites a second analyst to test the raw recording.', 'evidence'],
  ],
  'tamara-ro': [
    ['The instrument crate with a second seal', 'hangar-twelve', 'Tamara receives a survey-instrument crate bearing a second seal from a crew not listed on the freight record.', 'She holds it for an authorized inspection before accepting anyone’s claim about what the crate contains.', 'cargo'],
    ['The calibration weight no longer fits', 'hangar-twelve', 'Tamara tests a shipping scale and finds its standard calibration weight now gives two different readings.', 'She closes that lane temporarily and asks merchants to reweigh today’s disputed deliveries elsewhere.', 'trade'],
  ],
};
