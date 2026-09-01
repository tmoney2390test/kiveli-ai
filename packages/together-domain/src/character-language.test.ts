import { describe, expect, it } from 'vitest';
import {
  characterActivityClause,
  naturalizeCharacterActivity,
  naturalizeCharacterBiography,
  naturalizeCharacterEventSummary,
  naturalizeCharacterEventTitle,
} from './character-language';

describe('character language', () => {
  it.each([
    ['Taking private time at home', 'Having some quiet time at home'],
    ['Taking private time at home with a book', 'Having some quiet time at home with a book'],
    ['Making private time for sketching', 'Making time for sketching'],
    ['Making an ordinary meal at home', 'Making something to eat at home'],
    ['Picking up a few practical things', 'Running a few errands'],
    ['Picking up a few practical things without rushing what comes next', 'Running a few errands at an easy pace'],
    ['Picking up a few practical things while leaving room for the day to change naturally', 'Running a few errands with time to spare'],
    ['A slower Sunday routine', 'Taking Sunday at an easy pace'],
    ['Taking a genuine weekend routine', 'Taking the weekend at an easy pace'],
    ['Starting the day at home', 'Getting ready for the day at home'],
    ['Offline for the night', 'Winding down'],
    ['Winding down at home after a full Juniper day', 'Winding down at home'],
    ['Following Thursday at Lakehouse Cafe without forcing the pace', 'Spending some time at Lakehouse Cafe'],
    ['Taking the weekday routine at The Crooked Oak without forcing the pace', 'Spending some time at The Crooked Oak'],
    ['Friday Evening Around Ember-And-Rye', 'Spending Friday evening at Ember And Rye'],
    ['Saturday Around Common-Market', 'Spending Saturday at Common Market'],
    ['Keeping Saturday open around common market', 'Spending Saturday around Common Market'],
    ["Catching Friday's live set with the overlapping music, media, and design crowd", "Catching Friday's live set with friends from the local creative scene"],
    ['Winding down behind a closed privacy layer', 'Winding down at home'],
    ['Resetting at home with the privacy layer closed', 'Taking some quiet time at home'],
    ["Checking tomorrow and closing the privacy layer", "Checking tomorrow's plans before winding down"],
    ['Working as event producer', 'Working as an event producer'],
    ['Working as dj and sound designer', 'Working as a DJ and sound designer'],
  ])('rewrites mechanical activity %s', (source, expected) => {
    expect(naturalizeCharacterActivity(source)).toBe(expected);
  });

  it('uses the activity key and occupation to prevent noun labels from leaking as status', () => {
    expect(naturalizeCharacterActivity('Event Producer', { activityKey: 'work', occupation: 'Event Producer' })).toBe('At work');
    expect(characterActivityClause('Event Producer', { activityKey: 'work', occupation: 'Event Producer' })).toBe('at work');
  });

  it('forms grammatical scene clauses without inventing details', () => {
    expect(characterActivityClause('editing photos')).toBe('editing photos');
    expect(characterActivityClause('Unwinding at home after work')).toBe('unwinding at home after work');
    expect(characterActivityClause('Sharing a meal with friends')).toBe('sharing a meal with friends');
    expect(characterActivityClause('Settling in at home')).toBe('settling in at home');
    expect(characterActivityClause('Gallery opening')).toBe('busy with gallery opening');
  });

  it('repairs lifecycle summaries that describe sleep as finishing an activity', () => {
    expect(naturalizeCharacterEventSummary('Becka Shaw finishes Sleeping at home at 10:00 AM.')).toBe('Becka Shaw wakes up around 10:00 AM.');
  });

  it('normalizes schedule event titles but leaves authored event names intact', () => {
    expect(naturalizeCharacterEventTitle('A slower Sunday routine', 'schedule_presence')).toBe('Taking Sunday at an easy pace');
    expect(naturalizeCharacterEventTitle('The lake goes quiet', 'world_event')).toBe('The lake goes quiet');
  });

  it('repairs early compact biography scaffolding', () => {
    expect(naturalizeCharacterBiography('Jonah Sato, 42, is a memorial curator in Eos Meridian. warm, observant, patient. He found an altered archive.'))
      .toBe('Jonah Sato is a memorial curator in Eos Meridian. Jonah Sato is warm, observant, patient. He found an altered archive.');
  });
});
