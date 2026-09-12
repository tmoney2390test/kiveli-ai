import { describe, expect, it } from 'vitest';
import { companionBasicsIssues, creatorSectionIssues, nextCreatorRoutineSlot } from './creatorWizard';

const identity = { name: 'Mara', age: 29, gender: 'woman', pronouns: 'she/her', occupation: 'Architect', biography: 'A patient architect with a dry sense of humor.', interests: ['design'], traits: ['patient', 'wry'], ambitions: [] };
const life = { homeWorldId: 'world', homeLocationId: 'home', workLocationId: null, lifestyle: 'Grounded city life', preferredActivities: ['design'], scheduleStyle: 'Weekdays with flexible evenings' };

describe('companion creator validation', () => {
  it('requires canonical basics before creating a draft', () => {
    expect(companionBasicsIssues({ name: '', age: 17, gender: '', pronouns: '', worldId: '', description: '' })).toEqual([
      'Enter their name.',
      'Companions must have a confirmed age from 18 to 99.',
      'Choose or enter their gender.',
      'Enter their pronouns.',
      'Choose the world they live in.',
    ]);
  });

  it('requires an appearance and validates its 800-character limit', () => {
    expect(creatorSectionIssues({ step: 'appearance', identity, appearanceDescription: 'x'.repeat(801), hasAppearance: false, life, routine: [], selectedMeeting: true })).toEqual([
      'Keep the appearance description to 800 characters.',
      'Upload or generate and select a canonical portrait.',
    ]);
  });

  it('requires complete schedule blocks', () => {
    expect(creatorSectionIssues({ step: 'life', identity, appearanceDescription: 'A clear portrait description.', hasAppearance: true, life, routine: [{ id: '1', dayOfWeek: 1, startMinute: 600, endMinute: 600, locationId: '', activity: '', availability: 'busy', energyDelta: 0 }], selectedMeeting: true })).toContain('Every schedule block needs a place, activity, and valid time range.');
  });

  it('catches overlapping schedule blocks before the save request', () => {
    const routine = [
      { id: '1', dayOfWeek: 1, startMinute: 600, endMinute: 720, locationId: 'home', activity: 'Working', availability: 'busy' as const, energyDelta: 0 },
      { id: '2', dayOfWeek: 1, startMinute: 660, endMinute: 780, locationId: 'home', activity: 'Lunch', availability: 'available' as const, energyDelta: 0 },
    ];
    expect(creatorSectionIssues({ step: 'life', identity, appearanceDescription: 'A clear portrait description.', hasAppearance: true, life, routine, selectedMeeting: true })).toContain('Schedule blocks on the same day cannot overlap.');
  });

  it('places a new schedule block in an open slot', () => {
    const blocks = [{ id: '1', dayOfWeek: 1, startMinute: 1080, endMinute: 1200, locationId: 'home', activity: 'Dinner', availability: 'busy' as const, energyDelta: 0 }];
    expect(nextCreatorRoutineSlot(blocks)).toEqual({ dayOfWeek: 2, startMinute: 1080, endMinute: 1200 });
    const sevenDays = Array.from({ length: 7 }, (_, day) => ({ ...blocks[0]!, id: String(day), dayOfWeek: day }));
    const next = nextCreatorRoutineSlot(sevenDays);
    expect(next).not.toBeNull();
    expect(sevenDays.every((block) => block.dayOfWeek !== next!.dayOfWeek || block.endMinute <= next!.startMinute || block.startMinute >= next!.endMinute)).toBe(true);
  });

  it('shows a clear limit error for too many traits', () => {
    const issues = creatorSectionIssues({ step: 'personality', identity: { ...identity, traits: Array.from({ length: 9 }, (_, index) => `trait ${index}`) }, appearanceDescription: 'A clear portrait description.', hasAppearance: true, life, routine: [], selectedMeeting: true });
    expect(issues).toContain('Use up to 8 traits, each 40 characters or fewer.');
  });
});
