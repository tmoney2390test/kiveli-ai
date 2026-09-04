const BANNED_FALLBACKS = [
  /making time for a familiar routine/i,
  /following the day'?s routine at an easy pace/i,
  /settling into a familiar rhythm/i,
  /moving through the day at a comfortable pace/i,
];

export const VHARADREN_EVENT_LANGUAGE_VERSION = 'vharadren_event_language_v2';

export function enrichVharadrenSchedules(pack) {
  const characters = new Map(pack.characters.map((character) => [character.slug, character]));
  const locations = new Map(pack.locations.map((location) => [location.slug, location]));
  const districts = new Map(pack.districts.map((district) => [district.slug, district]));

  return pack.weeklySchedules.map((row) => {
    const character = characters.get(row.characterSlug);
    if (!character) throw new Error(`Missing Vharadren character for schedule row ${row.characterSlug}.`);
    const location = row.locationSlug ? locations.get(row.locationSlug) : null;
    const district = districts.get(character.districtSlug) ?? locations.get(character.districtSlug);
    const context = {
      activity: row.activity,
      activityKey: row.activityKey,
      day: row.diegeticDay,
      slot: Number(row.slot ?? 0),
      occupation: character.occupation,
      interests: character.interests,
      locationName: location?.name ?? null,
      districtName: district?.name ?? titleWords(character.districtSlug),
    };
    const activityVariants = buildVharadrenScheduleVariants(context);
    return {
      ...row,
      activityLabel: activityVariants[0],
      activityVariants,
      displayLocation: location?.name ?? `Private quarters in ${context.districtName}`,
      eventLanguageVersion: VHARADREN_EVENT_LANGUAGE_VERSION,
    };
  });
}

export function buildVharadrenScheduleVariants(input) {
  const interests = input.interests?.filter(Boolean) ?? [];
  const interestAt = (offset) => interests[(Number(input.slot ?? 0) + offset) % Math.max(1, interests.length)] ?? 'private correspondence';
  const primary = interestAt(Number(input.day?.length ?? 0));
  const secondary = interestAt(Number(input.day?.length ?? 0) + 2);
  const day = input.day || 'the day';
  const district = input.districtName || 'the district';
  const occupation = lowerFirst(clean(input.occupation) || 'their work');
  const place = clean(input.locationName);
  const atPlace = place ? ` at ${place}` : ' in private quarters';
  let variants;

  switch (input.activityKey) {
    case 'home_morning':
      variants = [
        `Taking a private ${day} morning before ${district}'s bells gather pace`,
        `Starting the day with ${primary} and a quiet first meal`,
        `Preparing for the day's work as ${occupation} before stepping back into ${district}`,
      ];
      break;
    case 'early_anchor':
      variants = [
        `Beginning ${day}'s work as ${occupation} before the streets fill${atPlace}`,
        `Taking the first difficult decisions of the day${atPlace}`,
        `Reviewing ${primary} by first bell before the day's obligations take hold`,
      ];
      break;
    case 'day_anchor':
      variants = [
        `Taking up ${day}'s work as ${occupation}${atPlace}`,
        `Handling the day's practical business${atPlace} while ${district} is busiest, with ${primary} in view`,
        `Working through the day's hardest obligations${atPlace} with ${secondary} still in view`,
      ];
      break;
    case 'midday_anchor':
      variants = [
        `Keeping the midday work moving${atPlace} while serving as ${occupation}`,
        `Taking a practical meal${atPlace} while reviewing ${primary}`,
        `Using ${district}'s busiest hours to follow up on ${secondary}${atPlace}`,
      ];
      break;
    case 'afternoon_interest':
      variants = [
        `Making room for ${primary}${atPlace}`,
        `Meeting a trusted contact over ${secondary}${atPlace}`,
        `Following a lead connected to ${primary}${atPlace}`,
      ];
      break;
    case 'evening_social':
      variants = [
        `Reading the room${atPlace}, where old loyalties travel faster than wine`,
        `Crossing paths with familiar faces${atPlace} over ${primary}`,
        `Letting ${day}'s evening unfold${atPlace} without losing sight of ${secondary}`,
      ];
      break;
    case 'home_evening':
      variants = [
        `Leaving ${day}'s demands outside and settling into private quarters`,
        `Keeping late hours with ${primary} while ${district} quiets`,
        `Reviewing ${secondary} by low firelight before turning in`,
      ];
      break;
    case 'late_worker_morning':
      variants = [
        `Keeping the morning private before reporting to ${place || `the late shift in ${district}`}`,
        `Making time for ${primary} before the late shift begins`,
        `Taking a quiet meal and reviewing ${secondary} ahead of work`,
      ];
      break;
    case 'day_preparation':
      variants = [
        place ? `Getting ready for ${day}'s late crowd at ${place}` : `Preparing the night's work in ${district} for ${day}`,
        `Checking supplies, promises, and loose ends${atPlace}`,
        `Handling the quiet work${atPlace} before the doors open`,
      ];
      break;
    case 'pre_shift_social':
      variants = [
        `Taking a meal${atPlace} while trading news about ${primary}`,
        `Catching a trusted face${atPlace} before the late shift`,
        `Making room for ${secondary} while ${district}'s night crowd gathers`,
      ];
      break;
    case 'night_anchor':
      variants = [
        `Working ${day}'s late hours${atPlace}`,
        `Keeping ${place || district} moving as ${district}'s night crowd gathers`,
        `Balancing duties as ${occupation} with ${primary} until closing`,
      ];
      break;
    case 'home_late':
      variants = [
        `Returning to private quarters after ${day}'s late hours`,
        `Letting the noise of ${district} fall away behind a closed door`,
        `Checking tomorrow's obligations before finally resting`,
      ];
      break;
    default:
      variants = [
        withPlace(clean(input.activity) || `Following ${day}'s obligations`, place),
        `Making time for ${primary}${atPlace}`,
        `Following up on ${secondary} while moving through ${district}`,
      ];
  }

  const unique = [...new Map(variants.map((variant) => [comparable(variant), sentenceCase(clean(variant))])).values()];
  if (unique.length !== 3 || unique.some((variant) => BANNED_FALLBACKS.some((pattern) => pattern.test(variant)))) {
    throw new Error(`Vharadren schedule language failed for ${input.activityKey}: ${JSON.stringify(unique)}`);
  }
  return unique;
}

export function auditVharadrenEvents(pack) {
  const enriched = enrichVharadrenSchedules(pack);
  const variants = enriched.flatMap((row) => row.activityVariants);
  const recurring = pack.recurringEvents ?? [];
  const failures = [];
  if (enriched.length !== pack.weeklySchedules.length) failures.push('schedule row count changed');
  if (enriched.some((row) => row.activityVariants.length !== 3)) failures.push('schedule row without exactly three variants');
  if (variants.some((variant) => BANNED_FALLBACKS.some((pattern) => pattern.test(variant)))) failures.push('generic fallback remains');
  if (enriched.some((row) => !row.displayLocation || !row.eventLanguageVersion)) failures.push('schedule presentation context missing');
  if (recurring.some((event) => !clean(event.title) || !clean(event.rhythm) || !event.locationSlug)) failures.push('recurring event lacks authored context');
  const distinctVariants = new Set(variants.map(comparable)).size;
  const minimumDistinctVariants = Math.min(300, Math.ceil(enriched.length * 1.05));
  if (distinctVariants < minimumDistinctVariants) failures.push(`schedule language variety is too low (${distinctVariants}; expected at least ${minimumDistinctVariants})`);
  return {
    ok: failures.length === 0,
    failures,
    scheduleRows: enriched.length,
    scheduleVariants: variants.length,
    distinctVariants,
    recurringEvents: recurring.length,
    enrichedSchedules: enriched,
  };
}

function withPlace(activity, place) {
  if (!place || comparable(activity).includes(comparable(place))) return activity;
  return `${activity} at ${place}`;
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function comparable(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleWords(value) {
  return clean(value).split(/[- ]+/).map(sentenceCase).join(' ');
}

function sentenceCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function lowerFirst(value) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}
