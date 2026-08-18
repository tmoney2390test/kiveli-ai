# Kivelle district model

Districts are canonical places in `together_locations`, not client-side tags. A venue belongs to a district through `parent_location_id`, and every place-aware system can recover the same path through `PlaceContext`.

## Product behavior

- A world directory presents districts as expandable visual containers.
- Venues, landmarks, and outdoor areas are the browseable photo cards inside a district.
- Regions and neighborhoods may sit above or below a district without changing the directory contract.
- Rooms and zones appear on their parent place detail page, not in the world directory.
- Private residences and work-only locations stay out of public discovery while remaining valid canonical locations for Life, Chat, plans, and media.
- A root place with no district remains visible in the explicit citywide collection. The client never guesses or invents its parent.

## Authoring contract

Every authored district should provide:

- a stable world-scoped slug;
- description, lore, and visual context;
- representative district artwork or a deliberate world-art fallback;
- an intentional sort order;
- parent assignments for its venues through `parent_location_id`;
- tests confirming every parent is in the same world and the resulting place path is correct.

Category filters describe what a user can do at a place. They do not replace geography. “Nightlife” may return venues from several districts while each venue keeps its canonical district path.

## Juniper City content pass

Juniper currently has one fully canonical district, Alder District, plus citywide root locations. The next content-data pass should:

1. inventory the root locations surfaced by the citywide collection;
2. author a small set of distinct Juniper districts based on story geography, not arbitrary UI buckets;
3. give each district its own lore and visual identity;
4. assign existing places with an additive migration;
5. keep homes and work locations private in the directory while still parenting them geographically;
6. verify `Juniper City → District → Place` paths across Chat, Life, plans, Dates, and PhotoGen.

Until that authored mapping lands, the citywide collection keeps every legitimate public place discoverable without creating false canonical geography.
