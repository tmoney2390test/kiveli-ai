# Place activity audit — 2026-10-06

Scope: all nine published worlds, 457 canonical public places, and 1,826 stored activity slots. Private user-created places were excluded. The chat “Things to do” tray was audited separately because it uses interaction packs rather than displaying the stored activity list verbatim.

## Findings

- **Invented affordances in chat.** The bar pack offered “Use the jukebox” at every bar. No published place currently lists a jukebox. Other broad packs assumed pool tables, room service, sauna circuits, prize counters, and similar amenities without place evidence.
- **Immediate repeats.** After an action, the resolver penalized it but still refilled the tray with it when the venue had few options.
- **Gilded Coast filler.** “conversation” occupied 39 of 42 places. Its pack generated “Try conversation here with someone who is available.” for the public activity description. The world had only 68 distinct labels across 128 slots.
- **Other generic labels.** Twelve published places outside the Gilded Coast also used the unqualified label “conversation”: Copper Mare Saloon; The Blue Shift; Juniper Café; Velvet Hour; Gallery Null; Quiet Hours; Scarlet Garden; Soba Miyako; The Balcony; Whisper Bridge; The Blue Lantern; Harbor Steps.

## Corrections prepared

- Object- or service-specific interaction actions now require an explicit place activity or `interactionObjects` entry. A bar no longer implies a jukebox. A bar with `pool` can offer a pool game; a bar with an explicitly listed jukebox can offer that action.
- The resolver omits the last two used actions while any other eligible option remains, instead of repeating them to fill a fixed count.
- The 39 Gilded Coast filler slots now identify concrete, venue-appropriate actions. Its exported catalog has 116 distinct labels across the same 128 slots and no bare “conversation,” “walking,” or “exploring” labels. Generic generated activity descriptions were removed. The additive migration updates only unchanged canonical rows, leaving user places and independently edited rows alone.
- The remaining twelve bare “conversation” slots in other published worlds have place-specific replacements in the additive migration. Where a client-side world catalog exists, its source was updated too.

## Follow-up audit rule

When adding an interaction, distinguish a **venue family** (bar, hotel, spa) from an **actual affordance** (jukebox, room service, sauna). Only put the latter in the tray when the place says it exists. Each published place should have at least one activity tied to its physical setting or service, and repeated universal labels should be reviewed as editorial debt rather than counted as unique content.
