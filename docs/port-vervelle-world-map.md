# Port Vervelle world map — draft

## Resident companion roster

Port Vervelle has 30 server-published, selectable women distributed evenly across its six districts. Each resident has a canonical workplace and first-meeting location, a Life Engine V2 occupation block, world-specific presence, an authored activity bank, spice pacing, and a reciprocal local social circle. Character portraits are intentionally marked `pending` until canonical artwork is supplied; Kivelle must not reuse another companion's portrait as a placeholder.

Status: implemented baseline. Migration `202608180004_kivelle_port_vervelle_world.sql` seeds the published world, six districts, and 38 public places. The app includes the world hero and a first mapped batch of 28 canonical location photos. Mercato Vecchio, Capo Vervelle, and the remaining unmapped places continue to use the Port Vervelle world fallback until dedicated art arrives.

## Canonical naming

The canonical world name is **Port Vervelle** with slug `port-vervelle`. All world-facing names, branded locations, slugs, asset keys, migrations, and character schedules must use **Vervelle** / `vervelle`.

The original source image arrived as `PortVirelle.png` inside a `PortKirelle` folder. Those spellings are provenance only and must be normalized when the asset is imported into the repository.

## World identity

- Form: compact, fictional Mediterranean coastal town built vertically around a working harbor.
- Emotional promise: romantic, sensual, picturesque, slightly escapist, and comfortably lived-in rather than glamorous.
- Social engine: repeated encounters caused by proximity. Residents reuse the same harbor, market, cafés, beach, stairs, and evening venues.
- Movement: walking first; stairs and steep lanes between the waterfront and Bellavista; scooters, taxis, and occasional cars for Mercato Vecchio and Capo Vervelle.
- Daily rhythm:
  - Before sunrise: fishing boats, market setup, bakery ovens, clinic and hotel night staff.
  - Morning: Porto Vecchio and Mercato Vecchio are busiest; Piazza Aurelia becomes the town's social crossroads.
  - Afternoon: shutters, heat, quiet streets, beaches, coves, gardens, studios, and long lunches.
  - Sunset: Belvedere Garden, Luna Terrace, Faro Vervelle, and the harbor steps become encounter magnets.
  - Evening: terraces, restaurants, taverns, and the old town fill gradually.
  - Late night: activity contracts into Marina Solana, the Blue Lantern, Velours, Maison Rouge, and post-shift gatherings near the harbor.
- Recommended default arrival: `porto-vecchio`, with Café Marelle or Harbor Steps used for the first grounded scene.
- Timezone: `Europe/Rome`.
- Hero asset key: `port-vervelle-hero`.

## Visual canon from the supplied hero image

- Warm pale stone and sun-faded pastel stucco stacked up a steep coastal hillside.
- Terracotta roofs, shuttered windows, wrought-iron balconies, flowers, climbing plants, and fabric awnings.
- A working blue-green harbor with small fishing boats and sailboats rather than a mega-marina.
- Narrow stone waterfront promenade with cafés directly beside the water.
- Church domes and towers as distant skyline anchors, not named real-world monuments.
- Warm late-afternoon light, hazy mountains, active but unhurried pedestrian life.
- Avoid: direct Amalfi/Positano replicas, recognizable real landmarks, generic luxury-resort imagery, empty streets, cruise ships, futuristic architecture, and spotless theme-park presentation.

## Authored photo coverage

The first mapped batch covers 28 of the 44 canonical location rows. Source filenames are provenance only; packaged assets use stable canonical slugs, including typo normalization such as `MarianaSolana.png` → `marina-solana`, `LidoVerbelle.png` → `lido-vervelle`, and `PortVecchio.png` → `porto-vecchio`.

Dedicated art is still pending for: `mercato-vecchio`, `capo-vervelle`, `studio-lucent`, `belvedere-garden`, `vervelle-general-clinic`, `officina-moretti`, `vervelle-design-works`, `studio-ondine`, `piccolo-cinema`, `vervelle-cooperative`, `domaine-vervelle`, `hotel-celeste`, `celeste-spa`, `cala-bianca`, `faro-vervelle`, and `la-pergola`. These locations intentionally inherit the Port Vervelle world hero until their own image is mapped.

## Canonical topology

```text
Capo Vervelle — cliffs, villas, vineyard and countryside
   ↕ cliff road / trail
Bellavista — hillside homes, studios and overlook
   ↕ steep lanes and public stairs
Piazza Aurelia — historic pedestrian center
   ↔ Mercato Vecchio — everyday services and working town
   ↕ short stone streets
Porto Vecchio — working harbor and arrival point
   ↔ waterfront promenade
Marina Solana — beach, sunset and nightlife
```

The database representation should use **44 unique `together_locations` rows**: six district nodes plus 38 additional places. Piazza Aurelia and Mercato Vecchio each act as both their district node and their numbered public scene location, avoiding duplicate names and slugs.

## District 1: Porto Vecchio — the Old Harbor

District row: `porto-vecchio` (`district`). Working harbor, arrival point, early-morning economy, and evening local social life.

| Location | Slug | Suggested type | Primary scene and routine roles |
| --- | --- | --- | --- |
| Café Marelle | `cafe-marelle` | venue | Coffee, casual dates, people-watching; barista/server/owner work |
| Vervelle Fish Market | `vervelle-fish-market` | venue | Pre-dawn and morning commerce; fishing and restaurant supply network |
| The Blue Lantern | `blue-lantern` | venue | Sailors' tavern, gossip, acoustic music, post-shift drinks |
| Porto Marina | `porto-marina` | transit | Docks, arrivals, departures, boat work, charters, waterfront walks |
| Vervelle Sailing House | `vervelle-sailing-house` | venue | Sailing lessons, tours, charter planning, harbor-facing employment |
| La Casa del Mare | `casa-del-mare` | venue | Family seafood restaurant and unhurried harbor dinners |
| Harbor Steps | `harbor-steps` | landmark | Free public lingering space, music, teenagers, couples, after-hours encounters |

## District 2: Piazza Aurelia — the Old Town

District and scene row: `piazza-aurelia` (`district`). Its possible activities should include festivals, demonstrations, markets, dates, street music, fountain meetings, and everyday crossings.

| Location | Slug | Suggested type | Primary scene and routine roles |
| --- | --- | --- | --- |
| Forno Bellini | `forno-bellini` | venue | Daily bread and pastry ritual; reliable morning encounter node |
| Libreria Vervelle | `libreria-vervelle` | venue | Bookshop, reading courtyard, writers, quiet daytime meetings |
| Osteria Rosa | `osteria-rosa` | venue | Long local dinners, wine, celebrations, recurring neighborhood tables |
| Atelier Amélie | `atelier-amelie` | venue | Tailoring, fashion design, fittings, wedding and event connections |
| Farmacia Vervelle | `farmacia-vervelle` | venue | Pharmacy, health errands, neighborhood knowledge network |
| Palazzo Civico | `palazzo-civico` | public_service | Weddings, permits, meetings, planning, and small-town politics |

## District 3: Marina Solana — beach and nightlife

District row: `marina-solana` (`district`). Daytime beach activity transitions into the world's highest-energy evening and late-night cluster.

| Location | Slug | Suggested type | Primary scene and routine roles |
| --- | --- | --- | --- |
| Spiaggia Solana | `spiaggia-solana` | outdoor | Main beach, swimming, volleyball, picnics, flirting, chance encounters |
| Lido Vervelle | `lido-vervelle` | venue | Beach club, cabanas, restaurant, music, lifeguard and hospitality work |
| La Sirena | `la-sirena` | venue | Main nightclub, dancing, DJs, promotion, security, after-midnight choices |
| Velours | `velours` | venue | Intimate cocktail lounge, live singers and piano, romantic late-night scenes |
| Maison Rouge | `maison-rouge` | venue | Tasteful cabaret, jazz, performances, cocktails, private events |
| Solana Beach Rentals | `solana-beach-rentals` | venue | Boards, kayaks, lessons, lifeguard and rental work |
| Luna Terrace | `luna-terrace` | venue | Rooftop restaurant and wine bar; signature date-night view |

Recommended nesting: make Solana Beach Rentals a child of Spiaggia Solana (`depth=2`) if the current location UI and nearby-place resolver are confirmed to support third-level paths cleanly. Otherwise keep both directly under Marina Solana.

## District 4: Bellavista — hillside neighborhood

District row: `bellavista` (`district`). Quiet homes, small businesses, steep lanes, views, and recurring residential encounters.

| Location | Slug | Suggested type | Primary scene and routine roles |
| --- | --- | --- | --- |
| Bellavista Apartments | `bellavista-apartments` | residence | Younger residents, neighbor encounters, balconies, shared stairs |
| Villa Mirabelle | `villa-mirabelle` | residence | Upscale apartments, gardens, wealthier or established residents |
| Studio Lucent | `studio-lucent` | venue | Portraits, fashion, weddings, tourism campaigns, creative work |
| Fiore & Fig | `fiore-and-fig` | venue | Florist, gifts, weddings, apologies, celebrations, daily street color |
| Bellavista Fitness Club | `bellavista-fitness-club` | venue | Training, yoga, Pilates, wellness routines and instructors |
| Belvedere Garden | `belvedere-garden` | outdoor | Quiet walks, picnics, sunsets, dates and private conversations |

Residence buildings should be canonical public shells. Individual character homes can become private child locations later if interiors need distinct continuity.

## District 5: Mercato Vecchio — everyday Port Vervelle

District and scene row: `mercato-vecchio` (`district`). Its possible activities should include produce shopping, artisan stalls, errands, local commerce, and morning social encounters.

| Location | Slug | Suggested type | Primary scene and routine roles |
| --- | --- | --- | --- |
| Vervelle General Clinic | `vervelle-general-clinic` | healthcare | Clinic and small hospital; medicine, therapy, reception, shift work |
| Officina Moretti | `officina-moretti` | venue | Scooter and automotive repair; working social space for mechanics |
| Vervelle Design Works | `vervelle-design-works` | venue | Architecture, interiors, restoration projects and professional work |
| Studio Ondine | `studio-ondine` | venue | Ceramics, painting, classes, exhibitions and handmade sales |
| Piccolo Cinema | `piccolo-cinema` | venue | Two-screen cinema, European film, mainstream releases, midnight shows |
| Vervelle Cooperative | `vervelle-cooperative` | venue | Groceries and household errands; high-frequency mundane encounters |

## District 6: Capo Vervelle — cliffs, villas and countryside

District row: `capo-vervelle` (`region` or `district`). It feels removed from town but remains reachable within the same world.

| Location | Slug | Suggested type | Primary scene and routine roles |
| --- | --- | --- | --- |
| Domaine Vervelle | `domaine-vervelle` | venue | Vineyard, tastings, harvest, weddings, long lunches and event work |
| Hôtel Celeste | `hotel-celeste` | residence | Boutique hotel, pool, gardens, visitors, hospitality and restaurant work |
| Celeste Spa | `celeste-spa` | venue | Treatments, sauna, relaxation terraces and wellness employment |
| Cala Bianca | `cala-bianca` | outdoor | Secluded rocky cove, swimming, intimacy and quieter encounters |
| Faro Vervelle | `faro-vervelle` | landmark | Lighthouse trail, sunset, solitude and dramatic conversations |
| La Pergola | `la-pergola` | venue | Olive-grove restaurant, communal tables, wine, music and summer dancing |

Recommended nesting: Celeste Spa should be a child of Hôtel Celeste (`depth=2`) because it is physically part of the hotel while remaining available to locals.

## Encounter and movement rules

- Keep most routine travel within one adjacent district transition. Characters should not teleport from Capo Vervelle to Marina Solana without a travel interval.
- Treat Porto Vecchio, Piazza Aurelia, Mercato Vecchio, and the waterfront promenade as high-frequency crossing nodes.
- Use time-of-day crowd rhythms, not random location selection. The fish market should not be lively at dinner; La Sirena should not be a morning encounter location.
- Give each resident two or three habitual nodes: home district, work location, and one preferred social or restorative place.
- Reuse ordinary places. The cooperative, bakery, pharmacy, clinic, marina, and market matter as much as romantic venues.
- Allow recurring faces from employment networks: hospitality, fishing, nightlife, municipal work, healthcare, arts, and coastal tourism.
- Let weather change movement. Heat quiets uphill streets in the afternoon; wind affects sailing; rain concentrates people under arcades, cafés, the cinema, and taverns.

## Occupation clusters

- Harbor economy: fisherman, fishmonger, dockhand, charter captain, sailing instructor, mechanic.
- Food and hospitality: baker, chef, server, bartender, sommelier, hotel staff, event coordinator.
- Everyday services: pharmacist, clinician, receptionist, mechanic, cashier, shopkeeper, municipal clerk.
- Creative work: photographer, tailor, designer, architect, ceramicist, musician, performer.
- Beach and nightlife: lifeguard, rental attendant, DJ, promoter, singer, dancer, security.
- Countryside and luxury: winemaker, vineyard worker, concierge, massage therapist, esthetician.

## Implemented launch assumptions

1. The Italian, French, and Spanish naming blend is part of the fictional town's canon.
2. The world uses `Europe/Rome` time and the existing platform currency model.
3. Port Vervelle is a featured early-access home world in the `worlds.standard` subscription entitlement.
4. Venue age policy remains independent from chat spice and content settings.
5. The initial release uses a warm Mediterranean baseline; seasonal closures can be layered into schedules later.
6. Porto Marina is the default arrival location.
7. Bellavista Apartments, Villa Mirabelle, and Hôtel Celeste are public shells; private character homes can be added as child locations with the resident roster.

## Follow-on rollout

1. Add location-specific photos under the stable world and location slugs.
2. Register world reference media and validate visual prompts against the hero image.
3. Author a resident roster with home, work, and habitual-place movement profiles.
4. Add event templates, photo opportunities, plans/dates, and rare outcomes tied to the town's daily rhythm.
5. Add high/low-season schedules and weather-sensitive closures.
