import {describe,it,expect} from 'vitest';
import{activityDisplayDescription,activityDisplayDescriptions,activityPlanningPrompt,isInternalActivityCopy}from'./location-activity-display';
import{normalizeLocationLore}from'./location-depth';
describe('public activity descriptions',()=>{
 it('rejects leaked instructions and uses concrete copy',()=>{
  const internal='Shopping must follow the location’s current access, schedule, consent, and story state.';
  expect(isInternalActivityCopy(internal)).toBe(true);
  expect(activityDisplayDescription('shopping',internal)).toBe('Browse the stalls and look for something worth bringing home.');
  expect(activityDisplayDescription('unknown ritual',internal)).toBeUndefined();
 });
 it('preserves specific authored text without treating ordinary consent language as internal policy',()=>{
  expect(activityDisplayDescription('dinner','Share a meal overlooking the harbor.')).toBe('Share a meal overlooking the harbor.');
  expect(isInternalActivityCopy('Talk about consent and what you both enjoy.')).toBe(false);
 });
 it('keeps display copy separate from internal rules through normalization',()=>{
  const rules={bathing:'Private access requires an invitation.'};
  const lore=normalizeLocationLore({activityNotes:rules,activityDescriptions:activityDisplayDescriptions(['bathing','unknown'])});
  expect(lore.activityNotes).toEqual(rules);
  expect(lore.activityDescriptions).toEqual({bathing:'Plan a relaxing soak together.'});
 });
 it('does not invent filler or access for unknown activities',()=>{
  expect(activityDisplayDescriptions(['unknown','Follow the location rules'])).toEqual({});
  expect(activityPlanningPrompt('archive_research','Royal Archives')).toBe('Let’s plan a visit to Royal Archives for archive research.');
 });
});
