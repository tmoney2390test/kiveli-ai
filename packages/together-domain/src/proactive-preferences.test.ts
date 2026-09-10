import {describe,it,expect} from 'vitest';
import {resolveCompanionQuietHours,nextQuietHoursEnd} from './proactive-preferences';
describe('companion quiet hours',()=>{
 const quiet={start:'23:00',end:'08:00',timezone:'America/New_York',enabled:true};
 it('inherits account then Life and companion overrides',()=>{
  expect(resolveCompanionQuietHours(null,'c','l').start).toBe('23:00');
  const p={quiet_hours_start:'21:00:00',life_quiet_hours:{l:quiet},companion_quiet_hours:{c:{...quiet,start:'22:00'}}};
  expect(resolveCompanionQuietHours(p,'c','l').start).toBe('22:00');
  expect(resolveCompanionQuietHours(p,'other','l')).toEqual(quiet);
  expect(resolveCompanionQuietHours(p,'other','other').start).toBe('21:00');
 });
 it('finds the end across both DST transitions and the exact boundary',()=>{
  expect(nextQuietHoursEnd(new Date('2026-03-08T04:30:00Z'),quiet).toISOString()).toBe('2026-03-08T12:00:00.000Z');
  expect(nextQuietHoursEnd(new Date('2026-11-01T04:30:00Z'),quiet).toISOString()).toBe('2026-11-01T13:00:00.000Z');
  expect(nextQuietHoursEnd(new Date('2026-09-10T12:00:00Z'),quiet).toISOString()).toBe('2026-09-10T12:00:00.000Z');
 });
 it('supports daytime hours, disabled hours and equal legacy bounds',()=>{
  const now=new Date('2026-09-10T12:30:00Z');
  expect(nextQuietHoursEnd(now,{...quiet,start:'08:00',end:'09:00'}).toISOString()).toBe('2026-09-10T13:00:00.000Z');
  expect(nextQuietHoursEnd(now,{...quiet,enabled:false})).toEqual(now);
  expect(nextQuietHoursEnd(now,{...quiet,start:'08:00',end:'08:00'})).toEqual(now);
 });
});
