export type PublicWorld = {
  slug: 'juniper-city' | 'port-vervelle' | 'neon-kyo' | 'vespormoor' | 'northvale' | 'eos-meridian' | 'vharadren';
  name: string;
  eyebrow: string;
  description: string;
  new?: boolean;
};

export type PublicCompanion = {
  slug: string;
  name: string;
  worldSlug: PublicWorld['slug'];
  worldName: string;
  location: string;
  description: string;
  tags: readonly string[];
};

export const PUBLIC_LANDING_COPY = {
  badge: 'AI COMPANIONS. LIVING WORLDS.',
  title: 'Step Into Worlds',
  titleAccent: 'Made for Connection.',
  body: "Kivelle.AI is more than chat. It’s AI companions, living worlds, and stories that evolve around you. Explore places like Juniper City and meet people who feel real.",
} as const;

export const PUBLIC_WORLDS: readonly PublicWorld[] = [
  {
    slug: 'juniper-city',
    name: 'Juniper City',
    eyebrow: 'CITY LIGHTS · LIVING STORIES',
    description: 'Rooftops, river walks, late cafés, and people building lives around you.',
  },
  {
    slug: 'neon-kyo',
    name: 'Neon Kyo',
    eyebrow: 'NEON · AMBITION · SECRETS',
    description: 'A hyperconnected city where identity is designed and privacy is precious.',
  },
  {
    slug: 'port-vervelle',
    name: 'Port Vervelle',
    eyebrow: 'HARBOR LIGHT · OLD STREETS',
    description: 'Mediterranean light, harbor nights, and an old town full of private histories.',
  },
  {
    slug: 'vespormoor',
    name: 'Vespormoor',
    eyebrow: 'GOTHIC ROMANCE · MYSTERY · UNIVERSITY',
    description: 'Old estates, intimate nights, subtle magic, and a castle university above a dark mountain lake.',
    new: true,
  },
  {
    slug: 'northvale',
    name: 'Northvale',
    eyebrow: 'ALPINE LIVES · WINTER HEAT',
    description: 'A working mountain town of ski patrols, storm nights, close friendships, and complicated second chances.',
    new: true,
  },
  {
    slug: 'eos-meridian',
    name: 'Eos Meridian',
    eyebrow: 'FRONTIER ROMANCE · LIVING COLONY',
    description: 'A human colony beneath a fixed twilight sky, where work, independence, and an impossible signal shape ordinary intimacy.',
    new: true,
  },
  {
    slug: 'vharadren',
    name: 'Vharadren',
    eyebrow: 'DARK FANTASY · DRAGONS · BROKEN OATHS',
    description: 'Three crowns contest an empty throne while dragons, rebels, and dangerous loyalties reshape a fractured realm.',
    new: true,
  },
] as const;

export const PUBLIC_COMPANIONS: readonly PublicCompanion[] = [
  {
    slug: 'becka-shaw',
    name: 'Becka Shaw',
    worldSlug: 'juniper-city',
    worldName: 'Juniper City',
    location: 'Riverwalk',
    description: 'Adventurous, mischievous, and always willing to try the unofficial route.',
    tags: ['Climbing', 'Concerts', 'Road trips'],
  },
  {
    slug: 'sophie-laurent',
    name: 'Sophie Laurent',
    worldSlug: 'juniper-city',
    worldName: 'Juniper City',
    location: 'Moss & Crumb',
    description: 'A precise pastry chef with a gentle sense of humor and a patient heart.',
    tags: ['Baking', 'Jazz', 'Markets'],
  },
  {
    slug: 'bianca-de-luca',
    name: 'Bianca De Luca',
    worldSlug: 'port-vervelle',
    worldName: 'Port Vervelle',
    location: 'Velours',
    description: 'Smooth, perceptive, and nearly impossible to embarrass.',
    tags: ['Mixology', 'Jazz', 'Vintage'],
  },
  {
    slug: 'amelie-rousseau',
    name: 'Amélie Rousseau',
    worldSlug: 'port-vervelle',
    worldName: 'Port Vervelle',
    location: 'Atelier Amélie',
    description: 'A sophisticated designer whose subtle flirtation is as precise as her work.',
    tags: ['Couture', 'Sketching', 'Travel'],
  },
  {
    slug: 'mina-seo',
    name: 'Mina Seo',
    worldSlug: 'neon-kyo',
    worldName: 'Neon Kyo',
    location: 'Eden',
    description: 'A sensory architect searching for chemistry no room can manufacture.',
    tags: ['Perfume', 'Sound', 'Sensory art'],
  },
  {
    slug: 'aya-mori',
    name: 'Aya Mori',
    worldSlug: 'neon-kyo',
    worldName: 'Neon Kyo',
    location: 'Maison Vice',
    description: 'A clever stylist with an eye for reinvention and a secretly sentimental streak.',
    tags: ['Fashion', 'Photography', 'Indie music'],
  },
  {
    slug: 'evelyn-harrow',
    name: 'Evelyn Harrow',
    worldSlug: 'vespormoor',
    worldName: 'Vespormoor',
    location: 'Morrow & Quill',
    description: 'A thoughtful bookseller whose gentleness hides a dry wit—and a book that predicts what happens next.',
    tags: ['Gothic novels', 'Poetry', 'Local history'],
  },
  {
    slug: 'mirelle-voss',
    name: 'Mirelle Voss',
    worldSlug: 'vespormoor',
    worldName: 'Vespormoor',
    location: 'Velvet Thorn',
    description: 'An elegant, perceptive proprietor who remembers more of Vespormoor’s oldest winter than she admits.',
    tags: ['Jazz', 'Psychology', 'Old secrets'],
  },
  {
    slug: 'avery-callahan',
    name: 'Avery Callahan',
    worldSlug: 'northvale',
    worldName: 'Northvale',
    location: 'Ski Patrol Headquarters',
    description: 'A capable patrol captain whose composure leaves room for dry humor and hard-earned tenderness.',
    tags: ['Ski patrol', 'Mountains', 'Quiet evenings'],
  },
  {
    slug: 'mara-ellison',
    name: 'Mara Ellison',
    worldSlug: 'northvale',
    worldName: 'Northvale',
    location: 'Old Vale',
    description: 'A grounded local with a sharp eye for weather, people, and the choices they avoid making.',
    tags: ['Winter', 'Community', 'Local stories'],
  },
  {
    slug: 'commander-rhea-navarro',
    name: 'Commander Rhea Navarro',
    worldSlug: 'eos-meridian',
    worldName: 'Eos Meridian',
    location: 'Ascension Port',
    description: 'A disciplined port commander balancing public duty, private history, and the colony’s uncertain future.',
    tags: ['Command', 'Flight', 'Colony politics'],
  },
  {
    slug: 'imani-laurent',
    name: 'Imani Laurent',
    worldSlug: 'eos-meridian',
    worldName: 'Eos Meridian',
    location: 'Solace Biome',
    description: 'A perceptive biome engineer who makes artificial rain and hard truths feel unexpectedly intimate.',
    tags: ['Ecology', 'Artificial rain', 'Research'],
  },
] as const;
