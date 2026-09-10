// Generated public projection. Private canon stays on the server.
import type {World,Location} from '../types';
export const caldersRunWorld={
  "id": "31740169-035e-5b10-8c9d-98b206e9f24b",
  "name": "Calder's Run",
  "slug": "calders-run",
  "description": "A river-crossing town in the territorial Southwest, where a new railroad, an old water bargain, and the people caught between them turn work, desire, and everyday loyalties into consequential adventures.",
  "hero_asset_key": "calders-run-hero",
  "theme": {
    "accent": [
      "ochre",
      "brick red",
      "lamplit amber"
    ]
  },
  "published": false,
  "access_type": "subscription",
  "entitlement_key": "worlds.standard",
  "timezone": "UTC",
  "sort_order": 130,
  "featured": true,
  "world_role": "home",
  "social_rhythm": "balanced",
  "dominant_dayparts": [
    "morning",
    "afternoon",
    "evening"
  ],
  "relationship_themes": [
    "frontier romance",
    "belonging",
    "independence"
  ],
  "activity_families": [
    "work",
    "social",
    "romance",
    "exploration"
  ],
  "mobility_style": "mixed",
  "weather_profile": {
    "climate": "Late-summer Southwest; heat, storms, variable river levels"
  },
  "visual_context": {
    "setting": "An original, historically inspired 1888 frontier. The fictional county, companies, municipal compact, river, and local legal procedures belong to this world; they are not claims about a real jurisdiction's law.",
    "geography": [
      "A fictional river basin inspired by southern New Mexico and the adjoining Southwest. Red sandstone uplands drain into the Calder River, a dependable but variable stream with a short irrigated valley. Main Street and Lantern Row occupy west-bank terraces. River Ward slopes to the ferry. The Railhead is on the east bank. Cottonwood Valley extends upstream to the north. Cinder Bluffs rises south and southwest."
    ],
    "palette": [
      "sun-warmed ochre",
      "brick red",
      "cottonwood green",
      "faded indigo",
      "cream plaster",
      "brass",
      "lamplit amber"
    ],
    "visualStyle": [
      "cinematic historical realism",
      "1888 territorial Southwest"
    ],
    "avoid": [
      "modern vehicles",
      "smartphones",
      "finished river bridge"
    ]
  },
  "metadata": {
    "source": "calders_run_authoring_v1",
    "genreTags": [
      "historical Western",
      "frontier community",
      "outlaw adventure",
      "romance",
      "labor and land",
      "reputation",
      "mature drama"
    ],
    "relationshipFantasy": "Arrive with your own reasons, find people worth staying for, and decide what kind of life you can build together while the town changes around you.",
    "diegeticYear": 1888,
    "userLocalClock": true,
    "assetStatus": "pending",
    "releaseStatus": "staged",
    "closedWorld": true
  },
  "default_arrival_location_id": "6091676c-6511-5aa5-81a4-6582b38dbc30"
} as unknown as World;
export const caldersRunLocations=[
  {
    "id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": null,
    "name": "Main Street",
    "slug": "main-street",
    "description": "The west-bank commercial terrace, where the town puts on its public face and conducts the business everyone eventually needs.",
    "category": "district",
    "location_type": "district",
    "sort_order": 0,
    "depth": 0,
    "visual_asset_key": "calders-run-main-street",
    "hours": null,
    "possible_activities": [],
    "access_metadata": {
      "publicMapVisible": true,
      "requiredState": null
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": null,
    "name": "Lantern Row",
    "slug": "lantern-row",
    "description": "The evening district, with music, good food, paid companionship, bathing, cards, and people whose labor lets others relax.",
    "category": "district",
    "location_type": "district",
    "sort_order": 10,
    "depth": 0,
    "visual_asset_key": "calders-run-lantern-row",
    "hours": null,
    "possible_activities": [],
    "access_metadata": {
      "publicMapVisible": true,
      "requiredState": null
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": null,
    "name": "River Ward",
    "slug": "river-ward",
    "description": "The old working slope to the river, full of shared services, boarding rooms, small trades, and accumulated memory.",
    "category": "district",
    "location_type": "district",
    "sort_order": 20,
    "depth": 0,
    "visual_asset_key": "calders-run-river-ward",
    "hours": null,
    "possible_activities": [],
    "access_metadata": {
      "publicMapVisible": true,
      "requiredState": null
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": null,
    "name": "The Railhead",
    "slug": "the-railhead",
    "description": "The east-bank terminus, where temporary structures, demanding work, and speculative confidence compete to define the future.",
    "category": "district",
    "location_type": "district",
    "sort_order": 30,
    "depth": 0,
    "visual_asset_key": "calders-run-the-railhead",
    "hours": null,
    "possible_activities": [],
    "access_metadata": {
      "publicMapVisible": true,
      "requiredState": null
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": null,
    "name": "Cottonwood Valley",
    "slug": "cottonwood-valley",
    "description": "The cultivated river corridor, with orchards, grazing, workshops, family homes, and disagreements that travel through irrigation channels.",
    "category": "district",
    "location_type": "district",
    "sort_order": 40,
    "depth": 0,
    "visual_asset_key": "calders-run-cottonwood-valley",
    "hours": null,
    "possible_activities": [],
    "access_metadata": {
      "publicMapVisible": true,
      "requiredState": null
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": null,
    "name": "Cinder Bluffs",
    "slug": "cinder-bluffs",
    "description": "The southern mining country and old road, with small claims, industrial workings, relay stations, and communities beyond easy supervision.",
    "category": "district",
    "location_type": "district",
    "sort_order": 50,
    "depth": 0,
    "visual_asset_key": "calders-run-cinder-bluffs",
    "hours": null,
    "possible_activities": [],
    "access_metadata": {
      "publicMapVisible": true,
      "requiredState": null
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "6091676c-6511-5aa5-81a4-6582b38dbc30",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Calder House Hotel",
    "slug": "calder-house-hotel",
    "description": "A three-story brick hotel with a shaded balcony, dependable meals, and a lobby where visitors learn how quickly an arrival becomes public news.",
    "category": "hotel",
    "location_type": "venue",
    "sort_order": 60,
    "depth": 1,
    "visual_asset_key": "calders-run-calder-house-hotel",
    "hours": {
      "open": "00:00",
      "close": "24:00"
    },
    "possible_activities": [
      "lodging",
      "supper",
      "balcony conversation",
      "arrival assistance"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "b8e6063d-69c1-5791-bb0d-595e8ea26148",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Keene’s Print Shop",
    "slug": "keenes-print-shop",
    "description": "A working print shop publishing The Run Ledger, selling stationery, and turning private grievances into carefully chosen public words.",
    "category": "print shop",
    "location_type": "venue",
    "sort_order": 70,
    "depth": 1,
    "visual_asset_key": "calders-run-keenes-print-shop",
    "hours": {
      "open": "08:00",
      "close": "20:00"
    },
    "possible_activities": [
      "printing",
      "news discussion",
      "notice submission",
      "proofreading by invitation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "12a6914f-0fe4-544d-bfe9-b36c97ea81e8",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "County Courthouse",
    "slug": "county-courthouse",
    "description": "The county’s modest record office and hearing rooms, where property, inheritance, and public promises acquire forms that outlast the people arguing over them.",
    "category": "courthouse",
    "location_type": "venue",
    "sort_order": 80,
    "depth": 1,
    "visual_asset_key": "calders-run-county-courthouse",
    "hours": {
      "open": "08:00",
      "close": "18:00"
    },
    "possible_activities": [
      "record requests",
      "public hearings",
      "petition assistance",
      "archive research"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "602be10b-b09b-58df-965e-033a1ea401d8",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Dempsey Livery",
    "slug": "dempsey-livery",
    "description": "A busy livery and training yard where the town hires transport, boards animals, swaps practical news, and learns whether a newcomer can be trusted with a horse.",
    "category": "livery stable",
    "location_type": "venue",
    "sort_order": 90,
    "depth": 1,
    "visual_asset_key": "calders-run-dempsey-livery",
    "hours": {
      "open": "05:00",
      "close": "21:00"
    },
    "possible_activities": [
      "horse hire",
      "riding lessons",
      "grooming",
      "travel planning"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "3c7e94d9-4f78-56e4-bc3c-d40056fbfb49",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Crown & Cotton Mercantile",
    "slug": "crown-and-cotton",
    "description": "The mercantile supplies everything from nails and lamp wicks to fabric, with a stockroom whose contents reveal the town’s changing ambitions.",
    "category": "general store",
    "location_type": "venue",
    "sort_order": 100,
    "depth": 1,
    "visual_asset_key": "calders-run-crown-and-cotton",
    "hours": {
      "open": "07:00",
      "close": "20:00"
    },
    "possible_activities": [
      "shopping",
      "fabric selection",
      "ordering supplies",
      "parcel collection"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "9fcae9c7-e773-534c-9ac7-7df82b66ae17",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Hearthstone Bakery",
    "slug": "hearthstone-bakery",
    "description": "A warm bakery serving ordinary bread, occasional elaborate pastries, and a few tables whose regulars know the rhythms of the oven.",
    "category": "bakery",
    "location_type": "venue",
    "sort_order": 110,
    "depth": 1,
    "visual_asset_key": "calders-run-hearthstone-bakery",
    "hours": {
      "open": "05:00",
      "close": "18:00"
    },
    "possible_activities": [
      "breakfast",
      "bread buying",
      "pastry orders",
      "kitchen conversation by invitation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "44c76f68-9a74-55b2-ba70-fe46da0742f6",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Marshal’s Office",
    "slug": "marshals-office",
    "description": "The marshal’s small office combines public service, uncomfortable waiting, local records, and the persistent problem of deciding which trouble cannot wait.",
    "category": "law office",
    "location_type": "venue",
    "sort_order": 120,
    "depth": 1,
    "visual_asset_key": "calders-run-marshals-office",
    "hours": {
      "open": "00:00",
      "close": "24:00"
    },
    "possible_activities": [
      "reporting a problem",
      "public notices",
      "lawful appointments",
      "found-property claims"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "5bd7111c-2e34-5c40-9779-b4dd2aec21c3",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "8ea973d5-94fe-5c5c-8cb3-84a90abef76e",
    "name": "Soto Forge",
    "slug": "soto-forge",
    "description": "A forge and wagon yard where hot metal, measured workmanship, and friendly argument keep the town’s animals and vehicles moving.",
    "category": "forge and repair yard",
    "location_type": "venue",
    "sort_order": 130,
    "depth": 1,
    "visual_asset_key": "calders-run-soto-forge",
    "hours": {
      "open": "07:00",
      "close": "19:00"
    },
    "possible_activities": [
      "wagon repair",
      "farrier work",
      "tool discussion",
      "after-work meals"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "main-street",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "e0526a03-fbb9-5eb9-bdbd-31872d63f11b",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Copper Mare Saloon",
    "slug": "copper-mare-saloon",
    "description": "The Copper Mare is a generous, noisy saloon with good music, ordinary food, and a back room where people who dislike one another sometimes manage to talk.",
    "category": "saloon",
    "location_type": "venue",
    "sort_order": 140,
    "depth": 1,
    "visual_asset_key": "calders-run-copper-mare-saloon",
    "hours": {
      "open": "12:00",
      "close": "02:00"
    },
    "possible_activities": [
      "supper",
      "music",
      "conversation",
      "private meetings by arrangement"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "15e01963-8be0-5523-b708-90c6ed3f5ad3",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Marigold House",
    "slug": "marigold-house",
    "description": "Marigold House is an adult companionship business with a gracious public parlor, experienced management, and workers whose private lives extend well beyond the building.",
    "category": "adult companionship house",
    "location_type": "venue",
    "sort_order": 150,
    "depth": 1,
    "visual_asset_key": "calders-run-marigold-house",
    "hours": {
      "open": "15:00",
      "close": "02:00"
    },
    "possible_activities": [
      "adult social company",
      "music",
      "private appointments",
      "business negotiation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "7e80c107-194e-5283-9f41-8964f282e145",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Bellflower Theater",
    "slug": "bellflower-theater",
    "description": "A small theater where professional ambition and community entertainment share costumes, limited money, and the hope of a full room.",
    "category": "theater",
    "location_type": "venue",
    "sort_order": 160,
    "depth": 1,
    "visual_asset_key": "calders-run-bellflower-theater",
    "hours": {
      "open": "12:00",
      "close": "24:00"
    },
    "possible_activities": [
      "performances",
      "rehearsal visits",
      "music",
      "community productions"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "1a511bfe-6c6d-5942-bbae-6f85fa2a7217",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Night Kitchen",
    "slug": "night-kitchen",
    "description": "The Night Kitchen feeds the town when its evening workers finally have time to sit down, with a long table that becomes a second living room.",
    "category": "restaurant",
    "location_type": "venue",
    "sort_order": 170,
    "depth": 1,
    "visual_asset_key": "calders-run-night-kitchen",
    "hours": {
      "open": "16:00",
      "close": "03:00"
    },
    "possible_activities": [
      "late supper",
      "staff meals",
      "recipe discussion",
      "shared-table conversation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "83833b22-7a11-59ac-b4ee-27cea0e3c35b",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Junebug Dance Hall",
    "slug": "junebug-dance-hall",
    "description": "A music hall where callers, musicians, and dancers negotiate crowded floors, uneven skill, and the pleasure of being seen enjoying themselves.",
    "category": "dance hall",
    "location_type": "venue",
    "sort_order": 180,
    "depth": 1,
    "visual_asset_key": "calders-run-junebug-dance-hall",
    "hours": {
      "open": "16:00",
      "close": "01:00"
    },
    "possible_activities": [
      "dancing",
      "lessons",
      "live music",
      "social evenings"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "1382bb5d-2704-5ff2-a0b4-23707e0219e3",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Blue Glass Baths",
    "slug": "blue-glass-baths",
    "description": "A bathhouse providing washing, quiet recovery, and a rare interval when residents can be comfortable without performing competence for their employers.",
    "category": "bathhouse",
    "location_type": "venue",
    "sort_order": 190,
    "depth": 1,
    "visual_asset_key": "calders-run-blue-glass-baths",
    "hours": {
      "open": "10:00",
      "close": "24:00"
    },
    "possible_activities": [
      "bathing",
      "rest",
      "linen service",
      "private conversation in booked space"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "0ffd252b-6c62-519c-98ab-f2cddf4dd042",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Argosy Cardroom",
    "slug": "argosy-cardroom",
    "description": "A gaming room known for controlled manners, attentive dealers, and the distinction between enjoying a risk and pretending consequences do not exist.",
    "category": "cardroom",
    "location_type": "venue",
    "sort_order": 200,
    "depth": 1,
    "visual_asset_key": "calders-run-argosy-cardroom",
    "hours": {
      "open": "14:00",
      "close": "02:00"
    },
    "possible_activities": [
      "social card play",
      "spectating",
      "refreshments",
      "conversation between games"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "fd31aebd-9627-5eb6-aa48-992466e453ee",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "Ribbon Room",
    "slug": "ribbon-room",
    "description": "An intimate adult salon where Pearl hosts private company, small dinners, and occasional readings for people who prefer a quieter social room.",
    "category": "adult private salon",
    "location_type": "venue",
    "sort_order": 210,
    "depth": 1,
    "visual_asset_key": "calders-run-ribbon-room",
    "hours": {
      "open": "16:00",
      "close": "24:00"
    },
    "possible_activities": [
      "adult social appointments",
      "small dinners",
      "readings",
      "private conversation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "be24fd5a-7571-5218-8101-70e25b0441b6",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Pike’s Ferry",
    "slug": "pikes-ferry",
    "description": "The working ferry joins the town’s banks and makes a journey into a brief shared experience of waiting, weather, and other people’s business.",
    "category": "ferry crossing",
    "location_type": "venue",
    "sort_order": 220,
    "depth": 1,
    "visual_asset_key": "calders-run-pikes-ferry",
    "hours": {
      "open": "05:00",
      "close": "22:00"
    },
    "possible_activities": [
      "crossing the river",
      "waiting conversation",
      "river observation",
      "crew work by agreement"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "41f0e160-b457-5611-9cb3-e6d9cbca84e4",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Salcedo Clinic",
    "slug": "salcedo-clinic",
    "description": "A small clinic where dependable care, crowded hours, and household realities turn abstract town disputes into specific human needs.",
    "category": "clinic",
    "location_type": "venue",
    "sort_order": 230,
    "depth": 1,
    "visual_asset_key": "calders-run-salcedo-clinic",
    "hours": {
      "open": "08:00",
      "close": "19:00"
    },
    "possible_activities": [
      "appointments",
      "supply deliveries",
      "community health discussion",
      "courtyard conversation off duty"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "7a59bff3-f402-598c-87a7-69a7ab77f6b0",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Public Washhouse",
    "slug": "public-washhouse",
    "description": "A cooperative washhouse where heavy physical work, exact bookkeeping, and conversation keep half the town present without any one person knowing every secret.",
    "category": "washhouse",
    "location_type": "venue",
    "sort_order": 240,
    "depth": 1,
    "visual_asset_key": "calders-run-public-washhouse",
    "hours": {
      "open": "06:00",
      "close": "19:00"
    },
    "possible_activities": [
      "laundry service",
      "cooperative meetings",
      "deliveries",
      "rest-break conversation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "29628d1c-5f41-52d4-bd76-4bb8a82c7a68",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Boatmen’s Boardinghouse",
    "slug": "boatmens-boardinghouse",
    "description": "A boardinghouse offering solid meals, modest rooms, and a household rhythm that gives working residents somewhere to return to.",
    "category": "boardinghouse",
    "location_type": "venue",
    "sort_order": 250,
    "depth": 1,
    "visual_asset_key": "calders-run-boatmens-boardinghouse",
    "hours": {
      "open": "05:00",
      "close": "23:00"
    },
    "possible_activities": [
      "lodging",
      "shared meals",
      "porch visits",
      "household errands"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "9b59c945-7e98-535f-bf7e-87f98f50ff89",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "River Market",
    "slug": "river-market",
    "description": "A riverside market where local growers, household cooks, and travelers negotiate prices alongside recipes, favors, and news.",
    "category": "market",
    "location_type": "venue",
    "sort_order": 260,
    "depth": 1,
    "visual_asset_key": "calders-run-river-market",
    "hours": {
      "open": "06:00",
      "close": "19:00"
    },
    "possible_activities": [
      "shopping",
      "produce selling",
      "food discussion",
      "public gathering"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "5a7e186e-f4de-58d9-bbc5-861f9eeeecfd",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Riverside Chapel",
    "slug": "riverside-chapel",
    "description": "A small riverside chapel and relief hall where worship, music, practical aid, and disagreements about deservingness share the same benches.",
    "category": "chapel and relief hall",
    "location_type": "venue",
    "sort_order": 270,
    "depth": 1,
    "visual_asset_key": "calders-run-riverside-chapel",
    "hours": {
      "open": "07:00",
      "close": "21:00"
    },
    "possible_activities": [
      "worship",
      "relief work",
      "music",
      "community suppers"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "61a778ab-001e-55f5-829c-2213f115f9a3",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Pike Boatworks",
    "slug": "pike-boatworks",
    "description": "A repair yard building and mending small river craft, with room for practical invention and the argument over what work will survive the bridge.",
    "category": "boat yard",
    "location_type": "venue",
    "sort_order": 280,
    "depth": 1,
    "visual_asset_key": "calders-run-pike-boatworks",
    "hours": {
      "open": "07:00",
      "close": "19:00"
    },
    "possible_activities": [
      "boat repair",
      "woodworking",
      "launch observation",
      "commission discussions"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "afdf3e0c-ab03-519c-b289-7535b91be390",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4331f47a-a84a-5a9c-84bb-29e462d61985",
    "name": "Cottonwood Dispensary",
    "slug": "cottonwood-dispensary",
    "description": "A modest dispensary whose careful stock work and supervised service provide a young apprentice with meaningful responsibility.",
    "category": "dispensary",
    "location_type": "venue",
    "sort_order": 290,
    "depth": 1,
    "visual_asset_key": "calders-run-cottonwood-dispensary",
    "hours": {
      "open": "08:00",
      "close": "19:00"
    },
    "possible_activities": [
      "supply collection",
      "inventory work",
      "supervised apprenticeship",
      "ordinary conversation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "river-ward",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "48020030-a545-5efc-b58c-b4c10a96af3f",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Temporary Passenger Depot",
    "slug": "temporary-passenger-depot",
    "description": "The temporary station makes Calder’s Run’s new connection to distant places tangible through tickets, freight, delays, and people saying goodbye.",
    "category": "rail depot",
    "location_type": "venue",
    "sort_order": 300,
    "depth": 1,
    "visual_asset_key": "calders-run-temporary-passenger-depot",
    "hours": {
      "open": "05:00",
      "close": "23:00"
    },
    "possible_activities": [
      "travel arrangements",
      "waiting",
      "greetings and farewells",
      "dispatch inquiries"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "271261e4-6280-5c1d-be25-dbbdab07ccf9",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Telegraph Office",
    "slug": "telegraph-office",
    "description": "A telegraph office where a few precise words can move money, change a plan, or reach someone far away, while privacy depends on the people handling them.",
    "category": "telegraph office",
    "location_type": "venue",
    "sort_order": 310,
    "depth": 1,
    "visual_asset_key": "calders-run-telegraph-office",
    "hours": {
      "open": "06:00",
      "close": "23:00"
    },
    "possible_activities": [
      "sending messages",
      "collecting messages",
      "waiting conversation",
      "technical discussion"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "3a99c001-cd13-588d-8adf-0ba57d924c39",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Survey Camp",
    "slug": "survey-camp",
    "description": "A working survey base where drawings, measurements, practical experience, and corporate instructions do not always agree.",
    "category": "survey base",
    "location_type": "venue",
    "sort_order": 320,
    "depth": 1,
    "visual_asset_key": "calders-run-survey-camp",
    "hours": {
      "open": "06:00",
      "close": "20:00"
    },
    "possible_activities": [
      "survey discussion",
      "map review by invitation",
      "field preparation",
      "crew meals"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "048903b9-a546-5386-93f1-5ae6ff7462dc",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Bridge Works",
    "slug": "bridge-works",
    "description": "The unfinished bridge is a visible argument about the future, made from demanding work rather than the confident language of a prospectus.",
    "category": "construction works",
    "location_type": "venue",
    "sort_order": 330,
    "depth": 1,
    "visual_asset_key": "calders-run-bridge-works",
    "hours": {
      "open": "06:00",
      "close": "19:00"
    },
    "possible_activities": [
      "observing construction",
      "authorized deliveries",
      "crew conversations on breaks",
      "public project discussion"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "ec896c98-a5c1-5cdc-b6e9-96cdefc12925",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Railroad Freight Office",
    "slug": "railroad-freight-office",
    "description": "The railway’s local office combines ordinary freight service with land negotiations whose consequences extend well beyond the building.",
    "category": "freight and land office",
    "location_type": "venue",
    "sort_order": 340,
    "depth": 1,
    "visual_asset_key": "calders-run-railroad-freight-office",
    "hours": {
      "open": "08:00",
      "close": "19:00"
    },
    "possible_activities": [
      "freight booking",
      "business appointments",
      "contract discussion",
      "public information requests"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "612b4cfc-93a0-569b-b03e-7db79372c573",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Calder Portrait Studio",
    "slug": "calder-portrait-studio",
    "description": "A photographic studio where people decide how they want to be remembered and discover how uncomfortable it can be to sit still under someone’s attention.",
    "category": "photographic studio",
    "location_type": "venue",
    "sort_order": 350,
    "depth": 1,
    "visual_asset_key": "calders-run-calder-portrait-studio",
    "hours": {
      "open": "08:00",
      "close": "19:00"
    },
    "possible_activities": [
      "portrait sittings",
      "photograph selection",
      "commercial commissions",
      "art discussion"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "0a1153f9-4db7-541b-99df-1c12023d649f",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "b825b72f-5bd8-5f53-a5a3-e4b862932ae7",
    "name": "Eastbank Provisioners",
    "slug": "eastbank-provisioners",
    "description": "An east-bank supply business built around hungry workers, small deliveries, and the determination to make the railhead a neighborhood.",
    "category": "supply store",
    "location_type": "venue",
    "sort_order": 360,
    "depth": 1,
    "visual_asset_key": "calders-run-eastbank-provisioners",
    "hours": {
      "open": "06:00",
      "close": "20:00"
    },
    "possible_activities": [
      "supplies",
      "parcel delivery",
      "porch conversation",
      "small business planning"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "the-railhead",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "66cb94b2-6df9-5c91-86ff-8d1075fa3c11",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Whitcomb Ranch",
    "slug": "whitcomb-ranch",
    "description": "A substantial working ranch whose comfortable house and productive land make independence look effortless to people who do not see its accounts.",
    "category": "working ranch",
    "location_type": "venue",
    "sort_order": 370,
    "depth": 1,
    "visual_asset_key": "calders-run-whitcomb-ranch",
    "hours": {
      "open": "06:00",
      "close": "20:00"
    },
    "possible_activities": [
      "ranch business",
      "invited riding",
      "work-yard visits",
      "household supper by invitation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "65aa25c9-b4db-5710-8594-91642bddc294",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Orchard Schoolhouse",
    "slug": "orchard-schoolhouse",
    "description": "A small schoolhouse whose adult evening classes and community meetings provide a place to ask a question without performing confidence.",
    "category": "school and adult classroom",
    "location_type": "venue",
    "sort_order": 380,
    "depth": 1,
    "visual_asset_key": "calders-run-orchard-schoolhouse",
    "hours": {
      "open": "08:00",
      "close": "20:00"
    },
    "possible_activities": [
      "adult literacy classes",
      "community meetings",
      "staff appointments",
      "reading"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "d62ba68c-1c91-56e2-8cdd-de1b2507f0cb",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Cottonwood Swimming Bend",
    "slug": "cottonwood-swimming-bend",
    "description": "A shaded river bend for guided fishing, picnics, swimming when conditions permit, and the feeling of being briefly beyond the town’s demands.",
    "category": "river recreation",
    "location_type": "venue",
    "sort_order": 390,
    "depth": 1,
    "visual_asset_key": "calders-run-cottonwood-swimming-bend",
    "hours": {
      "open": "06:00",
      "close": "21:00"
    },
    "possible_activities": [
      "guided fishing",
      "picnics",
      "permitted swimming",
      "river walks"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "aac1591a-0117-5969-b59e-1f2d6b1b1ab1",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Irrigation Meeting House",
    "slug": "irrigation-meeting-house",
    "description": "A practical meeting house beside the headworks, where the flow of water becomes a schedule, a household argument, and occasionally a workable compromise.",
    "category": "water cooperative",
    "location_type": "venue",
    "sort_order": 400,
    "depth": 1,
    "visual_asset_key": "calders-run-irrigation-meeting-house",
    "hours": {
      "open": "06:00",
      "close": "21:00"
    },
    "possible_activities": [
      "water-turn inquiries",
      "public meetings",
      "record comparison",
      "cooperative work"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "52c5ebd4-ec17-505f-972a-733356fdcd43",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Valley Creamery",
    "slug": "valley-creamery",
    "description": "A small dairy and creamery whose demanding early work produces ordinary comforts the town notices most when they are missing.",
    "category": "dairy and creamery",
    "location_type": "venue",
    "sort_order": 410,
    "depth": 1,
    "visual_asset_key": "calders-run-valley-creamery",
    "hours": {
      "open": "05:00",
      "close": "18:00"
    },
    "possible_activities": [
      "dairy collection",
      "cooperative business",
      "supervised apprenticeship",
      "afternoon conversation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "2af0c3b9-c860-5643-b0bd-c64ae9ece593",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Orchard Glasshouse",
    "slug": "orchard-glasshouse",
    "description": "A nursery and modest glasshouse where patience becomes visible through cuttings, orchard stock, and flowers residents buy for reasons they may not explain.",
    "category": "plant nursery",
    "location_type": "venue",
    "sort_order": 420,
    "depth": 1,
    "visual_asset_key": "calders-run-orchard-glasshouse",
    "hours": {
      "open": "05:00",
      "close": "19:00"
    },
    "possible_activities": [
      "plant buying",
      "orchard discussion",
      "garden walks by invitation",
      "flower selection"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "ab3eb385-e566-5113-93a2-ce83021d5dd4",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "cff3d4a7-0a30-57e0-ba3f-d74db9b72810",
    "name": "Cattle Sale Yard",
    "slug": "cattle-sale-yard",
    "description": "The livestock yard mixes practical judgment, competitive display, and the pleasure of knowing an animal well enough to see beyond a sales pitch.",
    "category": "livestock yard",
    "location_type": "venue",
    "sort_order": 430,
    "depth": 1,
    "visual_asset_key": "calders-run-cattle-sale-yard",
    "hours": {
      "open": "06:00",
      "close": "19:00"
    },
    "possible_activities": [
      "livestock viewing",
      "scheduled auctions",
      "stock records",
      "work-break conversation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cottonwood-valley",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "b293826d-7379-5ead-9e36-d0925ae2acb7",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Saint Agnes Mine",
    "slug": "saint-agnes-mine",
    "description": "A productive silver mine whose public office and surface yard reveal the gap between a profitable enterprise and the households waiting for wages.",
    "category": "silver mine",
    "location_type": "venue",
    "sort_order": 440,
    "depth": 1,
    "visual_asset_key": "calders-run-saint-agnes-mine",
    "hours": {
      "open": "05:00",
      "close": "19:00"
    },
    "possible_activities": [
      "surface appointments",
      "weighing records",
      "mutual-aid meetings",
      "authorized deliveries"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "4c788a8a-77fd-5fd4-8be8-e4b7a1d9aac0",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Assay Office",
    "slug": "assay-office",
    "description": "An independent assay office where patient measurement can determine whether someone has found a livelihood, made a mistake, or been deceived.",
    "category": "mineral laboratory",
    "location_type": "venue",
    "sort_order": 450,
    "depth": 1,
    "visual_asset_key": "calders-run-assay-office",
    "hours": {
      "open": "08:00",
      "close": "19:00"
    },
    "possible_activities": [
      "sample submissions",
      "results appointments",
      "mineral discussion",
      "record comparison by permission"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "24b62a9d-2605-5f9b-985d-816d3bc5da91",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Widow’s Cut Coach Station",
    "slug": "widows-cut-coach-station",
    "description": "An isolated coach station offering rest, repairs, food, and the unusual intimacy of strangers waiting for the same road to become passable.",
    "category": "coach station",
    "location_type": "venue",
    "sort_order": 460,
    "depth": 1,
    "visual_asset_key": "calders-run-widows-cut-coach-station",
    "hours": {
      "open": "05:00",
      "close": "22:00"
    },
    "possible_activities": [
      "coach travel",
      "meals",
      "shelter",
      "route planning"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "f7659198-986a-589e-95b0-0f36193fd1cc",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Mule Camp Trading Post",
    "slug": "mule-camp-trading-post",
    "description": "A trading post where remote work becomes possible through credit, information, practical supplies, and a broker who remembers who kept a promise.",
    "category": "trading post",
    "location_type": "venue",
    "sort_order": 470,
    "depth": 1,
    "visual_asset_key": "calders-run-mule-camp-trading-post",
    "hours": {
      "open": "06:00",
      "close": "21:00"
    },
    "possible_activities": [
      "supplies",
      "freight agreements",
      "credit discussions",
      "traveler meals"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "a3ac9f2f-33ff-5d19-af2a-cd83828e586d",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Red Wells Prospect",
    "slug": "red-wells-prospect",
    "description": "A small independent claim where hope, discipline, and borrowed resources meet a landscape that offers no guarantee of rewarding hard work.",
    "category": "independent claim",
    "location_type": "venue",
    "sort_order": 480,
    "depth": 1,
    "visual_asset_key": "calders-run-red-wells-prospect",
    "hours": {
      "open": "06:00",
      "close": "19:00"
    },
    "possible_activities": [
      "claim appointments",
      "surface observation",
      "sample discussion",
      "camp meals by invitation"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "dba2f892-1aef-540f-a8b5-7e443589774b",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Canyon Rest Cemetery",
    "slug": "canyon-rest-cemetery",
    "description": "A quiet cemetery and small service office where remembrance is practical work and the town’s history is attached to particular names.",
    "category": "cemetery",
    "location_type": "venue",
    "sort_order": 490,
    "depth": 1,
    "visual_asset_key": "calders-run-canyon-rest-cemetery",
    "hours": {
      "open": "07:00",
      "close": "19:00"
    },
    "possible_activities": [
      "memorial visits",
      "history by appointment",
      "grounds work",
      "quiet walking"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "96ed8d24-eb88-5fa9-ae9c-45257c6c6221",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "4aa276e2-1323-53a9-b9eb-d8de7cf3547e",
    "name": "Old Calder Relay",
    "slug": "old-calder-relay",
    "description": "An old relay station that gives independent carriers a place to change animals, leave agreed consignments, and weigh how much they need to know.",
    "category": "courier relay",
    "location_type": "venue",
    "sort_order": 500,
    "depth": 1,
    "visual_asset_key": "calders-run-old-calder-relay",
    "hours": {
      "open": "05:00",
      "close": "22:00"
    },
    "possible_activities": [
      "courier arrangements",
      "animal changes",
      "route discussion",
      "shelter by agreement"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "cinder-bluffs",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  },
  {
    "id": "38b0efd4-b1d9-5b32-bc1f-b0b711da47ca",
    "world_id": "31740169-035e-5b10-8c9d-98b206e9f24b",
    "parent_location_id": "604a7a05-0d7e-5ea2-9357-1e9953bf3bd1",
    "name": "The Red Sash",
    "slug": "red-sash-brothel",
    "description": "The Red Sash is a working brothel with a lively downstairs parlor, adult resident workers, and a practical struggle over how its profits and rules should be shared.",
    "category": "brothel",
    "location_type": "venue",
    "sort_order": 510,
    "depth": 1,
    "visual_asset_key": "calders-run-red-sash-brothel",
    "hours": {
      "open": "16:00",
      "close": "02:00"
    },
    "possible_activities": [
      "adult social company",
      "music",
      "agreed private appointments",
      "resident business meetings"
    ],
    "access_metadata": {
      "mode": "public_frontage",
      "initiallyDiscoverable": true,
      "requiredState": null,
      "privateAreasRequireInvitation": true,
      "publicMapVisible": true
    },
    "metadata": {
      "source": "calders_run_authoring_v1",
      "district": "lantern-row",
      "assetStatus": "pending",
      "photoStatus": "pending",
      "userLocalClock": true,
      "publicMapVisible": true
    }
  }
] as unknown as Location[];
