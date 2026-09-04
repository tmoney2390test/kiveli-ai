import { describe, expect, it } from 'vitest';
import { companionBasicsIssues, creatorSectionIssues } from './creatorWizard';

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
});
