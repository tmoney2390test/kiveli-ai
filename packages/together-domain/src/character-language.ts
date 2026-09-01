export type CharacterActivityLanguageOptions = {
  activityKey?: string | null;
  occupation?: string | null;
};

const ACTION_OPENING = /^(?:at\b|away\b|between\b|on\b|out\b|sleeping\b|working\b|taking\b|having\b|making\b|getting\b|going\b|heading\b|finishing\b|starting\b|preparing\b|running\b|walking\b|meeting\b|seeing\b|editing\b|photographing\b|shooting\b|cooking\b|recovering\b|relaxing\b|winding\b|unwinding\b|settling\b|resetting\b|spending\b|enjoying\b|hosting\b|joining\b|sharing\b|covering\b|handling\b|checking\b|reading\b|writing\b|practicing\b|training\b|teaching\b|studying\b|building\b|fixing\b|serving\b|opening\b|closing\b|browsing\b|testing\b|calling\b|doing\b|keeping\b|catching\b|helping\b|planning\b|recording\b|producing\b|coordinating\b|watching\b|listening\b|driving\b|riding\b|swimming\b|exploring\b|researching\b|reviewing\b|leading\b|maintaining\b|staying\b|following\b|looking\b|directing\b|hunting\b|setting\b|rehearsing\b|coaching\b|letting\b|auditing\b|developing\b|designing\b|dispatching\b|attending\b|gaming\b|surveying\b|sorting\b|arriving\b|waking\b|using\b|assisting\b|analyzing\b|trying\b|managing\b|calibrating\b|styling\b|soundchecking\b)/i;
const WEEKDAY = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';

/**
 * Turns schedule/storage labels into short, conversational status text.
 * This is deliberately deterministic: it never invents an activity that the
 * authored data did not establish.
 */
export function naturalizeCharacterActivity(value: unknown, options: CharacterActivityLanguageOptions = {}): string {
  let text = cleanHumanText(value);
  if (!text) return 'Enjoying some free time';
  text = text.replace(/\s*without rushing what comes next\b/gi, '').replace(/\s+/g, ' ').trim();

  const occupation = cleanHumanText(options.occupation);
  if (occupation && comparable(text) === comparable(occupation)) return 'At work';
  if (looksLikeBareOccupation(text, options.activityKey)) return 'At work';

  const following = text.match(new RegExp(`^Following ${WEEKDAY} at (.+?) without forcing the pace$`, 'i'));
  if (following?.[1]) return `Spending some time at ${naturalizePlacePhrase(following[1])}`;

  const routineAt = text.match(/^(?:Taking|Following) (?:the )?(?:weekday routine|Friday variation|Saturday variation|Sunday variation|weekend routine) at (.+?) without forcing the pace$/i);
  if (routineAt?.[1]) return `Spending some time at ${naturalizePlacePhrase(routineAt[1])}`;

  if (/^A slower Sunday routine$/i.test(text) || /^Taking a slower Sunday with room for a real conversation$/i.test(text)) return 'Taking Sunday at an easy pace';
  if (/^Taking a genuine weekend routine$/i.test(text)) return 'Taking the weekend at an easy pace';
  const quietAtHome = text.match(/^Taking private time at home with (.+)$/i);
  if (quietAtHome?.[1]) return `Having some quiet time at home with ${quietAtHome[1]}`;
  if (/^Taking private time at home$/i.test(text)) return 'Having some quiet time at home';
  const personalInterest = text.match(/^Making private time for (.+)$/i);
  if (personalInterest?.[1]) return `Making time for ${personalInterest[1]}`;
  if (/^Making an ordinary meal at home$/i.test(text)) return 'Making something to eat at home';
  if (/^Picking up a few practical things$/i.test(text)) return 'Running a few errands';
  if (/^Picking up a few practical things while leaving room for the day to change naturally$/i.test(text)) return 'Running a few errands with time to spare';
  if (/^Cooking or recovering at home$/i.test(text)) return 'Taking it easy at home';
  if (/^Starting the day at home$/i.test(text)) return 'Getting ready for the day at home';
  if (/^Starting slowly at home while the city keeps moving$/i.test(text)) return 'Having a slow start at home';
  if (/^Offline for the night$/i.test(text)) return 'Winding down';
  if (/^Having some unstructured time(?: at home)?$/i.test(text)) return 'Enjoying some free time';
  if (/^Winding down at home after a full .+ day$/i.test(text)) return 'Winding down at home';
  if (/^Winding down behind a closed privacy layer$/i.test(text)) return 'Winding down at home';
  if (/^Resetting at home with the privacy layer closed$/i.test(text)) return 'Taking some quiet time at home';
  if (/^Checking tomorrow and closing the privacy layer$/i.test(text)) return "Checking tomorrow's plans before winding down";
  if (/^(?:Taking a private late morning|Having a slow private morning) at home$/i.test(text)) return 'Having a slow morning at home';
  if (/^(?:Taking a private afternoon|Keeping the afternoon private) at home$/i.test(text)) return 'Having a quiet afternoon at home';
  if (/^Starting the day privately at home$/i.test(text)) return 'Having a quiet start at home';
  if (/^Taking a slow private start at home$/i.test(text)) return 'Having a slow start at home';
  if (/^Keeping a private nocturnal rhythm after the rest of town has gone quiet$/i.test(text)) return 'Keeping late hours at home';

  const creativeFriday = text.match(/^Catching Friday's live set with the overlapping music, media, and design crowd(?: (while leaving room for the day to change naturally))?$/i);
  if (creativeFriday?.[1]) return "Dropping into Friday's live set with friends from the local creative scene";
  if (creativeFriday) return "Catching Friday's live set with friends from the local creative scene";

  const errand = text.match(/^Handling an errand around (.+)$/i);
  if (errand?.[1]) return `Running an errand near ${naturalizePlacePhrase(errand[1])}`;
  const friday = text.match(/^(?:Taking a )?Friday evening around (.+)$/i);
  if (friday?.[1]) return `Spending Friday evening at ${naturalizePlacePhrase(friday[1])}`;
  const saturday = text.match(/^(?:Taking a )?Saturday around (.+)$/i);
  if (saturday?.[1]) return `Spending Saturday at ${naturalizePlacePhrase(saturday[1])}`;
  const openSaturday = text.match(/^Keeping Saturday open around (.+)$/i);
  if (openSaturday?.[1]) return `Spending Saturday around ${titleCaseWords(openSaturday[1])}`;

  const meal = text.match(/^(Breakfast|Lunch|Dinner)(\b.*)$/i);
  if (meal) return `Having ${meal[1]!.toLowerCase()}${meal[2] ?? ''}`;
  const drinks = text.match(/^Drinks(\b.*)$/i);
  if (drinks) return `Having drinks${drinks[1] ?? ''}`;
  const coffee = text.match(/^Coffee(\b.*)$/i);
  if (coffee) return `Having coffee${coffee[1] ?? ''}`;
  const movie = text.match(/^Movie(\b.*)$/i);
  if (movie) return `Watching a movie${movie[1] ?? ''}`;

  const role = text.match(/^Working as (.+)$/i)?.[1];
  if (role && !/^(?:a|an|the)\b/i.test(role)) {
    if (/^dj and sound designer$/i.test(role)) return 'Working as a DJ and sound designer';
    if (/^quiet orbit proprietor$/i.test(role)) return 'Running Quiet Orbit';
    if (/^wayfarer hotel manager$/i.test(role)) return 'Managing the Wayfarer Hotel';
    if (/^solace administrator$/i.test(role)) return 'Working as a Solace administrator';
    return `Working as ${indefiniteArticle(role)} ${role}`;
  }

  text = text.replace(/^Focused on work$/i, 'Working');
  text = text.replace(/^In the middle of a project$/i, 'Working on a project');
  text = text.replace(/^Taking care of a few things$/i, 'Running a few errands');
  return sentenceCase(text);
}

/** Returns text that is safe to place after “Name is …”. */
export function characterActivityClause(value: unknown, options: CharacterActivityLanguageOptions = {}): string {
  const activity = naturalizeCharacterActivity(value, options);
  if (ACTION_OPENING.test(activity)) return lowerFirst(activity);
  return `busy with ${lowerFirst(activity)}`;
}

export function naturalizeCharacterEventTitle(value: unknown, eventType?: string | null): string {
  const text = cleanHumanText(value);
  if (!text) return 'A moment from the day';
  if (eventType === 'schedule_presence' || eventType === 'schedule_outcome') return naturalizeCharacterActivity(text);
  return sentenceCase(text);
}

export function naturalizeCharacterEventSummary(value: unknown): string {
  let text = cleanHumanText(value);
  if (!text) return '';
  const waking = text.match(/^(.+?) finishes sleeping(?: at home)? at (.+)$/i);
  if (waking?.[1] && waking[2]) text = `${waking[1]} wakes up around ${stripTerminalPunctuation(waking[2])}`;
  const startingSleep = text.match(/^(.+?) (?:starts|begins) sleeping(?: at home)? at (.+)$/i);
  if (startingSleep?.[1] && startingSleep[2]) text = `${startingSleep[1]} goes to sleep around ${stripTerminalPunctuation(startingSleep[2])}`;
  return withTerminalPunctuation(sentenceCase(text));
}

/** Repairs the compact machine-authored biography shape used by early packs. */
export function naturalizeCharacterBiography(value: unknown): string {
  const text = cleanHumanText(value);
  const scaffold = text.match(/^(.+?),\s*\d+,\s*is\s+(.+?)\.\s*([a-z][^.]+)\.\s*(.+)$/);
  if (!scaffold?.[1] || !scaffold[2] || !scaffold[3] || !scaffold[4]) return withTerminalPunctuation(text);
  const name = scaffold[1].trim();
  return `${name} is ${stripTerminalPunctuation(scaffold[2])}. ${name} is ${stripTerminalPunctuation(scaffold[3])}. ${withTerminalPunctuation(scaffold[4])}`;
}

export function cleanHumanText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function looksLikeBareOccupation(value: string, activityKey?: string | null) {
  if (!activityKey || !/(?:^|_)(?:work|occupation|job|shift)(?:_|$)/i.test(activityKey)) return false;
  if (ACTION_OPENING.test(value)) return false;
  return value.split(/\s+/).length <= 8 && !/[.!?]/.test(value);
}

function naturalizePlacePhrase(value: string) {
  return value.replace(/\b[A-Za-z]+(?:-[A-Za-z]+)+\b/g, (token) => token.split('-').map(sentenceCase).join(' '));
}

function titleCaseWords(value: string) {
  return value.split(/\s+/).map(sentenceCase).join(' ');
}

function indefiniteArticle(value: string) {
  return /^[aeiou]/i.test(value) ? 'an' : 'a';
}

function comparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sentenceCase(value: string) {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function lowerFirst(value: string) {
  return value ? value[0]!.toLowerCase() + value.slice(1) : value;
}

function stripTerminalPunctuation(value: string) {
  return value.trim().replace(/[.!?]+$/, '');
}

function withTerminalPunctuation(value: string) {
  const text = value.trim();
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}
