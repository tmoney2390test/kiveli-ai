// Keep the source-title key stable: changing a visible title must never reset
// this event's slug, repeat identity, or 30-day scheduling rank.
export const eosEventOverrides = {
  'The map that ends at the gate': {
    displayTitle: 'The repair ticket that came back twice',
    feedSummary: 'A routine valve inspection at Eos Meridian’s water reserve has stalled. The colony maintenance desk sent the work order to Axiom; Axiom sent it back. Naomi Varga wants one signed plan before the valve needs repair.',
    detailBody: 'Eos Meridian’s homes and greenhouses depend on a carefully managed water system. When reservoir engineer Elian Park tried to schedule a routine valve inspection, the colony maintenance desk referred him to Axiom, the authority that still maintains part of the system. Axiom returned the ticket. The public maintenance map ends at the gate between their service areas and does not identify who handles that valve.\n\nNaomi Varga has brought both work orders to the reservoir. Zoe Mercer points out the care visits a prolonged outage could disrupt; Imani Laurent marks the growing beds served by the line. Naomi wants both offices to sign one inspection plan and correct the map. The valve still works, but the inspection is waiting for someone to take responsibility.',
    roleLabels: {
      'naomi-varga': 'Sought a repair plan',
      'zoe-mercer': 'Identified care needs',
      'imani-laurent': 'Traced the food supply',
      'elian-park': 'Filed the inspection ticket',
    },
    perspectives: {
      'naomi-varga': 'Naomi has both returned work orders and wants the colony office and Axiom to sign one plan before the working valve becomes a failed one.',
      'zoe-mercer': 'Zoe identified home-care visits that a prolonged water outage could disrupt; she cannot say which maintenance office will accept the job.',
      'imani-laurent': 'Imani marked the greenhouse beds supplied by the line; she knows which crops depend on it, not who owns the repair.',
      'elian-park': 'Elian filed the original inspection ticket and received it back from both maintenance desks. He can explain what each office told him.',
    },
    directMessages: {
      'naomi-varga': 'Naomi, why did the valve inspection ticket come back from both offices?',
      'zoe-mercer': 'Zoe, who would be affected if this water line stopped working?',
      'imani-laurent': 'Imani, which growing beds depend on that line?',
      'elian-park': 'Elian, what did each maintenance desk tell you about the valve?',
    },
    groupMessage: 'I read about the inspection ticket that neither office accepted. Who is actually meant to inspect the valve?',
  },
  'The renter line in an old renewal': {
    feedSummary: 'Naomi Varga has found a rent clause in an 18-year-old service agreement between the colony and Axiom, the authority that still runs part of its infrastructure. A current household bill shows that residents are still paying for it.',
  },
  'A later Lyra stamp': {
    displayTitle: 'The old bracket awaiting a test',
    feedSummary: 'A bracket from evacuated Habitat Lyra has turned up for sale at Salvage Court. Luc Moreau recognizes the stamp he put on it eighteen years ago, but refuses to approve it for a new pressure repair without a material test.',
  },
  'A Year 20 order in his hand': {
    feedSummary: 'At the colony museum, Malik Orison recognizes an order he followed during the evacuation of Habitat Lyra eighteen years ago. The draft exhibit says what the order required, but not how it separated families.',
  },
  'The stamp on the exhibit': {
    feedSummary: 'A museum caption dates a manufactured part to Eos Meridian’s first landing. Jonah Sato finds a shop stamp showing it was made for Habitat Lyra eighteen years later; three colleagues help check the record before he changes the display.',
  },
};
